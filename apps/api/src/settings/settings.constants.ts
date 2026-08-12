export const APP_SETTING_DEFINITIONS = {
  'branding.service_name': {
    category: 'BRANDING', description: 'Nombre del servicio mostrado en la navegación', defaultValue: 'finge',
    minLength: 1, maxLength: 80,
  },
  'tasks.notify_on_assignment': {
    category: 'TASKS', description: 'Enviar WhatsApp al asignar o reasignar una tarea', defaultValue: true,
  },
  'tasks.due_warning_hours': {
    category: 'TASKS', description: 'Horas de anticipación para avisar el vencimiento de una tarea', defaultValue: 24,
    min: 0, max: 24 * 365,
  },
  'tasks.overdue_repeat_enabled': {
    category: 'TASKS', description: 'Repetir recordatorios de tareas vencidas', defaultValue: true,
  },
  'tasks.overdue_repeat_interval_hours': {
    category: 'TASKS', description: 'Intervalo en horas entre recordatorios de tareas vencidas', defaultValue: 24,
    min: 1, max: 24 * 365,
  },
  'tasks.notify_on_due_date_change': {
    category: 'TASKS', description: 'Avisar cuando cambia la fecha de vencimiento', defaultValue: true,
  },
} as const;

export type AppSettingKey = keyof typeof APP_SETTING_DEFINITIONS;
