import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards, ValidationPipe } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ConfigureNotificationTopicDto, SetNotificationRecipientsDto } from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

interface JwtPayload { sub: string; email: string; role: Role }
const validation = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

@Controller('notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('reminders/me')
  myReminders(@Req() request: Request & { user: JwtPayload }) {
    return this.notifications.listReminders(request.user.sub);
  }

  @Get('reminders')
  @Roles(Role.ADMIN, Role.OFFICE)
  allReminders() {
    return this.notifications.listReminders();
  }

  @Get('entities/:entityType/:entityId/topics')
  @Roles(Role.ADMIN, Role.OFFICE)
  entityTopics(
    @Param('entityType') entityType: string,
    @Param('entityId', new ParseUUIDPipe()) entityId: string,
  ) {
    return this.notifications.getEntityTopics(entityType, entityId);
  }

  @Put('topics/:topicId/recipients')
  @Roles(Role.ADMIN, Role.OFFICE)
  setRecipients(
    @Param('topicId', new ParseUUIDPipe()) topicId: string,
    @Body(validation) payload: SetNotificationRecipientsDto,
  ) {
    return this.notifications.setRecipients(topicId, payload.recipients);
  }

  @Post('entities/:entityType/:entityId/topics')
  @Roles(Role.ADMIN, Role.OFFICE)
  configureDateTopic(
    @Param('entityType') entityType: string,
    @Param('entityId', new ParseUUIDPipe()) entityId: string,
    @Body(validation) payload: ConfigureNotificationTopicDto,
  ) {
    return this.notifications.configureDateTopic(entityType, entityId, payload);
  }

  @Post('dispatch')
  @Roles(Role.ADMIN, Role.OFFICE)
  dispatch() {
    return this.notifications.dispatchNotifications();
  }
}
