// This guard deliberately binds the sandbox to REV's existing staging environment.
export function isAttendanceTestMode() {
  return process.env.ATTENDANCE_TEST_MODE === 'true'
    && process.env.RAILWAY_ENVIRONMENT_ID === '53c93c9d-33e7-4137-a598-6648a6491886'
    && process.env.RAILWAY_ENVIRONMENT_NAME === 'staging'
    && process.env.AUTH_BYPASS_ENABLED !== 'true';
}

export function assertAttendanceTestIsolation() {
  if (process.env.ATTENDANCE_TEST_MODE !== 'true') return;
  const database = new URL(process.env.DATABASE_URL || 'https://invalid.local');
  if (!isAttendanceTestMode() || database.searchParams.get('schema') !== 'attendance_test'
    || ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'WHATSAPP_ACCESS_TOKEN', 'SMTP_PASS', 'ZOHO_REFRESH_TOKEN', 'OPENAI_API_KEY'].some(key => Boolean(process.env[key]))
    || process.env.WHATSAPP_REPORTS_ENABLED !== 'false' || process.env.NOTIFICATION_AUTO_DISPATCH !== 'false') {
    throw new Error('Attendance sandbox isolation check failed');
  }
}
