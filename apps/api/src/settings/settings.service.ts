import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { APP_SETTING_DEFINITIONS, AppSettingKey } from './settings.constants';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T extends boolean | number>(key: AppSettingKey): Promise<T> {
    const definition = APP_SETTING_DEFINITIONS[key];
    const row = await this.prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
    return (row?.value ?? definition.defaultValue) as T;
  }

  async list(category?: string) {
    const keys = (Object.keys(APP_SETTING_DEFINITIONS) as AppSettingKey[])
      .filter((key) => !category || APP_SETTING_DEFINITIONS[key].category === category.toUpperCase());
    const rows = await this.prisma.appSetting.findMany({ where: { key: { in: keys } } });
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return keys.map((key) => {
      const definition = APP_SETTING_DEFINITIONS[key];
      const row = byKey.get(key);
      return {
        key, value: row?.value ?? definition.defaultValue, category: definition.category,
        description: definition.description, updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  async update(values: Record<string, unknown>, userId: string) {
    const entries = Object.entries(values);
    if (!entries.length) throw new BadRequestException('At least one setting is required');
    for (const [key, value] of entries) this.validate(key, value);

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of entries) {
        const definition = APP_SETTING_DEFINITIONS[key as AppSettingKey];
        const existing = await tx.appSetting.findUnique({ where: { key }, select: { value: true } });
        const jsonValue = value as Prisma.InputJsonValue;
        await tx.appSetting.upsert({
          where: { key },
          create: { key, value: jsonValue, category: definition.category, description: definition.description },
          update: { value: jsonValue, category: definition.category, description: definition.description },
        });
        await tx.appSettingAudit.create({
          data: { settingKey: key, oldValue: existing?.value ?? Prisma.JsonNull, newValue: jsonValue, updatedByUserId: userId },
        });
      }
    });
    return this.list();
  }

  private validate(key: string, value: unknown) {
    const definition = APP_SETTING_DEFINITIONS[key as AppSettingKey];
    if (!definition) throw new BadRequestException(`Unknown setting: ${key}`);
    if (typeof value !== typeof definition.defaultValue) throw new BadRequestException(`Invalid value for ${key}`);
    if (typeof value === 'number') {
      const numericDefinition = definition as { min?: number; max?: number };
      if (!Number.isFinite(value) || (numericDefinition.min != null && value < numericDefinition.min)
        || (numericDefinition.max != null && value > numericDefinition.max)) {
        throw new BadRequestException(`Value out of range for ${key}`);
      }
    }
  }
}
