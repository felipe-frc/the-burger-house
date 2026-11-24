import { AdminApiError } from '../services/adminHttp';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Boxes, CircleCheck, PackageX, Plus, Search, TriangleAlert } from 'lucide-react';
import { Modal } from '../components/common/Modal';
import { createStock, isLowStock, loadStockHistory, moveStock, stockCondition, stockIndicators, type StockMovement, type StockRecord } from '../services/ownerStock';
import { formatOwnerDateTime } from '../services/ownerPresentation';

const field = 'owner-input w-full rounded-xl px-3 py-2';
const button = 'owner-button';
const primary = 'owner-button owner-primary';
const quantity = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

type StockDialog = { kind: 'new' } | { kind: 'move'; item: StockRecord } | { kind: 'history'; item: StockRecord };
type Props = { items: StockRecord[]; loading: boolean; error: string; reload: () => void };

export function StockPage({ items, loading, error, reload }: Props) {
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [dialog, setDialog] = useState<StockDialog | null>(null);
  const [failure, setFailure] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const saving = useRef(false);
  const movementRequest = useRef<{ key: string; id: string } | null>(null);
  const rows = items.filter(item => item.name.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR'))
    && (!lowOnly || isLowStock(item))).sort((a, b) => Number(b.quantity === 0) - Number(a.quantity === 0) ||
      Number(isLowStock(b)) - Number(isLowStock(a)) ||
      (a.minimum > 0 && b.minimum > 0 ? a.quantity / a.minimum - b.quantity / b.minimum : 0) ||
      a.name.localeCompare(b.name, 'pt-BR'));
  const indicators = stockIndicators(items);

  function open(next: StockDialog) {
    movementRequest.current = null;
    setFailure('');
    setConflict(false);
    setDialog(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || conflict || !dialog || dialog.kind === 'history') return;
    const fields = new FormData(event.currentTarget);
    saving.current = true;
    setBusy(true);
    setFailure('');
    try {
      if (dialog.kind === 'new') {
        await createStock({ name: String(fields.get('name')), unit: String(fields.get('unit')), minimum: Number(fields.get('minimum')) });
      } else {
        const amount = Number(fields.get('quantity'));
        const mode = fields.get('mode');
        const delta = Math.round((mode === 'out' ? -amount : mode === 'adjust' ? amount - dialog.item.quantity : amount) * 1000) / 1000;
        if (delta === 0 || dialog.item.quantity + delta < -0.000001) {
          setFailure('Informe uma movimentação válida com saldo final não negativo.');
          return;
        }
        const reason = String(fields.get('reason')).trim();
        const key = JSON.stringify([dialog.item.id, dialog.item.revision, delta, reason]);
        if (movementRequest.current?.key !== key) movementRequest.current = { key, id: crypto.randomUUID() };
        await moveStock(dialog.item.id, movementRequest.current.id, dialog.item.revision, delta, reason);
      }
      setSuccess(dialog.kind === 'new' ? 'Insumo cadastrado.' : 'Movimentação registrada.');
      setDialog(null);
      reload();
    } catch (cause) {
      setConflict(cause instanceof AdminApiError && cause.status === 409 && dialog.kind === 'move');
      setFailure(cause instanceof Error ? cause.message : 'Falha ao salvar.');
      reload();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const latest = dialog?.kind === 'move' &&
    items.find(item => item.id === dialog.item.id && item.revision !== dialog.item.revision);

  return (
    <div className="space-y-5">
      <section className="owner-panel rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="owner-module-icon"><Boxes size={21} aria-hidden="true" /></span>
          <div><h1 className="owner-title">Estoque</h1><p className="owner-muted">Saldos, reposição e movimentações dos insumos</p></div>
        </div>
        <button type="button" className={primary} onClick={() => open({ kind: 'new' })}>
          <Plus aria-hidden="true" className="inline" size={16} /> Cadastrar insumo
        </button>
      </section>
      {!error && <section className="owner-kpi-grid" aria-label="Indicadores de todos os insumos" aria-busy={loading}>
        {([
          ['Insumos cadastrados', indicators.total, Boxes, 'blue'],
          ['Abaixo do mínimo', indicators.low, TriangleAlert, 'coral'],
          ['Saldo zerado', indicators.empty, PackageX, 'coral'],
          ['Saldo adequado', indicators.adequate, CircleCheck, 'teal'],
        ] as const).map(([label, value, Icon, tone]) => <div className="owner-panel owner-kpi-hero" key={label}>
          <div className="owner-kpi-caption"><span className="owner-metric-icon" data-tone={tone}><Icon size={16} aria-hidden="true" /></span><h2 className="owner-label">{label}</h2></div>
          <p className="owner-display">{loading ? '—' : value}</p>
        </div>)}
      </section>}
      <div className="owner-panel rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <Search aria-hidden="true" size={16} />
        <input className={field + ' sm:max-w-xs'} aria-label="Buscar insumo" placeholder="Buscar insumo" value={search}
          onChange={event => setSearch(event.target.value)} />
        <label className="owner-check"><input type="checkbox" checked={lowOnly}
          onChange={event => setLowOnly(event.target.checked)} /> Abaixo do mínimo</label>
      </div>
      {loading && <p role="status">Consultando estoque…</p>}
      {success && <p role="status">{success}</p>}
      {error && <p role="alert">{error} <button type="button" className={button} onClick={reload}>Tentar novamente</button></p>}
      {!loading && !error && rows.length === 0 && <p className="owner-panel rounded-3xl p-8">Nenhum insumo encontrado.</p>}
      {rows.length > 0 && <div className="owner-panel p-4"><div className="owner-table-shell"><table className="owner-table owner-stock-table">
        <caption className="sr-only">Saldos de estoque</caption>
        <thead><tr><th scope="col">Insumo</th><th scope="col">Saldo atual</th><th scope="col">Mínimo</th><th scope="col">Reposição</th><th scope="col">Situação</th><th scope="col">Ações</th></tr></thead>
        <tbody>{rows.map(item => {
          const { state, shortage } = stockCondition(item);
          return <tr key={item.id} data-stock-state={state}>
          <th scope="row">{item.name}<span className="block owner-muted font-normal text-xs">{item.unit}</span></th>
          <td className="tabular-nums"><strong>{quantity.format(item.quantity)}</strong> {item.unit}
            {item.minimum > 0 && <div className="owner-quantity-track" aria-hidden="true">
              <div style={{ width: `${Math.min(100, item.quantity / item.minimum * 100)}%` }} />
            </div>}
          </td>
          <td className="tabular-nums">{quantity.format(item.minimum)} {item.unit}</td>
          <td className="tabular-nums">{shortage > 0 ? <strong>{quantity.format(shortage)} {item.unit}</strong> : '—'}</td>
          <td><span className="owner-status" data-tone={state === 'adequate' ? 'teal' : 'red'}>
            {state === 'empty' ? <><PackageX size={13} aria-hidden="true" /> Zerado</> : state === 'low'
              ? <><TriangleAlert size={13} aria-hidden="true" /> Abaixo do mínimo</> : 'Adequado'}
          </span></td>
          <td><div className="flex flex-wrap items-center gap-2">
            <button type="button" className={button} onClick={() => open({ kind: 'move', item })}>Movimentar</button>
            <button type="button" className={button} onClick={() => open({ kind: 'history', item })}>Histórico</button>
          </div></td>
          </tr>;
        })}</tbody>
      </table></div></div>}
      {dialog && <Modal isOpen onClose={() => { if (!saving.current) setDialog(null); }}
        title={dialog.kind === 'new' ? 'Cadastrar insumo' : dialog.item.name}>
        {dialog.kind === 'history' ? <History itemId={dialog.item.id} /> :
          <form onSubmit={submit} className="space-y-3">
            {dialog.kind === 'new' ? <>
              <label className="block">Nome<input className={field} name="name" required maxLength={120} /></label>
              <label className="block">Unidade<input className={field} name="unit" required maxLength={20} /></label>
              <label className="block">Estoque mínimo<input className={field} name="minimum" required type="number" min="0" max="1000000" step=".001" /></label>
            </> : <>
              <p>Saldo atual {dialog.item.quantity.toLocaleString('pt-BR')} {dialog.item.unit}</p>
              <label className="block">Tipo<select className={field} name="mode">
                <option value="in">Entrada</option><option value="out">Saída</option><option value="adjust">Ajustar saldo final</option>
              </select></label>
              <label className="block">Quantidade<input className={field} name="quantity" type="number" min="0" max="1000000" step=".001" required /></label>
              <label className="block">Motivo<input className={field} name="reason" required maxLength={300} /></label>
            </>}
            {failure && <p role="alert">{failure}</p>}
            {conflict && latest && <button type="button" className={button}
              onClick={() => open({ kind: 'move', item: latest })}>Revisar saldo atualizado</button>}
            {conflict && !latest && <button type="button" className={button} onClick={reload}>Consultar saldo novamente</button>}
            <button type="submit" className={primary} disabled={busy || conflict}>{busy ? 'Salvando…' : 'Salvar'}</button>
          </form>}
      </Modal>}
    </div>
  );
}

function History({ itemId }: { itemId: number }) {
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<StockMovement[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    setEntries(null);
    setError('');
    loadStockHistory(itemId, page, request.signal)
      .then(data => { if (!request.signal.aborted) setEntries(data); })
      .catch(cause => { if (!request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Falha ao consultar histórico.'); });
    return () => request.abort();
  }, [itemId, page, retry]);

  return <>
    <h3 className="font-semibold">Histórico de movimentações</h3>
    {!entries && !error && <p role="status">Consultando histórico…</p>}
    {error && <p role="alert">{error} <button type="button" className={button} onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></p>}
    {entries?.length === 0 && <p>Nenhuma movimentação nesta página.</p>}
    <ul className="divide-y divide-slate-500/30">
      {entries?.map(entry => <li key={entry.id} className="py-2 break-words">
        <strong>{entry.delta > 0 ? '+' : ''}{entry.delta.toLocaleString('pt-BR')}</strong> · Saldo {entry.balance.toLocaleString('pt-BR')}
        <p>{entry.reason}</p>
        <time dateTime={entry.createdAt}>{formatOwnerDateTime(entry.createdAt)}</time>
      </li>)}
    </ul>
    <nav className="owner-pagination" aria-label="Paginação do histórico">
      <button type="button" className={button} disabled={page === 1} onClick={() => setPage(value => value - 1)}>Anterior</button>
      <span>Página {page}</span>
      <button type="button" className={button} disabled={entries?.length !== 50} onClick={() => setPage(value => value + 1)}>Próxima</button>
    </nav>
  </>;
}
