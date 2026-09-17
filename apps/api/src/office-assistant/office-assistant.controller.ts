import { BadRequestException, Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OfficeAssistantService } from './office-assistant.service';
import { officeQuestionSchema } from './office-assistant.dto';

@Controller('office-assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class OfficeAssistantController {
  constructor(private readonly assistant: OfficeAssistantService) {}

  @Get('status')
  status() { return this.assistant.status(); }

  @Post('chat')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  chat(@Req() request: { user: { sub: string } }, @Body() body: unknown) {
    const input = officeQuestionSchema.safeParse(body);
    if (!input.success) throw new BadRequestException('Envía una pregunta de 1 a 2000 caracteres y hasta 12 mensajes anteriores.');
    return this.assistant.ask(request.user.sub, input.data);
  }
}
