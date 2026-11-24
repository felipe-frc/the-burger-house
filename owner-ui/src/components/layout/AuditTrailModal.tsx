import { useState } from 'react';
import { Modal } from '../common/Modal';
import { formatOwnerDateTime } from '../../services/ownerPresentation';
import type { FinancePeriod } from '../../services/ownerFinance';
import { useOwnerFinanceAudit } from '../../services/useOwnerFinance';

const actions: Record<string, string> = {
  OrderStatusChanged: 'Status do pedido atualizado', ProductUpdated: 'Produto atualizado', ProductCreated: 'Produto cadastrado',
  StockMovementRecorded: 'Movimentação registrada', StockItemCreated: 'Insumo cadastrado', TeamMemberChanged: 'Equipe atualizada',
  AgendaEventChanged: 'Compromisso atualizado', OperationLimitsChanged: 'Metas da operação atualizadas',
  PaymentApproved: 'Pagamento aprovado', PaymentRefunded: 'Estorno registrado', LoginSucceeded: 'Sessão iniciada',
  Logout: 'Sessão encerrada',
};
const entities: Record<string, string> = {
  Order: 'Pedidos', Product: 'Cardápio', StockItem: 'Estoque', TeamMember: 'Equipe', Agenda: 'Agenda',
  Store: 'Configurações', Payment: 'Pagamentos', AdminUser: 'Acesso', AdminSession: 'Acesso',
};
export const auditActionLabel = (action: string) => actions[action] ?? 'Alteração registrada';
export const auditEntityLabel = (entity: string) => entities[entity] ?? 'Outros';

export function AuditTrailModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return <AuditTrail onClose={onClose} />;
}

function AuditTrail({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState<FinancePeriod>('7d');
  const [entity, setEntity] = useState('');
  const [search, setSearch] = useState('');
  const audit = useOwnerFinanceAudit(period, 1);
  const types = [...new Set((audit.data ?? []).map(row => auditEntityLabel(row.entityType)))].sort();
  const term = search.trim().replace(/^#/, '').toLocaleLowerCase('pt-BR');
  const filtered = (audit.data ?? []).filter(row => (!entity || auditEntityLabel(row.entityType) === entity) &&
    (!term || row.actor.toLocaleLowerCase('pt-BR').includes(term) || row.entityId.toLocaleLowerCase('pt-BR').includes(term)));
  return <Modal isOpen onClose={onClose} title="Histórico de auditoria" maxWidthClass="max-w-2xl" titleId="owner-audit-title">
    <div className="flex flex-wrap gap-3">
      <label className="owner-field"><span>Período</span><select value={period} onChange={event => { setPeriod(event.target.value as FinancePeriod); setEntity(''); }}>
        <option value="today">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option>
      </select></label>
      <label className="owner-field"><span>Categoria</span><select value={entity} onChange={event => setEntity(event.target.value)}>
        <option value="">Todas</option>{types.map(type => <option key={type}>{type}</option>)}
      </select></label>
      <label className="owner-field"><span>Operador ou identificação</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>
    {audit.error ? <p role="alert" className="mt-4">{audit.error} <button className="owner-button" onClick={audit.retry}>Tentar novamente</button></p>
      : !audit.data ? <p role="status" className="mt-4">Carregando eventos…</p>
      : <div className="space-y-3 mt-4">
        <p className="owner-muted">{filtered.length} de {audit.data.length} registros carregados{audit.data.length === 50 ? ' · últimos 50 no período' : ''}</p>
        {filtered.length === 0 ? <p>Nenhum evento com estes filtros.</p> : <ol className="space-y-2">{filtered.map((row, index) => <li key={`${row.entityId}-${row.createdAtUtc}-${index}`} className="owner-panel p-3">
          <strong>{auditActionLabel(row.action)}</strong>
          <p className="owner-muted">{auditEntityLabel(row.entityType)} · {row.entityType === 'Order' ? '#' : ''}{row.entityId} · {row.actor}</p>
          <time dateTime={row.createdAtUtc} className="owner-muted">{formatOwnerDateTime(row.createdAtUtc)}</time>
        </li>)}</ol>}
      </div>}
  </Modal>;
}
