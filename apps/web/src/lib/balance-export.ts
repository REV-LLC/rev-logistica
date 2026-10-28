import { api } from './api';
import { balanceReportPath } from './balance-report';
import type { BalanceReport, BalanceReportQuery } from './balance-report';

export function getBalanceReport(query: BalanceReportQuery) {
  return api<BalanceReport>(balanceReportPath(query));
}

export async function exportBalanceReport(query: BalanceReportQuery) {
  const report = await getBalanceReport(query);
  const { downloadBalanceExcel } = await import('./balance-excel');
  await downloadBalanceExcel(report);
  return report;
}
