export type LoanDisplaySettings = { paymentsPositive: boolean };

// Presentation only: never use this sign to calculate balances or API amounts.
export function loanMovementPresentation(type: 'OPENING' | 'CHARGE' | 'PAYMENT', paymentsPositive: boolean) {
  const positive = type === 'PAYMENT' ? paymentsPositive : !paymentsPositive;
  return { sign: positive ? '+' : '−', color: positive ? 'green.8' : 'red.8' } as const;
}
