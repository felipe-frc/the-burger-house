import { useEffect, useRef, useState } from 'react';
import { loadCategoryRevenue, loadFinance, loadFinanceAudit, loadFinanceMethods, loadFinanceRevenue, loadFinanceSummary,
  type FinancePeriod, type FinanceDates } from './ownerFinance';

type FinanceLoader<T> = (period: FinancePeriod, page: number, signal: AbortSignal, dates?: FinanceDates, channel?: string) => Promise<T>;
function useFinanceData<T>(load: FinanceLoader<T>, period: FinancePeriod, page = 1, dates?: FinanceDates, paymentRevision = 0, channel?: string, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const scopeKey = JSON.stringify([period, page, dates, channel, enabled]);
  const previousScope = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (previousScope.current !== scopeKey) { setData(null); previousScope.current = scopeKey; }
    setError('');
    if (!enabled) return;
    load(period, page, controller.signal, dates, channel).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [load, period, page, revision, dates, paymentRevision, channel, enabled, scopeKey]);
  return { data, error, retry: () => setRevision(value => value + 1) };
}
export const useOwnerFinance = (period: FinancePeriod, page: number, dates?: FinanceDates, channel?: string, paymentRevision = 0) =>
  useFinanceData(loadFinance, period, page, dates, paymentRevision, channel);
export const useOwnerFinanceAudit = (period: FinancePeriod, page: number, dates?: FinanceDates, paymentRevision = 0) =>
  useFinanceData(loadFinanceAudit, period, page, dates, paymentRevision);
const loadChartRevenue: FinanceLoader<Awaited<ReturnType<typeof loadFinanceRevenue>>> = (period, page, signal, dates, channel) =>
  loadFinanceRevenue(period, page, signal, dates, true, channel);
export const useOwnerFinanceReport = (period: FinancePeriod, dates?: FinanceDates, channel?: string, paymentRevision = 0) =>
  useFinanceData(loadChartRevenue, period, 1, dates, paymentRevision, channel);
export const useOwnerFinanceRevenue = (period: FinancePeriod, paymentRevision: number, channel?: string) =>
  useFinanceData(loadChartRevenue, period, 1, undefined, paymentRevision, channel);
export const useOwnerFinanceMethods = (period: FinancePeriod, paymentRevision: number, channel?: string) =>
  useFinanceData(loadFinanceMethods, period, 1, undefined, paymentRevision, channel);
export const useOwnerCategoryRevenue = (period: FinancePeriod, paymentRevision: number, channel: string | undefined, enabled: boolean, dates?: FinanceDates) =>
  useFinanceData(loadCategoryRevenue, period, 1, dates, paymentRevision, channel, enabled);
export const useOwnerChannelSummary = (period: FinancePeriod, channel?: string, paymentRevision = 0, dates?: FinanceDates, enabled = !!channel) =>
  useFinanceData(loadFinanceSummary, period, 1, dates, paymentRevision, channel, enabled);
