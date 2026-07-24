export type AppUserOption = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OFFICE' | 'DRIVER' | 'OPERATOR';
  active: boolean;
  phone?: string | null;
};

export type NotificationRecipientInput = {
  userId: string;
  emailEnabled: boolean;
  smsEnabled: boolean;
};

export type NotificationRecipient = NotificationRecipientInput & {
  id?: string;
  user?: {
    id: string;
    email: string;
    active: boolean;
    employee?: {
      name?: string | null;
      lastName?: string | null;
      phone?: string | null;
    } | null;
  };
};

export type NotificationTopic = {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  active: boolean;
  recipients: NotificationRecipient[];
};

export type MaintenanceReading = {
  id: string;
  hours: number | string;
  recordedAt: string;
  note?: string | null;
  evidenceFileObjectId?: string | null;
  recordedByUserId: string;
  createdAt: string;
};

export type MaintenanceItem = {
  id: string;
  planId: string;
  name: string;
  instructions?: string | null;
  intervalHours: number | string;
  warningHours: number | string;
  baselineHours: number | string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  notificationTopic?: NotificationTopic | null;
};

export type MaintenancePlan = {
  id: string;
  assetId?: string | null;
  vehicleId?: string | null;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  items: MaintenanceItem[];
};

export type MaintenanceResponse = {
  currentHours: number;
  readings: MaintenanceReading[];
  plans: MaintenancePlan[];
};

export type NotificationReminder = {
  topicId: string;
  eventType: string;
  title: string;
  message: string;
  status: 'UPCOMING' | 'DUE' | 'OVERDUE';
  unit: 'HOURS' | 'DAYS';
  currentHours?: number;
  cycleStartHours?: number;
  dueHours?: number;
  remainingHours?: number;
  remainingDays?: number;
  instructions?: string | null;
  itemId?: string;
  planId?: string;
  entity: {
    id: string;
    type: 'ASSET' | 'VEHICLE' | string;
    label: string;
  };
};

export type MaintenanceSubject =
  | { type: 'ASSET'; id: string; label: string }
  | { type: 'VEHICLE'; id: string; label: string };

export type MaintenanceItemInput = {
  name: string;
  instructions: string;
  intervalHours: number | '';
  warningHours: number | '';
  baselineHours: number | '';
  active: boolean;
  recipients: NotificationRecipientInput[];
};

export const emptyMaintenanceItemInput = (): MaintenanceItemInput => ({
  name: '',
  instructions: '',
  intervalHours: '',
  warningHours: 10,
  baselineHours: 0,
  active: true,
  recipients: [],
});

export function recipientsFromTopic(topic?: NotificationTopic | null): NotificationRecipientInput[] {
  return (topic?.recipients ?? []).map((recipient) => ({
    userId: recipient.userId,
    emailEnabled: recipient.emailEnabled,
    smsEnabled: recipient.smsEnabled,
  }));
}

export function apiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message;
  const translations: Array<[string, string]> = [
    ['Hours cannot decrease below', 'El horómetro no puede disminuir de'],
    ['Completion hours cannot exceed current hours', 'Las horas realizadas no pueden superar el horómetro actual.'],
    ['Completion hours cannot be lower than the previous completion', 'Las horas no pueden ser inferiores al mantenimiento anterior.'],
    ['Maintenance item not found', 'No se encontró la revisión de mantenimiento.'],
    ['Maintenance plan not found', 'No se encontró el plan de mantenimiento.'],
    ['Asset not found', 'No se encontró el asset.'],
    ['Vehicle not found', 'No se encontró el vehículo.'],
    ['Local auth bypass requires an active user', 'El acceso local necesita un usuario activo.'],
  ];
  const translation = translations.find(([source]) => message.startsWith(source));
  return translation ? message.replace(translation[0], translation[1]) : message;
}
