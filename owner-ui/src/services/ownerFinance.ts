import { adminRequest } from './adminHttp';
export type FinancePeriod = 'today' | 'shift' | '7d' | '30d' | 'month' | 'custom';
export interface FinanceDates { start: string; end: string }
export interface FinanceSummary {
  grossRevenue: number; refundedAmount: number; netRevenue: number; paidOrders: number; averageTicket: number;
  grossProfit: number | null; ordersWithCost: number; partialRefunds: number; estimatedApprovals: number;
  unknownApprovalPayments: number; unreconstructedRefundPayments: number; undatedRefundBalance: number;
}
export interface RevenuePoint { date: string; revenue: number }
export interface CategoryRevenueReport {
  categories: { category: string; revenue: number }[];
  unclassifiedRevenue: number;
  deliveryFees: number;
  unallocatedPayments: number;
  grossRevenue: number;
  refundedAmount: number;
}
export interface MethodSummary { method: string; count: number; revenue: number; percentage: number }
export interface Transaction { orderId: number; customerName: string; date: string; method: string; amount: number; status: string; approvedAt: string | null; approvalDateSource: string; refundedAmount: number }
export interface AuditEntry { createdAtUtc: string; actor: string; action: string; entityType: string; entityId: string; changes: string }
export interface FinanceReport {
  summary: FinanceSummary; revenue: RevenuePoint[]; methods: MethodSummary[];
}
export interface FinanceData extends FinanceReport {
  transactions: { items: Transaction[]; total: number; pageNumber: number; pageSize: number };
}
export const grossRevenueShare = (value: number, total: number) => total > 0 ? value / total * 100 : 0;

function financeRequest(period: FinancePeriod, page: number, signal?: AbortSignal, dates?: FinanceDates, hourly = false, channel?: string) {
  const query = new URLSearchParams({ period, page: String(page) });
  if (period === 'custom' && dates) {
    query.set('start', dates.start);
    query.set('end', dates.end);
  }
  return <T>(part: string) => {
    const filters = new URLSearchParams(query);
    if (hourly && part === 'revenue') filters.set('granularity', 'hour');
    if (channel && part !== 'audit') filters.set('channel', channel);
    return adminRequest<T>(`/api/admin/finance/${part}?${filters}`, { signal });
  };
}
export async function loadFinanceRevenue(period: FinancePeriod, page: number, signal?: AbortSignal, dates?: FinanceDates, hourly = false, channel?: string) {
  const get = financeRequest(period, page, signal, dates, hourly && (period === 'today' || period === 'shift'), channel);
  const [summary, revenue] = await Promise.all([get<FinanceSummary>('summary'), get<RevenuePoint[]>('revenue')]);
  return { summary, revenue };
}
export const loadFinanceSummary = (period: FinancePeriod, page: number, signal?: AbortSignal, dates?: FinanceDates, channel?: string) =>
  financeRequest(period, page, signal, dates, false, channel)<FinanceSummary>('summary');
export const loadCategoryRevenue = (period: FinancePeriod, page: number, signal?: AbortSignal, dates?: FinanceDates, channel?: string) =>
  financeRequest(period, page, signal, dates, false, channel)<CategoryRevenueReport>('revenue-by-category');
export function loadFinanceMethods(period: FinancePeriod, page: number, signal?: AbortSignal, dates?: FinanceDates, channel?: string) {
  return financeRequest(period, page, signal, dates, false, channel)<MethodSummary[]>('payment-methods');
}
export async function loadFinanceReport(period: FinancePeriod, page: number, signal?: AbortSignal, dates?: FinanceDates, channel?: string, hourly = false): Promise<FinanceReport> {
  const [base, methods] = await Promise.all([
    loadFinanceRevenue(period, page, signal, dates, hourly, channel), loadFinanceMethods(period, page, signal, dates, channel),
  ]);
  return { ...base, methods };
}
export async function loadFinance(period: FinancePeriod, page: number, signal?: AbortSignal, dates?: FinanceDates, channel?: string): Promise<FinanceData> {
  const [report, transactions] = await Promise.all([
    loadFinanceReport(period, page, signal, dates, channel),
    financeRequest(period, page, signal, dates, false, channel)<FinanceData['transactions']>('transactions'),
  ]);
  return { ...report, transactions };
}
export function loadFinanceAudit(period: FinancePeriod, page: number, signal?: AbortSignal, dates?: FinanceDates) {
  return financeRequest(period, page, signal, dates)<AuditEntry[]>('audit');
}
export function revenueCsv(points: RevenuePoint[]) {
  return 'Data;ReceitaBruta\r\n' + points.map(point => `${point.date};${point.revenue.toFixed(2)}`).join('\r\n');
}
