import { useModalFocus } from '../utils/useModalFocus';
import AboutAccordionGallery from './AboutAccordionGallery';
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles } from 'lucide-react';
import './AboutSection.css';

export const AboutSection: React.FC<{ currentLang?: string }> = ({ currentLang = 'PT' }) => {
  const english = currentLang === 'EN';
  const [storyModalOpen, setStoryModalOpen] = useState(false);
  const dialogRef = useModalFocus(storyModalOpen, () => setStoryModalOpen(false));

  return (
    <section id="about" className="tbh-about" aria-labelledby="tbh-about-title">
      <div className="tbh-container">
        {/* Top Header Block */}
        <div className="tbh-about-intro">
          {/* Shared section headline */}
          <div className="tbh-about-title-block">
            <h2 id="tbh-about-title" className="tbh-section-title tbh-about-heading">
              {english ? 'ABOUT' : 'SOBRE'}<br />THE BURGER HOUSE
            </h2>
          </div>

          {/* Narrative Paragraph & Learn More Button */}
          <div className="tbh-about-narrative">
            <p className="tbh-description">
              {english ? 'At The Burger House, we believe a great burger is about more than flavor. We combine carefully selected ingredients, recipes full of personality and handcrafted preparation to turn every order into a special experience. From the first bite to the last, everything is made for you to enjoy.' : 'Na The Burger House, acreditamos que um bom hambúrguer vai além do sabor. Combinamos ingredientes selecionados, receitas cheias de personalidade e preparo artesanal para transformar cada pedido em uma experiência especial. Do primeiro ao último pedaço, tudo é feito para você aproveitar de verdade.'}
            </p>

            <button
              onClick={() => setStoryModalOpen(true)}
              className="tbh-about-more-hidden inline-flex items-center justify-center min-h-[46px] px-8 py-2.5 rounded-full bg-[#F5F3EE] text-[#171717] font-heading font-black text-sm tracking-wider uppercase shadow-md hover:bg-[#F5F3EE] hover:text-[#E85D4A] transform hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer"
            >
              {english ? 'LEARN MORE' : 'SAIBA MAIS'}
            </button>
          </div>
        </div>
        {/* Galeria animada oficial React Bits - The Burger House */}
        <div className="w-full min-w-0 pb-4 sm:pb-6">
          <AboutAccordionGallery english={english} />
        </div>
      </div>

      {/* Story Modal */}
      {storyModalOpen && createPortal(
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-story-title"
          className="tbh-landing-dialog fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div className="bg-[#F5F3EE] text-[#171717] max-w-2xl w-full p-6 sm:p-8 border-4 border-[#E85D4A] relative overflow-hidden">
            <button
              onClick={() => setStoryModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-full bg-[#F5F3EE] border border-gray-300 hover:bg-gray-100 text-gray-700 cursor-pointer"
              aria-label={english ? "Close our story" : "Fechar história"}
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-3 text-[#E85D4A]">
              <Sparkles className="w-5 h-5 text-[#FF3816]" />
              <span className="font-heading font-black text-xs uppercase tracking-widest">
                {english ? 'Our origin & philosophy' : 'Nossa Origem & Filosofia'}
              </span>
            </div>

            <h3 id="about-story-title" className="font-display text-3xl sm:text-4xl text-[#E85D4A] uppercase mb-4 leading-tight">
              {english ? 'THE BURGER HOUSE WAY' : 'O JEITO THE BURGER HOUSE'}
            </h3>

            <div className="space-y-4 text-sm sm:text-base leading-relaxed text-[#171717]/90 font-medium">
              <p>{english ? 'Fictional brand story for this portfolio demonstration. The copy below does not describe an operating restaurant.' : 'História fictícia da marca para esta demonstração de portfólio. O texto abaixo não descreve uma hamburgueria em operação.'}</p>
              <p>
                {english ? 'We traveled to renowned burger restaurants around the world to uncover the secret of the perfect crust: the sizzle of the griddle at almost 300°C, the Maillard reaction that creates crisp, lacy edges, and the balance of a soft, buttery brioche bun.' : 'Viajamos pelas hamburguerias mais consagradas do mundo para desvendar o segredo da crosta perfeita: o chiado exato da chapa a quase 300°C, a reação de Maillard que cria bordas lacy crocantes e o equilíbrio supremo com o pão brioche amanteigado e macio.'}
              </p>
              <p>
                {english ? 'We brought that authentic diner spirit to our neighborhoods, with an uncompromising focus on fresh, selected beef, artisan buns toasted to order, perfectly melted cheddar and no industrial shortcuts.' : 'Trouxemos essa alma autêntica de diner tradicional para os nossos bairros, com uma obsessão inegociável: 100% carne bovina fresca e selecionada, pães artesanais tostados na hora, queijo cheddar derretido com perfeição e zero atalhos industriais.'}
              </p>
              <p className="font-bold text-[#E85D4A]">
                {english ? 'Today, whether you eat in or order delivery, every burger is prepared over high heat, with honed technique and care from people who know their craft.' : 'Hoje, seja para saborear no nosso salão ou pedir no delivery, cada hambúrguer é preparado com fogo alto, técnica apurada e muito carinho por quem entende de verdade do assunto.'}
              </p>
            </div>

            <div className="mt-6 pt-5 border-t border-[#E85D4A]/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-[#E85D4A] text-[#FFDC32] font-display flex items-center justify-center text-sm font-bold">
                  TBH
                </span>
                <div>
                  <div className="font-heading font-black text-sm uppercase">Leo & Marc</div>
                  <div className="text-xs text-gray-600">{english ? 'Co-founders & smash masters' : 'Co-fundadores & Mestres do Smash'}</div>
                </div>
              </div>
              <button
                onClick={() => setStoryModalOpen(false)}
                className="px-6 py-2 rounded-full bg-[#E85D4A] text-[#F5F3EE] font-heading font-bold text-xs uppercase tracking-wider hover:bg-[#D44A37]"
              >
                {english ? 'Close' : 'Fechar'}
              </button>
            </div>
          </div>
        </div>, document.body
      )}


</section>
  );
};
