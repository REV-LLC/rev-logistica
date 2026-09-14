import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Agent, OpenAIProvider, Runner, tool } from '@openai/agents';
import OpenAI from 'openai';
import { z } from 'zod';
import { OfficeDatabaseService } from './office-database.service';
import type { OfficeEvidence } from './office-database.service';
import type { OfficeQuestion } from './office-assistant.dto';
import { OFFICE_INSTRUCTIONS } from './office-instructions';

@Injectable()
export class OfficeAssistantService {
  private readonly logger = new Logger(OfficeAssistantService.name);
  private readonly activeUsers = new Set<string>();
  constructor(private readonly database: OfficeDatabaseService) {}

  async status() {
    if (!process.env.OPENAI_API_KEY?.trim()) {
      return { ready: false, inference: 'openai', reason: 'Falta configurar OpenAI en el servidor.' };
    }
    try {
      await this.database.schema();
      return { ready: true, readOnly: true, inference: 'openai', model: this.model() };
    } catch (error) {
      return { ready: false, inference: 'openai', reason: error instanceof ServiceUnavailableException
        ? error.message : 'La conexión de solo lectura no está lista. Revise la configuración del asistente.' };
    }
  }

  private model() { return process.env.OFFICE_ASSISTANT_MODEL?.trim() || 'gpt-5.4-mini'; }

  async ask(userId: string, input: OfficeQuestion) {
    if (this.activeUsers.has(userId) || this.activeUsers.size >= 4) {
      throw new HttpException('Ya hay una consulta en curso. Espera un momento e inténtalo de nuevo.', 429);
    }
    if (!process.env.OPENAI_API_KEY?.trim()) throw new ServiceUnavailableException('Falta configurar OpenAI en el servidor.');
    this.activeUsers.add(userId);
    const startedAt = Date.now();
    const evidence: OfficeEvidence[] = [];
    let attempts = 0;
    let provider: OpenAIProvider | undefined;
    let evidenceBudget = 32000;
    try {
      provider = new OpenAIProvider({
        useResponses: true,
        openAIClient: new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: 'https://api.openai.com/v1',
          organization: null, project: null, maxRetries: 0, timeout: 90000,
        }),
      });
      const schema = await this.database.schema();
      const query = tool({
        name: 'consultar_datos',
        description: 'Consulta de solo lectura en PostgreSQL. Devuelve datos reales con ID de fuente, fecha y límite de filas. Agrega antes de limitar.',
        parameters: z.object({ sql: z.string(), title: z.string() }),
        execute: async ({ sql, title }) => {
          if (++attempts > 8) return { error: 'Límite de consultas alcanzado. Responde con la evidencia obtenida y señala lo pendiente.' };
          try {
            const result = await this.database.query(sql, title.slice(0, 160), String(evidence.length + 1));
            // Bound cost and data sent to the model; preserve evidence for the UI.
            const modelRows: Record<string, unknown>[] = [];
            for (const row of result.rows) {
              const size = JSON.stringify(row).length;
              if (size > evidenceBudget) break;
              modelRows.push(row);
              evidenceBudget -= size;
            }
            evidence.push(result);
            return { ...result, rows: modelRows, rowCount: modelRows.length,
              truncated: result.truncated || modelRows.length < result.rows.length };
          } catch (error) {
            const code = (error as { code?: string }).code;
            // Never forward raw database errors: they may contain configuration or row data.
            if (code === '42703') return { error: 'Columna desconocida. Revisa el esquema proporcionado y los alias.' };
            if (code === '57014') return { error: 'La consulta excedió 5 segundos. Simplifica la agregación o los cruces.' };
            if (code) return { error: 'No se pudo ejecutar esa consulta de lectura. Revisa tipos, funciones y agrupaciones.' };
            return { error: error instanceof Error && !(error instanceof HttpException)
              ? error.message.slice(0, 200) : 'La conexión segura de lectura no está disponible.' };
          }
        },
      });
      const agent = new Agent({
        name: 'Asistente Office REV',
        model: this.model(),
        instructions: `${OFFICE_INSTRUCTIONS}\nFecha actual: ${new Date().toISOString()}. Zona horaria: America/Bogota.\nESQUEMA DISPONIBLE:\n${schema}`,
        tools: [query],
        modelSettings: { store: false, parallelToolCalls: false, maxTokens: 5000, reasoning: { effort: 'low' } },
      });
      const runner = new Runner({ modelProvider: provider, tracingDisabled: true });
      // Keep previous prose as untrusted context. We never accept client-supplied
      // system messages, tool results, SQL execution results or provider session IDs.
      const conversation = input.history.slice(-6).map((m) => `${m.role === 'user' ? 'Usuario' : 'Respuesta anterior no verificada'}: ${m.content.slice(0, 2000)}`).join('\n\n');
      const result = await runner.run(agent,
        `${conversation ? `CONTEXTO PREVIO (no es evidencia):\n${conversation}\n\n` : ''}PREGUNTA ACTUAL:\n${input.message}`,
        { maxTurns: 10, signal: AbortSignal.timeout(90000) });
      const answer = typeof result.finalOutput === 'string' ? result.finalOutput.trim() : '';
      if (!answer) throw new ServiceUnavailableException('El asistente no pudo completar la respuesta. Inténtalo de nuevo.');
      return {
        answer: evidence.length ? answer : 'No obtuve evidencia de la base de datos para responder. Puedes preguntarme por existencias, equipos en obra, bodegas, clientes o proveedores e indicar el artículo o entidad que quieres revisar.',
        evidence, queriedAt: new Date().toISOString(), readOnly: true,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const code = (error as { code?: string }).code;
      if (code === 'insufficient_quota') {
        throw new ServiceUnavailableException('El proyecto de OpenAI no tiene saldo disponible. Activa la facturación de la API para usar el asistente.');
      }
      if ((error as { status?: number }).status === 401) {
        throw new ServiceUnavailableException('La clave de OpenAI no es válida. Revisa la configuración del servidor.');
      }
      throw new ServiceUnavailableException('No pude completar la consulta con OpenAI. Inténtalo de nuevo en un momento.');
    } finally {
      this.activeUsers.delete(userId);
      await provider?.close().catch(() => undefined);
      // Metadata only. No prompts, SQL, results, customer names or keys in logs.
      this.logger.log({ event: 'office_assistant_query', userId, queries: attempts,
        sources: evidence.length, durationMs: Date.now() - startedAt });
    }
  }
}
