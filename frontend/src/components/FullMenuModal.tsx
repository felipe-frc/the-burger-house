import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { ShoppingBag, ArrowRight, X } from 'lucide-react';
import { burgerIngredients } from './burger-menu/ingredients';
import { englishMenuCopy } from '../utils/menuCopy';
import { useModalFocus } from '../utils/useModalFocus';
import { BURGERS, SIDES_AND_DRINKS, type CartItem, type BurgerItem } from '../utils/menu';
import { storefrontOffer, type StorefrontCatalog } from '../utils/useStorefrontCatalog';
import { MenuProductCard, MenuProductDetails, MenuProductPurchase, type MenuCategory, type MenuProductView } from './MenuProductCard';
import { formatBRL } from '../utils/menu';
import { CatalogNotice } from './CatalogNotice';
import './FullMenuModal.css';

interface FullMenuModalProps {
  currentLang?: string;
  isOpen: boolean;
  onClose: () => void;
  onAddBurger: (burger: BurgerItem) => void;
  storefrontCatalog: StorefrontCatalog;
  cart: CartItem[];
  bagTotal: number | null;
  onChangeQuantity: (id: string, delta: number) => void;
  onOpenBag: () => void;
}

// Concise display copy only: the original catalogue descriptions/recipes stay in details.
const shortDescriptions: Record<string, { pt: string; en: string }> = {
  'the-classic': { pt: 'Smash bovino com cheddar, cebola, picles e molho da casa.', en: 'Beef smash with cheddar, onion, pickles and house sauce.' },
  'double-smash': { pt: 'Dois smash burgers, cheddar em dobro, picles e cebola caramelizada.', en: 'Two smash patties, double cheddar, pickles and caramelized onion.' },
  'smokehouse-bbq': { pt: 'Smash bovino, cheddar, bacon crocante, cebola e barbecue defumado.', en: 'Beef smash, cheddar, crispy bacon, onion and smoked barbecue sauce.' },
  'crispy-cheddar': { pt: 'Frango empanado, cheddar, bacon, alface, tomate e maionese defumada.', en: 'Breaded chicken, cheddar, bacon, lettuce, tomato and smoked mayonnaise.' },
  'onion-crunch': { pt: 'Burger bovino, queijo suíço, bacon, onion rings e aioli de alho assado.', en: 'Beef burger, Swiss cheese, bacon, onion rings and roasted garlic aioli.' },
  'o-praiano': { pt: 'Burger bovino, queijo coalho, banana-da-terra, bacon e fio de mel.', en: 'Beef burger, coalho cheese, fried plantain, bacon and a drizzle of honey.' },
};

export const FullMenuModal = ({ currentLang = 'PT', isOpen, onClose, onAddBurger, storefrontCatalog, cart, bagTotal, onChangeQuantity, onOpenBag }: FullMenuModalProps) => {
  const english = currentLang === 'EN';
  const dialogRef = useModalFocus(isOpen, onClose, '.tbh-order-panel');
  const bodyRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drawerTrigger = useRef<HTMLButtonElement | null>(null);
  const detailsTrigger = useRef<HTMLButtonElement | null>(null);
  const listScroll = useRef(0);
  const [activeTab, setActiveTab] = useState<MenuCategory>('burgers');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { if (!isOpen) setSelectedId(null); }, [isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    let wasOpen = false, frame = 0;
    const handoff = () => {
      const panel = document.querySelector<HTMLElement>('.tbh-order-panel');
      const open = !!panel;
      if (open === wasOpen) return;
      wasOpen = open; setDrawerOpen(open);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (panel) panel.querySelector<HTMLButtonElement>('button')?.focus();
        else if (drawerTrigger.current?.isConnected) drawerTrigger.current.focus({ preventScroll: true });
      });
    };
    const observer = new MutationObserver(handoff);
    observer.observe(document.body, { childList: true, subtree: true });
    handoff();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [isOpen]);

  const burgerViews: MenuProductView[] = BURGERS.map(product => ({
    category: 'burgers', product, name: product.name,
    offer: storefrontOffer(storefrontCatalog, product.id, english),
    description: shortDescriptions[product.id]?.[english ? 'en' : 'pt'] ?? product.tagline,
    fullDescription: english ? englishMenuCopy[product.id]?.description ?? product.description : product.description,
    ingredients: english ? burgerIngredients(product, true).join(', ') + '.' : product.ingredients,
  }));
  const otherViews: MenuProductView[] = SIDES_AND_DRINKS.filter(item => item.category === 'Acompanhamentos' || item.category === 'Bebidas').map(item => ({
    category: item.category === 'Acompanhamentos' ? 'sides' : 'drinks',
    // Same payload previously passed by the separate sides/drinks buttons.
    product: { id: item.id, name: item.name, tagline: item.desc,
      badge: item.category === 'Acompanhamentos' ? 'ACOMPANHAMENTO' : 'BEBIDA', badgeType: 'classic',
      description: item.desc, ingredients: item.desc, image: item.image, price: item.price,
      prices: { small: item.price, medium: item.price, large: item.price } },
    name: english ? englishMenuCopy[item.id]?.name ?? item.name : item.name,
    offer: storefrontOffer(storefrontCatalog, item.id, english),
    description: english ? englishMenuCopy[item.id]?.description ?? item.desc : item.desc,
    fullDescription: english ? englishMenuCopy[item.id]?.description ?? item.desc : item.desc,
    ingredients: null,
  }));
  const additionalViews: MenuProductView[] = storefrontCatalog.catalogState === 'ready' ? storefrontCatalog.catalog
    .filter(item => item.storefrontId.startsWith('catalog:') && item.available).map(item => {
      const name = english ? item.englishName : item.name;
      const description = english ? item.englishDescription : item.description;
      const category: MenuCategory = item.category === 'Acompanhamentos' ? 'sides' : item.category === 'Bebidas' ? 'drinks' : 'burgers';
      return {
        category, name, description, fullDescription: description, ingredients: null,
        product: { id: item.storefrontId, name, description, tagline: description, ingredients: '', badge: '', badgeType: 'classic', image: '',
          price: item.price, prices: { small: item.price, medium: item.price, large: item.price } },
        offer: storefrontOffer(storefrontCatalog, item.storefrontId, english),
      };
    }) : [];
  const views = [...burgerViews, ...otherViews, ...additionalViews].map(item => {
    const live = item.offer.product;
    if (live?.source !== 'api') return item;
    const description = english ? live.englishDescription : live.description;
    const category: MenuCategory = live.category === 'Acompanhamentos' ? 'sides' : live.category === 'Bebidas' ? 'drinks' : 'burgers';
    return {
      ...item, category,
      name: (english ? live.englishName : live.name) || item.name,
      fullDescription: description || item.fullDescription,
      description: description || item.description,
    };
  });
  const inCategory = (category: MenuCategory) => views
    .filter(item => item.category === category)
    .sort((a, b) => (a.offer.product?.displayOrder ?? 1000) - (b.offer.product?.displayOrder ?? 1000));
  const categories: Array<{ id: MenuCategory; label: string; items: MenuProductView[] }> = [
    { id: 'burgers', label: 'SMASH BURGERS', items: inCategory('burgers') },
    { id: 'sides', label: english ? 'SIDES' : 'ACOMPANHAMENTOS', items: inCategory('sides') },
    { id: 'drinks', label: english ? 'DRINKS' : 'BEBIDAS', items: inCategory('drinks') },
  ];

  const handleAdd = (item: MenuProductView, event: MouseEvent<HTMLButtonElement>) => {
    if (!item.offer.available) return;
    drawerTrigger.current = event.currentTarget;
    onAddBurger(item.product);

  };
  const scrollingRegion = () => bodyRef.current && getComputedStyle(bodyRef.current).overflowY !== 'visible'
    ? bodyRef.current : viewportRef.current;
  const selectCategory = (id: MenuCategory) => {
    setActiveTab(id); setSelectedId(null);
    requestAnimationFrame(() => {
      const region = scrollingRegion();
      if (!region) return;
      if (region === viewportRef.current) {
        // Keep the tabs in view when switching from the bottom of a mobile list.
        const headerHeight = dialogRef.current?.querySelector<HTMLElement>('.tbh-fullmenu-header')?.offsetHeight ?? 0;
        region.scrollTop = Math.min(region.scrollTop, headerHeight);
      } else region.scrollTop = 0;
    });
  };
  const categoryKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % categories.length;
    else if (event.key === 'ArrowLeft') next = (index + categories.length - 1) % categories.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = categories.length - 1;
    else return;
    event.preventDefault(); selectCategory(categories[next].id);
    const button = dialogRef.current?.querySelector<HTMLButtonElement>(`#menu-tab-${categories[next].id}`);
    button?.focus({ preventScroll: true }); button?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const openDetails = (id: string, trigger: HTMLButtonElement) => {
    detailsTrigger.current = trigger;
    listScroll.current = scrollingRegion()?.scrollTop ?? 0;
    setSelectedId(id);
    requestAnimationFrame(() => {
      const region = scrollingRegion();
      if (region) region.scrollTop = 0;
      dialogRef.current?.querySelector<HTMLButtonElement>('.tbh-fullmenu-back')?.focus({ preventScroll: true });
    });
  };
  const closeDetails = () => {
    const id = selectedId;
    const triggerClass = detailsTrigger.current?.classList.contains('tbh-fullmenu-info')
      ? '.tbh-fullmenu-info' : '.tbh-fullmenu-image-trigger';
    setSelectedId(null);
    requestAnimationFrame(() => {
      const region = scrollingRegion();
      if (region) region.scrollTop = listScroll.current;
      dialogRef.current?.querySelector<HTMLButtonElement>(`[data-menu-product="${id}"] ${triggerClass}`)?.focus({ preventScroll: true });
    });
  };

  if (!isOpen) return null;
  const selected = categories.find(category => category.id === activeTab)?.items.find(item => item.product.id === selectedId);
  return <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal={drawerOpen ? undefined : true}
    aria-hidden={drawerOpen || undefined} inert={drawerOpen} aria-labelledby="full-menu-title"
    className="tbh-fullmenu-dialog" data-drawer-open={drawerOpen} data-detail={!!selected} aria-busy={storefrontCatalog.catalogState === 'loading'}>
    <div className="tbh-fullmenu-surface">
      <button type="button" className="tbh-fullmenu-close" onClick={onClose} aria-label={english ? 'Close menu' : 'Fechar cardápio'}><X aria-hidden="true" /></button>
      <div ref={viewportRef} className="tbh-fullmenu-viewport">
        <header className="tbh-fullmenu-header">
          <img className="tbh-fullmenu-logo" src="/assets/branding/the-burger-house-logo-440.webp" alt="The Burger House" width={440} height={440} decoding="async" />
          <div className="tbh-fullmenu-header-copy">
            <p className="tbh-fullmenu-eyebrow">{english ? 'OUR MENU' : 'NOSSO CARDÁPIO'}</p>
            <h2 id="full-menu-title" className="tbh-section-title tbh-fullmenu-title">{english ? 'PICK YOUR FAVORITE.' : 'ESCOLHA SEU FAVORITO.'}</h2>
            <p className="tbh-fullmenu-intro">{english ? 'CRAFT BURGERS, MADE ON THE GRIDDLE.' : 'BURGERS ARTESANAIS, FEITOS NA CHAPA.'}</p>
          </div>
        <div className="tbh-fullmenu-categories" role="tablist" aria-label={english ? 'Menu categories' : 'Categorias do cardápio'}>
          {categories.map((category, index) => <button key={category.id} type="button" role="tab" id={`menu-tab-${category.id}`}
            aria-selected={activeTab === category.id} aria-controls={`menu-panel-${category.id}`} tabIndex={activeTab === category.id ? 0 : -1}
            aria-label={`${category.label} (${category.items.length})`}
            onClick={() => selectCategory(category.id)} onKeyDown={event => categoryKey(event, index)}>
            <span>{category.label} ({category.items.length})</span>
          </button>)}
        </div>
        </header>
        <div ref={bodyRef} className="tbh-fullmenu-body">
          <CatalogNotice storefrontCatalog={storefrontCatalog} english={english} />
          {categories.map(category => <section key={category.id} role="tabpanel" tabIndex={0} id={`menu-panel-${category.id}`}
            aria-labelledby={`menu-tab-${category.id}`} hidden={activeTab !== category.id} className="tbh-fullmenu-tabpanel">
            {selected && category.id === activeTab
              ? <MenuProductDetails key={selected.product.id} item={selected} english={english} onBack={closeDetails} />
              : <div className="tbh-fullmenu-grid">{category.items.map(item => <MenuProductCard key={item.product.id}
                item={item} english={english} quantity={cart.find(line => line.burger.id === item.product.id)?.quantity ?? 0} onDecrease={() => onChangeQuantity(item.product.id, -1)} onAdd={event => handleAdd(item, event)} onDetails={event => openDetails(item.product.id, event.currentTarget)} />)}</div>}
          </section>)}
        </div>
        {selected && <MenuProductPurchase className="tbh-fullmenu-detail-purchase" item={selected} english={english}
          quantity={cart.find(line => line.burger.id === selected.product.id)?.quantity ?? 0} onDecrease={() => onChangeQuantity(selected.product.id, -1)} onAdd={event => handleAdd(selected, event)} />}
      </div>
      {cart.length > 0 && <div className="tbh-fullmenu-bagbar">
        <span><ShoppingBag aria-hidden="true" /> {cart.reduce((sum, line) => sum + line.quantity, 0)} {cart.reduce((sum, line) => sum + line.quantity, 0) === 1 ? 'ITEM' : english ? 'ITEMS' : 'ITENS'} · {bagTotal == null ? (english ? 'Checking total…' : 'Conferindo total…') : formatBRL(bagTotal, english)}</span>
        <button type="button" aria-label={english ? 'View bag' : 'Ver sacola'} onClick={event => { drawerTrigger.current = event.currentTarget; onOpenBag(); }}>{english ? 'VIEW BAG' : 'VER SACOLA'}<ArrowRight aria-hidden="true" /></button>
      </div>}
    </div>
  </div>;
};
