import { useEffect, useRef, useState, type ElementType } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard, ShoppingBag, Flame, PackageCheck, Bike, UtensilsCrossed,
  Boxes, Users, DollarSign, BarChart3, UserCog, Settings, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import { OFFICIAL_LOGO_SRC } from '../common/BrandIdentity';

const desktopQuery = '(min-width: 1200px)';

export type NavModule =
  | 'overview'
  | 'orders'
  | 'kitchen'
  | 'expedition'
  | 'delivery'
  | 'menu'
  | 'stock'
  | 'customers'
  | 'financial'
  | 'reports'
  | 'team'
  | 'settings';

export interface SidebarCounts {
  orders: number;
  kitchen: number;
  expedition: number;
  delivery: number;
  lowStock: number;
}

interface SidebarProps {
  currentModule: NavModule;
  onSelectModule: (module: NavModule) => void;
  counts: SidebarCounts;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItemDef {
  id: NavModule;
  label: string;
  icon: ElementType;
  countKey?: keyof SidebarCounts;
  isAlertBadge?: boolean;
}

const OPERATION_ITEMS: NavItemDef[] = [
  { id: 'overview', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'orders', label: 'Pedidos', icon: ShoppingBag, countKey: 'orders' },
  { id: 'kitchen', label: 'Cozinha', icon: Flame, countKey: 'kitchen' },
  { id: 'expedition', label: 'Expedição', icon: PackageCheck, countKey: 'expedition' },
  { id: 'delivery', label: 'Entregas', icon: Bike, countKey: 'delivery' },
];

const MANAGEMENT_ITEMS: NavItemDef[] = [
  { id: 'menu', label: 'Cardápio', icon: UtensilsCrossed },
  { id: 'stock', label: 'Estoque', icon: Boxes, countKey: 'lowStock', isAlertBadge: true },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'financial', label: 'Financeiro', icon: DollarSign },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'team', label: 'Equipe', icon: UserCog },
];
const SETTINGS_ITEM: NavItemDef = { id: 'settings', label: 'Configurações', icon: Settings };

export function Sidebar({ currentModule, onSelectModule, counts, isMobileOpen, onCloseMobile, isCollapsed, onToggleCollapse }: SidebarProps) {
  const panel = useRef<HTMLElement>(null);
  const navigation = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeMobile = useRef(onCloseMobile);
  const [tooltip, setTooltip] = useState<{ item: NavItemDef; anchor: HTMLButtonElement; left: number; top: number }>();
  const tooltipDelay = useRef<number | undefined>(undefined);
  closeMobile.current = onCloseMobile;

  function tooltipPosition(button: HTMLButtonElement) {
    const rect = button.getBoundingClientRect();
    return { left: (panel.current?.getBoundingClientRect().right ?? rect.right) + 8,
      top: Math.max(22, Math.min(window.innerHeight - 22, rect.top + rect.height / 2)) };
  }

  function showTooltip(item: NavItemDef, button: HTMLButtonElement) {
    if (!isCollapsed || !window.matchMedia(desktopQuery).matches) return;
    window.clearTimeout(tooltipDelay.current);
    setTooltip({ item, anchor: button, ...tooltipPosition(button) });
  }

  function deferTooltipClose() {
    window.clearTimeout(tooltipDelay.current);
    tooltipDelay.current = window.setTimeout(() => setTooltip(undefined), 140);
  }

  useEffect(() => {
    const nav = navigation.current;
    const active = nav?.querySelector<HTMLButtonElement>('[aria-current="page"]');
    if (!nav || !active || nav.clientHeight === 0) return;
    const navRect = nav.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.top < navRect.top) nav.scrollTop -= navRect.top - item.top + 6;
    else if (item.bottom > navRect.bottom) nav.scrollTop += item.bottom - navRect.bottom + 6;
  }, [currentModule, isCollapsed, isMobileOpen]);

  useEffect(() => {
    const close = () => setTooltip(undefined);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('keydown', escape);
    return () => {
      window.clearTimeout(tooltipDelay.current);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close);
      window.removeEventListener('keydown', escape);
    };
  }, []);

  useEffect(() => {
    if (!isMobileOpen) return;
    const trigger = document.activeElement;
    // Chromium can keep the drawer hidden for the first frames of its entrance.
    const focusDeadline = performance.now() + 500;
    let focusFrame: number;
    const focusClose = () => {
      const button = closeButton.current;
      if (button && getComputedStyle(button).visibility === 'visible') button.focus({ preventScroll: true });
      if (document.activeElement !== button && performance.now() < focusDeadline) {
        focusFrame = window.requestAnimationFrame(focusClose);
      }
    };
    focusFrame = window.requestAnimationFrame(focusClose);
    const desktop = window.matchMedia(desktopQuery);
    const closeOnDesktop = () => { if (desktop.matches) closeMobile.current(); };
    desktop.addEventListener('change', closeOnDesktop);
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobile.current();
      }
      if (event.key !== 'Tab') return;
      const targets = [...(panel.current?.querySelectorAll('button') ?? [])].filter(button => button.getClientRects().length);
      const first = targets.at(0);
      const last = targets.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    };
    window.addEventListener('keydown', dismiss);
    return () => {
      window.removeEventListener('keydown', dismiss);
      window.cancelAnimationFrame(focusFrame);
      desktop.removeEventListener('change', closeOnDesktop);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [isMobileOpen]);

  function renderItem(item: NavItemDef) {
    const { id, label, icon: Icon, countKey, isAlertBadge } = item;
    const count = countKey ? counts[countKey] : undefined;
    const hasCount = count !== undefined && count > 0;
    return <button key={id} type="button" className="owner-sidebar-link"
      aria-current={currentModule === id ? 'page' : undefined}
      aria-label={label}
      aria-description={hasCount ? `${count} ${isAlertBadge ? 'em alerta' : 'na fila'}` : undefined}
      onPointerEnter={event => { if (event.pointerType !== 'touch') showTooltip(item, event.currentTarget); }}
      onPointerLeave={deferTooltipClose} onFocus={event => showTooltip(item, event.currentTarget)}
      onBlur={() => setTooltip(undefined)}
      onClick={() => { setTooltip(undefined); onSelectModule(id); if (isMobileOpen) onCloseMobile(); }}>
      <span className="owner-sidebar-icon"><Icon size={19} strokeWidth={1.65} aria-hidden="true" /></span>
      <span className="owner-sidebar-label">{label}</span>
      {hasCount && <span className="owner-sidebar-badge" aria-hidden="true" data-warning={isAlertBadge || undefined}>{count}</span>}
    </button>;
  }

  const tooltipCount = tooltip?.item.countKey && counts[tooltip.item.countKey];
  return <>
    {isMobileOpen && <div className="owner-sidebar-scrim" aria-hidden="true" onClick={onCloseMobile} />}
    <aside ref={panel} id="owner-sidebar" aria-label="Navegação administrativa"
      className={`owner-sidebar ${isMobileOpen ? 'owner-sidebar-open' : ''}`}
      data-collapsed={isCollapsed || undefined}>
      <button type="button" className="owner-sidebar-toggle" aria-controls="owner-sidebar-modules" aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        onClick={() => { setTooltip(undefined); onToggleCollapse(); }}>
        {isCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronLeft size={14} aria-hidden="true" />}
      </button>
      <div className="owner-sidebar-surface">
        <header className="owner-sidebar-header">
          <button ref={closeButton} type="button" className="owner-sidebar-close" aria-label="Fechar menu lateral" onClick={onCloseMobile}>
            <X size={19} aria-hidden="true" />
          </button>
          <div className="owner-sidebar-brand">
            <span className="owner-sidebar-logo"><img src={OFFICIAL_LOGO_SRC} alt="Logo oficial The Burger House" width="44" height="44" /></span>
            <div className="owner-sidebar-identity"><p>The Burger House</p><p>Painel Administrativo</p></div>
          </div>
        </header>
        <nav id="owner-sidebar-modules" ref={navigation} className="owner-sidebar-scroll" aria-label="Módulos administrativos"
          onScroll={() => setTooltip(current => current?.anchor === document.activeElement
            ? { ...current, ...tooltipPosition(current.anchor) } : undefined)}>
          <div className="owner-sidebar-group" role="group" aria-label="Operação">
            <p className="owner-sidebar-section" aria-hidden="true">Operação</p>
            {OPERATION_ITEMS.map(renderItem)}
          </div>
          <div className="owner-sidebar-group" role="group" aria-label="Gestão">
            <p className="owner-sidebar-section" aria-hidden="true">Gestão</p>
            {MANAGEMENT_ITEMS.map(renderItem)}
          </div>
          <div className="owner-sidebar-footer">{renderItem(SETTINGS_ITEM)}</div>
        </nav>
      </div>
    </aside>
    {isCollapsed && tooltip && createPortal(<span aria-hidden="true" data-sidebar-tooltip className="owner-sidebar-tooltip"
      style={{ left: tooltip.left, top: tooltip.top }} onPointerEnter={() => window.clearTimeout(tooltipDelay.current)} onPointerLeave={deferTooltipClose}>
      <span>{tooltip.item.label}</span>
      {!!tooltipCount && <span className="owner-sidebar-badge" data-warning={tooltip.item.isAlertBadge || undefined}>{tooltipCount}</span>}
    </span>, document.body)}
  </>;
}
