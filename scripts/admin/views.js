import { escapeHTML as esc } from "../utils.js";
import { money, dateTime, statusLabels, methodLabels, nextStatus } from "./model.js";
import { icon, brand } from "./icons.js";

export const title = (name, description) =>
  `<div class="heading"><div><span class="eyebrow">The Burger House · Gestão</span><h1>${esc(name)}</h1><p class="muted">${esc(description)}</p></div></div>`;
export const sectionTitle = (label, symbol) =>
  `<div class="section-title"><span class="section-icon">${icon(symbol)}</span><h2>${esc(label)}</h2></div>`;
export function card(label, value, symbol = "revenue", information = false) {
  return `<div class="card"><span class="metric-icon">${icon(symbol)}</span><span class="card-label">${esc(label)}${information ? "" : icon("chevron")}</span><strong class="${value === "Não disponível" ? "unavailable" : ""}">${esc(value)}</strong>${information ? `<button type="button" class="info-trigger" aria-label="Sobre o lucro bruto estimado">${icon("info")}<span class="tooltip" role="tooltip">Receita dos produtos menos o custo cadastrado dos itens. Não inclui despesas operacionais nem taxa de entrega.</span></button>` : `<span class="card-decoration" aria-hidden="true">${icon("chef")}</span>`}</div>`;
}
export const badge = (status) =>
  `<span class="badge badge-${Object.hasOwn(statusLabels, status) ? status.toLowerCase() : "unknown"}">${esc(statusLabels[status] || "Não informado")}</span>`;
export function shell(route) {
  return `<header class="topbar">${brand()}<button id="menu-toggle" aria-label="Menu" aria-expanded="false" aria-controls="admin-nav">${icon("menu")}<span class="menu-text">Menu</span></button><span class="owner">${icon("user")}Proprietário</span><button id="logout">${icon("logout")}Sair</button></header><div class="layout"><nav class="sidebar" id="admin-nav" aria-label="Administração">${[
    ["dashboard", "Dashboard", "home"],
    ["orders", "Pedidos", "orders"],
    ["finance", "Financeiro", "finance"],
    ["products", "Produtos", "products"],
    ["store", "Loja", "store"],
  ]
    .map(
      ([path, label, symbol]) =>
        `<a data-nav href="/admin/${path}" ${route.startsWith(`/admin/${path}`) ? 'aria-current="page"' : ""}>${icon(symbol)}<span>${label}</span>${path === "orders" ? '<span id="order-count" class="badge">0</span>' : ""}</a>`,
    )
    .join(
      "",
    )}<div class="sidebar-note">${icon("chef")}<p>Da cozinha à gestão.<br>Atualização a cada 15 segundos.</p></div></nav><main id="content" tabindex="-1"><p role="status">Carregando…</p></main></div>`;
}
export function login() {
  return `<main id="content" class="login">${brand()}<form id="login-form"><div class="login-intro"><span class="section-icon">${icon("lock")}</span><div class="eyebrow">Acesso privado</div><h1>Bem-vindo à casa.</h1><p class="muted">Entre para acompanhar pedidos e cuidar da operação.</p></div><label>E-mail<input name="email" type="email" autocomplete="username" maxlength="254" required></label><label>Senha<input name="password" type="password" autocomplete="current-password" maxlength="128" required></label><p id="login-error" class="error" role="alert"></p><button>Entrar ${icon("arrow")}</button></form></main>`;
}
export function orderTable(orders) {
  return `<div class="table-scroll" tabindex="0" aria-label="Pedidos"><table><thead><tr><th>Pedido / horário</th><th>Cliente</th><th>Tipo</th><th>Itens</th><th>Pagamento</th><th>Total</th><th>Status</th></tr></thead><tbody>${
    orders
      .map((o) => {
        const paid = o.status === "Received" && o.paymentStatus === "Approved";
        return `<tr class="${paid ? "new-order" : ""}"><td><a data-nav href="/admin/orders/${Number(o.id)}">#${Number(o.id)}</a><br><small>${esc(dateTime(o.createdAt))}</small></td><td>${esc(o.customerName || "Não registrado")}</td><td>${esc(o.orderType === "delivery" ? "Entrega" : o.orderType === "pickup" ? "Retirada" : "Não registrado")}</td><td>${Number(o.itemCount)}</td><td>${esc(methodLabels[o.paymentMethod] || "Não informado")}<br>${badge(o.paymentStatus)}</td><td>${esc(money(o.total))}</td><td>${badge(o.status)}${paid ? '<br><span class="badge new">Novo pedido pago</span>' : ""}</td></tr>`;
      })
      .join("") || '<tr><td colspan="7">Nenhum pedido neste filtro.</td></tr>'
  }</tbody></table></div>`;
}
export function pagination(page) {
  return `<div class="pagination"><button data-page="${page.pageNumber - 1}" ${page.pageNumber <= 1 ? "disabled" : ""}>${icon("back")}Anterior</button><span>Página ${page.pageNumber} · ${page.total} registros</span><button data-page="${page.pageNumber + 1}" ${page.pageNumber * page.pageSize >= page.total ? "disabled" : ""}>Próxima${icon("arrow")}</button></div>`;
}
export function periodForm(period = "7d", custom = false) {
  return `<form id="period-form" class="filters period-form ${custom ? "finance-period" : ""}"><label class="period-field"><span class="field-caption">Período</span>${icon("calendar")}<select name="period">${[
    ["today", "Hoje"],
    ["7d", "Últimos 7 dias"],
    ["30d", "Últimos 30 dias"],
    ["month", "Este mês"],
    ...(custom ? [["custom", "Personalizado"]] : []),
  ]
    .filter(([v]) => custom || v !== "today")
    .map(([v, l]) => `<option value="${v}" ${period === v ? "selected" : ""}>${l}</option>`)
    .join(
      "",
    )}</select></label>${custom ? '<label>Início<input type="date" name="start"></label><label>Fim<input type="date" name="end"></label>' : ""}<button>Aplicar período</button></form>`;
}
export function chart(points) {
  const max = Math.max(1, ...points.map((p) => p.revenue));
  const x = (i) => (points.length > 1 ? (i * 100) / (points.length - 1) : 50);
  const coordinates = points.map((p, i) => `${x(i) * 10},${(1 - p.revenue / max) * 180}`).join(" ");
  const axis = (value) =>
    new Intl.NumberFormat(
      "pt-BR",
      max >= 1000
        ? { notation: "compact", maximumFractionDigits: 1 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    ).format(value);
  return `<figure class="chart"><figcaption>Receita bruta por data de aprovação · BRL</figcaption><p class="muted">Escala: ${esc(money(0))} a ${esc(money(max))}</p><div class="line-chart"><div class="chart-y" aria-hidden="true">${[1, 0.75, 0.5, 0.25, 0].map((f) => `<span>${esc(axis(max * f))}</span>`).join("")}</div><div class="chart-body"><svg viewBox="0 0 1000 180" preserveAspectRatio="none" aria-hidden="true" focusable="false">${[0, 45, 90, 135].map((y) => `<line class="chart-grid" x1="0" y1="${y}" x2="1000" y2="${y}"/>`).join("")}<line class="chart-baseline" x1="0" y1="180" x2="1000" y2="180"/><polyline class="chart-line" points="${coordinates}"/></svg>${points.map((p, i) => `<button type="button" class="chart-point" style="left:${x(i)}%;bottom:${(p.revenue * 100) / max}%" aria-label="${esc(p.date)}: ${esc(money(p.revenue))}"><span>${esc(p.date)} · ${esc(money(p.revenue))}</span></button>`).join("")}</div><div class="chart-x" aria-hidden="true">${points.map((p, i) => (i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 7) === 0 ? `<span style="left:${x(i)}%">${esc(p.date)}</span>` : "")).join("")}</div></div>${points.every((p) => p.revenue === 0) ? '<p class="empty-chart">Nenhuma venda aprovada neste período.</p>' : ""}<details><summary>Ver valores por dia</summary><div class="table-scroll" tabindex="0" aria-label="Valores por dia"><table><thead><tr><th>Data</th><th>Faturamento</th></tr></thead><tbody>${points.map((p) => `<tr><td>${esc(p.date)}</td><td>${esc(money(p.revenue))}</td></tr>`).join("")}</tbody></table></div></details></figure>`;
}
export function coverage(summary) {
  return `<p class="muted">Receita dos produtos menos o custo cadastrado dos itens. Estimativa antes de estornos; não inclui despesas operacionais da loja nem taxa de entrega. Baseado em ${Number(summary.ordersWithCost)} de ${Number(summary.paidOrders)} pedidos pagos com custo completo.</p>${summary.partialRefunds ? `<p class="notice">${icon("info")}<span>${Number(summary.partialRefunds)} pagamento(s) com incremento parcial de estorno observado no período; a receita bruta original foi preservada.</span></p>` : ""}`;
}
export function historyNotice(summary) {
  const incomplete =
    summary.unknownApprovalPayments ||
    summary.unreconstructedRefundPayments ||
    summary.undatedRefundBalance;
  return `${summary.estimatedApprovals ? `<p class="notice">${Number(summary.estimatedApprovals)} aprovação(ões) no período usam estimativa legada, fixada na migração.</p>` : ""}${incomplete ? `<p class="notice">Histórico global incompleto: ${Number(summary.unknownApprovalPayments || 0)} pagamento(s) sem data de aprovação e ${Number(summary.unreconstructedRefundPayments || 0)} saldo(s) ainda não reconstruído(s). Saldo de estornos sem data: ${esc(money(summary.undatedRefundBalance || 0))}. Valores sem data não são atribuídos aos totais de nenhum período.</p>` : ""}`;
}
export function dashboard(data) {
  return (
    title("Dashboard", "Uma visão clara da operação. Valores em horário de São Paulo.") +
    `<div id="dashboard-cards" class="cards dashboard-cards">${dashboardCards(data)}</div><div id="coverage">${coverage(data.month)}${historyNotice(data.month)}</div><section class="panel"><div class="section-header">${sectionTitle("Ritmo das vendas", "revenue")}${periodForm()}</div><div id="revenue-chart"></div></section><section class="panel"><div class="section-header">${sectionTitle("Pedidos recentes", "coins")}<a data-nav href="/admin/orders">Ver todos os pedidos ${icon("arrow")}</a></div><div id="recent-orders">${orderTable(data.recentOrders)}</div></section>`
  );
}
export function dashboardCards(data) {
  return [
    card("Receita bruta hoje", money(data.today.grossRevenue), "revenue"),
    card("Pedidos pagos hoje", data.today.paidOrders, "cart"),
    card("Ticket médio hoje", money(data.today.averageTicket), "ticket"),
    card("Pedidos em aberto", data.openOrders, "orders"),
    card("Receita bruta · últimos 7 dias", money(data.week.grossRevenue), "trend"),
    card("Receita bruta do mês", money(data.month.grossRevenue), "calendar"),
    card("Lucro bruto estimado do mês", money(data.month.grossProfit), "coins", true),
  ].join("");
}
export function orderDetails(data) {
  const o = data.order,
    next = nextStatus(o.status, o.orderType);
  const action = {
    Preparing: "Iniciar preparo",
    ReadyForPickup: "Marcar como pronto",
    OutForDelivery: "Iniciar entrega",
    Completed: "Concluir pedido",
  };
  return (
    `<a data-nav class="back-link" href="/admin/orders">${icon("back")}Voltar aos pedidos</a>` +
    title(`Pedido #${o.id}`, dateTime(o.createdAt)) +
    `<p>${badge(o.status)}</p><div class="detail-grid"><section class="panel">${sectionTitle("Cliente", "user")}<p><span class="detail-value">${esc(o.customerName || "Não registrado")}</span><br>${esc(data.customerPhone || "Não registrado")}</p></section><section class="panel">${sectionTitle(o.orderType === "delivery" ? "Entrega" : "Retirada", "store")}${o.orderType === "delivery" ? `<p>${esc(data.street || "")}, ${esc(data.houseNumber || "")}<br>${esc(data.neighborhood || "")} · ${esc(data.city || "")}<br>CEP ${esc(data.zipCode || "")}<br>${esc(data.complement || "")}</p>` : "<p>Retirada no local.</p>"}</section><section class="panel">${sectionTitle("Pagamento", "coins")}${data.payments.map((p) => `<p>${badge(p.status)} · ${esc(methodLabels[p.method] || "Não informado")}<br>${esc(money(p.amount))}<br><small class="muted">Atualizado em ${esc(dateTime(p.updatedAt))}</small></p>`).join("") || "<p>Nenhum pagamento registrado.</p>"}<p class="muted">Taxa de entrega: ${esc(money(data.deliveryFee))}</p><div class="payment-total"><span>Total</span><strong>${esc(money(o.total))}</strong></div></section><section class="panel">${sectionTitle("Observação geral", "orders")}<p>${esc(data.observation || "Sem observações.")}</p></section></div><section class="panel"><div class="section-header">${sectionTitle("Itens do pedido", "products")}</div><div class="table-scroll" tabindex="0" aria-label="Itens do pedido"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Preço</th><th>Subtotal</th><th>Observação</th></tr></thead><tbody>${data.items.map((i) => `<tr><td>${esc(i.name)}</td><td>${Number(i.quantity)}</td><td>${esc(money(i.unitPrice))}</td><td>${esc(money(i.subtotal))}</td><td>${esc(i.observation || "—")}</td></tr>`).join("")}</tbody></table></div></section><section class="panel status-panel"><div>${sectionTitle("Status do pedido", "orders")}<p class="muted">Cancelamentos e estornos não são executados por este painel.</p></div>${next && o.paymentStatus === "Approved" ? `<button id="advance-status" data-id="${o.id}" data-current="${esc(o.status)}" data-next="${esc(next)}">${esc(action[next])}${icon("arrow")}</button>` : badge(o.status)}</section>`
  );
}
export function products(rows) {
  return (
    title("Produtos", "Gerencie preço, custo e disponibilidade.") +
    `<p class="notice">${icon("info")}<span>O cardápio público mantém preços, nomes, imagens e disponibilidade em arquivos estáticos. Atualize-o na mesma publicação ao alterar preço ou disponibilidade aqui; o backend sempre determina o preço cobrado. Custo vazio significa desconhecido.</span></p>` +
    `<div class="product-grid">${rows.map((p) => `<form class="panel" data-product="${p.id}"><div class="product-heading"><span class="section-icon">${icon("products")}</span><h2>${esc(p.name)}</h2></div><label>Preço de venda<input name="price" type="number" step=".01" min=".01" max="99999999.99" required value="${p.price}"></label><label>Custo por unidade<input name="costPrice" type="number" step=".01" min="0" max="99999999.99" value="${p.costPrice ?? ""}"></label><div class="product-margin"><p>Margem bruta</p><strong>${esc(money(p.margin))}${p.margin == null ? "" : ` <small>(${((p.margin / p.price) * 100).toFixed(1)}%)</small>`}</strong></div><label class="switch-label"><span>Status · Ativo</span><input name="isActive" type="checkbox" ${p.isActive ? "checked" : ""}></label><button>Salvar produto${icon("check")}</button></form>`).join("")}</div>`
  );
}
export function paymentMethods(methods) {
  return `<div class="method-list">${methods.map((m) => `<div class="method"><div class="method-top"><strong>${esc(methodLabels[m.method] || "Não informado")}</strong><strong>${esc(money(m.revenue))}</strong></div><div class="method-top method-meta"><span>${Number(m.count)} pagamento(s)</span><span>${Number(m.percentage)}% do faturamento</span></div><div class="method-track" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, Number(m.percentage)))}%"></span></div></div>`).join("") || "<p class='muted'>Sem pagamentos aprovados.</p>"}</div>`;
}
export function transactionTable(page) {
  return `<div class="table-scroll" tabindex="0" aria-label="Transações"><table><thead><tr><th>Data de atualização</th><th>Pedido</th><th>Cliente</th><th>Método</th><th>Valor original</th><th>Aprovação</th><th>Estorno acumulado</th><th>Status</th></tr></thead><tbody>${page.items.map((p) => `<tr><td>${esc(dateTime(p.date))}</td><td><a data-nav href="/admin/orders/${p.orderId}">#${p.orderId}</a></td><td>${esc(p.customerName)}</td><td>${esc(methodLabels[p.method] || "Não informado")}</td><td>${esc(money(p.amount))}</td><td>${p.approvedAt ? esc(dateTime(p.approvedAt)) : "Desconhecida"}<br><small>${p.approvalDateSource === "LegacyEstimate" ? "Estimativa legada" : p.approvalDateSource === "Observed" ? "Observação local" : "Sem data confiável"}</small></td><td>${esc(money(p.refundedAmount))}</td><td>${badge(p.status)}</td></tr>`).join("") || '<tr><td colspan="8">Nenhuma transação neste período.</td></tr>'}</tbody></table></div>${pagination(page)}`;
}

export function finance(data) {
  return (
    title("Financeiro", "Entenda o desempenho da operação e acompanhe receitas e custos.") +
    `<div class="cards">${card("Receita bruta hoje", money(data.today.grossRevenue), "revenue")}${card("Receita bruta · 7 dias", money(data.week.grossRevenue), "trend")}${card("Receita bruta · 30 dias", money(data.last30Days.grossRevenue), "calendar")}${card("Receita bruta do mês", money(data.month.grossRevenue), "coins")}</div>${periodForm("7d", true)}<p class="muted">Receita bruta pela aprovação, preservada após estornos. Estornos pela primeira observação do incremento na aplicação, não pela data garantida de execução no PagBank. Receita líquida = bruta menos estornos observados no período; pode ser negativa. Chargebacks não são deduzidos sem dados financeiros confiáveis. Datas em São Paulo. Aprovações novas também usam a primeira observação local.</p><div id="finance-results"></div>`
  );
}
export function financeResults(summary, points, methods, transactions) {
  return `<div class="cards">${card("Receita bruta no período", money(summary.grossRevenue), "revenue")}${card("Estornos observados", money(summary.refundedAmount), "coins")}${card("Receita líquida no período", money(summary.netRevenue), "revenue")}${card("Pedidos pagos", summary.paidOrders, "cart")}${card("Ticket médio", money(summary.averageTicket), "ticket")}${card("Lucro bruto estimado", money(summary.grossProfit), "coins", true)}</div>${coverage(summary)}${historyNotice(summary)}<section class="panel"><div class="section-header">${sectionTitle("Receita bruta por dia", "revenue")}</div>${chart(points)}</section><section class="panel"><div class="section-header">${sectionTitle("Formas de pagamento", "coins")}</div>${paymentMethods(methods)}</section><section class="panel"><div class="section-header">${sectionTitle("Transações", "orders")}</div>${transactionTable(transactions)}</section>`;
}
export function store(data, isOpen, hours) {
  return (
    title("Loja", "Visão atual da operação.") +
    `<p class="store-state ${isOpen ? "open" : ""}">${isOpen ? "Loja aberta" : "Loja fechada"} · somente leitura</p><div class="cards">${card("Status no horário deste dispositivo", isOpen ? "Aberta" : "Fechada", "store")}${card("Horário configurado", hours, "clock")}${card("Taxa de entrega", money(data.deliveryFee), "coins")}</div><p class="notice">${icon("info")}<span>Horários usam a mesma configuração e o relógio local do cardápio público. A taxa exibida vem da regra de pedidos do backend. Configurações dinâmicas não estão disponíveis nesta etapa.</span></p>`
  );
}
