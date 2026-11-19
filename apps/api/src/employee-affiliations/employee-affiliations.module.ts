import { CertificateRecognitionController } from './certificate-recognition.controller';
import { CertificateRecognitionService } from './certificate-recognition.service';
import { CertificateRecognitionWorker } from './certificate-recognition.worker';
import { CertificateTextReader } from './certificate-text-reader';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { EmployeeAffiliationsService } from './employee-affiliations.service';
import { EmployeeAffiliationsController } from './employee-affiliations.controller';
@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    EmployeeAffiliationsService,
    CertificateRecognitionService,
    CertificateRecognitionWorker,
    CertificateTextReader,
  ],
  controllers: [
    EmployeeAffiliationsController,
    CertificateRecognitionController,
  ],
})
export class EmployeeAffiliationsModule {}
