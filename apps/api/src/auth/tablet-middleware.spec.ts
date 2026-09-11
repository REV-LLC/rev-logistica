import { UppercaseBodyMiddleware } from '../common/middleware/uppercase-body.middleware';

describe('tablet credentials through request normalization', () => {
  it('preserves the password and document authorization token exactly', () => {
    const request = {
      body: {
        password: 'TabletSafe123',
        tabletEmployeeToken: 'abcdef0123456789',
        name: 'Ana',
        pin: '0042',
      },
    };
    new UppercaseBodyMiddleware().use(request as never, {} as never, jest.fn());
    expect(request.body).toEqual({
      password: 'TabletSafe123',
      tabletEmployeeToken: 'abcdef0123456789',
      name: 'ANA',
      pin: '0042',
    });
  });
});
