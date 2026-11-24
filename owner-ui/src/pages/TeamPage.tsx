import { AdminApiError } from '../services/adminHttp';
import React, { useEffect, useState } from 'react';
import { UserCog, Plus } from 'lucide-react';
import { TeamMember } from '../types';
import { Modal } from '../components/common/Modal';
import { loadTeam, saveTeam, TeamRecord, TeamPageResult } from '../services/ownerTeam';
import { isOnShift } from '../services/ownerPresentation';
import { ownerNow, showcaseEnabled } from '../services/ownerShowcase';
import { TeamOperationsPanel, type TeamArea } from '../components/team/TeamOperationsPanel';

interface TeamPageProps {
  onNotifyToast: (
    title: string,
    description?: string,
    variant?: 'info' | 'success' | 'warning'
  ) => void;
}

export const TeamPage: React.FC<TeamPageProps> = ({
  onNotifyToast,
}) => {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamMember['role']>('Atendente');
  const [department, setDepartment] = useState<TeamMember['department']>('Atendimento');
  const [shift, setShift] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TeamPageResult | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [editing, setEditing] = useState<TeamRecord | null>(null);
  const [confirmMember, setConfirmMember] = useState<TeamRecord | null>(null);
  const [area, setArea] = useState<TeamArea>('staff');
  const [memberId, setMemberId] = useState<number>();
  const team = data?.items ?? [];
  const selectedMember = team.find(member => member.id === memberId) ?? team[0];

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadTeam(search, filter, page, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Falha ao consultar equipe.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, filter, page, reload]);

  const openEditor = (member: TeamRecord | null) => {
    setEditing(member);
    setConflict(false);
    setName(member?.name ?? '');
    setEmail(member?.email ?? '');
    setRole((member?.role ?? 'Atendente') as TeamMember['role']);
    setDepartment((member?.department ?? 'Atendimento') as TeamMember['department']);
    setShift(member?.shift ?? '');
    setError(null);
    setIsInviteOpen(true);
  };

  const toggleActive = async (member: TeamRecord) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveTeam({ ...member, active: !member.active }, member.id);
      setConfirmMember(null);
      setReload(value => value + 1);
      onNotifyToast('Cadastro atualizado', undefined, 'success');
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 409) {
        setConfirmMember(null);
        setReload(value => value + 1);
      }
      setError(error instanceof Error ? error.message : 'Falha ao atualizar cadastro.');
    } finally { setBusy(false); }
  };

  const handleInviteSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || conflict) return;
    setBusy(true);
    setError(null);
    try {
      await saveTeam({ name: name.trim(), email: email.trim(), role, department, shift: shift.trim(),
        active: editing?.active ?? true, revision: editing?.revision ?? 0 }, editing?.id);
      setIsInviteOpen(false);
      setReload(value => value + 1);
      onNotifyToast('Cadastro salvo', undefined, 'success');
    } catch (error) {
      setConflict(error instanceof AdminApiError && error.status === 409);
      setError(error instanceof Error ? error.message : 'Falha ao salvar cadastro.');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="owner-panel rounded-3xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="owner-module-icon">
            <UserCog size={21} aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-['Anton'] text-2xl uppercase tracking-wide text-slate-900 dark:text-white">
              Equipe
            </h2>
            <p className="text-xs font-['Barlow_Condensed'] uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Cadastro e funções operacionais dos colaboradores
            </p>
          </div>
        </div>

        {area === 'staff' && <button
          type="button"
          onClick={() => openEditor(null)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl owner-button owner-primary font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-xs transition-all"
        >
          <Plus size={16} />
          <span>Cadastrar Colaborador</span>
        </button>}
      </div>
      <nav className="owner-panel p-3 flex flex-wrap gap-2" aria-label="Áreas da equipe">
        {([['staff', 'Colaboradores'], ['attendance', 'Ponto e jornada'], ['payments', 'Pagamentos'], ['journal', 'Histórico administrativo']] as const).map(([value, label]) =>
          <button key={value} type="button" className="owner-button" aria-pressed={area === value} onClick={() => setArea(value)}>{label}</button>)}
      </nav>

      <div className="owner-panel rounded-3xl p-5 flex flex-wrap gap-3">
        <label className="owner-field flex-1"><span>Buscar equipe</span>
          <input className="owner-input w-full p-2 rounded-xl" value={search} maxLength={120}
            onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </label>
        <label className="owner-field"><span>Situação</span>
          <select className="owner-input block p-2 rounded-xl" value={filter}
            onChange={event => { setFilter(event.target.value); setPage(1); }}>
            <option value="all">Todos</option><option value="true">Ativos</option><option value="false">Inativos</option>
          </select>
        </label>
      </div>
      {loading && <p role="status">Carregando equipe…</p>}
      {error && !isInviteOpen && <div role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>Atualizar equipe</button></div>}
      {!loading && !error && team.length === 0 && <p role="status">Nenhum colaborador encontrado.</p>}
      {area === 'staff' && team.length > 0 && <section className="owner-panel p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="owner-heading">Colaboradores</h2>
          {data && <p className="owner-muted">{data.total} no filtro · {team.length} nesta página</p>}
        </div>
        <div className="owner-table-shell"><table className="owner-table">
          <caption className="sr-only">Colaboradores no filtro selecionado</caption>
          <thead><tr>
            <th scope="col">Colaborador</th><th scope="col">Departamento</th>
            <th scope="col">Escala de turno</th><th scope="col">Situação</th><th scope="col">Ações</th>
          </tr></thead>
          <tbody>{team.map(member => <tr key={member.id}>
            <th scope="row">
              <div className="flex items-start gap-2">
                <span className="owner-module-icon" aria-hidden="true">
                  {member.name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join('').toLocaleUpperCase('pt-BR')}
                </span>
                <div><h3 className="font-semibold">{member.name}</h3><span className="block owner-muted text-xs">{member.role}</span>
                  <span className="block owner-muted text-xs font-normal">{member.email}</span></div>
              </div>
            </th>
            <td>{member.department}</td>
            <td>{member.shift || '—'}</td>
            <td><div className="flex flex-wrap gap-1">
              <span className="owner-status" data-tone={member.active ? 'teal' : 'slate'}>{member.active ? 'Ativo' : 'Inativo'}</span>
              {member.active && isOnShift(member.shift, ownerNow()) && <span className="owner-status" data-tone="sky">Em turno agora</span>}
            </div></td>
            <td><div className="flex flex-wrap gap-2">
              <button type="button" className="owner-button" disabled={busy || loading}
                onClick={() => openEditor(member)} aria-label={`Editar ${member.name}`}>Editar</button>
              <button type="button" disabled={busy || loading} className={`owner-button ${member.active ? 'owner-button-critical' : ''}`}
                onClick={() => { setError(null); setConfirmMember(member); }}>{member.active ? 'Desativar' : 'Ativar'}</button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
        {data && <nav aria-label="Paginação da equipe" className="owner-pagination">
          <button className="owner-button" type="button" disabled={loading || page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button>
          <span>Página {page} · {data.total} colaboradores no filtro</span>
          <button className="owner-button" type="button" disabled={loading || page * data.pageSize >= data.total} onClick={() => setPage(value => value + 1)}>Próxima</button>
        </nav>}
      </section>}
      {area !== 'staff' && !loading && selectedMember && <>
        <div className="owner-panel p-4 flex flex-wrap items-end justify-between gap-3">
          <label className="owner-field"><span>Colaborador</span><select aria-label="Colaborador" value={selectedMember.id} onChange={event => setMemberId(Number(event.target.value))}>
            {team.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select></label>
          {data && <nav aria-label="Páginas de colaboradores" className="owner-pagination">
            <button type="button" className="owner-button" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button>
            <span>Página {page} · {data.total} no filtro</span>
            <button type="button" className="owner-button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Próxima</button>
          </nav>}
        </div>
        {showcaseEnabled() ? <p className="owner-panel p-4">Registros de pessoal disponíveis na sessão autenticada.</p>
          : <TeamOperationsPanel key={`${area}:${selectedMember.id}`} area={area} memberId={selectedMember.id} memberName={selectedMember.name} />}
      </>}
      {confirmMember && <Modal isOpen onClose={() => { if (!busy) setConfirmMember(null); }}
        title={confirmMember.active ? 'Desativar colaborador' : 'Ativar colaborador'} titleId="team-change-title">
        <p className="mb-3">Confirme a mudança no cadastro de {confirmMember.name}.</p>
        {error && <p role="alert" className="mb-2">{error}</p>}
        <button className="owner-button owner-primary" disabled={busy} onClick={() => void toggleActive(confirmMember)}>
          {busy ? 'Atualizando…' : 'Confirmar situação'}
        </button>
      </Modal>}
      {/* Invite Member Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => { if (!busy) setIsInviteOpen(false); }}
        title={editing ? 'Editar Colaborador' : 'Cadastrar Colaborador'}
        subtitle="Dados administrativos do colaborador e sua função operacional"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleInviteSubmit} className="space-y-3 text-xs">
          {error && (
            <div
              role="alert"
              className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 font-medium"
            >
              {error}
              {conflict && <button type="button" className="block underline py-2" onClick={() => {
                setIsInviteOpen(false);
                setReload(value => value + 1);
              }}>Fechar e atualizar equipe</button>}
            </div>
          )}

          <div>
            <label className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
              Nome Completo *
            </label>
            <input
              type="text"
              aria-label="Nome Completo"
              minLength={2}
              maxLength={120}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Fernanda Lima"
              className="owner-input w-full p-2.5 rounded-xl"
            />
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
              E-mail Corporativo *
            </label>
            <input
              type="email"
              aria-label="E-mail Corporativo"
              maxLength={254}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="fernanda@theburgerhouse.com.br"
              className="owner-input w-full p-2.5 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
                Cargo
              </label>
              <select
                aria-label="Cargo"
                value={role}
                onChange={(e) => setRole(e.target.value as TeamMember['role'])}
                className="owner-input w-full p-2.5 rounded-xl"
              >
                <option value="Atendente">Atendente</option>
                <option value="Chapeiro">Chapeiro</option>
                <option value="Chef de Cozinha">Chef de Cozinha</option>
                <option value="Entregador">Entregador</option>
                <option value="Gerente">Gerente</option>
                <option value="Administrador">Administrador</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
                Departamento
              </label>
              <select
                aria-label="Departamento"
                value={department}
                onChange={(e) =>
                  setDepartment(e.target.value as TeamMember['department'])
                }
                className="owner-input w-full p-2.5 rounded-xl"
              >
                <option value="Atendimento">Atendimento</option>
                <option value="Cozinha">Cozinha</option>
                <option value="Logística">Logística</option>
                <option value="Administração">Administração</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 mb-1 font-['Barlow_Condensed'] uppercase font-semibold">
              Escala de Turno
            </label>
            <input
              type="text"
              aria-label="Escala de Turno"
              maxLength={120}
              required
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              placeholder="18:00 - 23:30"
              className="owner-input w-full p-2.5 rounded-xl font-mono"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setIsInviteOpen(false)}
              className="flex-1 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-['Barlow_Condensed'] uppercase font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy || conflict}
              className="flex-1 py-2.5 rounded-xl owner-button owner-primary font-['Barlow_Condensed'] uppercase font-semibold"
            >
              {busy ? 'Salvando…' : 'Salvar Colaborador'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
