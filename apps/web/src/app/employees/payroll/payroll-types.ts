export type Salary = {
  id: string; revision: number; effectiveFrom: string; monthlySalary: string;
  transportAllowance: string; totalMonthly: string; provisional: boolean;
  regime: 'STANDARD' | 'REVIEW_REQUIRED'; note: string;
};
export type PayrollPreview = {
  eligible: boolean; blockingReasons: string[]; provisional: boolean;
  expectedSalaryRevision: number; from: string; to: string; days: number;
  monthlySalary: string; transportAllowance: string; totalMonthly: string;
  salaryEarned: string; transportEarned: string; totalEarned: string;
  healthDeduction: string; pensionDeduction: string; totalDeductions: string; netPay: string;
};
export type PayrollReceipt = PayrollPreview & { id: string; createdAt: string; observations?: string | null };
export type PayrollEmployee = {
  id: string; name: string; lastName: string; documentId: string | null;
  role: string; active: boolean; latestRevision: number; current: Salary | null;
  history: Salary[]; preview: PayrollPreview; receipts: PayrollReceipt[];
};
export type PayrollPeriodResponse = {
  from: string; to: string; employees: PayrollEmployee[];
  policy: { minimumMonthlySalary: string; transportAllowanceReference: string };
};
export const employeeName = (employee: Pick<PayrollEmployee, 'name' | 'lastName'>) => `${employee.name} ${employee.lastName}`.trim();
