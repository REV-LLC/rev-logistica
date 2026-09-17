import { HttpException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Agent, OpenAIProvider, Runner, tool } from '@openai/agents';
import OpenAI from 'openai';
import { z } from 'zod';
import { OfficeDatabaseService } from './office-database.service';
import type { OfficeEvidence } from './office-database.service';
import type { OfficeQuestion } from './office-assistant.dto';
import { OFFICE_INSTRUCTIONS } from './office-instructions';
import { requestedOwnerScope } from './owner-scope';
import { inventoryParameters, inventoryQuery } from './inventory-query';
import { compactEvidence } from './model-evidence';
import { OFFICE_VIEWS, validateOfficeQuery } from './query-policy';

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
      await this.database.schema(undefined, true);
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
    const completed = new Map<string, ReturnType<typeof compactEvidence>['data']>();
    let usage: { requests: number; inputTokens: number; outputTokens: number } | undefined;
    const ownerScope = requestedOwnerScope(input.message);
    try {
      provider = new OpenAIProvider({
        useResponses: true,
        openAIClient: new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: 'https://api.openai.com/v1',
          organization: null, project: null, maxRetries: 0, timeout: 90000,
        }),
      });
      const executeQuery = async (sql: string, title: string) => {
          try {
            const key = validateOfficeQuery(sql).sql;
            const previous = completed.get(key);
            if (previous) return { ...previous, reused: true, note: 'Es la misma consulta ya completada. Usa esta evidencia para responder; no la repitas.' };
            if (++attempts > 8) return { error: 'Límite de consultas alcanzado. Responde con la evidencia obtenida y señala lo pendiente.' };
            const result = await this.database.query(sql, title.slice(0, 160), String(evidence.length + 1), ownerScope);
            const compact = compactEvidence(result, evidenceBudget);
            evidenceBudget = Math.max(0, evidenceBudget - compact.used);
            evidence.push(result);
            completed.set(key, compact.data);
            return compact.data;
          } catch (error) {
            const code = (error as { code?: string }).code;
            // Never forward raw database errors: they may contain configuration or row data.
            if (code === '42703') return { error: 'Columna desconocida. Revisa el esquema proporcionado y los alias.' };
            if (code === '57014') return { error: 'La consulta excedió 5 segundos. Simplifica la agregación o los cruces.' };
            if (code) return { error: 'No se pudo ejecutar esa consulta de lectura. Revisa tipos, funciones y agrupaciones.' };
            return { error: error instanceof Error && !(error instanceof HttpException)
              ? error.message.slice(0, 200) : 'La conexión segura de lectura no está disponible.' };
          }
      };
      const query = tool({
        name: 'consultar_datos',
        description: 'SQL de solo lectura para consultas generales. Pide primero el esquema que necesites. Agrega antes de limitar.',
        parameters: z.object({ sql: z.string(), title: z.string() }),
        execute: ({ sql, title }) => executeQuery(sql, title),
      });
      const inventory = tool({
        name: 'consultar_inventario',
        description: 'Saldos actuales sin escribir SQL: busca artículos y agrupa cantidades por ubicación, referencia, cliente, propietario o activo. No incluye tránsito. No sirve para fechas históricas ni filtros de entidades concretas. Conserva anomalías separadas.',
        parameters: inventoryParameters,
        execute: (filters) => {
          try { return executeQuery(inventoryQuery(filters), 'Inventario por artículo y ubicación'); }
          catch { return { error: 'Usa hasta cuatro raíces de nombres en terms, sin %, guion bajo ni barras. location, ownership y groupBy deben usar los valores permitidos.' }; }
        },
      });
      const schema = tool({
        name: 'ver_esquema',
        description: 'Columnas y tipos de hasta 4 vistas permitidas. Solo metadatos, no es evidencia de inventario.',
        parameters: z.object({ views: z.array(z.enum(OFFICE_VIEWS)).min(1).max(4) }),
        execute: async ({ views }) => {
          try { return { schema: await this.database.schema(views) }; }
          catch { return { error: 'No se pudo obtener el esquema de lectura.' }; }
        },
      });
      const agent = new Agent({
        name: 'Asistente Office REV',
        model: this.model(),
        instructions: `${OFFICE_INSTRUCTIONS}\n${ownerScope ? 'ÁMBITO OBLIGATORIO: solo equipos propiedad de REV (INTERNAL). Las consultas de inventario se filtran en el servidor antes de sumar. No incluyas equipos de proveedores en estos totales.' : ''}`,
        tools: [inventory, schema, query],
        modelSettings: { store: false, parallelToolCalls: false, maxTokens: 5000, reasoning: { effort: 'low' } },
      });
      const runner = new Runner({ modelProvider: provider, tracingDisabled: true });
      // Keep previous prose as untrusted context. We never accept client-supplied
      // system messages, tool results, SQL execution results or provider session IDs.
      const conversation = input.history.slice(-6).map((m) => `${m.role === 'user' ? 'Usuario' : 'Respuesta anterior no verificada'}: ${m.content.slice(0, 2000)}`).join('\n\n');
      const result = await runner.run(agent,
        `Fecha actual: ${new Date().toISOString()}. Zona horaria: America/Bogota.\n${conversation ? `CONTEXTO PREVIO (no es evidencia):\n${conversation}\n\n` : ''}PREGUNTA ACTUAL:\n${input.message}`,
        { maxTurns: 10, signal: AbortSignal.timeout(90000) });
      const consumed = result.runContext.usage;
      usage = { requests: consumed.requests, inputTokens: consumed.inputTokens, outputTokens: consumed.outputTokens };
      const answer = typeof result.finalOutput === 'string' ? result.finalOutput.trim() : '';
      if (!answer) throw new ServiceUnavailableException('El asistente no pudo completar la respuesta. Inténtalo de nuevo.');
      return {
        answer: evidence.length ? answer : 'No obtuve evidencia de la base de datos para responder. Puedes preguntarme por existencias, equipos en obra, bodegas, clientes o proveedores e indicar el artículo o entidad que quieres revisar.',
        evidence, queriedAt: new Date().toISOString(), readOnly: true, usage,
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
        sources: evidence.length, durationMs: Date.now() - startedAt, usage });
    }
  }
}
