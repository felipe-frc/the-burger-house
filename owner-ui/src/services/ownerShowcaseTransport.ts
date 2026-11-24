import type { AgendaEvent, AgendaEventDraft } from './agendaService';
import type { AuditEntry, FinanceDates, FinancePeriod, FinanceSummary, Transaction } from './ownerFinance';
import type { DispatchChecklist, OrderDetailDto } from './ownerOrders';
import type { ProductDto } from './ownerProducts';
import type { OperationSettingsDto } from './ownerSettings';
import { isActiveStatus, type ServerOrderStatus } from './ownerPresentation';
import type { StockMovement, StockRecord } from './ownerStock';
import type { TeamDraft, TeamRecord } from './ownerTeam';

import { demoClock, demoDate } from './ownerShowcase';
const prefix = '/api/admin/';
const demoId = 3_000_000_000; // Outside the ASP.NET int ID space.
const customers = ['Alice Monteiro', 'Bruno Nogueira', 'Camila Azevedo', 'Diego Portela', 'Elisa Neri', 'Fábio Campos',
  'Gabriela Cordeiro', 'Henrique Pires', 'Isabela Mota', 'João Farias', 'Larissa Reis', 'Marcos Fialho'];
const products: ProductDto[] = [
  { id: demoId + 1, name: 'The Classic', description: 'Blend, cheddar e molho da casa.', price: 38, costPrice: 15, category: 'menu' },
  { id: demoId + 2, name: 'Double Smash', description: 'Dois smashes e cebola caramelizada.', price: 46, costPrice: 20, category: 'menu' },
  { id: demoId + 3, name: 'Batata crocante', description: 'Porção individual.', price: 16, costPrice: 6, category: 'sides' },
  { id: demoId + 4, name: 'Soda de morango', description: 'Soda da casa.', price: 12, costPrice: null, category: 'drinks' },
].map((item, index) => ({ ...item, category: item.category as ProductDto['category'], isActive: index !== 3,
  englishName: '', englishDescription: '', displayOrder: index, imageUrl: null }));
const initialStock: StockRecord[] = [
  { id: demoId + 1, name: 'Pão brioche', unit: 'un', quantity: 24, minimum: 30, revision: 1 },
  { id: demoId + 2, name: 'Blend bovino', unit: 'un', quantity: 42, minimum: 35, revision: 1 },
  { id: demoId + 3, name: 'Batata congelada', unit: 'kg', quantity: 4, minimum: 10, revision: 1 },
  { id: demoId + 4, name: 'Embalagem de hambúrguer', unit: 'un', quantity: 95, minimum: 40, revision: 1 },
];
const initialTeam: TeamRecord[] = [
  { id: demoId + 1, name: 'Marina Vasconcelos', email: 'marina@equipe.invalid', role: 'Gerente', department: 'Gestão', shift: '16:00 - 23:30', active: true, revision: 1 },
  { id: demoId + 2, name: 'Rafael Prado', email: 'rafael@equipe.invalid', role: 'Cozinheiro', department: 'Cozinha', shift: '17:00 - 23:30', active: true, revision: 1 },
  { id: demoId + 3, name: 'Beatriz Meireles', email: 'beatriz@equipe.invalid', role: 'Atendente', department: 'Atendimento', shift: '18:00 - 23:00', active: true, revision: 1 },
];

const dateKey = (stamp: number) => new Date(stamp - 3 * 3600000).toISOString().slice(0, 10);
const iso = (time: number) => new Date(time).toISOString();
type SampleOrder = OrderDetailDto & { approvedAt: string | null; costProfit: number | null };
const methods = ['Pix', 'CreditCard', 'DebitCard'];
const statuses: ServerOrderStatus[] = ['Received', 'Received', 'Preparing', 'Preparing', 'ReadyForPickup', 'OutForDelivery', 'Completed', 'PendingPayment', 'Cancelled'];
function makeOrders(): SampleOrder[] {
  return Array.from({ length: 96 }, (_, index) => {
    const status = index < 63 ? statuses[index % statuses.length] : 'Completed';
    const time = demoClock - (4 + index * 4 + Math.max(0, index - 62) * 360) * 60000;
    const paid = status !== 'PendingPayment' && status !== 'Cancelled';
    const product = products[index % 2];
    const side = products[(index % 3 === 0) ? 3 : 2];
    const quantity = 1 + index % 3;
    const isDelivery = (index + Math.floor(index / statuses.length)) % 3 !== 1 || status === 'OutForDelivery';
    const deliveryFee = isDelivery ? 5 : 0;
    const items = [product, side].map((item, position) => ({ name: item.name, category: item.category,
      unitPrice: item.price, quantity: position === 0 ? quantity : 1, subtotal: item.price * (position === 0 ? quantity : 1),
      observation: position === 0 && index % 9 === 0 ? 'Sem cebola' : null }));
    return {
      order: { id: demoId + index + 1, createdAt: iso(time), stageStartedAt: paid ? iso(time + (status === 'Received' ? 1 : 2) * 60000) : null,
        customerName: customers[index % customers.length], orderType: isDelivery ? 'delivery' : 'pickup',
        total: items.reduce((sum, item) => sum + item.subtotal, deliveryFee), status, paymentMethod: methods[index % methods.length],
        paymentStatus: paid ? 'Approved' : status === 'Cancelled' ? 'Cancelled' : 'Pending' },
      approvedAt: paid ? iso(time + 60000) : null,
      customerPhone: '', street: isDelivery ? 'Rua da Figueira' : null, neighborhood: isDelivery ? 'Jardim Horizonte' : null,
      houseNumber: isDelivery ? String(10 + index) : null, city: isDelivery ? 'Vila Modelo' : null,
      deliveryFee, items, costProfit: side.costPrice == null ? null : (product.price - product.costPrice!) * quantity + side.price - side.costPrice,
    };
  });
}

export class ShowcaseError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
const conflict = () => { throw new ShowcaseError(409, 'O registro foi alterado. Atualize e tente novamente.'); };
function page<T>(rows: T[], current: number) {
  return { items: rows.slice((current - 1) * 20, current * 20), total: rows.length, pageNumber: current, page: current, pageSize: 20 };
}
const cents = (value: number) => Math.round(value * 100) / 100;

export function createShowcase() {
  const orders = makeOrders();
  const menu = structuredClone(products);
  const stock = structuredClone(initialStock);
  const team = structuredClone(initialTeam);
  const movements = new Map<number, StockMovement[]>();
  const agenda: AgendaEvent[] = [
    { id: 'demo-entrega-insumos', revision: 1, title: 'Receber insumos', date: demoDate, startTime: '16:40', endTime: '17:20',
      category: 'Fornecedores', status: 'completed', createdAt: iso(demoClock - 86400000), updatedAt: iso(demoClock - 18000000) },
    { id: 'demo-fechamento', revision: 1, title: 'Conferir estoque de fechamento', date: demoDate, startTime: '22:45', endTime: '23:10',
      category: 'Estoque', status: 'pending', createdAt: iso(demoClock - 19800000), updatedAt: iso(demoClock - 19800000) },
  ];
  const audit: AuditEntry[] = [
    { createdAtUtc: iso(demoClock - 170000), actor: team[0].name, action: 'OrderStatusChanged', entityType: 'Order', entityId: String(demoId + 6), changes: '{"status":{"from":"ReadyForPickup","to":"OutForDelivery"}}' },
    { createdAtUtc: iso(demoClock - 1330000), actor: team[2].name, action: 'StockMovementRecorded', entityType: 'StockItem', entityId: String(stock[0].id), changes: '{"delta":-6}' },
    { createdAtUtc: iso(demoClock - 4530000), actor: team[0].name, action: 'ProductUpdated', entityType: 'Product', entityId: String(menu[3].id), changes: '{"active":{"from":true,"to":false}}' },
  ];
  const inbox = new Map(orders.filter(item => item.approvedAt).slice(0, 14).map((row, i) => [
    row.order.id, { id: row.order.id, approvedAt: row.approvedAt!, read: i > 4, archived: false,
      customerName: row.order.customerName, amount: row.order.total, channel: row.order.orderType },
  ]));
  let settings: OperationSettingsDto = { revision: 1, limits: { preparing: 20, readyForPickup: 12, outForDelivery: 35,
    pendingPaymentAgeHours: 2, schedule: { enabled: true, start: '18:00', end: '23:00' } } };
  let nextId = demoId + 1000;
  const track = (action: string, entityType: string, id: string | number, changes: unknown) =>
    audit.unshift({ createdAtUtc: iso(demoClock), actor: team[0].name, action, entityType, entityId: String(id), changes: JSON.stringify(changes) });

  function shiftWindow() {
    const configured = settings.limits.schedule;
    if (!configured?.enabled || !configured.start || !configured.end) return undefined;
    let start = Date.parse(`${demoDate}T${configured.start}:00-03:00`);
    let end = Date.parse(`${demoDate}T${configured.end}:00-03:00`);
    if (end <= start) end += 86400000;
    if (demoClock < start) { start -= 86400000; end -= 86400000; }
    return { start, end };
  }
  function financial(period: FinancePeriod, dates?: FinanceDates, channel?: string) {
    const shift = period === 'shift' ? shiftWindow() : undefined;
    if (period === 'shift' && !shift) throw new ShowcaseError(400, 'Configure o turno antes de consultar.');
    const first = period === 'today' ? demoDate : period === 'month' ? demoDate.slice(0, 7) + '-01'
      : period === 'custom' ? dates?.start : shift ? dateKey(shift.start) : dateKey(demoClock - (period === '7d' ? 6 : 29) * 86400000);
    const end = period === 'custom' ? dates?.end : shift ? dateKey(shift.end - 1) : demoDate;
    const selected = orders.filter(row => {
      const stamp = Date.parse(row.approvedAt ?? row.order.createdAt);
      const day = dateKey(stamp);
      return !!first && !!end && day >= first && day <= end && (!channel || row.order.orderType === channel) &&
        (!shift || (stamp >= shift.start && stamp < shift.end));
    });
    const approved = selected.filter(row => row.approvedAt);
    const gross = cents(approved.reduce((sum, row) => sum + row.order.total, 0));
    const withCost = approved.filter(row => row.costProfit != null);
    const summary: FinanceSummary = { grossRevenue: gross, refundedAmount: 0, netRevenue: gross, paidOrders: approved.length,
      averageTicket: approved.length ? cents(gross / approved.length) : 0,
      grossProfit: withCost.length ? cents(withCost.reduce((sum, row) => sum + row.costProfit!, 0)) : null,
      ordersWithCost: withCost.length, partialRefunds: 0, estimatedApprovals: 0, unknownApprovalPayments: 0,
      unreconstructedRefundPayments: 0, undatedRefundBalance: 0 };
    return { summary, selected, approved, first, end, shift };
  }

  return (path: string, init: RequestInit = {}) => {
    init.signal?.throwIfAborted();
    const url = new URL(path, 'http://localhost');
    const route = url.pathname.slice(prefix.length);
    const query = (key: string) => [...url.searchParams].find(([name]) => name.toLowerCase() === key.toLowerCase())?.[1] ?? '';
    const method = (init.method ?? 'GET').toUpperCase();
    const current = Math.max(1, Number(query('page')) || 1);
    const body = <T>() => JSON.parse(String(init.body)) as T;
    if (route === 'auth/me') return { role: 'Owner' };
    if (route === 'auth/logout') return;
    if (route === 'operation/settings') {
      if (method === 'GET') return settings;
      const draft = body<OperationSettingsDto>();
      if (draft.revision !== settings.revision) conflict();
      const schedule = draft.limits.schedule;
      if (schedule?.enabled && (!schedule.start || !schedule.end || schedule.start === schedule.end))
        throw new ShowcaseError(400, 'Horário do turno inválido.');
      settings = { ...draft, revision: draft.revision + 1 };
      track('OperationLimitsChanged', 'Store', 'operation', settings.limits);
      return;
    }
    if (route === 'store') return { deliveryFee: 5 };
    if (route === 'dashboard') {
      const orderCounts = new Map<string, { status: string; channel: string; count: number }>();
      for (const { order } of orders) {
        const key = order.status + ':' + order.orderType;
        const row = orderCounts.get(key) ?? { status: order.status, channel: order.orderType, count: 0 };
        row.count++;
        orderCounts.set(key, row);
      }
      const window = shiftWindow();
      const shift = window ? { start: iso(window.start), end: iso(window.end), isOpen: demoClock >= window.start && demoClock < window.end,
        summary: financial('shift').summary } : null;
      return { today: financial('today').summary, week: financial('7d').summary, month: financial('month').summary, shift,
        last30Days: financial('30d').summary, orderCounts: [...orderCounts.values()],
        openOrders: orders.filter(row => row.approvedAt && isActiveStatus(row.order.status as ServerOrderStatus)).length,
        newPaidOrders: orders.filter(row => row.order.status === 'Received').length,
        recentOrders: orders.filter(row => row.approvedAt).slice(0, 8).map(row => row.order) };
    }
    if (route === 'orders' || route === 'orders/operational') {
      const search = query('search').trim().toLocaleLowerCase('pt-BR').replace(/^#/, '');
      const filtered = orders.filter(({ order }) =>
        (!query('status') || query('status') === order.status) && (!query('channel') || query('channel') === order.orderType) &&
        (query('activeonly') !== 'true' || isActiveStatus(order.status as ServerOrderStatus)) &&
        (!search || String(order.id).includes(search) || order.customerName.toLocaleLowerCase('pt-BR').includes(search)));
      if (query('sort') === 'oldest') filtered.reverse();
      return route === 'orders' ? page(filtered.map(row => row.order), current) : page(filtered, current);
    }
    const orderMatch = /^orders\/(\d+)(\/status)?$/.exec(route);
    if (orderMatch) {
      const row = orders.find(item => item.order.id === Number(orderMatch[1]));
      if (!row) throw new ShowcaseError(404, 'Pedido indisponível.');
      if (method === 'GET') return row;
      const request = body<{ expectedStatus: string; status: string; checklist?: DispatchChecklist }>();
      const next: Record<string, string> = { Received: 'Preparing', Preparing: 'ReadyForPickup',
        ReadyForPickup: row.order.orderType === 'delivery' ? 'OutForDelivery' : 'Completed', OutForDelivery: 'Completed' };
      if (row.order.status !== request.expectedStatus || !row.approvedAt || next[row.order.status] !== request.status) conflict();
      if (row.order.status === 'ReadyForPickup' &&
        !(request.checklist?.items && request.checklist.packaging && request.checklist.identification))
        throw new ShowcaseError(400, 'Complete as conferências para liberar o pedido.');
      track('OrderStatusChanged', 'Order', row.order.id, { status: { from: row.order.status, to: request.status } });
      row.order = { ...row.order, status: request.status, stageStartedAt: iso(demoClock) };
      row.stageHistory = [...(row.stageHistory ?? []), { status: request.status as ServerOrderStatus, changedAt: iso(demoClock) }];
      return;
    }
    if (route.startsWith('finance/')) {
      const part = route.split('/')[1];
      const { approved, selected, summary, first, end, shift } = financial((query('period') || '7d') as FinancePeriod,
        { start: query('start'), end: query('end') }, query('channel'));
      if (part === 'summary') return summary;
      if (part === 'revenue') {
        const hourly = query('granularity') === 'hour';
        const points = new Map<string, number>();
        for (let day = Date.parse(first + 'T00:00:00Z'); day <= Date.parse(end + 'T00:00:00Z'); day += 86400000) {
          const key = iso(day).slice(0, 10);
          for (let hour = 0; hour < (hourly ? 24 : 1); hour++) {
            const label = `${key}T${String(hour).padStart(2, '0')}:00`;
            const instant = Date.parse(label + ':00-03:00');
            if (!hourly || !shift || (instant < shift.end && instant + 3600000 > shift.start))
              points.set(hourly ? label : key, 0);
          }
        }
        for (const row of approved) {
          const stamp = iso(Date.parse(row.approvedAt!) - 3 * 3600000);
          const key = hourly ? stamp.slice(0, 13) + ':00' : stamp.slice(0, 10);
          points.set(key, cents((points.get(key) ?? 0) + row.order.total));
        }
        return [...points].map(([date, revenue]) => ({ date, revenue }));
      }
      if (part === 'payment-methods') return methods.map(method => {
        const rows = approved.filter(row => row.order.paymentMethod === method);
        const revenue = cents(rows.reduce((sum, row) => sum + row.order.total, 0));
        return { method, count: rows.length, revenue, percentage: summary.grossRevenue ? cents(revenue * 100 / summary.grossRevenue) : 0 };
      }).filter(row => row.count > 0).sort((a, b) => b.revenue - a.revenue);
      if (part === 'transactions') return page(selected.map(({ order, approvedAt }): Transaction => ({
        orderId: order.id, customerName: order.customerName, date: approvedAt ?? order.createdAt, method: order.paymentMethod!,
        amount: order.total, status: order.paymentStatus!, approvedAt, approvalDateSource: 'Provider', refundedAmount: 0,
      })), current);
      if (part === 'audit') return audit.filter(row => {
        const day = dateKey(Date.parse(row.createdAtUtc));
        const instant = Date.parse(row.createdAtUtc);
        return !!first && !!end && day >= first && day <= end && (!shift || (instant >= shift.start && instant < shift.end));
      }).slice(0, 50);
    }
    if (route === 'customers') return customers.map(name => ({ name, purchases: orders
      .filter(row => row.approvedAt && row.order.customerName === name)
      .map(row => ({ orderId: row.order.id, createdAt: row.order.createdAt, approvedAmount: row.order.total })) }));
    if (route === 'products') {
      if (method === 'GET') return menu;
      const draft = body<ProductDto>();
      menu.push({ ...draft, id: nextId++, imageUrl: null });
      track('ProductCreated', 'Product', menu.at(-1)!.id, {});
      return;
    }
    const productMatch = /^products\/(\d+)(\/image)?$/.exec(route);
    if (productMatch) {
      const item = menu.find(row => row.id === Number(productMatch[1]));
      if (!item) throw new ShowcaseError(404, 'Produto indisponível.');
      if (productMatch[2]) {
        if (item.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(item.imageUrl);
        const file = init.body instanceof FormData ? init.body.get('file') : null;
        item.imageUrl = file instanceof Blob ? URL.createObjectURL(file) : null;
        return { imageUrl: item.imageUrl };
      }
      Object.assign(item, body<ProductDto>(), { id: item.id, imageUrl: item.imageUrl });
      track('ProductUpdated', 'Product', item.id, {});
      return;
    }
    if (route === 'stock') {
      if (method === 'GET') return stock;
      const draft = body<Pick<StockRecord, 'name' | 'unit' | 'minimum'>>();
      const item = { ...draft, id: nextId++, quantity: 0, revision: 1 };
      stock.push(item);
      track('StockItemCreated', 'StockItem', item.id, {});
      return item;
    }
    const movementMatch = /^stock\/(\d+)\/movements$/.exec(route);
    if (movementMatch) {
      const item = stock.find(row => row.id === Number(movementMatch[1]));
      if (!item) throw new ShowcaseError(404, 'Insumo indisponível.');
      const history = movements.get(item.id) ?? [];
      if (method === 'GET') return page(history, current).items;
      const change = body<{ requestId: string; revision: number; delta: number; reason: string }>();
      if (history.some(row => row.id === change.requestId)) return;
      if (change.revision !== item.revision) conflict();
      if (item.quantity + change.delta < 0) throw new ShowcaseError(400, 'O saldo do insumo não pode ficar negativo.');
      item.quantity += change.delta; item.revision++;
      history.unshift({ id: change.requestId, delta: change.delta, reason: change.reason, balance: item.quantity, createdAt: iso(demoClock) });
      movements.set(item.id, history);
      track('StockMovementRecorded', 'StockItem', item.id, { delta: change.delta });
      return;
    }
    if (route === 'team' || route.startsWith('team/')) {
      if (method === 'GET') return page(team.filter(row => (!query('active') || query('active') === String(row.active)) &&
        [row.name, row.role, row.department, row.email].some(value => value.toLocaleLowerCase('pt-BR').includes(query('search').toLocaleLowerCase('pt-BR')))), current);
      const draft = body<TeamDraft>();
      const existing = team.find(row => row.id === Number(route.split('/')[1]));
      if (method === 'PUT' && (!existing || existing.revision !== draft.revision)) conflict();
      const record = { ...draft, id: existing?.id ?? nextId++, revision: (existing?.revision ?? 0) + 1 };
      if (existing) Object.assign(existing, record); else team.push(record);
      track('TeamMemberChanged', 'TeamMember', record.id, {});
      return record;
    }
    if (route === 'agenda' || route.startsWith('agenda/')) {
      if (method === 'GET') return agenda.filter(row => row.date >= query('start') && row.date <= query('end'));
      const index = agenda.findIndex(row => row.id === decodeURIComponent(route.slice(7)));
      if (method === 'DELETE') {
        if (index < 0 || agenda[index].revision !== Number(query('revision'))) conflict();
        agenda.splice(index, 1);
        return;
      }
      const { id, draft, revision } = body<{ id: string; draft: AgendaEventDraft & { status: AgendaEvent['status'] }; revision: number }>();
      if (method === 'PUT' && (index < 0 || agenda[index].revision !== revision)) conflict();
      const event = { ...draft, id: agenda[index]?.id ?? id, revision: (revision ?? 0) + 1,
        createdAt: agenda[index]?.createdAt ?? iso(demoClock), updatedAt: iso(demoClock) };
      if (index < 0) agenda.push(event); else agenda[index] = event;
      track('AgendaEventChanged', 'Agenda', event.id, {});
      return event;
    }
    if (route === 'notifications/inbox') {
      const visible = [...inbox.values()].filter(row => !row.archived);
      const eligible = visible.filter(row => !query('beforeId') || row.id < Number(query('beforeId'))).sort((a, b) => b.id - a.id);
      return { items: eligible.slice(0, 20), beforeId: eligible.length > 20 ? eligible[19].id : null,
        unreadCount: visible.filter(row => !row.read).length };
    }
    if (route.startsWith('notifications/inbox/')) {
      if (route.endsWith('/inbox/read')) for (const row of inbox.values()) row.read = true;
      else {
        const row = inbox.get(Number(route.split('/')[2]));
        if (!row) throw new ShowcaseError(404, 'Notificação indisponível.');
        if (route.endsWith('/archive')) row.archived = true;
        else row.read = true;
      }
      return;
    }
    throw new ShowcaseError(403, 'Esta ação exige uma sessão operacional.');
  };
}

export const showcaseRequest = createShowcase();
