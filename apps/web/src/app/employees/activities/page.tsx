"use client";

import { useSearchParams } from "next/navigation";
import EmployeeActivitiesPanel from "./EmployeeActivitiesPanel";

export default function EmployeeActivitiesPage() {
  const params = useSearchParams();
  const employeeId = params.get("employeeId");
  return (
    <EmployeeActivitiesPanel
      requestedEmployeeId={employeeId}
      requestedMonth={params.get("month")}
      requestedDate={params.get("date")}
    />
  );
}
