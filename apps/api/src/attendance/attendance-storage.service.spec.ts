import { S3Client } from '@aws-sdk/client-s3';
import { AttendanceStorageService } from './attendance-storage.service';
describe('Attendance evidence encryption', () => {
  const env = { ...process.env };
  let object: Buffer;
  let send: jest.SpyInstance;
  beforeEach(() => {
    Object.assign(process.env, {
      R2_ACCOUNT_ID: 'test',
      R2_ACCESS_KEY_ID: 'test',
      R2_SECRET_ACCESS_KEY: 'test',
      R2_BUCKET: 'test',
      ATTENDANCE_EVIDENCE_KEY: 'ab'.repeat(32),
    });
    send = jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (
      command: any,
    ) => {
      if (command.constructor.name === 'PutObjectCommand') {
        object = command.input.Body;
        expect(command.input.ContentType).toBe('application/octet-stream');
        return {};
      }
      return { Body: { transformToByteArray: async () => object } };
    }) as any);
  });
  afterEach(() => {
    send.mockRestore();
    process.env = { ...env };
  });
  it('stores ciphertext and only decrypts with the right key and object identity', async () => {
    const service = new AttendanceStorageService();
    const image = Buffer.from('private-face-image');
    await service.put('attendance/one', image);
    expect(object.includes(image)).toBe(false);
    expect(await service.get('attendance/one')).toEqual(image);
    await expect(service.get('attendance/other')).rejects.toThrow();
    process.env.ATTENDANCE_EVIDENCE_KEY = 'cd'.repeat(32);
    await expect(service.get('attendance/one')).rejects.toThrow();
  });
  it('fails closed if the encryption key is missing', async () => {
    delete process.env.ATTENDANCE_EVIDENCE_KEY;
    await expect(
      new AttendanceStorageService().put('x', Buffer.from('image')),
    ).rejects.toThrow('sin configurar');
    expect(send).not.toHaveBeenCalled();
  });
});
