export function attendanceEmployeeHref(
  employeeId: string,
  period: { from?: string; to?: string; date?: string } = {},
) {
  const query = new URLSearchParams();
  for (const key of ["from", "to", "date"] as const)
    if (period[key]) query.set(key, period[key]);
  return `/employees/attendance/${encodeURIComponent(employeeId)}${query.size ? `?${query}` : ""}`;
}

export function attendanceOverviewHref(period: { from: string; to: string }) {
  return `/employees/attendance?${new URLSearchParams(period)}`;
}
