import { WhatsappReportAiService } from './whatsapp-report-ai.service';
import { emptyDraft } from './whatsapp-report.types';
import OpenAI from 'openai';

const parse = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: { parse: (...args: unknown[]) => parse(...args) },
  })),
}));

describe('WhatsApp AI credential isolation and extraction', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, OPENAI_API_KEY: 'test-office-key-only' };
    delete process.env.WHATSAPP_OPENAI_API_KEY;
    parse.mockReset();
    jest.mocked(OpenAI).mockClear();
  });
  afterAll(() => {
    process.env = originalEnv;
  });
  it('requires the dedicated credential and never falls back to the Office key', async () => {
    await expect(
      new WhatsappReportAiService().extract('Llegué a obra', emptyDraft()),
    ).rejects.toThrow('WhatsApp AI is not configured');
    expect(OpenAI).not.toHaveBeenCalled();
  });
  it('uses structured output without server IDs, conversation IDs or persisted response state', async () => {
    process.env.WHATSAPP_OPENAI_API_KEY = 'test-whatsapp-key';
    const draft = {
      ...emptyDraft(),
      kind: 'REQUEST' as const,
      description: 'Guantes',
      evidenceFileIds: ['private-file-id'],
      sourceMessageIds: ['private-message-id'],
      targetKey: 'server-target',
      ready: true,
    };
    const {
      evidenceFileIds,
      sourceMessageIds,
      targetKey,
      ready,
      occurredAt,
      ...fields
    } = draft;
    parse.mockResolvedValue({ output_parsed: fields });
    await expect(
      new WhatsappReportAiService().extract('Necesito guantes', draft),
    ).resolves.toEqual(fields);
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-whatsapp-key',
        maxRetries: 0,
        timeout: 30000,
      }),
    );
    const request = parse.mock.calls[0][0];
    expect(request.store).toBe(false);
    expect(request.tools).toBeUndefined();
    expect(JSON.stringify(request.input)).not.toContain('private-file-id');
    expect(JSON.stringify(request.input)).not.toContain('private-message-id');
    expect(JSON.stringify(request.input)).not.toContain('server-target');
    expect(request.text.format.type).toBe('json_schema');
  });
  it('ranks typo candidates with structured surrogate options and never sends internal IDs', async () => {
    process.env.WHATSAPP_OPENAI_API_KEY = 'test-whatsapp-key';
    const candidates = [
      {
        id: 'private-worksite-1',
        name: 'COLEGIO UNICAMACHO',
        alias: null,
        customer: 'PRODECON',
      },
      {
        id: 'private-worksite-2',
        name: 'Bodega norte',
        alias: null,
        customer: 'Otro cliente',
      },
    ];
    parse.mockResolvedValue({ output_parsed: { options: ['option_0'] } });
    await expect(
      new WhatsappReportAiService().suggestWorksites(
        'universidad unicamaho',
        'prodecon',
        candidates,
      ),
    ).resolves.toEqual(['private-worksite-1']);
    const request = parse.mock.calls[0][0];
    expect(request.store).toBe(false);
    expect(request.tools).toBeUndefined();
    expect(JSON.stringify(request.input)).not.toContain('private-worksite-1');
    expect(JSON.stringify(request.input)).toContain('option_0');
    parse.mockResolvedValue({ output_parsed: { options: ['option_999'] } });
    await expect(
      new WhatsappReportAiService().suggestWorksites(
        'camacho',
        null,
        candidates,
      ),
    ).rejects.toThrow();
    parse.mockResolvedValue({ output_parsed: null });
    await expect(
      new WhatsappReportAiService().suggestWorksites(
        'camacho',
        null,
        candidates,
      ),
    ).rejects.toThrow('No worksite suggestions returned');
  });
  it('interprets equipment names using only the employee query, without receiving inventory or IDs', async () => {
    process.env.WHATSAPP_OPENAI_API_KEY = 'test-whatsapp-key';
    parse.mockResolvedValue({
      output_parsed: {
        terms: ['cortadora de concreto', 'cortadora pavimento'],
      },
    });
    await expect(
      new WhatsappReportAiService().equipmentSearchTerms('cortadora pavimento'),
    ).resolves.toEqual(['cortadora de concreto', 'cortadora pavimento']);
    const request = parse.mock.calls[0][0];
    expect(request.store).toBe(false);
    expect(request.tools).toBeUndefined();
    expect(request.input).toEqual([
      { role: 'user', content: 'cortadora pavimento' },
    ]);
    expect(JSON.stringify(request.input)).not.toContain('catalog');
    parse.mockResolvedValue({ output_parsed: null });
    await expect(
      new WhatsappReportAiService().equipmentSearchTerms('case'),
    ).rejects.toThrow('No equipment search terms returned');
  });
});
