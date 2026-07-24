import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FilesModule } from '../files/files.module';
import { MobilityGuidesController } from './mobility-guides.controller';
import { MobilityGuidesService } from './mobility-guides.service';

@Module({
  imports: [AuthModule, FilesModule],
  controllers: [MobilityGuidesController],
  providers: [MobilityGuidesService],
})
export class MobilityGuidesModule {}
