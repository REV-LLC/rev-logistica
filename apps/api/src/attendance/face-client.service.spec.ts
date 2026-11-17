import { FaceClientService } from './face-client.service';
describe('Face detection confidence contract', () => {
  const env = { ...process.env };
  const vector = Array.from({ length: 128 }, (_, i) => i === 0 ? 1 : 0);
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    process.env.FACE_SERVICE_URL = 'http://face.test';
    process.env.FACE_SERVICE_TOKEN = 'test-only';
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => { fetchMock.mockRestore(); process.env = { ...env }; });
  it('returns the detector confidence alongside the identity embedding', async () => {
    fetchMock.mockResolvedValue(Response.json({ vector, modelVersion: 'sface-test', detectionScore: .987, detectionThreshold: .9 }));
    expect(await new FaceClientService().extract(Buffer.from('fixture'))).toEqual({ vector, modelVersion: 'sface-test', detectionScore: .987, detectionThreshold: .9 });
  });
  it.each([null, -1, 1.1])('rejects invalid detection scores (%s)', async detectionScore => {
    fetchMock.mockResolvedValue(Response.json({ vector, modelVersion: 'sface-test', detectionScore, detectionThreshold: .9 }));
    await expect(new FaceClientService().extract(Buffer.from('fixture'))).rejects.toThrow('Respuesta facial inválida');
  });
  it('keeps rolling deployments compatible with the previous worker response', async () => {
    fetchMock.mockResolvedValue(Response.json({ vector, modelVersion: 'sface-test' }));
    const result = await new FaceClientService().extract(Buffer.from('fixture'));
    expect(result.detectionScore).toBeUndefined();
  });
});
