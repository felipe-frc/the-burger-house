import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { BURGERS, type BurgerItem } from '../utils/menu';
import { BurgerShowcaseItem } from './burger-menu/BurgerShowcaseItem';
import { useScrollEntrance } from '../utils/useScrollEntrance';
import { storefrontOffer, type StorefrontCatalog } from '../utils/useStorefrontCatalog';
import { CatalogNotice } from './CatalogNotice';
import './burger-menu/BurgerShowcase.css';

interface BurgerMenuProps {
  onSelectBurger: (burger: BurgerItem) => void;
  onOpenWholeMenu: () => void;
  currentLang?: string;
  storefrontCatalog: StorefrontCatalog;
}

export const BurgerMenu: React.FC<BurgerMenuProps> = ({ onSelectBurger, onOpenWholeMenu, storefrontCatalog, currentLang = 'PT' }) => {
  const english = currentLang === 'EN';
  const [openId, setOpenId] = useState<string | null>(null);
  const gridRef = useScrollEntrance('burger');
  return (
    <section id="menu" className="tbh-feature-section tbh-showcase-section" aria-labelledby="tbh-feature-heading">
      <div className="tbh-container tbh-showcase-container">
        <header className="tbh-showcase-header">
          <h2 id="tbh-feature-heading" className="tbh-section-title">{english ? 'YOUR NEXT FAVORITE IS HERE' : 'SEU PRÓXIMO FAVORITO TÁ AQUI'}</h2>
          <p className="tbh-subtitle">{english ? 'From classic to unexpected. Which one is yours?' : 'Do clássico ao surpreendente. Qual combina com você?'}</p>
        </header>
        <CatalogNotice storefrontCatalog={storefrontCatalog} english={english} />
        <div ref={gridRef} className="tbh-showcase-grid">
          {BURGERS.map(burger => (
            <BurgerShowcaseItem key={burger.id} burger={burger} offer={storefrontOffer(storefrontCatalog, burger.id, english)} english={english} open={openId === burger.id}
              onAdd={() => onSelectBurger(burger)}
              onOpen={() => setOpenId(burger.id)}
              onClose={() => setOpenId(id => id === burger.id ? null : id)} />
          ))}
        </div>
        <div className="tbh-feature-footer tbh-showcase-footer">
          <button type="button" className="tbh-button tbh-button--primary tbh-showcase-all" onClick={event => {
            event.currentTarget.focus({ preventScroll: true });
            onOpenWholeMenu();
          }}>
            {english ? 'VIEW FULL MENU' : 'VER CARDÁPIO COMPLETO'}
            <ArrowRight size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
};
