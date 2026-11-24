import { Info, Plus, X } from 'lucide-react';
import type { BurgerItem } from '../../utils/menu';
import type { StorefrontOffer } from '../../utils/useStorefrontCatalog';
import { burgerIngredients } from './ingredients';
import { BurgerShowcaseBadge } from './BurgerShowcaseBadge';
import { getProductNutrition } from '../../data/nutrition';
import { productImage } from '../../utils/productImage';

interface Props {
  burger: BurgerItem;
  offer: StorefrontOffer;
  open: boolean;
  english?: boolean;
  onAdd: () => void;
  onOpen: () => void;
  onClose: () => void;
}

export function BurgerShowcaseItem({ burger, offer, open, onAdd, onOpen, onClose, english = false }: Props) {
  const panelId = `ingredients-${burger.id}`;
  const live = offer.product?.source === 'api' ? offer.product : undefined;
  const name = (english ? live?.englishName : live?.name) || burger.name;
  const nutrition = getProductNutrition(burger.id);
  return (
    <article className="tbh-showcase-item" data-open={open} data-product={burger.id}
      onPointerEnter={event => { if (event.pointerType === 'mouse') onOpen(); }}
      onPointerLeave={event => { if (event.pointerType === 'mouse') onClose(); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onClose(); }}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } }}>
      <button type="button" className="tbh-showcase-reveal"
        aria-expanded={open} aria-controls={panelId}
        aria-describedby={open ? panelId : undefined}
        aria-label={`${english ? (open ? 'Hide ingredients for' : 'Show ingredients for') : (open ? 'Fechar ingredientes de' : 'Ver ingredientes de')} ${name}`}
        onClick={() => open ? onClose() : onOpen()}>
        <span className="tbh-showcase-visual">
          <span className="tbh-showcase-photo-face" aria-hidden={open}>
            <img {...productImage(burger.image, '(max-width: 420px) 85vw, 340px', live?.uploadedImage)} alt={name} width={512} height={512} loading="lazy" decoding="async" />
            <BurgerShowcaseBadge type={burger.badgeType} english={english} />
          </span>
          <span id={panelId} className="tbh-showcase-ingredients" aria-hidden={!open}>
            <span className="tbh-showcase-ingredients-label">{english ? 'WHAT’S IN THIS BURGER?' : 'O QUE VAI NESSE BURGER?'}</span>
            <span className="tbh-showcase-ingredient-list">
              {burgerIngredients(burger, english).join(', ')}.
            </span>
            {nutrition?.values && (
              <>
                <span className="tbh-showcase-nutrition-strip">
                  <strong>~{nutrition.values.calories} kcal</strong>
                  <span>{nutrition.values.protein}g prot</span>
                  <span>{nutrition.values.carbohydrates}g {english ? 'carbs' : 'carb'}</span>
                  <span>{nutrition.values.totalFat}g {english ? 'fat' : 'gord'}</span>
                </span>
                <span className="tbh-showcase-nutrition-legend">
                  {english ? '*Estimated nutritional values' : '*Valores nutricionais estimados'}
                </span>
              </>
            )}
          </span>
        </span>
        <span className="tbh-showcase-hint" aria-hidden="true">
          {open ? <X size={14} /> : <Info size={14} />}
          <span>{english ? (open ? 'BACK TO THE BURGER' : 'VIEW INGREDIENTS & NUTRITION') : (open ? 'VOLTAR AO BURGER' : 'VER INGREDIENTES E NUTRIÇÃO')}</span>
        </span>
      </button>
      <h3 className="tbh-showcase-name">{name}</h3>
      <span className="tbh-showcase-price">{offer.price}</span>
      <button type="button" className="tbh-button tbh-showcase-add"
        disabled={!offer.available}
        aria-label={english ? `Add ${name}` : `Adicionar ${name}`}
        onClick={event => { event.currentTarget.focus({ preventScroll: true }); onClose(); onAdd(); }}>
        <Plus aria-hidden="true" />{english ? 'ADD' : 'ADICIONAR'}
      </button>
    </article>
  );
}
