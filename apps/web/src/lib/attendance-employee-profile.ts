export type AttendanceProfile =
  | "operators"
  | "drivers"
  | "office"
  | "others"
  | "all";
export function attendanceEmployeeProfile(employee: {
  role: string;
  accountRole: string | null;
}): Exclude<AttendanceProfile, "all"> {
  if (
    ["ADMIN", "OFFICE"].includes(employee.accountRole ?? "") ||
    ["OFFICE", "MANAGER", "OPERATIONS_MANAGER"].includes(employee.role)
  )
    return "office";
  if (employee.accountRole === "DRIVER" || employee.role === "DRIVER")
    return "drivers";
  if (["HEAVY_MACHINERY_OPERATOR", "MACHINIST"].includes(employee.role))
    return "operators";
  return "others";
}
