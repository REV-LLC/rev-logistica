import { OpenAIProvider } from '@openai/agents';
import { ScriptedModel, assistantMessage, functionCall } from '@openai/agents/testing';
import { OfficeAssistantService } from './office-assistant.service';
import { OfficeDatabaseService } from './office-database.service';

describe('Office agent loop (no external requests)', () => {
  const oldKey = process.env.OPENAI_API_KEY;
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-placeholder-not-sent';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldKey;
  });

  it('executes the database tool and returns server-generated evidence', async () => {
    const evidence = { id: '1', title: 'Unidades', rows: [{ unidades: '12' }],
      columns: ['unidades'], views: ['inventory_balances'], rowCount: 1, truncated: false, queriedAt: '2026-09-14' };
    const database = { schema: jest.fn().mockResolvedValue('rev_office.inventory_balances (quantity: numeric)'),
      query: jest.fn().mockResolvedValue(evidence) };
    const model = new ScriptedModel([
      [functionCall('consultar_datos', { sql: 'SELECT SUM(quantity) AS unidades FROM rev_office.inventory_balances', title: 'Unidades' }, { callId: 'query-1' })],
      [assistantMessage('Hay 12 unidades según la consulta [1].')],
    ]);
    jest.spyOn(OpenAIProvider.prototype, 'getModel').mockResolvedValue(model);
    const service = new OfficeAssistantService(database as unknown as OfficeDatabaseService);
    const result = await service.ask('office-user', { message: '¿Cuántos hay?', history: [] });
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(result.evidence).toEqual([evidence]);
    expect(result.readOnly).toBe(true);
    model.assertComplete();
  });

  it('does not return invented facts without a successful database query', async () => {
    const model = new ScriptedModel([[assistantMessage('Hay 999 tornillos en la obra inventada.')]]);
    jest.spyOn(OpenAIProvider.prototype, 'getModel').mockResolvedValue(model);
    const database = { schema: jest.fn().mockResolvedValue('schema') };
    const service = new OfficeAssistantService(database as unknown as OfficeDatabaseService);
    const result = await service.ask('office-user', { message: '¿Dónde están?', history: [] });
    expect(result.answer).not.toContain('999');
    expect(result.answer).toContain('No obtuve evidencia');
  });

  it('does not leak database error text to the model or the response', async () => {
    const database = { schema: jest.fn().mockResolvedValue('schema'),
      query: jest.fn().mockRejectedValue(Object.assign(new Error('secret internal data'), { code: '42501' })) };
    const model = new ScriptedModel([
      [functionCall('consultar_datos', { sql: 'SELECT * FROM rev_office.catalog', title: 'Consulta' }, { callId: 'query-1' })],
      [assistantMessage('No hay datos verificados.')],
    ]);
    jest.spyOn(OpenAIProvider.prototype, 'getModel').mockResolvedValue(model);
    const service = new OfficeAssistantService(database as unknown as OfficeDatabaseService);
    const result = await service.ask('office-user', { message: 'Consulta', history: [] });
    expect(JSON.stringify(model.lastCall?.request.input)).not.toContain('secret internal data');
    expect(result.evidence).toEqual([]);
  });
});
