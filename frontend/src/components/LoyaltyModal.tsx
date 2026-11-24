import React, { useState } from 'react';
import { X, Gift, Sparkles } from 'lucide-react';
import { useModalFocus } from '../utils/useModalFocus';

interface LoyaltyModalProps {
  currentLang?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const LoyaltyModal: React.FC<LoyaltyModalProps> = ({ isOpen, onClose, currentLang = 'PT' }) => {
  const english = currentLang === 'EN';
  const dialogRef = useModalFocus(isOpen, onClose);
  const [stamps, setStamps] = useState<number>(3); // 3 of 6 collected by default

  if (!isOpen) return null;

  const punchStamp = () => {
    if (stamps < 6) {
      setStamps((s) => s + 1);
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="loyalty-title"
      className="tbh-landing-dialog fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-[#F5F3EE] text-[#171717] max-w-lg w-full p-6 sm:p-8 border-4 border-[#FF3816] relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-full bg-[#F5F3EE] border border-gray-300 hover:bg-gray-100 text-gray-700 cursor-pointer"
          aria-label={english ? "Close loyalty modal" : "Fechar fidelidade"}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-[#FF3816]">
            <Sparkles className="w-5 h-5" />
            <span className="font-heading font-black text-xs uppercase tracking-widest text-[#171717]">
              The Burger House Diner Club
            </span>
          </div>
          <img
            src="/assets/mascots/mascote-hamburguer-em-paz-512.webp"
            alt=""
            className="w-14 h-14 object-contain"
          />
        </div>

        <h3 id="loyalty-title" className="font-display text-3xl sm:text-4xl text-[#171717] uppercase mb-2">
          {english ? 'TRY THE LOYALTY CARD' : 'EXPERIMENTE O CARTÃO FIDELIDADE'}
        </h3>

        <p className="text-xs sm:text-sm text-gray-700 font-medium mb-6">
          {english ? 'Stamps stay in this browser and do not earn rewards.' : 'Os carimbos ficam neste navegador e não geram recompensas.'}
        </p>

        {/* Vintage Diner Stamp Card */}
        <div className="bg-[#F5F3EE] rounded-2xl p-5 border-2 border-dashed border-[#E85D4A] shadow-inner mb-6">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
            <span className="font-heading font-black text-xs text-[#E85D4A] uppercase tracking-wider">
              {english ? 'THE BURGER HOUSE LOYALTY CARD' : 'CARTÃO FIDELIDADE THE BURGER HOUSE'}
            </span>
            <span className="text-[10px] font-bold text-gray-400">#TBH-CLUB-2026</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map((num) => {
              const isStamped = num <= stamps;
              const isReward = num === 6;
              return (
                <div
                  key={num}
                  className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center p-2 text-center transition-all ${
                    isStamped
                      ? 'border-[#E85D4A] bg-[#E85D4A] text-[#F5F3EE] shadow-sm rotate-1'
                      : isReward
                      ? 'border-[#FF3816] bg-[#FF3816]/10 text-[#FF3816]'
                      : 'border-dashed border-gray-300 text-gray-400'
                  }`}
                >
                  {isStamped ? (
                    <>
                      <span className="font-display text-lg text-[#FFDC32] font-bold">TBH</span>
                      <span className="text-[9px] font-bold tracking-tighter">SMASHED</span>
                    </>
                  ) : isReward ? (
                    <>
                      <Gift className="w-5 h-5 text-[#FF3816] motion-safe:animate-bounce" />
                      <span className="text-[8px] font-black uppercase mt-1">{english ? 'DEMO REWARD' : 'RECOMPENSA DE TESTE'}</span>
                    </>
                  ) : (
                    <span className="font-heading font-bold text-base text-gray-300">#{num}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-600">
              {stamps === 6 ? (english ? 'Card complete!' : 'Cartão completo!') : (english ? `${6 - stamps} more stamps to complete the card.` : `Faltam ${6 - stamps} carimbos para concluir o cartão.`)}
            </span>
            {stamps < 6 && (
              <button
                onClick={punchStamp}
                className="px-3 py-1 rounded-full bg-[#FFDC32] text-[#171717] font-heading font-black text-[11px] uppercase hover:bg-yellow-400 cursor-pointer"
              >
                {english ? '+ Punch Test Stamp' : '+ Carimbo de teste'}
              </button>
            )}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-full bg-[#E85D4A] text-[#171717] font-heading font-black text-xs uppercase tracking-wider hover:bg-[#d92d0b] transition-colors"
        >
          {english ? 'SWEET, GOT IT!' : 'ENTENDI!'}
        </button>
      </div>
    </div>
  );
};
