import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(params: {
    key?: string;
    operation: string;
    userId: string;
    run: () => Promise<T>;
  }): Promise<T> {
    const key = params.key?.trim();
    if (!key) return params.run();
    if (key.length > 128) {
      throw new ConflictException('Idempotency key is too long');
    }

    const uniqueKey = {
      createdBy: params.userId,
      idempotencyKey: key,
    };
    const existing = await this.prisma.syncOperation.findUnique({
      where: { createdBy_idempotencyKey: uniqueKey },
    });
    if (existing) {
      if (existing.operation !== params.operation) {
        throw new ConflictException(
          'Idempotency key was already used for a different operation',
        );
      }
      if (existing.status === 'COMPLETED') return existing.response as T;
      throw new ConflictException(
        'Operation is already being processed; verify its result before retrying',
      );
    }

    try {
      await this.prisma.syncOperation.create({
        data: {
          idempotencyKey: key,
          operation: params.operation,
          createdBy: params.userId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return this.execute(params);
      }
      throw error;
    }

    let result: T;
    try {
      result = await params.run();
    } catch (error) {
      await this.prisma.syncOperation.deleteMany({
        where: { ...uniqueKey, status: 'PROCESSING' },
      });
      throw error;
    }

    // If persisting the response fails, PROCESSING remains and blocks a
    // potentially duplicated business mutation on retry.
    await this.prisma.syncOperation.update({
      where: { createdBy_idempotencyKey: uniqueKey },
      data: {
        status: 'COMPLETED',
        response: result as Prisma.InputJsonValue,
        completedAt: new Date(),
      },
    });
    return result;
  }
}
