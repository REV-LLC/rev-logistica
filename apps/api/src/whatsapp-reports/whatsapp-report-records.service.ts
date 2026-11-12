import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Employee, Prisma, Role, WhatsappReportKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  Draft,
  isAttendance,
  locationEvidenceSchema,
  locationCoordinatesSchema,
  normalized,
  normalizePhone,
  REPORT_LABELS,
} from './whatsapp-report.types';

import {
  findEquipment,
  assetLabel,
  readableDescription,
} from './whatsapp-equipment';

type Target = {
  assetId: string | null;
  vehicleId: string | null;
  customerWorksiteId: string | null;
  attendanceId?: string;
  label: string;
};
const reportInclude = {
  employee: { select: { id: true, name: true, lastName: true } },
  asset: {
    select: {
      id: true,
      publicCode: true,
      internalNumber: true,
      sku: { select: { name: true } },
    },
  },
  vehicle: { select: { id: true, plate: true } },
  customerWorksite: {
    select: {
      id: true,
      alias: true,
      worksite: { select: { name: true } },
      customer: { select: { name: true } },
    },
  },
  alertRecipients: {
    select: { id: true, name: true, status: true, error: true, sentAt: true },
  },
  evidence: {
    select: {
      fileObject: { select: { id: true, originalName: true, mimeType: true } },
    },
  },
} as const;

@Injectable()
export class WhatsappReportRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    draft: Draft,
    employeeId?: string,
  ): Promise<{
    target?: Target;
    question?: string;
    needsEquipment?: boolean;
    needsWorksite?: boolean;
  }> {
    if (!draft.kind)
      return {
        question:
          '¿Quieres reportar un daño, horómetro, petición, entrada o salida de obra?',
      };
    const target: Target = {
      assetId: null,
      vehicleId: null,
      customerWorksiteId: null,
      label: '',
    };
    if (draft.kind === 'DAMAGE' || draft.kind === 'HOUR_METER') {
      if (draft.selectedEquipment) {
        const selected = await findEquipment(
          this.prisma,
          draft.selectedEquipment,
          draft.kind,
        );
        if (!selected)
          return {
            needsEquipment: true,
            question:
              'Esa máquina ya no está disponible para este reporte. Elige otra máquina.',
          };
        Object.assign(target, {
          assetId: selected.assetId,
          vehicleId: selected.vehicleId,
          label: selected.label,
        });
      } else {
        const reference = draft.subjectReference?.trim();
        if (!reference)
          return {
            needsEquipment: true,
            question: 'Elige la máquina en la lista o escribe su nombre.',
          };
        const ref = normalized(reference);
        const namedNumber = reference.match(/^(.+?)\s*#?\s+(\d+)$/);
        const plateParts = reference
          .replace(/[^a-z0-9]/gi, '')
          .match(/^([a-z]+)([0-9].*)$/i);
        const number = /^#?0*\d+$/.test(reference)
          ? Number(reference.replace('#', ''))
          : undefined;
        const [assets, vehicles] = await Promise.all([
          this.prisma.asset.findMany({
            where: {
              ...(draft.subjectType === 'VEHICLE'
                ? { id: '__excluded__' }
                : {}),
              active: true,
              deletedAt: null,
              OR: [
                { publicCode: { equals: reference, mode: 'insensitive' } },
                {
                  registrationNumber: {
                    equals: reference,
                    mode: 'insensitive',
                  },
                },
                ...(number !== undefined ? [{ internalNumber: number }] : []),
                ...(namedNumber
                  ? [
                      {
                        internalNumber: Number(namedNumber[2]),
                        OR: [
                          {
                            sku: {
                              name: {
                                contains: namedNumber[1].trim(),
                                mode: 'insensitive' as const,
                              },
                            },
                          },
                          {
                            description: {
                              contains: namedNumber[1].trim(),
                              mode: 'insensitive' as const,
                            },
                          },
                        ],
                      },
                    ]
                  : []),
                { sku: { name: { contains: reference, mode: 'insensitive' } } },
                { description: { contains: reference, mode: 'insensitive' } },
              ],
            },
            include: { sku: { select: { name: true, chargeType: true } } },
            take: 21,
          }),
          this.prisma.vehicle.findMany({
            where: {
              ...(draft.subjectType === 'ASSET' ? { id: '__excluded__' } : {}),
              active: true,
              OR: [
                { plate: { equals: reference, mode: 'insensitive' } },
                {
                  plate: {
                    equals: reference.replace(/[^a-z0-9]/gi, ''),
                    mode: 'insensitive',
                  },
                },
                ...(plateParts
                  ? [
                      {
                        plate: {
                          equals: `${plateParts[1]}-${plateParts[2]}`,
                          mode: 'insensitive' as const,
                        },
                      },
                      {
                        plate: {
                          equals: `${plateParts[1]} ${plateParts[2]}`,
                          mode: 'insensitive' as const,
                        },
                      },
                    ]
                  : []),
              ],
            },
            take: 21,
          }),
        ]);
        const exactAssets = assets.filter((a) =>
          [a.publicCode, a.registrationNumber].some(
            (v) => v && normalized(v) === ref,
          ),
        );
        const choices = [
          ...(exactAssets.length ? exactAssets : assets).map((a) => ({
            assetId: a.id,
            vehicleId: null,
            label: assetLabel(a),
            hourly: a.sku.chargeType === 'HOUR',
          })),
          ...vehicles.map((v) => ({
            assetId: null,
            vehicleId: v.id,
            label: `Vehículo ${v.plate}`,
            hourly: true,
          })),
        ];
        if (choices.length !== 1)
          return {
            needsEquipment: true,
            question: choices.length
              ? `Hay varios equipos posibles: ${choices
                  .slice(0, 6)
                  .map((c) => c.label)
                  .join('; ')}. Escribe el código completo o la placa.`
              : 'No encontré ese equipo o vehículo activo. Revisa el código completo o la placa.',
          };
        if (draft.kind === 'HOUR_METER' && !choices[0].hourly)
          return {
            needsEquipment: true,
            question:
              'Ese equipo no maneja horómetro. Indica un equipo por horas o un vehículo.',
          };
        Object.assign(target, choices[0]);
      }
    }
    if (draft.kind === 'CHECK_OUT') {
      const open = employeeId
        ? await this.prisma.worksiteAttendance.findFirst({
            where: { employeeId, leftAt: null },
            include: {
              customerWorksite: { include: { worksite: true, customer: true } },
            },
          })
        : null;
      if (!open)
        return {
          question:
            'No tienes una entrada abierta. Revisa con oficina antes de registrar la salida.',
        };
      const site = open.customerWorksite;
      if (!site.active || !site.worksite.active || !site.customer.active)
        return {
          question:
            'La obra de tu entrada abierta ya no está activa. Comunícate con oficina.',
        };
      target.customerWorksiteId = site.id;
      target.attendanceId = open.id;
      target.label = `${site.worksite.name} (${site.customer.name})`;
    }
    if (draft.kind === 'CHECK_IN') {
      if (draft.selectedWorksiteId) {
        const site = await this.prisma.customerWorksite.findFirst({
          where: {
            id: draft.selectedWorksiteId,
            active: true,
            customer: { active: true },
            worksite: { active: true },
          },
          include: { worksite: true, customer: true },
        });
        if (!site)
          return {
            needsWorksite: true,
            question: 'Esa obra ya no está disponible. Elige otra en la lista.',
          };
        target.customerWorksiteId = site.id;
        target.label = `${site.worksite.name} (${site.customer.name})`;
      } else {
        if (!draft.worksiteReference?.trim())
          return {
            needsWorksite: true,
            question: 'Elige la obra en la lista.',
          };
        const reference = draft.worksiteReference.trim();
        const terms = normalized(reference)
          .split(' ')
          .filter(Boolean)
          .slice(0, 12);
        const sites = await this.prisma.customerWorksite.findMany({
          where: {
            active: true,
            customer: {
              active: true,
              ...(draft.customerReference
                ? {
                    name: {
                      contains: draft.customerReference,
                      mode: 'insensitive' as const,
                    },
                  }
                : {}),
            },
            worksite: { active: true },
            OR: [
              { alias: { contains: reference, mode: 'insensitive' as const } },
              {
                worksite: {
                  name: { contains: reference, mode: 'insensitive' as const },
                },
              },
              {
                AND: terms.map((term) => ({
                  OR: [
                    { alias: { contains: term, mode: 'insensitive' as const } },
                    {
                      worksite: {
                        name: { contains: term, mode: 'insensitive' as const },
                      },
                    },
                  ],
                })),
              },
            ],
          },
          include: { worksite: true, customer: true },
          take: 21,
        });
        const exact = sites.filter(
          (site) =>
            normalized(site.alias ?? '') === normalized(reference) ||
            normalized(site.worksite.name) === normalized(reference),
        );
        const choices = exact.length ? exact : sites;
        if (choices.length !== 1)
          return {
            needsWorksite: true,
            question: 'Elige la obra en la lista para evitar confusiones.',
          };
        target.customerWorksiteId = choices[0].id;
        target.label = `${choices[0].worksite.name} (${choices[0].customer.name})`;
      }
    }
    if (
      (draft.kind === 'DAMAGE' || draft.kind === 'REQUEST') &&
      !draft.description?.trim()
    ) {
      return {
        question:
          draft.kind === 'DAMAGE'
            ? 'Cuéntame qué daño o falla encontraste. Puedes adjuntar fotos ahora usando el clip o el botón + de WhatsApp → Fotos/Galería; son opcionales.'
            : 'Cuéntame qué necesitas solicitar a oficina y gerencia.',
      };
    }
    if (
      (draft.kind === 'HOUR_METER' ||
        (isAttendance(draft.kind) &&
          !locationEvidenceSchema.safeParse(draft.location).success)) &&
      !draft.evidenceFileIds.length
    ) {
      return {
        question:
          draft.kind === 'HOUR_METER'
            ? 'Envía una foto legible del horómetro para adjuntarla como evidencia.'
            : `${draft.kind === 'CHECK_OUT' ? `Tu entrada abierta es en ${target.label}.\n` : ''}Envía tu ubicación o una foto de tu entrada o salida; solo necesitas una. Para ubicación: clip → Ubicación → Enviar mi ubicación actual.`,
      };
    }
    if (draft.kind === 'HOUR_METER') {
      if (draft.hours === null)
        return {
          question:
            '¿Cuántas horas marca el horómetro? Escribe el valor con sus decimales.',
        };
      if (
        draft.photoHours !== null &&
        Math.abs(draft.photoHours - draft.hours) > 0.01
      )
        return {
          question: `La foto parece marcar ${draft.photoHours} horas y escribiste ${draft.hours}. Revisa la lectura y envía una foto nueva si hace falta.`,
        };
      const latest = target.assetId
        ? Number(
            (
              await this.prisma.asset.findUniqueOrThrow({
                where: { id: target.assetId },
                select: { hourMeter: true },
              })
            ).hourMeter,
          )
        : Number(
            (
              await this.prisma.vehicleHourReading.findFirst({
                where: { vehicleId: target.vehicleId! },
                orderBy: { hours: 'desc' },
              })
            )?.hours ?? 0,
          );
      if (draft.hours < latest)
        return {
          question: `El último horómetro registrado es ${latest}. La lectura no puede disminuir; revisa el valor y la foto.`,
        };
    }
    return { target };
  }

  summary(draft: Draft, target: Target) {
    return `${REPORT_LABELS[draft.kind!]}${target.label ? `: ${target.label}` : ''}\n${readableDescription(draft.description, draft.subjectReference)}${draft.kind === 'HOUR_METER' ? `\nHorómetro: ${draft.hours} h` : ''}\nFecha y hora del reporte: ${new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' }).format(new Date(draft.occurredAt))}\n${isAttendance(draft.kind) && draft.location ? `Ubicación: ${draft.location.latitude.toFixed(6)}, ${draft.location.longitude.toFixed(6)}.` : `Fotos: ${draft.evidenceFileIds.length}.`}\nPuedes agregar fotos antes de confirmar. Responde SÍ para registrar, corrige los datos o escribe CANCELAR.`;
  }

  async record(
    tx: Prisma.TransactionClient,
    employee: Employee,
    draft: Draft,
    target: Target,
    sourceMessageId: string,
  ) {
    if (!draft.kind) throw new BadRequestException('Falta el tipo de reporte');
    // The phone lease serializes conversations; row locks also protect against UI updates and other phones.
    await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${employee.id} FOR UPDATE`;
    const active = await tx.employee.findFirst({
      where: { id: employee.id, active: true },
    });
    if (
      !active ||
      normalizePhone(active.phone) !== normalizePhone(employee.phone)
    )
      throw new BadRequestException(
        'El empleado o su teléfono cambiaron. Comunícate con oficina.',
      );
    const occurredAt = new Date(draft.occurredAt);
    const evidence = await tx.fileObject.findMany({
      where: {
        id: { in: draft.evidenceFileIds },
        entityType: 'EMPLOYEE',
        entityId: employee.id,
        category: 'EVIDENCIA_WHATSAPP',
        mimeType: { startsWith: 'image/' },
      },
    });
    if (
      evidence.length !== draft.evidenceFileIds.length ||
      ((draft.kind === 'HOUR_METER' ||
        (isAttendance(draft.kind) &&
          !locationEvidenceSchema.safeParse(draft.location).success)) &&
        !evidence.length)
    ) {
      throw new BadRequestException(
        draft.kind === 'HOUR_METER'
          ? 'Falta una foto válida del horómetro. Vuelve a enviarla.'
          : 'Falta tu ubicación o una foto válida. Envía solo una de las dos.',
      );
    }
    const location =
      isAttendance(draft.kind) && draft.location
        ? locationEvidenceSchema.safeParse(draft.location)
        : null;
    if (location) {
      if (!location.success || evidence.length)
        throw new BadRequestException(
          'Envía ubicación o foto, solo una de las dos.',
        );
      const original = await tx.whatsappInboundMessage.findFirst({
        where: {
          providerMessageId: location.data.sourceMessageId,
          phone: normalizePhone(employee.phone)!,
          employeeId: employee.id,
          type: 'location',
        },
      });
      const coordinates = locationCoordinatesSchema.safeParse(
        original?.location,
      );
      if (
        !original ||
        !coordinates.success ||
        coordinates.data.latitude !== location.data.latitude ||
        coordinates.data.longitude !== location.data.longitude ||
        original.createdAt.toISOString() !== location.data.receivedAt ||
        original.sentAt.toISOString() !== location.data.sentAt
      )
        throw new BadRequestException(
          'No pude validar la ubicación. Compártela otra vez o envía una foto.',
        );
    }
    let actorId: string | undefined;
    if (['DAMAGE', 'HOUR_METER'].includes(draft.kind)) {
      const linkedUser = employee.userId
        ? await tx.user.findFirst({
            where: { id: employee.userId, active: true },
          })
        : null;
      const actor =
        linkedUser ??
        (process.env.WHATSAPP_REPORT_ACTOR_USER_ID
          ? await tx.user.findFirst({
              where: {
                id: process.env.WHATSAPP_REPORT_ACTOR_USER_ID,
                active: true,
                role: { in: [Role.ADMIN, Role.OFFICE] },
              },
            })
          : null);
      if (!actor)
        throw new ServiceUnavailableException(
          'Configure WhatsApp report actor for employees without an account',
        );
      actorId = actor.id;
    }
    if (target.assetId) {
      await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${target.assetId} FOR UPDATE`;
      const asset = await tx.asset.findFirst({
        where: { id: target.assetId, active: true, deletedAt: null },
        include: { sku: true },
      });
      if (!asset) throw new BadRequestException('El equipo ya no está activo.');
      if (draft.kind === 'HOUR_METER') {
        if (
          asset.sku.chargeType !== 'HOUR' ||
          draft.hours === null ||
          draft.hours < Number(asset.hourMeter)
        )
          throw new BadRequestException(
            'La lectura ya no es válida; revisa el horómetro actual.',
          );
        await tx.asset.update({
          where: { id: asset.id },
          data: { hourMeter: draft.hours },
        });
        await tx.assetHourReading.create({
          data: {
            assetId: asset.id,
            hours: draft.hours,
            previousHours: asset.hourMeter,
            operatorReportedHours: draft.hours,
            recordedAt: occurredAt,
            note: `WhatsApp: ${employee.name} ${employee.lastName}`,
            evidenceFileObjectId: evidence[0].id,
            recordedByUserId: actorId!,
          },
        });
      }
      if (draft.kind === 'DAMAGE') {
        await tx.asset.update({
          where: { id: asset.id },
          data: { isDamaged: true, damageNote: draft.description },
        });
        await tx.assetConditionEvent.create({
          data: {
            assetId: asset.id,
            isDamaged: true,
            note: `WhatsApp (${employee.name} ${employee.lastName}): ${draft.description}`,
            changedByUserId: actorId!,
          },
        });
      }
    }
    if (target.vehicleId) {
      await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${target.vehicleId} FOR UPDATE`;
      if (
        !(await tx.vehicle.findFirst({
          where: { id: target.vehicleId, active: true },
        }))
      )
        throw new BadRequestException('El vehículo ya no está activo.');
      if (draft.kind === 'HOUR_METER') {
        const latest = await tx.vehicleHourReading.findFirst({
          where: { vehicleId: target.vehicleId },
          orderBy: { hours: 'desc' },
        });
        if (draft.hours === null || draft.hours < Number(latest?.hours ?? 0))
          throw new BadRequestException('La lectura no puede disminuir.');
        await tx.vehicleHourReading.create({
          data: {
            vehicleId: target.vehicleId,
            hours: draft.hours,
            recordedAt: occurredAt,
            note: `WhatsApp (${employee.name} ${employee.lastName}); evidencia en reporte ${sourceMessageId}`,
            recordedByUserId: actorId!,
          },
        });
      }
    }
    let openAttendance: Awaited<
      ReturnType<typeof tx.worksiteAttendance.findFirst>
    > = null;
    if (target.customerWorksiteId) {
      const site = await tx.customerWorksite.findFirst({
        where: {
          id: target.customerWorksiteId,
          active: true,
          worksite: { active: true },
          customer: { active: true },
        },
      });
      if (!site) throw new BadRequestException('La obra ya no está activa.');
      openAttendance = await tx.worksiteAttendance.findFirst({
        where: { employeeId: employee.id, leftAt: null },
      });
      if (draft.kind === 'CHECK_IN' && openAttendance)
        throw new BadRequestException(
          'Tienes una entrada abierta. Registra primero la salida de esa obra.',
        );
      if (
        draft.kind === 'CHECK_OUT' &&
        (!openAttendance ||
          openAttendance.customerWorksiteId !== target.customerWorksiteId ||
          (target.attendanceId && openAttendance.id !== target.attendanceId) ||
          occurredAt <= openAttendance.enteredAt)
      ) {
        throw new BadRequestException(
          'No tienes una entrada anterior abierta en esa obra. Revisa con oficina.',
        );
      }
    }
    const report = await tx.whatsappReport.create({
      data: {
        kind: draft.kind,
        employeeId: employee.id,
        assetId: target.assetId,
        vehicleId: target.vehicleId,
        customerWorksiteId: target.customerWorksiteId,
        description: draft.description?.trim() || REPORT_LABELS[draft.kind],
        hours: draft.kind === 'HOUR_METER' ? draft.hours : null,
        occurredAt,
        location: location?.success ? location.data : Prisma.DbNull,
        sourceMessageId,
        sourceMessageIds: draft.sourceMessageIds ?? [sourceMessageId],
        evidence: {
          create: evidence.map((file) => ({ fileObjectId: file.id })),
        },
      },
    });
    if (draft.kind === 'CHECK_IN') {
      await tx.worksiteAttendance.create({
        data: {
          employeeId: employee.id,
          customerWorksiteId: target.customerWorksiteId!,
          enteredAt: occurredAt,
          checkInReportId: report.id,
        },
      });
      // Attendance does not assign a machine. EmployeeActivityNote WORKSITE rows
      // require an asset and describe operational work, so attendance stays in
      // WorksiteAttendance with its linked WhatsApp report and photo evidence.
    }
    if (draft.kind === 'CHECK_OUT')
      await tx.worksiteAttendance.update({
        where: { id: openAttendance!.id },
        data: { leftAt: occurredAt, checkOutReportId: report.id },
      });
    if (draft.kind === 'REQUEST' || draft.kind === 'DAMAGE')
      await this.createAlert(tx, report.id, employee, draft, target);
    return report;
  }

  private async createAlert(
    tx: Prisma.TransactionClient,
    reportId: string,
    employee: Employee,
    draft: Draft,
    target: Target,
  ) {
    const configuredIds = (process.env.WHATSAPP_ALERT_RECIPIENT_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const employeeIds = (
      process.env.WHATSAPP_ALERT_RECIPIENT_EMPLOYEE_IDS ?? ''
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const [users, employees] = await Promise.all([
      tx.user.findMany({
        where: {
          active: true,
          OR: [
            { role: { in: [Role.ADMIN, Role.OFFICE] } },
            ...(configuredIds.length ? [{ id: { in: configuredIds } }] : []),
          ],
        },
        include: { employee: true },
      }),
      tx.employee.findMany({
        where: { active: true },
        include: { user: true },
      }),
    ]);
    const recipients = new Map<
      string,
      {
        recipientKey: string;
        employeeId: string | null;
        userId: string | null;
        name: string;
        phone: string | null;
        status: string;
      }
    >();
    for (const user of users) {
      const e = user.employee?.active ? user.employee : null;
      const phone = normalizePhone(e?.phone);
      recipients.set(`user:${user.id}`, {
        recipientKey: `user:${user.id}`,
        userId: user.id,
        employeeId: e?.id ?? null,
        name: e ? `${e.name} ${e.lastName}`.trim() : user.email,
        phone,
        status: phone ? 'PENDING' : 'NO_PHONE',
      });
    }
    for (const e of employees) {
      const names = normalized(`${e.name} ${e.lastName}`).split(' ');
      if (
        !['MANAGER', 'OPERATIONS_MANAGER', 'OFFICE'].includes(e.role) &&
        !(names.includes('hector') && names.includes('ramirez')) &&
        !employeeIds.includes(e.id)
      )
        continue;
      const userId = e.user?.active ? e.user.id : null;
      const key = userId ? `user:${userId}` : `employee:${e.id}`;
      const phone = normalizePhone(e.phone);
      recipients.set(key, {
        recipientKey: key,
        userId,
        employeeId: e.id,
        name: `${e.name} ${e.lastName}`.trim(),
        phone,
        status: phone ? 'PENDING' : 'NO_PHONE',
      });
    }
    if (!recipients.size)
      throw new ServiceUnavailableException(
        'No active recipients configured for WhatsApp alerts',
      );
    const values = [...recipients.values()];
    await tx.whatsappReportAlertRecipient.createMany({
      data: values.map((r) => ({ ...r, reportId })),
    });
    await tx.notificationTopic.create({
      data: {
        entityType: 'WHATSAPP_REPORT',
        entityId: reportId,
        eventType: 'EMPLOYEE_REPORT',
        dueAt: new Date(),
        warningDays: 0,
        titleTemplate:
          `${REPORT_LABELS[draft.kind!]} por WhatsApp: ${employee.name} ${employee.lastName}`
            .slice(0, 250)
            .replace(/\{\{/g, '(')
            .replace(/\}\}/g, ')'),
        messageTemplate:
          `${target.label ? `${target.label}: ` : ''}${readableDescription(draft.description, draft.subjectReference)}`
            .slice(0, 3500)
            .replace(/\{\{/g, '(')
            .replace(/\}\}/g, ')'),
        // In-app alerts use the existing inbox. A dedicated durable outbox also reaches employees without accounts.
        recipients: {
          create: values
            .filter((r) => r.userId)
            .map((r) => ({ userId: r.userId!, whatsappEnabled: false })),
        },
      },
    });
  }

  async list(kind?: string, cursor?: string) {
    if (
      kind &&
      !Object.values(WhatsappReportKind).includes(kind as WhatsappReportKind)
    )
      throw new BadRequestException('Tipo de reporte inválido');
    return this.prisma.whatsappReport.findMany({
      where: kind ? { kind: kind as WhatsappReportKind } : {},
      include: reportInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }
  async resolveReport(id: string, userId: string, resolution: string) {
    if (!resolution?.trim() || resolution.length > 2000)
      throw new BadRequestException(
        'Escribe una resolución de máximo 2000 caracteres',
      );
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "WhatsappReport" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.whatsappReport.findUniqueOrThrow({
        where: { id },
      });
      if (!['DAMAGE', 'REQUEST'].includes(current.kind))
        throw new BadRequestException(
          'Solo se resuelven alertas de daños y peticiones.',
        );
      const result = await tx.whatsappReport.update({
        where: { id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          resolvedByUserId: userId,
          resolution: resolution.trim(),
        },
      });
      await tx.notificationTopic.updateMany({
        where: { entityType: 'WHATSAPP_REPORT', entityId: id },
        data: { active: false },
      });
      return result;
    });
  }
}
