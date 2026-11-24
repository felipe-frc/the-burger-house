import { useState } from 'react';
import { ArrowRight, Mail, Phone } from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { formatOwnerDateTime, formatOwnerMoney } from '../services/ownerPresentation';
import type { Customer } from '../types';

export function CustomersPage({ customers }: { customers: Customer[] }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Customer | null>(null);
  const term = search.trim().toLocaleLowerCase('pt-BR');
  const rows = customers.filter(customer => (filter === 'all' || customer.status === filter) &&
    (!term || [customer.name, customer.phone, customer.email].some(value => value.toLocaleLowerCase('pt-BR').includes(term)) ||
      customer.purchases?.some(purchase => '#' + purchase.orderId === term || String(purchase.orderId) === term)));

  return <div className="space-y-4">
    <header className="owner-panel p-5"><h1 className="owner-title">Clientes</h1><p className="owner-muted">Compras aprovadas com identificação válida nos últimos 365 dias · {customers.length} clientes exibidos</p></header>
    <section className="owner-panel p-4 flex flex-wrap gap-3" aria-label="Filtros de clientes">
      <label className="owner-field"><span>Buscar clientes</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome ou pedido" /></label>
      <label className="owner-field"><span>Compras</span><select value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="all">Todas</option><option value="regular">Recorrentes</option><option value="new">Primeira compra</option>
      </select></label>
    </section>
    {!rows.length ? <p className="owner-panel p-5">Nenhum cliente com compras aprovadas corresponde à busca.</p> : <div className="owner-panel p-4 owner-table-shell">
      <table className="owner-table">
        <caption className="sr-only">Clientes e compras aprovadas</caption>
        <thead><tr><th scope="col">Cliente</th><th scope="col">Compras</th><th scope="col">Última compra</th><th scope="col" className="text-right">Total</th><th scope="col">Histórico</th></tr></thead>
        <tbody>{rows.map(customer => <tr key={customer.id}>
          <th scope="row"><h2><button type="button" className="font-semibold text-left hover:underline min-h-10" onClick={() => setSelected(customer)}>{customer.name}</button></h2></th>
          <td>{customer.ordersCount}</td><td>{customer.lastOrderDate ? formatOwnerDateTime(customer.lastOrderDate) : '—'}</td>
          <td className="text-right tabular-nums">{formatOwnerMoney(customer.totalSpent)}</td>
          <td><button aria-label={`Histórico de ${customer.name}`} className="owner-icon-button" onClick={() => setSelected(customer)}><ArrowRight size={16} aria-hidden="true"/></button></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {selected && <Modal isOpen onClose={() => setSelected(null)} title={selected.name} titleId="owner-customer-title">
      <section className="space-y-3">
        {selected.phone && <p className="flex items-center gap-2"><Phone size={16} aria-hidden="true"/> {selected.phone}</p>}
        {selected.email && <p className="flex items-center gap-2"><Mail size={16} aria-hidden="true"/> {selected.email}</p>}
        {selected.deliveryAddress && <p className="owner-muted">Endereço da última compra · {selected.deliveryAddress}</p>}
        <h3 className="owner-heading">Compras aprovadas ({selected.ordersCount})</h3>
        <ul>{selected.purchases?.map(row => <li key={row.orderId} className="py-2 border-b border-current/10 flex flex-wrap justify-between gap-2">
          <span>#{row.orderId} · {formatOwnerDateTime(row.createdAt)}</span><strong className="tabular-nums">{formatOwnerMoney(row.approvedAmount)}</strong>
        </li>)}</ul>
      </section>
    </Modal>}
  </div>;
}
