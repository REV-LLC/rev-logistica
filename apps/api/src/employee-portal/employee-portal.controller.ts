import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EmployeesService } from '../transport/employees.service';
import { EmployeeLoansService } from '../transport/employee-loans.service';
import { EmployeeActivitiesService } from '../employee-activities/employee-activities.service';

type PersonalRequest = { user: { sub: string } };

// No employee ID input or write endpoint: each read resolves the active account's employee.
@Controller('employee-portal')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER, Role.OPERATOR)
export class EmployeePortalController {
  constructor(private readonly employees: EmployeesService, private readonly loans: EmployeeLoansService, private readonly activities: EmployeeActivitiesService) {}

  @Get('profile')
  @Header('Cache-Control', 'private, no-store')
  async profile(@Req() request: PersonalRequest) {
    return this.employees.getEmployeeProfile(await this.employees.ownEmployeeId(request.user.sub));
  }

  @Get('loans')
  @Header('Cache-Control', 'private, no-store')
  async account(@Req() request: PersonalRequest) {
    const account = await this.loans.get(await this.employees.ownEmployeeId(request.user.sub));
    return { ...account, entries: account.entries.map(({ id, type, date, detail, amount }) => ({ id, type, date, detail, amount })) };
  }

  @Get('activities')
  @Header('Cache-Control', 'private, no-store')
  async notes(@Req() request: PersonalRequest, @Query('month') month: string) {
    const notes = await this.activities.list(await this.employees.ownEmployeeId(request.user.sub), month);
    return notes.map(note => ({
      id: note.id, date: note.date, endDate: note.endDate, type: note.type, description: note.description,
      warehouseId: note.warehouseId, assetId: note.assetId, customerWorksiteId: note.customerWorksiteId,
      warehouse: note.warehouse, asset: note.asset,
      customerWorksite: note.customerWorksite ? {
        id: note.customerWorksite.id, alias: note.customerWorksite.alias,
        worksite: { name: note.customerWorksite.worksite.name, address: note.customerWorksite.worksite.address },
        customer: { name: note.customerWorksite.customer.name },
      } : null,
      createdBy: note.createdBy, createdAt: note.createdAt, updatedAt: note.updatedAt,
    }));
  }
}
