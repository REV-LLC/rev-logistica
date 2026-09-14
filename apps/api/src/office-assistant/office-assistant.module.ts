import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OfficeAssistantController } from './office-assistant.controller';
import { OfficeAssistantService } from './office-assistant.service';
import { OfficeDatabaseService } from './office-database.service';

@Module({
  imports: [AuthModule],
  controllers: [OfficeAssistantController],
  providers: [OfficeAssistantService, OfficeDatabaseService],
})
export class OfficeAssistantModule {}
