import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, RequestMethod, ValidationPipe } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateLoanDescriptionDto } from './dto/update-loan-description.dto';
import { EmployeeLoansController } from './employee-loans.controller';

describe('Loan description API contract', () => {
  const validate = (value: unknown) => new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })
    .transform(value, { type: 'body', metatype: UpdateLoanDescriptionDto });

  it('accepts only a description at the dedicated PATCH endpoint', async () => {
    expect(await validate({ detail: 'Prestamo iphone 14 pro' })).toEqual({ detail: 'Prestamo iphone 14 pro' });
    const handler = EmployeeLoansController.prototype.updateDescription;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':employeeId/loans/:entryId/description');
  });

  it.each(['amount', 'date', 'type', 'employeeId', 'requestId', 'createdById', 'sourceReference', 'id'])('rejects attempts to change %s', async field => {
    await expect(validate({ detail: 'Descripción', [field]: 'modified' })).rejects.toThrow();
  });

  it.each([{}, { detail: '' }, { detail: ' \t\n' }, { detail: 123 }, { detail: null }, { detail: 'a'.repeat(501) }])('rejects invalid body %p', async body => {
    await expect(validate(body)).rejects.toThrow();
  });

  const guard = new RolesGuard(new Reflector());
  const context = (role?: Role) => ({
    getHandler: () => EmployeeLoansController.prototype.updateDescription,
    getClass: () => EmployeeLoansController,
    switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
  }) as unknown as ExecutionContext;

  it.each([Role.ADMIN, Role.OFFICE])('allows %s to correct descriptions', role => {
    expect(guard.canActivate(context(role))).toBe(true);
  });

  it.each([Role.DRIVER, Role.OPERATOR, Role.WAREHOUSE_TABLET, undefined])('rejects %s', role => {
    expect(() => guard.canActivate(context(role))).toThrow(ForbiddenException);
  });
});
