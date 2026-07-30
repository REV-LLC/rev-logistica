import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateCatalogOptionsDto } from './dto/update-catalog-options.dto';

export const CATALOG_GROUPS = [
  'BULK_FORMWORK_LINES',
  'BULK_FORMWORK_WIDTHS',
  'BULK_FORMWORK_HEIGHTS',
  'BULK_CERTIFIED_SCAFFOLD_PARTS',
  'BULK_CERTIFIED_SCAFFOLD_MEASURES',
  'BULK_CERTIFIED_SCAFFOLD_WITHOUT_MEASURE',
  'BULK_CONVENTIONAL_SCAFFOLD_PARTS',
  'BULK_CONVENTIONAL_SCAFFOLD_MEASURES',
  'BULK_CONVENTIONAL_SCAFFOLD_WITH_MEASURE',
  'SERIAL_ASSET_BRANDS',
] as const;

const CATALOG_GROUP_SET = new Set<string>(CATALOG_GROUPS);

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listOptions(groupKey?: string) {
    if (groupKey && !CATALOG_GROUP_SET.has(groupKey)) {
      throw new BadRequestException('Grupo de catalogo invalido');
    }

    const options = await this.prisma.catalogOption.findMany({
      where: groupKey ? { groupKey } : { groupKey: { in: [...CATALOG_GROUPS] } },
      orderBy: [{ groupKey: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      select: {
        id: true,
        groupKey: true,
        value: true,
        label: true,
        sortOrder: true,
        active: true,
      },
    });

    return options;
  }

  async replaceOptions(groupKey: string, payload: UpdateCatalogOptionsDto) {
    if (!CATALOG_GROUP_SET.has(groupKey)) {
      throw new BadRequestException('Grupo de catalogo invalido');
    }

    const normalized = payload.options.map((option, index) => {
      const value = option.value.trim().toUpperCase();
      const label = (option.label?.trim() || value).toUpperCase();
      if (!value) {
        throw new BadRequestException('Las opciones no pueden estar vacias');
      }
      return {
        value,
        label,
        active: option.active ?? true,
        sortOrder: (index + 1) * 10,
      };
    });

    const repeated = new Set<string>();
    normalized.forEach((option) => {
      if (repeated.has(option.value)) {
        throw new BadRequestException(`Opcion repetida: ${option.value}`);
      }
      repeated.add(option.value);
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.catalogOption.deleteMany({ where: { groupKey } });
      await tx.catalogOption.createMany({
        data: normalized.map((option) => ({
          groupKey,
          value: option.value,
          label: option.label,
          active: option.active,
          sortOrder: option.sortOrder,
        })),
      });
    });

    return this.listOptions(groupKey);
  }
}
