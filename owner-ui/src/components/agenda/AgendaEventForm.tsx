import type { Dispatch, FormEvent, Ref, SetStateAction } from 'react';
import { AlertCircle } from 'lucide-react';
import { AGENDA_CATEGORIES, type AgendaCategory, type AgendaEventDraft, type AgendaValidationErrors } from '../../services/agendaService';

interface AgendaEventFormProps {
  draft: AgendaEventDraft;
  errors: AgendaValidationErrors;
  editingId: string | null;
  mutating: boolean;
  titleInputRef: Ref<HTMLInputElement>;
  onChange: (field: keyof AgendaEventDraft, value: string) => void;
  onErrorsChange: Dispatch<SetStateAction<AgendaValidationErrors>>;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}

/** Controlled event editor. API synchronization and calendar navigation stay outside this view. */
export function AgendaEventForm({ draft, errors: formErrors, editingId, mutating, titleInputRef,
  onChange, onErrorsChange: setFormErrors, onSubmit: handleSubmitForm, onClose: closeForm }: AgendaEventFormProps) {
  const { title, category, date: eventDate, startTime, endTime, description, notes } = draft;
  const setTitle = (value: string) => onChange('title', value);
  const setCategory = (value: AgendaCategory) => onChange('category', value);
  const setEventDate = (value: string) => onChange('date', value);
  const setStartTime = (value: string) => onChange('startTime', value);
  const setEndTime = (value: string) => onChange('endTime', value);
  const setDescription = (value: string) => onChange('description', value);
  const setNotes = (value: string) => onChange('notes', value);
  return (
            <form
              noValidate
              aria-busy={mutating}
              onSubmit={handleSubmitForm}
              className="flex-1 min-h-0 flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-900/12 dark:border-white/16"
            >
              {/* Form Header */}
              <div className="px-4 pt-3.5 pb-2.5 border-b border-slate-900/10 dark:border-white/10 flex items-center justify-between shrink-0">
                <h5 className="font-['Barlow_Condensed'] text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                  {editingId ? 'Editar compromisso' : 'Novo compromisso'}
                </h5>
                <span className="text-[11px] font-['Barlow_Condensed'] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  * Obrigatório
                </span>
              </div>

              {/* Scrollable Form Fields Area */}
              <div className="flex-1 min-h-0 lg:overflow-y-auto scrollbar-thin px-4 pt-3 pb-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="agenda-title"
                      className="block text-[11px] font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1"
                    >
                      Título *
                    </label>
                    <input
                      ref={titleInputRef}
                      id="agenda-title"
                      type="text"
                      placeholder="Ex.: Conferência de estoque semanal"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        if (formErrors.title) {
                          setFormErrors((prev) => ({ ...prev, title: undefined }));
                        }
                      }}
                      aria-invalid={formErrors.title ? 'true' : 'false'}
                      aria-describedby={formErrors.title ? 'agenda-title-error' : undefined}
                      className="w-full owner-input rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                    {formErrors.title && (
                      <p
                        id="agenda-title-error"
                        role="alert"
                        className="mt-1 flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-300"
                      >
                        <AlertCircle size={12} aria-hidden="true" />
                        <span>{formErrors.title}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="agenda-date"
                      className="block text-[11px] font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1"
                    >
                      Data *
                    </label>
                    <input
                      id="agenda-date"
                      type="date"
                      value={eventDate}
                      onChange={(e) => {
                        setEventDate(e.target.value);
                        if (formErrors.date) {
                          setFormErrors((prev) => ({ ...prev, date: undefined }));
                        }
                      }}
                      aria-invalid={formErrors.date ? 'true' : 'false'}
                      aria-describedby={formErrors.date ? 'agenda-date-error' : undefined}
                      className="w-full owner-input rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums"
                    />
                    {formErrors.date && (
                      <p
                        id="agenda-date-error"
                        role="alert"
                        className="mt-1 flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-300"
                      >
                        <AlertCircle size={12} aria-hidden="true" />
                        <span>{formErrors.date}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="agenda-category"
                      className="block text-[11px] font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1"
                    >
                      Categoria
                    </label>
                    <select
                      id="agenda-category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as AgendaCategory)}
                      className="w-full owner-input rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
                    >
                      {AGENDA_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="agenda-start"
                      className="block text-[11px] font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1"
                    >
                      Início (24h) *
                    </label>
                    <input
                      id="agenda-start"
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        if (formErrors.startTime || formErrors.endTime) {
                          setFormErrors((prev) => ({
                            ...prev,
                            startTime: undefined,
                            endTime: undefined,
                          }));
                        }
                      }}
                      aria-invalid={formErrors.startTime ? 'true' : 'false'}
                      aria-describedby={formErrors.startTime ? 'agenda-start-error' : undefined}
                      className="w-full owner-input rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums"
                    />
                    {formErrors.startTime && (
                      <p
                        id="agenda-start-error"
                        role="alert"
                        className="mt-1 flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-300"
                      >
                        <AlertCircle size={12} aria-hidden="true" />
                        <span>{formErrors.startTime}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="agenda-end"
                      className="block text-[11px] font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1"
                    >
                      Término (24h) *
                    </label>
                    <input
                      id="agenda-end"
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        if (formErrors.endTime) {
                          setFormErrors((prev) => ({ ...prev, endTime: undefined }));
                        }
                      }}
                      aria-invalid={formErrors.endTime ? 'true' : 'false'}
                      aria-describedby={formErrors.endTime ? 'agenda-end-error' : undefined}
                      className="w-full owner-input rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white tabular-nums"
                    />
                    {formErrors.endTime && (
                      <p
                        id="agenda-end-error"
                        role="alert"
                        className="mt-1 flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-300"
                      >
                        <AlertCircle size={12} aria-hidden="true" />
                        <span>{formErrors.endTime}</span>
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="agenda-desc"
                      className="block text-[11px] font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1"
                    >
                      Descrição (opcional)
                    </label>
                    <input
                      id="agenda-desc"
                      type="text"
                      placeholder="Resumo curto do compromisso"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full owner-input rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="agenda-notes"
                      className="block text-[11px] font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1"
                    >
                      Observações (opcional)
                    </label>
                    <textarea
                      id="agenda-notes"
                      rows={2}
                      placeholder="Anotações operacionais internas"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full owner-input rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Pinned / Sticky Internal Action Footer (Always Reachable) */}
              <div className="shrink-0 sticky bottom-0 z-10 px-4 py-3 border-t border-slate-900/10 dark:border-white/12 bg-white dark:bg-slate-900 rounded-b-2xl flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={mutating}
                  className="px-4 py-2 rounded-xl owner-button owner-primary text-xs font-['Barlow_Condensed'] font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  {editingId ? 'Salvar alterações' : 'Salvar compromisso'}
                </button>
              </div>
            </form>
  );
}
