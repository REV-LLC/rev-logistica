import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertCanViewDocument } from './documents.service';

describe('document detail access', () => {
  it('allows a driver to view their own document', () => {
    expect(() =>
      assertCanViewDocument(
        { createdBy: 'driver-1' },
        { role: Role.DRIVER, userId: 'driver-1' },
      ),
    ).not.toThrow();
  });

  it('prevents a driver from viewing another user document', () => {
    expect(() =>
      assertCanViewDocument(
        { createdBy: 'driver-2' },
        { role: Role.DRIVER, userId: 'driver-1' },
      ),
    ).toThrow(ForbiddenException);
  });

  it('keeps office access to document details', () => {
    expect(() =>
      assertCanViewDocument(
        { createdBy: 'driver-1' },
        { role: Role.OFFICE, userId: 'office-1' },
      ),
    ).not.toThrow();
  });
});
