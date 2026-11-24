import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { ArrowLeft, Info, Minus, Plus } from 'lucide-react';
import type { BurgerItem } from '../utils/menu';
import type { StorefrontOffer } from '../utils/useStorefrontCatalog';
import { NutritionFacts } from './NutritionFacts';
import { productImage, productViewBox } from '../utils/productImage';

export type MenuCategory = 'burgers' | 'sides' | 'drinks';
export interface MenuProductView {
  category: MenuCategory;
  product: BurgerItem;
  name: string;
  description: string;
  fullDescription: string;
  ingredients: string | null;
  offer: StorefrontOffer;
}

interface ActionProps {
  item: MenuProductView;
  english: boolean;
  quantity: number;
  onDecrease: () => void;
  onAdd: (event: MouseEvent<HTMLButtonElement>) => void;
}

function AddButton({ item, english, quantity, onAdd, onDecrease }: ActionProps) {
  const control = useRef<HTMLButtonElement>(null);
  const transferFocus = useRef(false);
  useLayoutEffect(() => {
    if (transferFocus.current) { control.current?.focus({ preventScroll: true }); transferFocus.current = false; }
  }, [quantity]);
  const add = (event: MouseEvent<HTMLButtonElement>) => { transferFocus.current = true; onAdd(event); };
  const decrease = () => { if (quantity === 1) transferFocus.current = true; onDecrease(); };
  if (quantity > 0) return <div className="tbh-fullmenu-quantity" role="group" aria-label={english ? `Quantity of ${item.name}` : `Quantidade de ${item.name}`}>
    <button type="button" onClick={decrease} aria-label={english ? `Decrease ${item.name} quantity` : `Diminuir quantidade de ${item.name}`}><Minus aria-hidden="true" /></button>
    <output aria-live="polite">{quantity}</output>
    <button ref={control} type="button" disabled={!item.offer.available || quantity >= 99} onClick={add} aria-label={english ? `Increase ${item.name} quantity` : `Aumentar quantidade de ${item.name}`}><Plus aria-hidden="true" /></button>
  </div>;
  return <button ref={control} type="button" className="tbh-fullmenu-add" onClick={add}
    disabled={!item.offer.available} data-available={item.offer.available}
    aria-label={`${english ? 'Add' : 'Adicionar'} ${item.name}`}>
    <Plus aria-hidden="true" /><span>{english ? 'ADD' : 'ADICIONAR'}</span>
  </button>;
}

function englishLabel(english: boolean) { return english ? 'Price' : 'Preço'; }

export function MenuProductPurchase({ className, ...props }: ActionProps & { className: string }) {
  return <div className={className} data-available={props.item.offer.available}>
    <span className="tbh-fullmenu-product-price" aria-label={`${englishLabel(props.english)}: ${props.item.offer.price}`}>{props.item.offer.price}</span>
    <AddButton {...props} />
  </div>;
}

export function MenuProductCard(props: ActionProps & { onDetails: (event: MouseEvent<HTMLButtonElement>) => void }) {
  const { item, english, onDetails } = props;
  return <article className="tbh-fullmenu-product" data-menu-product={item.product.id}
    style={{ '--product-frame-ratio': item.category === 'drinks' ? '3 / 4' : '1' } as CSSProperties}
    aria-labelledby={`menu-name-${item.product.id}`}>
    <button type="button" className="tbh-fullmenu-image-trigger" onClick={onDetails}
      aria-label={`${item.ingredients ? (english ? 'View ingredients and details for' : 'Ver ingredientes e detalhes de') : (english ? 'View details for' : 'Ver detalhes de')} ${item.name}`}
      title={english ? 'View product details' : 'Ver detalhes do produto'}>
      {item.product.image || item.offer.product?.uploadedImage
        ? <img className="tbh-fullmenu-product-image" style={{ '--product-view-box': productViewBox(item.product.image, item.offer.product?.uploadedImage) } as CSSProperties} {...productImage(item.product.image, '(max-width: 700px) 36vw, 165px', item.offer.product?.uploadedImage)} alt="" width={512} height={512} loading="lazy" decoding="async" />
        : <Info size={32} aria-hidden="true" />}

    </button>
    <div className="tbh-fullmenu-product-copy">
      <div className="tbh-fullmenu-product-heading">
        <h3 id={`menu-name-${item.product.id}`} className="tbh-fullmenu-product-name">{item.name}</h3>
        <button type="button" className="tbh-fullmenu-info" onClick={onDetails}
          aria-label={english ? `View details and nutrition for ${item.name}` : `Ver detalhes e nutrição de ${item.name}`}><Info aria-hidden="true" /></button>
      </div>
      <p className="tbh-fullmenu-product-description">{item.description}</p>
      <MenuProductPurchase {...props} className="tbh-fullmenu-product-purchase" />
    </div>
  </article>;
}

const detailTabs = ['info', 'nutrition'] as const;
export function MenuProductDetails({ item, english, onBack }: Pick<ActionProps, 'item' | 'english'> & { onBack: () => void }) {
  const [detailTab, setDetailTab] = useState<(typeof detailTabs)[number]>('info');
  const prefix = useId();
  const focusSelected = useRef(false);
  useLayoutEffect(() => {
    if (!focusSelected.current) return;
    focusSelected.current = false;
    const frame = requestAnimationFrame(() => {
      const tab = document.getElementById(`${prefix}-tab-${detailTab}`);
      tab?.focus({ preventScroll: true });
      tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [detailTab, prefix]);
  const infoLabel = item.ingredients ? (english ? 'INGREDIENTS' : 'INGREDIENTES') : (english ? 'DESCRIPTION' : 'DESCRIÇÃO');
  const nutritionLabel = english ? 'NUTRITION FACTS' : 'INFORMAÇÕES NUTRICIONAIS';
  const tabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? detailTabs.length - 1
      : event.key === 'ArrowRight' ? (index + 1) % detailTabs.length
      : event.key === 'ArrowLeft' ? (index + detailTabs.length - 1) % detailTabs.length : -1;
    if (next < 0) return;
    event.preventDefault();
    if (detailTabs[next] === detailTab) return;
    focusSelected.current = true;
    setDetailTab(detailTabs[next]);
  };
  return <div className="tbh-fullmenu-detail" data-menu-detail={item.product.id}>
    <button type="button" className="tbh-button tbh-fullmenu-back" onClick={onBack}>
      <ArrowLeft aria-hidden="true" />{english ? 'BACK TO PRODUCTS' : 'VOLTAR AOS PRODUTOS'}
    </button>
    <div className="tbh-fullmenu-detail-content">
      {(item.product.image || item.offer.product?.uploadedImage) && <img {...productImage(item.product.image, '(max-width: 700px) 88vw, 460px', item.offer.product?.uploadedImage)} alt={item.name} width={512} height={512} decoding="async" />}
      <div>
        <h3 className="tbh-fullmenu-product-name">{item.name}</h3>
        {item.ingredients && <p className="tbh-fullmenu-product-description">{item.fullDescription}</p>}
        <div className="tbh-fullmenu-detail-tabs" role="tablist"
          aria-label={english ? 'Product details' : 'Detalhes do produto'}>
          {detailTabs.map((tab, index) => <button key={tab} type="button" role="tab" id={`${prefix}-tab-${tab}`}
            aria-controls={`${prefix}-panel-${tab}`} aria-selected={detailTab === tab} tabIndex={detailTab === tab ? 0 : -1}
            onKeyDown={event => tabKey(event, index)} onClick={() => setDetailTab(tab)}>
            {tab === 'info' ? infoLabel : nutritionLabel}
          </button>)}
        </div>
        {detailTabs.map(tab => <section key={tab} className="tbh-fullmenu-detail-tabpanel" role="tabpanel"
          id={`${prefix}-panel-${tab}`} aria-labelledby={`${prefix}-tab-${tab}`} hidden={detailTab !== tab} tabIndex={0}>
          {tab === 'nutrition' ? <NutritionFacts productId={item.product.id} english={english} showSources />
            : <p className="tbh-fullmenu-product-description">{item.ingredients ?? item.fullDescription}</p>}
        </section>)}
      </div>
    </div>
  </div>;
}
