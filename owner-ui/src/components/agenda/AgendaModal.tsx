import { AdminApiError } from '../../services/adminHttp';
import { useAgendaData } from '../../services/useAgendaData';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  Circle,
  Pencil,
  Trash2,
  Clock,
  RotateCcw,
  HardDrive,
  Check,
  X,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { AgendaEventForm } from './AgendaEventForm';
import {
  CalendarDate,
  addDaysToCalendarDate,
  addMonthsToView,
  formatFullOperationalDate,
  formatMonthYearTitle,
  getMonthGridCells,
  getOperationalToday,
  isSameCalendarDate,
  toIsoCalendarKey,
} from '../../services/dateService';
import {
  AgendaCategory,
  AgendaEvent,
  AgendaEventDraft,
  AgendaValidationErrors,
  createAgendaEvent,
  sortAgendaEvents,
  validateAgendaDraft,
  generateAgendaEventId,
  persistAgendaEvent,
  deletePersistedAgendaEvent,
} from '../../services/agendaService';

interface AgendaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WEEKDAY_HEADERS = [
  { short: 'D', label: 'Domingo' },
  { short: 'S', label: 'Segunda-feira' },
  { short: 'T', label: 'Terça-feira' },
  { short: 'Q', label: 'Quarta-feira' },
  { short: 'Q', label: 'Quinta-feira' },
  { short: 'S', label: 'Sexta-feira' },
  { short: 'S', label: 'Sábado' },
];

const CATEGORY_BADGE_CLASSES: Record<AgendaCategory, string> = {
  Operação:
    'bg-sky-500/12 text-sky-800 dark:text-sky-300 border-sky-500/30',
  Estoque:
    'bg-amber-500/12 text-amber-800 dark:text-amber-300 border-amber-500/30',
  Fornecedores:
    'bg-indigo-500/12 text-indigo-800 dark:text-indigo-300 border-indigo-500/30',
  Equipe:
    'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
  Manutenção:
    'bg-rose-500/12 text-rose-800 dark:text-rose-300 border-rose-500/30',
  Administrativo:
    'bg-purple-500/12 text-purple-800 dark:text-purple-300 border-purple-500/30',
  Outros:
    'bg-slate-500 text-slate-700 dark:text-slate-300 border-slate-500/30',
};

function parseIsoKeyToCalendarDate(isoKey: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoKey);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

export const AgendaModal: React.FC<AgendaModalProps> = ({
  isOpen,
  onClose,
}) => {
  const editingEvent = useRef<AgendaEvent | null>(null);
  const creationId = useRef('');
  const [today, setToday] = useState<CalendarDate>(() => getOperationalToday());
  const [selectedDate, setSelectedDate] = useState<CalendarDate>(() =>
    getOperationalToday()
  );
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number }>(() => {
    const t = getOperationalToday();
    return { year: t.year, month: t.month };
  });

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AgendaCategory>('Operação');
  const [eventDate, setEventDate] = useState<string>(() =>
    toIsoCalendarKey(getOperationalToday())
  );
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [formErrors, setFormErrors] = useState<AgendaValidationErrors>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const dayButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const titleInputRef = useRef<HTMLInputElement>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const showFeedback = (msg: string) => {
    setFeedbackMessage(msg);
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedbackMessage(null);
      feedbackTimerRef.current = null;
    }, 4000);
  };

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const current = getOperationalToday();
    setToday(current);
    setConfirmDeleteId(null);
    setFormErrors({});
    setIsFormOpen(false);
    setEditingId(null);
  }, [isOpen]);

  const selectedIsoKey = toIsoCalendarKey(selectedDate);
  const isViewingToday = isSameCalendarDate(selectedDate, today);

  const gridCells = useMemo(
    () => getMonthGridCells(viewMonth.year, viewMonth.month),
    [viewMonth.year, viewMonth.month]
  );

  const { events, loading, requestError, legacyEvents, mutating, mutate, retry } = useAgendaData(
    isOpen, toIsoCalendarKey(gridCells[0].date), toIsoCalendarKey(gridCells[gridCells.length - 1].date)
  );

  const eventsCountByDate = useMemo(() => {
    const map = new Map<string, { total: number; pending: number }>();
    for (const ev of events) {
      const current = map.get(ev.date) ?? { total: 0, pending: 0 };
      current.total += 1;
      if (ev.status === 'pending') current.pending += 1;
      map.set(ev.date, current);
    }
    return map;
  }, [events]);

  const selectedDayEvents = useMemo(() => {
    return sortAgendaEvents(events.filter((ev) => ev.date === selectedIsoKey));
  }, [events, selectedIsoKey]);


  const importLocalEvents = async () => {
    let conflicts = 0;
    const imported = await mutate(async () => {
      for (const event of legacyEvents) {
        try {
          await persistAgendaEvent({ ...event, revision: undefined });
        } catch (error) {
          if (!(error instanceof AdminApiError) || error.status !== 409) throw error;
          conflicts += 1;
        }
      }
    });
    if (imported) {
      showFeedback(conflicts
        ? (legacyEvents.length - conflicts) + ' compromissos confirmados. ' + conflicts + ' em conflito permanecem neste navegador.'
        : 'Importação concluída. Os registros locais foram preservados.');
    }
  };

  const openNewForm = () => {
    if (mutating) return;
    setEditingId(null);
    editingEvent.current = null;
    creationId.current = generateAgendaEventId();
    setTitle('');
    setCategory('Operação');
    setEventDate(selectedIsoKey);
    setStartTime('09:00');
    setEndTime('10:00');
    setDescription('');
    setNotes('');
    setFormErrors({});
    setConfirmDeleteId(null);
    setIsFormOpen(true);
    window.requestAnimationFrame(() => titleInputRef.current?.focus());
  };

  const openEditForm = (ev: AgendaEvent) => {
    if (mutating) return;
    setEditingId(ev.id);
    editingEvent.current = ev;
    setTitle(ev.title);
    setCategory(ev.category);
    setEventDate(ev.date);
    setStartTime(ev.startTime);
    setEndTime(ev.endTime);
    setDescription(ev.description ?? '');
    setNotes(ev.notes ?? '');
    setFormErrors({});
    setConfirmDeleteId(null);
    setIsFormOpen(true);
    window.requestAnimationFrame(() => titleInputRef.current?.focus());
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormErrors({});
  };

  const handleSelectCalendarDay = (date: CalendarDate) => {
    setSelectedDate(date);
    setViewMonth({ year: date.year, month: date.month });
    setConfirmDeleteId(null);
    if (isFormOpen && !editingId) {
      setEventDate(toIsoCalendarKey(date));
    }
  };

  const handleGoToToday = () => {
    const current = getOperationalToday();
    setToday(current);
    setSelectedDate(current);
    setViewMonth({ year: current.year, month: current.month });
    setConfirmDeleteId(null);
    if (isFormOpen && !editingId) {
      setEventDate(toIsoCalendarKey(current));
    }
  };

  const handleDayKeyDown = (e: React.KeyboardEvent, cellDate: CalendarDate) => {
    let delta = 0;
    if (e.key === 'ArrowRight') delta = 1;
    else if (e.key === 'ArrowLeft') delta = -1;
    else if (e.key === 'ArrowDown') delta = 7;
    else if (e.key === 'ArrowUp') delta = -7;
    else if (e.key === 'PageUp') {
      e.preventDefault();
      setViewMonth((v) => addMonthsToView(v.year, v.month, -1));
      return;
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setViewMonth((v) => addMonthsToView(v.year, v.month, 1));
      return;
    } else {
      return;
    }

    e.preventDefault();
    const next = addDaysToCalendarDate(cellDate, delta);
    if (next.year !== viewMonth.year || next.month !== viewMonth.month) {
      setViewMonth({ year: next.year, month: next.month });
    }
    window.requestAnimationFrame(() => {
      dayButtonRefs.current[toIsoCalendarKey(next)]?.focus();
    });
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutating) return;

    const draft: AgendaEventDraft = {
      title: title.trim(),
      description: description.trim() || undefined,
      date: eventDate,
      startTime,
      endTime,
      category,
      notes: notes.trim() || undefined,
    };

    const validation = validateAgendaDraft(draft);
    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    const original = editingEvent.current;
    const candidate = original
      ? { ...original, ...draft }
      : { ...createAgendaEvent([], draft).created, id: creationId.current };
    if (!await mutate(() => persistAgendaEvent(candidate))) return;
    showFeedback('Compromisso confirmado pelo servidor.');

    const parsedDate = parseIsoKeyToCalendarDate(draft.date);
    if (parsedDate) {
      setSelectedDate(parsedDate);
      setViewMonth({ year: parsedDate.year, month: parsedDate.month });
    }

    closeForm();
  };

  const handleToggleComplete = async (id: string) => {
    const target = events.find((ev) => ev.id === id);
    if (!target) return;
    if (!await mutate(() => persistAgendaEvent({ ...target, status: target.status === 'completed' ? 'pending' : 'completed' }))) return;
    showFeedback(
      target.status === 'completed'
        ? 'Compromisso reaberto como pendente.'
        : 'Compromisso marcado como concluído.'
    );
  };

  const handleDeleteEvent = async (id: string) => {
    const target = events.find(event => event.id === id);
    if (!target || !await mutate(() => deletePersistedAgendaEvent(target))) return;
    setConfirmDeleteId(null);
    if (editingId === id) {
      closeForm();
    }
    if (expandedEventId === id) {
      setExpandedEventId(null);
    }
    showFeedback('Compromisso removido da agenda.');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agenda Administrativa"
      subtitle="Compromissos da operação · horário de Brasília"
      maxWidthClass="max-w-4xl"
      titleId="agenda-modal-title"
      bodyClassName="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden py-3.5 sm:py-4 pr-0.5 flex flex-col"
      footer={
        <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <HardDrive
            size={13}
            aria-hidden="true"
            className="text-slate-500 dark:text-slate-400 shrink-0"
          />
          <span className="leading-snug">
            Compromissos salvos no servidor e sincronizados a cada 15 segundos.
          </span>
        </div>
      }
    >
      {loading && <p role="status">Carregando agenda…</p>}
      {requestError && <div role="alert">{requestError} <button type="button" onClick={retry}>Atualizar agenda</button></div>}
      {legacyEvents.length > 0 && <button type="button" onClick={importLocalEvents} disabled={loading}
        className="text-sm underline my-2">Importar {legacyEvents.length} compromissos deste navegador</button>}
      <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)] gap-4 lg:gap-5 items-stretch lg:flex-1 lg:min-h-0">
        {/* LEFT COLUMN: Monthly Calendar */}
        <div className="lg:col-span-5 flex flex-col justify-start shrink-0">
          <div className="rounded-2xl p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-white/85 dark:border-white/14">
            {/* Month Controls */}
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <button
                type="button"
                onClick={() => setViewMonth((v) => addMonthsToView(v.year, v.month, -1))}
                aria-label="Mês anterior"
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <span className="font-['Barlow_Condensed'] text-base font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                {formatMonthYearTitle(viewMonth.year, viewMonth.month)}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((v) => addMonthsToView(v.year, v.month, 1))}
                aria-label="Próximo mês"
                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 mb-1 text-center">
              {WEEKDAY_HEADERS.map((wd, idx) => (
                <span
                  key={idx}
                  title={wd.label}
                  aria-label={wd.label}
                  className="text-[11px] font-['Barlow_Condensed'] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 py-1"
                >
                  {wd.short}
                </span>
              ))}
            </div>

            {/* Monthly Grid (42 fixed cells) */}
            <div
              role="group"
              aria-label="Calendário mensal da agenda"
              className="grid grid-cols-7 gap-1"
            >
              {gridCells.map((cell) => {
                const isoKey = toIsoCalendarKey(cell.date);
                const isToday = isSameCalendarDate(cell.date, today);
                const isSelected = isSameCalendarDate(cell.date, selectedDate);
                const dayStats = eventsCountByDate.get(isoKey);
                const hasEvents = (dayStats?.total ?? 0) > 0;

                return (
                  <button
                    key={isoKey}
                    ref={(el) => {
                      dayButtonRefs.current[isoKey] = el;
                    }}
                    type="button"
                    onClick={() => handleSelectCalendarDay(cell.date)}
                    onKeyDown={(e) => handleDayKeyDown(e, cell.date)}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    aria-label={`${formatFullOperationalDate(cell.date)}${
                      isToday ? ' (Hoje)' : ''
                    }${
                      hasEvents
                        ? ` — ${dayStats!.total} ${
                            dayStats!.total === 1 ? 'compromisso' : 'compromissos'
                          }`
                        : ''
                    }`}
                    className={`h-9 rounded-xl text-xs font-medium tabular-nums flex flex-col items-center justify-center relative transition-colors cursor-pointer ${
                      isSelected && isToday
                        ? 'bg-blue-700 text-white font-bold ring-2 ring-[#E85D4A]/35 dark:ring-[#ff9c8e]/45 ring-offset-1 ring-offset-white dark:ring-offset-slate-900'
                        : isSelected
                          ? 'bg-blue-700 text-white font-bold'
                          : isToday
                            ? 'bg-[#E85D4A]/12 dark:bg-[#E85D4A]/20 text-[#BF3E2C] dark:text-[#ffb4a8] font-bold ring-1 ring-[#E85D4A]/60 dark:ring-[#E85D4A]/70'
                            : cell.inCurrentMonth
                              ? 'text-slate-800 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                              : 'owner-muted hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>{cell.date.day}</span>
                    {hasEvents && (
                      <span
                        aria-hidden="true"
                        className={`w-1.5 h-1.5 rounded-full absolute bottom-1 ${
                          isSelected
                            ? 'bg-white'
                            : dayStats!.pending > 0
                              ? 'bg-[#2864F0] dark:bg-sky-400'
                              : 'bg-emerald-500 dark:bg-emerald-400'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer Actions & Legend */}
            <div className="mt-3 pt-2.5 border-t border-slate-900/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <button
                type="button"
                onClick={handleGoToToday}
                className="owner-button"
              >
                <RotateCcw size={12} aria-hidden="true" />
                <span>Ir para hoje</span>
              </button>

              <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2864F0] dark:bg-sky-400" />
                  <span>Pendente</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                  <span>Concluído</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Day Schedule + Adaptive Form */}
        <div className="lg:col-span-7 flex flex-col min-h-0 gap-3">
          {/* Selected Day Header */}
          <div className="rounded-2xl p-3.5 sm:p-4 bg-white dark:bg-slate-900 border border-white/85 dark:border-white/14 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <CalendarDays
                  size={15}
                  aria-hidden="true"
                  className="text-[#E85D4A] shrink-0"
                />
                <span className="text-[11px] font-['Barlow_Condensed'] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300">
                  Programação do dia
                </span>
                {isViewingToday && (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#E85D4A]/14 dark:bg-[#E85D4A]/22 text-[#BF3E2C] dark:text-[#ffb4a8] text-[10px] font-['Barlow_Condensed'] font-bold uppercase tracking-wider">
                    Hoje
                  </span>
                )}
              </div>
              <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white mt-0.5">
                {formatFullOperationalDate(selectedDate)}
              </h4>
            </div>

            {!isFormOpen && (
              <button
                type="button"
                onClick={openNewForm}
                disabled={mutating || loading}
                className="owner-button owner-primary shrink-0"
              >
                <Plus size={14} aria-hidden="true" />
                <span>Novo compromisso</span>
              </button>
            )}
          </div>

          {/* Operation Status Feedback Banner */}
          {feedbackMessage && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-xl px-3.5 py-2 bg-emerald-500/14 dark:bg-emerald-500/18 border border-emerald-500/30 text-emerald-900 dark:text-emerald-200 text-xs flex items-center justify-between gap-2 shrink-0"
            >
              <span className="flex items-center gap-2 font-medium">
                <Check size={14} aria-hidden="true" className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>{feedbackMessage}</span>
              </span>
              <button
                type="button"
                onClick={() => setFeedbackMessage(null)}
                aria-label="Dispensar aviso"
                className="p-0.5 rounded hover:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Create / Edit Event Form with Independent Scroll & Always-Accessible Sticky Footer */}
          {isFormOpen ? (
            <AgendaEventForm
              draft={{ title, category, date: eventDate, startTime, endTime, description, notes }}
              errors={formErrors} editingId={editingId} mutating={mutating} titleInputRef={titleInputRef}
              onChange={(field, value) => {
                const setters = { title: setTitle, category: (value: string) => setCategory(value as AgendaCategory),
                  date: setEventDate, startTime: setStartTime, endTime: setEndTime,
                  description: setDescription, notes: setNotes };
                setters[field](value);
              }}
              onErrorsChange={setFormErrors} onSubmit={handleSubmitForm} onClose={closeForm}
            />
          ) : selectedDayEvents.length === 0 ? (loading || requestError ? null :
            /* Balanced Adaptive Empty State (No Excessive Blank Space) */
            <div className="flex-1 flex flex-col items-center justify-center rounded-2xl p-5 sm:p-6 bg-white dark:bg-slate-900 border border-dashed border-slate-900/15 dark:border-white/15 text-center space-y-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#E85D4A]/10 dark:bg-[#E85D4A]/18 border border-[#E85D4A]/20 flex items-center justify-center text-blue-700 dark:text-blue-300">
                <CalendarDays size={18} aria-hidden="true" />
              </div>
              <div className="space-y-1 max-w-xs">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Nenhum compromisso para esta data.
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Crie compromissos para organizar a operação da loja.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewForm}
                disabled={mutating || loading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[#E85D4A]/14 dark:hover:bg-[#E85D4A]/22 border border-slate-900/10 dark:border-white/12 text-xs font-['Barlow_Condensed'] font-bold uppercase tracking-wider text-slate-800 dark:text-white transition-colors cursor-pointer"
              >
                <Plus size={13} aria-hidden="true" className="text-[#E85D4A]" />
                <span>Agendar compromisso</span>
              </button>
            </div>
          ) : (
            /* Scrollable Selected Day Events List */
            <div className="flex-1 min-h-0 lg:overflow-y-auto scrollbar-thin space-y-2.5 pr-1">
              {selectedDayEvents.map((ev) => {
                const isCompleted = ev.status === 'completed';
                const isExpanded = expandedEventId === ev.id;
                const isConfirmingDelete = confirmDeleteId === ev.id;

                return (
                  <div
                    key={ev.id}
                    className={`rounded-2xl p-3.5 bg-white dark:bg-slate-900 border transition-colors ${
                      isCompleted
                        ? 'border-emerald-700 dark:border-emerald-400'
                        : 'border-slate-900/10 dark:border-white/15'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => handleToggleComplete(ev.id)}
                          aria-label={
                            isCompleted
                              ? `Reabrir compromisso ${ev.title}`
                              : `Marcar compromisso ${ev.title} como concluído`
                          }
                          aria-pressed={isCompleted}
                          className="mt-0.5 text-slate-400 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded-full shrink-0 cursor-pointer"
                        >
                          {isCompleted ? (
                            <CheckCircle2
                              size={18}
                              className="text-emerald-600 dark:text-emerald-400"
                            />
                          ) : (
                            <Circle size={18} />
                          )}
                        </button>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                              <Clock
                                size={11}
                                aria-hidden="true"
                                className="text-[#E85D4A]"
                              />
                              {ev.startTime} – {ev.endTime}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-md border text-[10px] font-['Barlow_Condensed'] font-bold uppercase tracking-wider ${CATEGORY_BADGE_CLASSES[ev.category]}`}
                            >
                              {ev.category}
                            </span>
                            <span
                              className={`text-[10px] font-['Barlow_Condensed'] font-bold uppercase tracking-wider ${
                                isCompleted
                                  ? 'text-emerald-700 dark:text-emerald-300'
                                  : 'text-sky-700 dark:text-sky-300'
                              }`}
                            >
                              {isCompleted ? 'Concluído' : 'Pendente'}
                            </span>
                          </div>

                          <h5
                            className={`text-sm font-semibold leading-snug break-words ${
                              isCompleted
                                ? 'line-through text-slate-500 dark:text-slate-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {ev.title}
                          </h5>

                          {ev.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed break-words">
                              {ev.description}
                            </p>
                          )}

                          {ev.notes && (
                            <div className="mt-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedEventId((prev) =>
                                    prev === ev.id ? null : ev.id
                                  )
                                }
                                aria-expanded={isExpanded}
                                className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 hover:underline focus-visible:underline cursor-pointer"
                              >
                                {isExpanded ? 'Ocultar observações' : 'Ver observações'}
                              </button>
                              {isExpanded && (
                                <p className="mt-1 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                                  {ev.notes}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Event Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {isConfirmingDelete ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(ev.id)}
                              className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-bold uppercase hover:bg-rose-700 transition-colors cursor-pointer"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 rounded-lg text-[10px] font-semibold text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditForm(ev)}
                              aria-label={`Editar compromisso ${ev.title}`}
                              title="Editar"
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                            >
                              <Pencil size={14} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(ev.id)}
                              aria-label={`Excluir compromisso ${ev.title}`}
                              title="Excluir"
                              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};
