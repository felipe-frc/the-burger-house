import { Coins, ShoppingCart, ReceiptText, CreditCard, Clock3 } from 'lucide-react';
import { useEffect, useRef, type CSSProperties } from 'react';
import { CurrencyValue, formatBRL } from '../common/CurrencyValue';
import { informationalKpiAppearance, kitchenKpiAppearance, type KpiAppearance } from '../../services/ownerOverviewAppearance';
import { MetallicKpiCard } from './MetallicKpiCard';

interface Props {
  todayRevenue: number | null;
  paidOrdersCount: number | null;
  pendingPaymentCount: number | null;
  pendingAppearance: KpiAppearance;
  averageTicket: number | null;
  delayedCount: number | null;
  meanMinutes: number | null;
  measuredCount: number;
  kitchenCount: number;
  preparingLimit: number | null;
  onOpenKitchen: () => void;
  onOpenFinance: () => void;
  onOpenPending: () => void;
}
export function KpiMetricsRow({ todayRevenue, paidOrdersCount, pendingPaymentCount, averageTicket,
  delayedCount, meanMinutes, measuredCount, kitchenCount, preparingLimit, onOpenKitchen, onOpenFinance, onOpenPending, pendingAppearance }: Props) {
  const appearance = kitchenKpiAppearance(delayedCount, preparingLimit, measuredCount, kitchenCount);
  const row = useRef<HTMLElement>(null);
  useEffect(() => {
    let dark = document.documentElement.classList.contains('dark');
    let firstFrame = 0, secondFrame = 0;
    const observer = new MutationObserver(() => {
      const next = document.documentElement.classList.contains('dark');
      if (next === dark) return;
      dark = next;
      cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame);
      // State changes interpolate within each theme. Theme switches must not
      // interpolate dark text through a simultaneously darkening background.
      row.current?.style.setProperty('--kpi-state-duration', '0s');
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => row.current?.style.removeProperty('--kpi-state-duration'));
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { observer.disconnect(); cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame); };
  }, []);
  return <section ref={row} aria-label="Indicadores do dia" className="owner-overview-kpis">
    {[
      { label: 'Receita de hoje', value: todayRevenue, money: true, help: 'Receita bruta · inclui frete', icon: Coins, tone: 'revenue' as const, appearance: informationalKpiAppearance(todayRevenue, 'positive'), open: onOpenFinance, action: 'Ver receita de hoje no Financeiro' },
      { label: 'Pedidos pagos hoje', value: paidOrdersCount, help: 'Pagamentos aprovados hoje', icon: ShoppingCart, tone: 'jade' as const, appearance: informationalKpiAppearance(paidOrdersCount, 'neutral'), open: onOpenFinance, action: 'Consultar pagamentos de hoje no Financeiro' },
      { label: 'Ticket médio', value: averageTicket, money: true, help: 'Por pedido pago hoje', icon: ReceiptText, tone: 'steel' as const, appearance: informationalKpiAppearance(averageTicket, 'neutral'), open: onOpenFinance, action: 'Ver ticket médio de hoje no Financeiro' },
      { label: 'Aguardando pagamento', value: pendingPaymentCount, help: 'Pedidos pendentes · todos os dias', icon: CreditCard, tone: 'slate' as const, appearance: pendingAppearance, open: onOpenPending, action: 'Ver pedidos pendentes de pagamento' },
    ].map(({ label, value, money, help, icon: Icon, tone, open, action, appearance }) =>
      <MetallicKpiCard key={label} tone={tone} onOpen={open} actionLabel={action} appearance={appearance}>
        <div className="owner-kpi-caption"><span className="owner-metric-icon"><Icon size={24} strokeWidth={1.65} aria-hidden="true" /></span><h2 className="owner-label">{label}</h2></div>
        <p className={`owner-display${money ? ' owner-kpi-money' : ''}`}
          style={money && value != null ? { '--kpi-value-length': formatBRL(value).length } as CSSProperties : undefined}>
          {value == null ? '—' : money ? <CurrencyValue value={value} size="kpi" /> : value}</p>
        <p className="owner-muted text-xs">{help}</p>
      </MetallicKpiCard>)}
    <MetallicKpiCard tone="coral" appearance={appearance} onOpen={onOpenKitchen} actionLabel="Abrir Cozinha — atrasados e tempo médio">
      <div className="owner-kpi-caption"><span className="owner-metric-icon">
        <Clock3 size={24} strokeWidth={1.65} aria-hidden="true" /></span><h2 className="owner-label">Atrasados / Tempo médio</h2></div>
      <p className="owner-display">{delayedCount ?? '—'} <span className="owner-kpi-unit">atrasados</span>
        <span aria-hidden="true"> · </span>{meanMinutes == null ? '—' : meanMinutes + ' min'}</p>
      <p className="owner-muted text-xs">Média na etapa · fila/preparo pagos · todas as datas</p>
      <p className="owner-muted text-xs">{preparingLimit == null ? 'Limite indisponível' :
        preparingLimit > 0 ? `Limite por etapa: ${preparingLimit} min` : 'Limite de atraso desativado'}
        {measuredCount < kitchenCount ? ` · ${measuredCount} de ${kitchenCount} com horário` : ''}</p>
      <button type="button" className="owner-kpi-link" onClick={onOpenKitchen}>Conferir cozinha</button>
    </MetallicKpiCard>
  </section>;
}
