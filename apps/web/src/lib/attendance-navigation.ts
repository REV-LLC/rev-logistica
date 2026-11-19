export function attendanceEmployeeHref(
  employeeId: string,
  period: { from?: string; to?: string; date?: string } = {},
) {
  const query = new URLSearchParams();
  for (const key of ["from", "to", "date"] as const) {
    const value = period[key];
    if (value) query.set(key, value);
  }
  return `/employees/attendance/${encodeURIComponent(employeeId)}${query.size ? `?${query}` : ""}`;
}

export function attendanceOverviewHref(period: { from: string; to: string }) {
  return `/employees/attendance?${new URLSearchParams(period)}`;
}
