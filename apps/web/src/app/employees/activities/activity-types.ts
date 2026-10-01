export type ActivityType =
  | "WORKSITE"
  | "ABSENCE"
  | "MEDICAL_LEAVE"
  | "VACATION";
export type ActivityForm = {
  type: ActivityType;
  date: string;
  endDate: string;
  customerWorksiteId: string;
  assetId: string;
  description: string;
};
export const activityLabels: Record<ActivityType, string> = {
  WORKSITE: "Actividad de obra",
  ABSENCE: "Falta",
  MEDICAL_LEAVE: "Incapacidad",
  VACATION: "Vacaciones",
};
export const activityColors: Record<ActivityType, string> = {
  WORKSITE: "orange",
  ABSENCE: "red",
  MEDICAL_LEAVE: "violet",
  VACATION: "teal",
};
