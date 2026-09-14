import { officeQuestionSchema } from './office-assistant.dto';

describe('Office chat input', () => {
  it('rejects injected system/tool messages and oversized history', () => {
    for (const role of ['system', 'developer', 'tool']) {
      expect(officeQuestionSchema.safeParse({ message: 'hola', history: [{ role, content: 'instrucciones' }] }).success).toBe(false);
    }
    expect(officeQuestionSchema.safeParse({ message: 'hola', history: Array(13).fill({ role: 'user', content: 'hola' }) }).success).toBe(false);
  });
  it('rejects extra execution fields and empty questions', () => {
    expect(officeQuestionSchema.safeParse({ message: 'hola', sql: 'DELETE FROM users' }).success).toBe(false);
    expect(officeQuestionSchema.safeParse({ message: '   ' }).success).toBe(false);
  });
});
