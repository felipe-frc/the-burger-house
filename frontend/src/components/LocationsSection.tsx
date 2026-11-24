import React from 'react';
import LocationMap from './DeferredLocationMap';
import { ArrowUpRight, Phone } from 'lucide-react';
import { DEMO_LOCATION } from '../utils/demoLocation';
import './LocationsSection.css';

interface LocationsSectionProps {
  currentLang?: string;
  onSelectLocationForOrder: (locationName: string) => void;
}

const location = DEMO_LOCATION;

// Reuse the WhatsApp brand vector already present in the project's original section.
function WhatsAppIcon() {
  return <svg className="tbh-locations-whatsapp-icon" viewBox="0 0 24 24" role="img" aria-label="WhatsApp">
    <path fill="currentColor" d="M20.52 3.48A11.87 11.87 0 0 0 12.04 0C5.46 0 .1 5.36.09 11.95c0 2.1.55 4.15 1.59 5.95L0 24l6.25-1.64a11.94 11.94 0 0 0 5.79 1.48h.01C18.63 23.84 24 18.48 24 11.9c0-3.18-1.24-6.18-3.48-8.42ZM12.05 21.8a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.71.97.99-3.62-.23-.37a9.88 9.88 0 0 1-1.52-5.25c0-5.47 4.45-9.92 9.92-9.92a9.86 9.86 0 0 1 7.02 2.91 9.86 9.86 0 0 1 2.9 7.02c0 5.47-4.45 9.92-9.96 9.92Zm5.45-7.43c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.68-2.08-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.21 5.08 4.5.71.3 1.26.48 1.69.61.71.22 1.35.19 1.86.12.57-.08 1.77-.72 2.02-1.41.25-.7.25-1.3.18-1.42-.07-.13-.27-.2-.57-.35Z" />
  </svg>;
}

function isWithinIllustrativeHours(): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const hour = Number(parts.find(p => p.type === 'hour')?.value);
  const minute = Number(parts.find(p => p.type === 'minute')?.value);

  return Number.isFinite(hour) &&
    Number.isFinite(minute) &&
    hour * 60 + minute >= 1080 &&
    hour * 60 + minute < 1380;
}
export const LocationsSection: React.FC<LocationsSectionProps> = ({ onSelectLocationForOrder, currentLang = 'PT' }) => {
  const english = currentLang === 'EN';
  const [withinHours, setWithinHours] =
    React.useState(isWithinIllustrativeHours);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setWithinHours(isWithinIllustrativeHours());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);
  return (
  <section id="locations" className="tbh-locations" aria-labelledby="tbh-locations-heading">
    <header className="tbh-container tbh-locations-heading">
      <h2 id="tbh-locations-heading" className="tbh-section-title">{english ? 'WHERE TO FIND US' : 'ONDE NOS ENCONTRAR'}</h2>
    </header>
    <article className="tbh-container tbh-locations-unit" aria-labelledby="tbh-locations-city">
      <div className="tbh-locations-map-frame"><LocationMap currentLang={currentLang} /></div>
      <div className="tbh-locations-info tbh-loc-approved-layout">
        <div className="tbh-loc-layout-top">
          <div className="tbh-loc-layout-identity">
            <span className="tbh-loc-layout-kicker">
              THE BURGER HOUSE · {english ? 'CONCEPT LOCATION' : 'UNIDADE CONCEITUAL'}
            </span>

            <div className="tbh-loc-layout-city-row">
              <h3 id="tbh-locations-city">{location.city}</h3>
              <span className="tbh-loc-layout-state" aria-label="Santa Catarina">SC</span>
            </div>
          </div>

          <div
            className="tbh-loc-layout-hours"
            aria-label={english
              ? 'Hours: every day from 6 PM to 11 PM'
              : 'Horário: todos os dias das 18 às 23 horas'}
          >
            <span className="tbh-loc-layout-status">
              <span
                className={withinHours
                  ? 'tbh-loc-layout-status-dot is-active'
                  : 'tbh-loc-layout-status-dot'}
                aria-hidden="true"
              />
              {withinHours
                ? (english ? 'WITHIN DEMO HOURS' : 'NO HORÁRIO PREVISTO')
                : (english ? 'OUTSIDE DEMO HOURS' : 'FORA DO HORÁRIO')}
            </span>

            <span className="tbh-loc-layout-hours-label">
              {english ? 'EVERY DAY' : 'TODOS OS DIAS'}
            </span>
            <strong>{location.hours}</strong>
          </div>
        </div>

        <div className="tbh-loc-layout-divider" />

        <div className="tbh-loc-layout-bottom">
          <div className="tbh-loc-layout-main">
            <div className="tbh-loc-layout-contacts">
              <div className="tbh-loc-layout-contact">
                <WhatsAppIcon />
                <div>
                  <span>WHATSAPP</span>
                  <strong>{location.phone}</strong>
                </div>
              </div>

              <div className="tbh-loc-layout-contact">
                <Phone aria-hidden="true" />
                <div>
                  <span>{english ? 'PHONE' : 'TELEFONE'}</span>
                  <strong>{location.phone}</strong>
                </div>
              </div>
            </div>

            <div className="tbh-loc-layout-actions">
              <button
                type="button"
                className="tbh-loc-layout-primary"
                onClick={event => {
                  event.currentTarget.focus({ preventScroll: true });
                  onSelectLocationForOrder(location.city);
                }}
              >
                <span>{english ? 'ORDER FOR PICKUP' : 'PEDIR PARA RETIRAR'}</span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </button>

              <a
                className="tbh-loc-layout-secondary"
                href={location.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={english
                  ? 'Show the illustrative city in maps'
                  : 'Ver a cidade ilustrativa no mapa'}
              >
                <span>{english ? 'DIRECTIONS' : 'COMO CHEGAR'}</span>
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className="tbh-loc-layout-mascot" aria-hidden="true">
            <img
              src="/assets/mascotes/mascote-localizacao-transparente.png"
              alt=""
              width={240}
              height={240}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </div>    </article>
  </section>
);
};
