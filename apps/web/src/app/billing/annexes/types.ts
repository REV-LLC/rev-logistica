export type CommercialSnapshot = {
  schemaVersion?: 2;
  contextualZero?: boolean;
  selectedModeId?: string;
  minimumReview?: boolean;
  frozenProfile?: {
    id: string;
    version: number;
    effectiveFrom: string;
    groups: {
      id: string;
      name: string;
      selectors: {
        kind: "ASSET" | "SKU" | "FAMILY" | "ACCESSORY";
        id: string;
      }[];
    }[];
    modes: NonNullable<CommercialSnapshot["mode"]>[];
  };
  catalog?: { unit: string; price: string | null };
  parentDocumentItemId?: string;
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
    parentAssetId?: string;
    parentDocumentItemId?: string;
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
  priorUnits?: string;
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
  basePriceOverride?: string;
  discountPercent?: string;
  effectivePrice?: string;
  adjustmentReason?: string;
  adjustmentSource?: "MANUAL" | "CUSTOMER" | "WORKSITE";
};
export type Source = {
  documentId?: string;
  documentNumber?: string;
  reference: string;
  origin: "INVENTORY" | "PHYSICAL" | "DIGITAL";
};
export type Rental = {
  billingAreaM2?: string;
  modeArchive?: {
    metering?: Metering;
    dayAdjustments?: Rental["dayAdjustments"];
    waivedDays?: Rental["waivedDays"];
    machineDays?: Omit<MachineDay, "rentalContext">[];
  };
  id: string;
  skuId: string;
  assetId?: string;
  accessoryId?: string;
  commercialInterval?: { from: string; to: string; rentalId: string };
  minimumHistoryRanges?: Array<{ from: string; to: string; rentalId: string }>;
  label: string;
  deliveredOn: string;
  billingStartsOn?: string;
  quantity: string;
  source: Source;
  returns: {
    date: string;
    billingCutoffDate?: string;
    quantity: string;
    source: Source;
  }[];
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
  rentalContext?: Rental;
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
export type TransportCharge = { quantity: string; unitPrice: string };
export type TransportRow = TransportCharge & {
  id: string;
  direction: "outbound" | "return";
  description: string;
};
export type AdditionalCharge = TransportCharge & {
  id: string;
  skuId?: string;
  assetId?: string;
  type: "REPAIR" | "REPLACEMENT";
  description: string;
};
export type AnnexInput = {
  worksiteRates?: { skuId: string; quantityBasis: "UNIT" | "AREA_M2"; unitPrice: string | null; tablePrice?: Pricing; thisCutOnly?: true }[];
  additionalCharges?: AdditionalCharge[];
  observations?: string;
  transport?: { outbound: TransportCharge; return: TransportCharge; rows?: TransportRow[] };
  period: { from: string; to: string; through: string };
  policy: {
    version: string;
    vatPercent?: 0 | 19;
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
  supportsWorksiteRates?: boolean;
  supportsAutomaticWorksiteRates?: boolean;
  additionalChargesTotal?: string;
  summary?: { base: string; discount: string; subtotal: string };
  transport?: { outbound: string; return: string; total: string };
  tax?: { vatPercent: number; vat: string; total: string };
  lines: {
    key: string;
    kind: string;
    label: string;
    date: string;
    quantity: string;
    billableAreaM2?: string;
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
  customerWorksiteId: string;
  id: string;
  revision: number;
  periodFrom: string;
  periodTo: string;
  revisions: {
    input: AnnexInput;
    result: Result;
    sourceIssues?: SourceIssue[];
    invoiceNumber?: string | null;
    createdAt?: string;
    through: string;
    reason: string;
  }[];
};
