import { useModalFocus } from '../utils/useModalFocus';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, UsersRound, X } from 'lucide-react';
import './RecruitmentSection.css';
import { publicWhatsAppNumber } from '../privacy/publicContact';

export const RecruitmentSection: React.FC<{ currentLang?: string }> = ({ currentLang = 'PT' }) => {
  const english = currentLang === 'EN';
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [area, setArea] = useState('Atendimento');
  const dialogRef = useModalFocus(isOpen, () => setIsOpen(false));

  const whatsappNumber = publicWhatsAppNumber();

  const handleInterest = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!whatsappNumber) return;

    const message = [
      english ? 'Hi! I am interested in joining The Burger House team.' : 'Olá! Tenho interesse em fazer parte da equipe The Burger House.',
      `${english ? 'Name' : 'Nome'}: ${name.trim()}`,
      `${english ? 'Area of interest' : 'Área de interesse'}: ${area}`,
      english ? 'How can I send my PDF résumé?' : 'Gostaria de saber como posso encaminhar meu currículo em PDF.',
    ].join('\n');

    window.open(
      `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  return (
    <section
      id="carreiras"
      aria-labelledby="careers-title"
      className="tbh-careers"
    >
      <div className="tbh-container tbh-careers-layout">
        <div className="tbh-careers-copy">
          <div className="tbh-careers-badge">
            <UsersRound aria-hidden="true" className="h-4 w-4 text-[#171717]" />
            <span>
              {english ? 'JOIN THE TEAM!' : 'VEM PRO TIME!'}
            </span>
          </div>

          <p className="tbh-careers-eyebrow">
            THE BURGER HOUSE · {english ? 'CAREERS' : 'CARREIRAS'}
          </p>

          <h2
            id="careers-title"
            className="tbh-section-title tbh-careers-title"
          >
            <span>{english ? 'JOIN OUR' : 'FAÇA PARTE DA'}</span><span>{english ? 'BURGER CREW!' : 'NOSSA CHAPA!'}</span>
          </h2>
          <p className="tbh-careers-description">
            {english ? 'Great food starts with great people. Create good moments with us and be part of our story.' : 'Boa comida se faz com gente boa. Venha construir bons momentos e fazer parte da nossa história.'}
          </p>

          <div className="tbh-careers-action"><button
            type="button"
            onClick={event => {
              event.currentTarget.focus({ preventScroll: true });
              setIsOpen(true);
            }}
            className="tbh-button tbh-button--primary tbh-careers-cta"
          >
            {english ? 'I WANT TO JOIN' : 'QUERO FAZER PARTE'}
            <ArrowUpRight aria-hidden="true" className="h-5 w-5" />
          </button></div>
        </div>

        <div className="tbh-careers-visual">
          <div className="tbh-careers-photo">
            <img src="/assets/photography/equipe-the-burger-house-cozinha-1100.webp" alt={english ? "The Burger House kitchen team wearing branded aprons, with the central chef in a light shirt" : "Equipe The Burger House na cozinha, com aventais da marca e chef central de camisa clara"} width={1448} height={1086} loading="lazy" decoding="async" />
            <div className="tbh-careers-photo-quote">{english ? <>GREAT PEOPLE<br />MAKE GREAT<br />BURGERS.</> : <>GENTE BOA<br />FAZ BURGER<br />BOM.</>}</div>
          </div>
          <img className="tbh-careers-mascot" src="/assets/mascots/mascote-hamburguer-em-paz-512.webp" alt="" aria-hidden="true" width={1278} height={1230} loading="lazy" decoding="async" />
        </div>
      </div>

      {isOpen && createPortal(
        <div
          role="presentation"
          className="tbh-landing-dialog fixed inset-0 z-[100] flex items-center justify-center bg-[#171717]/70 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <div
            ref={dialogRef}
          tabIndex={-1}
          role="dialog"
            aria-modal="true"
            aria-labelledby="careers-modal-title"
            className="tbh-careers-dialog w-full max-w-[500px] bg-[#F5F3EE] p-6 sm:p-8"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#2864F0]">
                  {english ? 'WORK WITH US' : 'TRABALHE CONOSCO'}
                </p>
                <h3
                  id="careers-modal-title"
                  className="mt-2 font-display text-3xl font-black uppercase text-[#E85D4A]"
                >
                  {english ? 'JOIN THE TEAM!' : 'VEM PRO TIME!'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label={english ? "Close application" : "Fechar candidatura"}
                className="rounded-full p-2 text-[#171717] hover:bg-[#E85D4A]/10 focus-visible:outline-2 focus-visible:outline-[#2864F0]"
              >
                <X aria-hidden="true" className="h-6 w-6" />
              </button>
            </div>

            {whatsappNumber ? <form onSubmit={handleInterest} className="space-y-5">
              <div>
                <label htmlFor="career-name" className="mb-2 block text-sm font-bold text-[#171717]">
                  {english ? 'Your name' : 'Seu nome'}
                </label>
                <input
                  id="career-name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={english ? "What should we call you?" : "Como podemos chamar você?"}
                  className="w-full rounded-xl border border-[#CFC6BA] bg-[#F5F3EE] px-4 py-3 text-[#171717] focus-visible:outline-2 focus-visible:outline-[#2864F0]"
                />
              </div>

              <div>
                <label htmlFor="career-area" className="mb-2 block text-sm font-bold text-[#171717]">
                  {english ? 'Area of interest' : 'Área de interesse'}
                </label>
                <select
                  id="career-area"
                  value={area}
                  onChange={(event) => setArea(event.target.value)}
                  className="w-full rounded-xl border border-[#CFC6BA] bg-[#F5F3EE] px-4 py-3 text-[#171717] focus-visible:outline-2 focus-visible:outline-[#2864F0]"
                >
                  <option value="Atendimento">{english ? 'Customer service' : 'Atendimento'}</option>
                  <option value="Cozinha">{english ? 'Kitchen' : 'Cozinha'}</option>
                  <option value="Operação e logística">{english ? 'Operations and logistics' : 'Operação e logística'}</option>
                  <option value="Administração">{english ? 'Administration' : 'Administração'}</option>
                  <option value="Outras áreas">{english ? 'Other areas' : 'Outras áreas'}</option>
                </select>
              </div>

              <p className="text-sm leading-relaxed text-[#55504B]">
                {english ? 'You will be redirected to the restaurant’s WhatsApp. Send your PDF résumé directly in the conversation. This form does not store or automatically send files.' : 'Você será direcionado ao WhatsApp da hamburgueria. Envie seu currículo em PDF diretamente na conversa. Este formulário não armazena nem envia arquivos automaticamente.'}
              </p>

              <button
                type="submit"
                className="flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[#E85D4A] px-5 py-3 font-heading text-sm font-black uppercase text-[#171717] hover:bg-[#D44A37] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2864F0]"
              >
                {english ? 'CONTINUE ON WHATSAPP' : 'CONTINUAR PELO WHATSAPP'}
                <ArrowUpRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </form> : <p role="status">{english ? 'Portfolio demonstration. There are no real vacancies or verified recruiting contact. No résumé or personal data is collected here.' : 'Demonstração de portfólio. Não há vagas reais ou contato verificado de recrutamento. Não coletamos currículo nem dados pessoais aqui.'}</p>}
          </div>
        </div>, document.body
      )}
    </section>
  );
};
