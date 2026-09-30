export type CommercialSnapshot = {
  status: "RESOLVED" | "REVIEW";
  profileId?: string;
  version?: number;
  effectiveFrom?: string;
  reason?: string;
  basePrice?: string;
  mode?: {
    id: string;
    name: string;
    unit: "DAY" | "HOUR" | "METER";
    minimum: { value: string; basis: "PER_RENTAL" | "PER_REPORTED_DAY" };
    pricing: { source: "CATALOG" } | { source: "FIXED"; amount: string };
    conditions: {
      groupId: string;
      presence: "PRESENT" | "ABSENT";
      minimumQuantity: number;
    }[];
    parts: { groupId: string; treatment: "INCLUDED" | "INDEPENDENT" }[];
  };
  parts: {
    documentItemId: string;
    parentAssetId: string;
    assetId?: string;
    skuId?: string;
    familyId?: string;
    accessoryId?: string;
    label: string;
    quantity: number;
    treatment: "INCLUDED" | "INDEPENDENT" | "REVIEW";
  }[];
};
export type Metering = {
  minimumMeters: string;
  pricing: Pricing;
  reports: { date: string; meters: string; source: Source }[];
};
export type Inclusion = {
  assetId: string;
  label: string;
  documentItemId: string;
};
export type Pricing = {
  basePrice: string;
  discountPercent?: string;
  effectivePrice?: string;
  adjustmentReason?: string;
};
export type Source = {
  reference: string;
  origin: "INVENTORY" | "PHYSICAL" | "DIGITAL";
};
export type Rental = {
  id: string;
  skuId: string;
  assetId?: string;
  label: string;
  deliveredOn: string;
  quantity: string;
  source: Source;
  returns: { date: string; quantity: string; source: Source }[];
  pricing: Pricing;
  commercial?: CommercialSnapshot;
  includedIn?: Inclusion;
  metering?: Metering;
  allowsCutting?: boolean;
  priorBillableDays?: string;
  cutting?: {
    minimumMeters: string;
    pricing: Pricing;
    reports: { date: string; meters: string; source: Source }[];
  };
  waivedDays: { date: string; reason: string }[];
  dayAdjustments?: {
    from: string;
    to: string;
    days: number;
    quantity: string;
  }[];
};
export type MachineDay = {
  rentalId?: string;
  commercial?: CommercialSnapshot;
  includedIn?: Inclusion;
  assetId: string;
  label: string;
  date: string;
  status: "REPORTED" | "NO_WORK" | "PENDING";
  confirmationReason?: string;
  reports: { source: Source; employeeId: string; hours: string }[];
  pricing: Pricing;
  waiverReason?: string;
};
export type AnnexInput = {
  period: { from: string; to: string; through: string };
  policy: {
    version: string;
    includeReturnDay: boolean;
    excludedWeekdays: number[];
    excludeHolidays: boolean;
    holidays: string[];
    holidayCalendarConfirmed: boolean;
    minimumHoursPerMachineDay: string;
    minimumHoursByAsset?: Record<string, string>;
    minimumDaysByRental?: Record<string, number>;
    minimumDaysBySku?: Record<string, number>;
    rememberMinimums?: {
      days: Record<string, number>;
      hours: Record<string, string>;
    };
  };
  rentals: Rental[];
  machineDays: MachineDay[];
};
export type Result = {
  lines: {
    key: string;
    kind: string;
    label: string;
    date: string;
    quantity: string;
    reportedHours: string | null;
    billableUnits: string;
    basePrice: string;
    effectivePrice: string;
    waived: boolean;
    discountPercent: string;
    net: string;
    reason: string | null;
  }[];
  issues: { code: string; key: string; message: string }[];
  totals: { rentalGross: string; rentalDiscount: string; rentalNet: string };
};
export type SourceIssue = { code: string; reference: string; message: string };
export type Draft = {
  id: string;
  revision: number;
  periodFrom: string;
  periodTo: string;
  revisions: {
    input: AnnexInput;
    result: Result;
    sourceIssues?: SourceIssue[];
    through: string;
    reason: string;
  }[];
};
