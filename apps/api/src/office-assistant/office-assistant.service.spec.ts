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
    const result = await service.ask('office-user', { message: '¿Cuántos equipos de REV hay?', history: [] });
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(database.query).toHaveBeenCalledWith(expect.any(String), 'Unidades', '1', 'INTERNAL');
    expect(result.evidence).toEqual([evidence]);
    expect(result.readOnly).toBe(true);
    expect(database.schema).not.toHaveBeenCalled();
    expect(result.usage).toHaveProperty('requests');
    model.assertComplete();
  });

  it('answers inventory with one database call and no schema exploration', async () => {
    const evidence = { id: '1', title: 'Inventario', rows: [{ articulo: 'Prueba', cantidad: '12' }],
      columns: ['articulo', 'cantidad'], views: ['inventory_balances'], rowCount: 1, truncated: false, queriedAt: '2026-09-15' };
    const database = { schema: jest.fn(), query: jest.fn().mockResolvedValue(evidence) };
    const model = new ScriptedModel([
      [functionCall('consultar_inventario', { terms: ['tornill'], location: 'WORKSITE', ownership: 'ALL', groupBy: 'LOCATION' }, { callId: 'inventory-1' })],
      [assistantMessage('Hay 12 unidades en obra [1].')],
    ]);
    jest.spyOn(OpenAIProvider.prototype, 'getModel').mockResolvedValue(model);
    const result = await new OfficeAssistantService(database as unknown as OfficeDatabaseService)
      .ask('office-user', { message: '¿Dónde están los tornillos de REV?', history: [] });
    expect(database.schema).not.toHaveBeenCalled();
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('SUM(quantity)'), expect.any(String), '1', 'INTERNAL');
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(result.evidence[0].rows).toEqual(evidence.rows);
    expect(JSON.stringify(model.lastCall?.request.input)).toContain('Prueba');
    model.assertComplete();
  });

  it('deduplicates within a question, but fetches fresh data for the next question', async () => {
    const evidence = { id: '1', title: 'Consulta', rows: [{ cantidad: '12' }], columns: ['cantidad'],
      views: ['inventory_balances'], rowCount: 1, truncated: false, queriedAt: '2026-09-15' };
    const database = { query: jest.fn().mockResolvedValue(evidence) };
    const sql = 'SELECT SUM(quantity) AS cantidad FROM rev_office.inventory_balances';
    const model = new ScriptedModel([
      [functionCall('consultar_datos', { sql, title: 'Consulta' }, { callId: 'query-1' })],
      [functionCall('consultar_datos', { sql, title: 'Repetida' }, { callId: 'query-2' })],
      [assistantMessage('12 [1].')],
      [functionCall('consultar_datos', { sql, title: 'Consulta' }, { callId: 'query-3' })],
      [assistantMessage('12 [1].')],
    ]);
    jest.spyOn(OpenAIProvider.prototype, 'getModel').mockResolvedValue(model);
    const service = new OfficeAssistantService(database as unknown as OfficeDatabaseService);
    const first = await service.ask('office-user', { message: 'Inventario', history: [] });
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(first.evidence).toHaveLength(1);
    await service.ask('office-user', { message: 'Inventario', history: [] });
    expect(database.query).toHaveBeenCalledTimes(2);
    model.assertComplete();
  });

  it('loads only requested schema without treating metadata as evidence', async () => {
    const database = { schema: jest.fn().mockResolvedValue('rev_office.customers (customer_name: text)') };
    const model = new ScriptedModel([
      [functionCall('ver_esquema', { views: ['customers'] }, { callId: 'schema-1' })],
      [assistantMessage('Hay 123 clientes.')],
    ]);
    jest.spyOn(OpenAIProvider.prototype, 'getModel').mockResolvedValue(model);
    const result = await new OfficeAssistantService(database as unknown as OfficeDatabaseService)
      .ask('office-user', { message: 'Clientes', history: [] });
    expect(database.schema).toHaveBeenCalledWith(['customers']);
    expect(result.evidence).toHaveLength(0);
    expect(result.answer).not.toContain('123');
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
