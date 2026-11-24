import { useEffect, useRef, useState } from 'react';
import { denied, saveConsent, type Choices } from './consent';
import { useConsent } from './useConsent';
import './privacy.css';

export const OPEN_PRIVACY = 'burger-house-open-privacy';
export function openPrivacyPreferences() { window.dispatchEvent(new Event(OPEN_PRIVACY)); }

export function PrivacyPreferences({ english, suspended }: { english: boolean; suspended: boolean }) {
  const consent = useConsent();
  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [choices, setChoices] = useState<Choices>(denied);
  const heading = useRef<HTMLHeadingElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const show = () => {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setChoices(consent ?? denied); setCustomizing(true); setOpen(true);
    };
    window.addEventListener(OPEN_PRIVACY, show);
    return () => window.removeEventListener(OPEN_PRIVACY, show);
  }, [consent?.maps, consent?.analytics]);
  useEffect(() => { if (open && !suspended) heading.current?.focus({ preventScroll: true }); }, [open, suspended]);
  const finish = (next: Choices) => {
    saveConsent(next); setOpen(false); setCustomizing(false);
    if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
  };
  if (suspended || (!open && consent)) return null;
  return <section className="tbh-privacy-preferences" aria-labelledby="privacy-heading">
    <h2 id="privacy-heading" tabIndex={-1} ref={heading}>{english ? 'Your privacy choices' : 'Suas escolhas de privacidade'}</h2>
    <p>{english ? 'Essential storage keeps your basket, payment recovery and security working. Optional services start off. You can change your choices in the footer.' : 'O armazenamento essencial mantém a sacola, a retomada de pagamento e a segurança. Serviços opcionais começam desativados. Altere sua escolha no rodapé.'} <a href="/privacy.html">{english ? 'Privacy notice (Portuguese)' : 'Aviso de privacidade'}</a></p>
    {customizing && <fieldset>
      <legend>{english ? 'Choose optional services' : 'Escolha os serviços opcionais'}</legend>
      <label><input type="checkbox" checked disabled />{english ? 'Essential storage (always active)' : 'Armazenamento essencial (sempre ativo)'}</label>
      <label><input type="checkbox" checked={choices.maps} onChange={event => setChoices(value => ({ ...value, maps: event.target.checked }))} />{english ? 'External map — MapTiler receives connection data' : 'Mapa externo — MapTiler recebe dados da conexão'}</label>
      <label><input type="checkbox" checked={choices.analytics} onChange={event => setChoices(value => ({ ...value, analytics: event.target.checked }))} />{english ? 'Audience analytics — only if configured; no advertising' : 'Análise de audiência — somente se configurada; sem publicidade'}</label>
      <p>{english ? 'No marketing trackers are installed. Choices expire after 180 days. Revoking does not delete your orders.' : 'Não há rastreadores de marketing instalados. Escolhas expiram em 180 dias. Revogar não exclui seus pedidos.'}</p>
    </fieldset>}
    <div className="tbh-privacy-actions">
      <button type="button" onClick={() => finish(denied)}>{english ? 'Reject optional' : 'Rejeitar opcionais'}</button>
      <button type="button" onClick={() => finish({ maps: true, analytics: true })}>{english ? 'Accept optional' : 'Aceitar opcionais'}</button>
      {customizing ? <button type="button" onClick={() => finish(choices)}>{english ? 'Save choices' : 'Salvar escolhas'}</button> : <button type="button" onClick={() => { setChoices(denied); setCustomizing(true); }}>{english ? 'Customize' : 'Personalizar'}</button>}
    </div>
  </section>;
}
