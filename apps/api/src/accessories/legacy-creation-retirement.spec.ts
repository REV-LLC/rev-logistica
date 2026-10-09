import { GoneException } from '@nestjs/common';
import { AccessoriesController } from './accessories.controller';
describe('retired accessory creation route', () => {
  it('does not create another parallel stock model', () => {
    const create = jest.fn();
    expect(() => new AccessoriesController({ create } as never).create()).toThrow(GoneException);
    expect(create).not.toHaveBeenCalled();
  });
});
