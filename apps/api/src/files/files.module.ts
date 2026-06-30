import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentEmailsModule } from '../document-emails/document-emails.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [AuthModule, DocumentEmailsModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
