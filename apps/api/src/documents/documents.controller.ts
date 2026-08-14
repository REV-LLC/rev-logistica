import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  InternalServerErrorException,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentStatus, DocumentType, Role } from '@prisma/client';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ApplyDocumentItemsCutoffDto } from './dto/apply-document-items-cutoff.dto';
import { AutosaveDocumentRequestDto } from './dto/autosave-document-request.dto';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentRequestDto } from './dto/create-document-request.dto';
import { DecideDocumentRequestDto } from './dto/decide-document-request.dto';
import { UpdateDocumentItemBillingDto } from './dto/update-document-item-billing.dto';
import { UpdateDocumentRequestDto } from './dto/update-document-request.dto';
import { SubmitAutosavedDocumentRequestDto } from './dto/submit-autosaved-document-request.dto';
import { DocumentsService } from './documents.service';
import { IdempotencyService } from '../common/idempotency.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}

@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.OFFICE)
  async createDocument(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateDocumentDto,
    @Req() request: Request & { user: JwtPayload },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute({
      key: idempotencyKey,
      operation: 'documents.create',
      userId: request.user.sub,
      run: () => this.documentsService.createDocument({
        ...payload,
        createdBy: request.user.sub,
      }),
    });
  }

  @Post('requests')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  async createRequest(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: CreateDocumentRequestDto,
    @Req() request: Request & { user: JwtPayload },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const type =
      payload.type === DocumentType.REMISSION ||
      payload.type === DocumentType.RETURN
        ? payload.type
        : null;
    if (!type) {
      throw new BadRequestException(
        'Solo se permiten solicitudes de remisión o devolución',
      );
    }
    if (payload.sendWhatsapp === false && request.user.role === Role.DRIVER) {
      throw new ForbiddenException(
        'Solo administración y oficina pueden omitir el envío por WhatsApp',
      );
    }
    return this.idempotency.execute({
      key: idempotencyKey,
      operation: 'documents.requests.create',
      userId: request.user.sub,
      run: () => this.documentsService.createRequestDocument({
        ...payload,
        type,
        createdBy: request.user.sub,
      }),
    });
  }

  @Post('requests/autosave')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  async createAutosavedRequest(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: AutosaveDocumentRequestDto,
    @Req() request: Request & { user: JwtPayload },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute({
      key: idempotencyKey,
      operation: 'documents.requests.autosave.create',
      userId: request.user.sub,
      run: () => this.documentsService.createAutosavedRequestDocument({
        ...payload,
        createdBy: request.user.sub,
      }),
    });
  }

  @Patch(':documentId/request/autosave')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  async updateAutosavedRequest(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: AutosaveDocumentRequestDto,
    @Req() request: Request & { user: JwtPayload },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute({
      key: idempotencyKey,
      operation: `documents.requests.autosave.update:${documentId}`,
      userId: request.user.sub,
      run: () => this.documentsService.updateAutosavedRequestDocument(
        documentId,
        payload,
        request.user,
      ),
    });
  }

  @Post(':documentId/request/submit')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  async submitAutosavedRequest(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: SubmitAutosavedDocumentRequestDto,
    @Req() request: Request & { user: JwtPayload },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (payload.sendWhatsapp === false && request.user.role === Role.DRIVER) {
      throw new ForbiddenException(
        'Solo administración y oficina pueden omitir el envío por WhatsApp',
      );
    }
    return this.idempotency.execute({
      key: idempotencyKey,
      operation: `documents.requests.autosave.submit:${documentId}`,
      userId: request.user.sub,
      run: () => this.documentsService.submitAutosavedRequestDocument(
        documentId,
        payload,
        request.user,
      ),
    });
  }

  @Patch(':documentId/request')
  @Roles(Role.ADMIN, Role.OFFICE)
  updateRequest(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateDocumentRequestDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    if (
      payload.type &&
      payload.type !== DocumentType.REMISSION &&
      payload.type !== DocumentType.RETURN
    ) {
      throw new BadRequestException(
        'Solo se permiten solicitudes de remisión o devolución',
      );
    }
    return this.documentsService.updateRequestDocument(
      documentId,
      payload,
      request.user.sub,
    );
  }

  @Patch(':documentId/items/:itemId/billing')
  @Roles(Role.ADMIN, Role.OFFICE)
  updateDocumentItemBilling(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: UpdateDocumentItemBillingDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.documentsService.updateDocumentItemBilling(
      documentId,
      itemId,
      payload,
      request.user.sub,
    );
  }

  @Patch(':documentId/items/billing-cutoff')
  @Roles(Role.ADMIN, Role.OFFICE)
  applyDocumentItemsBillingCutoff(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: ApplyDocumentItemsCutoffDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.documentsService.applyDocumentItemsBillingCutoff(
      documentId,
      payload.billingCutoffDate,
      request.user.sub,
    );
  }

  @Get()
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  listDocuments(
    @Req() request: Request & { user: JwtPayload },
    @Query('status') status?: DocumentStatus,
    @Query('type') type?: DocumentType,
    @Query('take') take?: string,
  ) {
    try {
      if (status && !Object.values(DocumentStatus).includes(status)) {
        throw new BadRequestException('Invalid status');
      }
      if (type && !Object.values(DocumentType).includes(type)) {
        throw new BadRequestException('Invalid type');
      }
      const parsedTake = take ? Number(take) : undefined;
      if (take && Number.isNaN(parsedTake)) {
        throw new BadRequestException('Invalid take');
      }
      return this.documentsService.listDocuments({
        role: request.user.role,
        userId: request.user.sub,
        status,
        type,
        take: parsedTake,
      });
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const message = error instanceof Error ? error.message : 'unknown error';
      throw new InternalServerErrorException(
        `List documents failed: ${message}`,
      );
    }
  }

  @Post(':documentId/decision')
  @Roles(Role.ADMIN, Role.OFFICE)
  decideDocument(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    payload: DecideDocumentRequestDto,
    @Req() request: Request & { user: JwtPayload },
  ) {
    if (payload.action === 'APPROVE') {
      return this.documentsService.approveRequestDocument(
        documentId,
        request.user.sub,
      );
    }
    return this.documentsService.rejectRequestDocument(
      documentId,
      request.user.sub,
      payload.reason,
    );
  }

  @Post(':documentId/customer-email/draft')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  async sendDraftCustomerEmail(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Req() request: Request & { user: JwtPayload },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute({
      key: idempotencyKey,
      operation: `documents.customer-email.draft:${documentId}`,
      userId: request.user.sub,
      run: () => this.documentsService.sendDraftCustomerEmail(documentId),
    });
  }

  @Post(':documentId/customer-email/final')
  @Roles(Role.ADMIN, Role.OFFICE)
  sendFinalCustomerEmail(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
  ) {
    return this.documentsService.sendFinalCustomerEmail(documentId);
  }

  @Post(':documentId/customer-messages/draft')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  async sendDraftCustomerMessages(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Req() request: Request & { user: JwtPayload },
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute({
      key: idempotencyKey,
      operation: `documents.customer-messages.draft:${documentId}`,
      userId: request.user.sub,
      run: () => this.documentsService.sendDraftCustomerMessages(documentId),
    });
  }

  @Get(':documentId')
  @Roles(Role.ADMIN, Role.OFFICE, Role.DRIVER)
  getDocument(
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Req() request: Request & { user: JwtPayload },
  ) {
    return this.documentsService.getDocument(documentId, {
      role: request.user.role,
      userId: request.user.sub,
    });
  }
}
