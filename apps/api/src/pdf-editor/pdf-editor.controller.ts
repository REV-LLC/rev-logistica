import { BadRequestException, Body, Controller, Header, Module, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PdfEditorService } from './pdf-editor.service';

type Uploads = { pdf?: { buffer: Buffer }[] };
const uploads = FileFieldsInterceptor([{ name: 'pdf', maxCount: 1 }], {
  limits: { fileSize: 15 * 1024 * 1024, files: 1, fields: 6, fieldSize: 24 * 1024 },
});

@Controller('pdf-editor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OFFICE)
export class PdfEditorController {
  constructor(private readonly editor: PdfEditorService) {}

  private pdf(files: Uploads) {
    const bytes = files?.pdf?.[0]?.buffer;
    if (!bytes) throw new BadRequestException('Selecciona un archivo PDF.');
    return bytes;
  }

  @Post('inspect')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(uploads)
  inspect(@UploadedFiles() files: Uploads, @Body() body: Record<string, string>) {
    return this.editor.inspect(this.pdf(files), body.page ?? '0');
  }

  @Post('edit')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(uploads)
  edit(@UploadedFiles() files: Uploads, @Body() body: Record<string, string>) {
    return this.editor.edit(this.pdf(files), body);
  }
}

@Module({ imports: [AuthModule], controllers: [PdfEditorController], providers: [PdfEditorService] })
export class PdfEditorModule {}
