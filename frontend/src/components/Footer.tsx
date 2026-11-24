import React from 'react';
import { ArrowUpRight, Award, Clock, MapPin, Phone } from 'lucide-react';
import { scrollToLandingSection } from '../utils/landingNavigation';
import { DEMO_LOCATION } from '../utils/demoLocation';
import { openPrivacyPreferences } from '../privacy/PrivacyPreferences';
import { publicWhatsAppNumber } from '../privacy/publicContact';
import './Footer.css';

interface FooterProps {
  onOpenOrder: () => void;
  onOpenLoyalty: () => void;
  currentLang: string;
  onSelectLang?: (lang: string) => void;
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={18} height={18}>
      <path
        fill="currentColor"
        d="M7.75 2h8.5A5.75 5.75 0 0 1 22 7.75v8.5A5.75 5.75 0 0 1 16.25 22h-8.5A5.75 5.75 0 0 1 2 16.25v-8.5A5.75 5.75 0 0 1 7.75 2Zm0 1.8A3.95 3.95 0 0 0 3.8 7.75v8.5a3.95 3.95 0 0 0 3.95 3.95h8.5a3.95 3.95 0 0 0 3.95-3.95v-8.5a3.95 3.95 0 0 0-3.95-3.95h-8.5Zm9.1 1.45a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Z"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={18} height={18}>
      <path
        fill="currentColor"
        d="M20.52 3.48A11.87 11.87 0 0 0 12.04 0C5.46 0 .1 5.36.09 11.95c0 2.1.55 4.15 1.59 5.95L0 24l6.25-1.64a11.94 11.94 0 0 0 5.79 1.48h.01C18.63 23.84 24 18.48 24 11.9c0-3.18-1.24-6.18-3.48-8.42ZM12.05 21.8a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.71.97.99-3.62-.23-.37a9.88 9.88 0 0 1-1.52-5.25c0-5.47 4.45-9.92 9.92-9.92a9.86 9.86 0 0 1 7.02 2.91 9.86 9.86 0 0 1 2.9 7.02c0 5.47-4.45 9.92-9.96 9.92Zm5.45-7.43c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-1.27-.47-2.42-1.5-.9-.8-1.5-1.78-1.68-2.08-.17-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.47 1.07 2.88 1.22 3.08.15.2 2.1 3.21 5.08 4.5.71.3 1.26.48 1.69.61.71.22 1.35.19 1.86.12.57-.08 1.77-.72 2.02-1.41.25-.7.25-1.3.18-1.42-.07-.13-.27-.2-.57-.35Z"
      />
    </svg>
  );
}

function TikTokIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width={18} height={18}>
      <path
        fill="currentColor"
        d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1Z"
      />
    </svg>
  );
}

export const Footer: React.FC<FooterProps> = ({ onOpenOrder, onOpenLoyalty, currentLang }) => {
  const english = currentLang === 'EN';
  const configuredWhatsApp = publicWhatsAppNumber();

  const marqueeItems = english
    ? ['Made fresh to order', '✦', 'Selected ingredients', '✦', 'Real flavor', '✦']
    : ['Feito na hora', '✦', 'Ingredientes selecionados', '✦', 'Sabor de verdade', '✦'];

  const sectionLinks = [
    { id: 'about', label: english ? 'About us' : 'Sobre nós' },
    { id: 'menu', label: english ? 'Menu' : 'Cardápio' },
    { id: 'locations', label: english ? 'Locations' : 'Unidades' },
  ];

  const renderMarqueeGroup = (copyIndex: number) => (
    <div key={copyIndex} className="tbh-footer-marquee-group">
      {[0, 1, 2].map(repeatIndex => (
        <div key={repeatIndex} className="tbh-footer-marquee-segment">
          {marqueeItems.map((text, itemIndex) => (
            <span
              key={itemIndex}
              className={
                text === '✦' ? 'tbh-footer-marquee-sparkle' : 'tbh-footer-marquee-text'
              }
            >
              {text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <footer className="tbh-footer" aria-label={english ? 'Site footer' : 'Rodapé do site'}>
      <div className="tbh-footer-marquee" aria-hidden="true">
        <div className="tbh-footer-marquee-track">
          {renderMarqueeGroup(0)}
          {renderMarqueeGroup(1)}
        </div>
      </div>

      <div className="tbh-footer-upper">
        <div className="tbh-container">
          <div className="tbh-footer-main">
            {/* Coluna 1 — Marca */}
            <div className="tbh-footer-col tbh-footer-brand">
              <div className="tbh-footer-brand-copy">
                <img
                  className="tbh-footer-logo"
                  src="/assets/branding/the-burger-house-logo-440.webp"
                  alt="The Burger House"
                  width={440}
                  height={440}
                  loading="lazy"
                  decoding="async"
                />
                <p className="tbh-footer-tagline">GOOD FOOD. GOOD TIMES.</p>
                <p className="tbh-footer-motto">
                  {english
                    ? 'Crafted burgers taste different.'
                    : 'O artesanal tem outro sabor.'}
                </p>
              </div>

              <div
                className="tbh-footer-socials"
                aria-label={english ? 'Social channels' : 'Redes sociais'}
              >
                <a
                  className="tbh-footer-social-link"
                  href="https://www.instagram.com/theburgerhouse"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={
                    english
                      ? 'The Burger House on Instagram (opens in new tab)'
                      : 'Instagram da The Burger House (abre em nova aba)'
                  }
                >
                  <InstagramIcon />
                </a>
                {configuredWhatsApp ? (
                  <a
                    className="tbh-footer-social-link"
                    href={`https://wa.me/${configuredWhatsApp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={
                      english
                        ? 'Chat on WhatsApp (opens in new tab)'
                        : 'Falar pelo WhatsApp (abre em nova aba)'
                    }
                  >
                    <WhatsAppIcon />
                  </a>
                ) : (
                  <a
                    className="tbh-footer-social-link"
                    href="#locations"
                    onClick={event => {
                      event.preventDefault();
                      scrollToLandingSection('locations', true);
                    }}
                    aria-label={
                      english
                        ? 'WhatsApp info in Locations section'
                        : 'Contato WhatsApp na seção Unidades'
                    }
                  >
                    <WhatsAppIcon />
                  </a>
                )}
                <a
                  className="tbh-footer-social-link"
                  href="https://www.tiktok.com/@theburgerhouse"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={
                    english
                      ? 'The Burger House on TikTok (opens in new tab)'
                      : 'TikTok da The Burger House (abre em nova aba)'
                  }
                >
                  <TikTokIcon />
                </a>
              </div>
            </div>

            {/* Coluna 2 — Navegue */}
            <nav
              className="tbh-footer-col tbh-footer-nav-col"
              aria-label={english ? 'Footer navigation' : 'Navegação do rodapé'}
            >
              <h2 className="tbh-footer-heading">{english ? 'EXPLORE' : 'NAVEGUE'}</h2>
              <ul className="tbh-footer-navigation">
                {sectionLinks.map(link => (
                  <li key={link.id}>
                    <a
                      href={`#${link.id}`}
                      onClick={event => {
                        event.preventDefault();
                        scrollToLandingSection(link.id, true);
                      }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    href="#fidelidade"
                    onClick={event => {
                      event.preventDefault();
                      event.currentTarget.focus({ preventScroll: true });
                      onOpenLoyalty();
                    }}
                  >
                    {english ? 'Loyalty Program' : 'Programa de Fidelidade'}
                  </a>
                </li>
              </ul>
            </nav>

            {/* Coluna 3 — Visite */}
            <div className="tbh-footer-col tbh-footer-unit">
              <h2 className="tbh-footer-heading">{english ? 'VISIT US' : 'VISITE'}</h2>
              <div className="tbh-footer-unit-card">
                <div className="tbh-footer-unit-details">
                  <p className="tbh-footer-unit-line tbh-footer-unit-address">
                    <MapPin size={16} aria-hidden="true" />
                    <span>
                      <strong>{DEMO_LOCATION.addressLine}</strong>
                      <span>{`${DEMO_LOCATION.cityTitle} — ${DEMO_LOCATION.stateCode}`}</span>
                    </span>
                  </p>
                  <p className="tbh-footer-unit-line tbh-footer-unit-hours">
                    <Clock size={16} aria-hidden="true" />
                    <span>
                      {english
                        ? `Every day · ${DEMO_LOCATION.hoursEn}`
                        : `Todos os dias · ${DEMO_LOCATION.hours.toLowerCase()}`}
                    </span>
                  </p>
                  <p className="tbh-footer-unit-line tbh-footer-unit-phone">
                    <Phone size={16} aria-hidden="true" />
                    <span>{DEMO_LOCATION.phone}</span>
                  </p>
                </div>
                <a
                  className="tbh-footer-directions"
                  href={DEMO_LOCATION.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={
                    english
                      ? 'Show the illustrative city in maps'
                      : 'Ver a cidade ilustrativa no mapa'
                  }
                >
                  <span>{english ? 'GET DIRECTIONS' : 'COMO CHEGAR'}</span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </div>
            </div>

            {/* Coluna 4 — Peça agora */}
            <div className="tbh-footer-col tbh-footer-actions">
              <div className="tbh-footer-cta-head">
                <div className="tbh-footer-cta-copy-block">
                  <h2 className="tbh-footer-heading">{english ? 'ORDER NOW' : 'PEÇA AGORA'}</h2>
                  <p className="tbh-footer-actions-copy">
                    {english
                      ? 'Build your handcrafted smash burger order and track every step.'
                      : 'Monte seu smash artesanal agora e acompanhe cada etapa do pedido.'}
                  </p>
                </div>
                <img
                  className="tbh-footer-mascot"
                  src="/assets/mascots/mascot-sunglasses-512.webp"
                  alt=""
                  aria-hidden="true"
                  width={512}
                  height={493}
                  loading="lazy"
                  decoding="async"
                />
              </div>

              <div className="tbh-footer-cta-group">
                <button
                  type="button"
                  className="tbh-button tbh-footer-order"
                  onClick={event => {
                    event.currentTarget.focus({ preventScroll: true });
                    onOpenOrder();
                  }}
                >
                  <span>{english ? 'ORDER NOW' : 'PEDIR AGORA'}</span>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="tbh-footer-loyalty"
                  onClick={event => {
                    event.currentTarget.focus({ preventScroll: true });
                    onOpenLoyalty();
                  }}
                >
                  <Award size={16} aria-hidden="true" />
                  <span>{english ? 'LOYALTY PROGRAM' : 'PROGRAMA DE FIDELIDADE'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="tbh-footer-bottom">
        <div className="tbh-container tbh-footer-bottom-inner">
          <p className="tbh-footer-demo-note">
            {english
              ? 'DEMO PROJECT · Concept location, address, hours and contacts are fictional. No real service; directions point only to the city.'
              : 'PROJETO DEMONSTRATIVO · Unidade conceitual com endereço, horário e contatos fictícios. Sem atendimento real; “Como chegar” mostra apenas a cidade.'}
          </p>

          <div className="tbh-footer-legal-row">
            <nav
              className="tbh-footer-legal-links"
              aria-label={english ? 'Legal and privacy links' : 'Links legais e de privacidade'}
            >
              <a href="/privacy.html" hrefLang="pt-BR">
                {english ? 'Privacy Policy' : 'Privacidade'}
              </a>
              <a href="/terms.html" hrefLang="pt-BR">
                {english ? 'Terms (Portuguese)' : 'Termos de uso'}
              </a>
              <a href="/rights.html" hrefLang="pt-BR">
                {english ? 'Your Data (Portuguese)' : 'Seus dados'}
              </a>
              <a href="/cancellation.html" hrefLang="pt-BR">
                {english ? 'Cancellations (Portuguese)' : 'Política de reembolso e cancelamento'}
              </a>
              <button type="button" onClick={openPrivacyPreferences}>
                {english ? 'Privacy Preferences' : 'Preferências de privacidade'}
              </button>
            </nav>

            <small className="tbh-footer-copyright">
              © 2026, THE BURGER HOUSE.{' '}
              {english ? 'ALL RIGHTS RESERVED.' : 'TODOS OS DIREITOS RESERVADOS.'}
            </small>
          </div>
        </div>
      </div>
    </footer>
  );
};
