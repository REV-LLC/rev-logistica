export type LoanEntry = {
  id: string;
  type: 'OPENING' | 'CHARGE' | 'PAYMENT';
  date: string | null;
  detail: string;
  amount: string;
};

export type LoanAccount = {
  employee: { id: string; name: string; lastName: string };
  entries: LoanEntry[];
  opening: string;
  charges: string;
  payments: string;
  balance: string;
};
