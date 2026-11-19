import type { EmployeeCardRole } from "@/components/EmployeeCard";

export type AttendanceEmployee = {
  id: string;
  name: string;
  lastName: string;
  active: boolean;
  role: EmployeeCardRole;
  accountRole: string | null;
  journeys: number;
  open: number;
  pendingReview: number;
  reportedHours: number;
  latestWorksite: string | null;
  lastEntry: string | null;
  lastExit: string | null;
};

export type AttendanceEvidence = {
  id: string;
  kind: string;
  description: string;
  occurredAt: string;
  deletedAt: string | null;
  location: { latitude: number; longitude: number } | null;
  evidence: { fileObject: { id: string } }[];
};

export type AttendanceJournal = {
  id: string;
  enteredAt: string;
  leftAt: string | null;
  checkOutReportId: string | null;
  customerWorksite: { worksite: { name: string }; customer: { name: string } };
  checkInReport: AttendanceEvidence | null;
  checkOutReport: AttendanceEvidence | null;
  punches?: {
    id: string;
    kind: string;
    status: string;
    occurredAt: string;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
  }[];
  activityNote: {
    id: string;
    reviewStatus: string | null;
    description: string;
    sourceInvalidatedAt: string | null;
    reviewedSourceExitId: string | null;
    verifiedEnteredAt?: string | null;
    verifiedLeftAt?: string | null;
    lastCorrection?: { userId: string; name: string; at: string } | null;
  } | null;
};
