import { RecruitmentSection } from './components/RecruitmentSection';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { HeroSmokeTransition } from './components/HeroSmokeTransition';
import { AboutSection } from './components/AboutSection';
import { PatternRibbon } from './components/PatternRibbon';
import { BurgerMenu } from './components/BurgerMenu';
import { LocationsSection } from './components/LocationsSection';
import { Footer } from './components/Footer';
import { OrderDrawer } from './components/OrderDrawer';
import { LoyaltyModal } from './components/LoyaltyModal';
import { LandingScroll, LandingPanel } from './components/LandingScroll';
import { BurgerItem } from './utils/menu';
import { catalogProduct, hasReturnParameters, persistDrawerCart, readDrawerCart, readSession, mergeCartMutation, readCheckoutDraft, beginCartVisit } from './checkout/model';
import { useStorefrontCatalog } from './utils/useStorefrontCatalog';
import { CART_CHANGED, CART_PREFIX } from './checkout/cartStorage';
import { PrivacyPreferences } from './privacy/PrivacyPreferences';
import { startAnalytics, trackDemoEvent } from './privacy/analytics';

const FullMenuModal = lazy(() => import('./components/FullMenuModal').then(module => ({ default: module.FullMenuModal })));

export default function App() {
  useEffect(() => startAnalytics({ enabled: import.meta.env.VITE_ANALYTICS_ENABLED, measurementId: import.meta.env.VITE_GA4_MEASUREMENT_ID }), []);
  const storefrontCatalog = useStorefrontCatalog();
  const [cart, replaceCart] = useState(() => { beginCartVisit(); return readDrawerCart(); });
  const [bagTotal, setBagTotal] = useState<number | null>(null);
  const renderedCart = useRef(cart); renderedCart.current = cart;
  const setCart = useCallback((next: React.SetStateAction<ReturnType<typeof readDrawerCart>>) => {
    const latest = readDrawerCart();
    const value = typeof next === 'function' ? next(latest) : mergeCartMutation(renderedCart.current, next, latest);
    renderedCart.current = value;
    persistDrawerCart(value); replaceCart(value);
  }, []);
  useEffect(() => {
    const refresh = () => replaceCart(readDrawerCart());
    const stored = (event: StorageEvent) => { if (event.key?.startsWith(CART_PREFIX)) refresh(); };
    window.addEventListener(CART_CHANGED, refresh); window.addEventListener('storage', stored);
    window.addEventListener('focus', refresh); window.addEventListener('pageshow', refresh);
    return () => {
      window.removeEventListener(CART_CHANGED, refresh); window.removeEventListener('storage', stored);
      window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh);
    };
  }, []);

  const [orderDrawerOpen, setOrderDrawerOpen] = useState(() => !!readSession() || hasReturnParameters() ||
    cart.length > 0 && ['details','review'].includes(readCheckoutDraft()?.step ?? 'bag'));
  const [orderDrawerMode, setOrderDrawerMode] = useState<'takeaway' | 'delivery'>('takeaway');
  const [fullMenuOpen, setFullMenuOpen] = useState(false);
  const [loyaltyModalOpen, setLoyaltyModalOpen] = useState(false);
  const [currentLang, setCurrentLang] = useState(() => {
    try { return localStorage.getItem('burgerShop:language') === 'en-US' ? 'EN' : 'PT'; }
    catch { return 'PT'; }
  });
  useEffect(() => {
    document.documentElement.lang = currentLang === 'EN' ? 'en-US' : 'pt-BR';
    try { localStorage.setItem('burgerShop:language', currentLang === 'EN' ? 'en-US' : 'pt-BR'); }
    catch { /* Language remains available in memory. */ }
  }, [currentLang]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleOpenOrder = (mode: 'takeaway' | 'delivery' = 'takeaway') => {
    setOrderDrawerMode(mode);
    setOrderDrawerOpen(true);
  };

  const handleSelectBurger = (burger: BurgerItem, openDrawer = true) => {
    const live = catalogProduct(storefrontCatalog.catalog, burger.id);
    if (storefrontCatalog.catalogState !== 'ready' || !live?.available || !live.code) return;
    trackDemoEvent('add_to_cart');
    setCart(previous => previous.some(item => item.burger.id === burger.id)
      ? previous.map(item => item.burger.id === burger.id ? { ...item, quantity: Math.min(99, item.quantity + 1) } : item)
      : [...previous, { burger, size: 'medium', quantity: 1, extras: [] }]);
    if (openDrawer) setOrderDrawerOpen(true);
  };

  const handleSelectLocationForOrder = () => {
    handleOpenOrder('takeaway');
  };

  return (
    <div className="min-h-screen bg-[#F5F3EE] text-[#171717] flex flex-col font-body selection:bg-[#E85D4A] selection:text-[#F5F3EE]">
      {/* Top Navigation */}
      <a className="tbh-skip-link" href="#main-content" tabIndex={0} onClick={event => {
        const main = document.getElementById('main-content');
        if (!main) return;
        event.preventDefault();
        main.focus({ preventScroll: true });
        main.scrollIntoView({ block: 'start', behavior: 'instant' });
      }}>{currentLang === 'EN' ? 'Skip to content' : 'Ir para o conteúdo'}</a>
      <Navbar
        onOpenOrder={handleOpenOrder}
        onOpenMenu={() => { trackDemoEvent('view_menu'); setFullMenuOpen(true); }}
        cartCount={cartCount}
        currentLang={currentLang}
        onSelectLang={setCurrentLang}
      />

      <LandingScroll>
        <LandingPanel key="hero" name="hero">
          <HeroSection />
        </LandingPanel>
        <HeroSmokeTransition />
        <LandingPanel key="about" name="about">
          <AboutSection currentLang={currentLang} />
          <PatternRibbon variant="blue" />
        </LandingPanel>
        <LandingPanel key="menu" name="menu">
          <BurgerMenu
            currentLang={currentLang}
            storefrontCatalog={storefrontCatalog}
            onSelectBurger={handleSelectBurger}
            onOpenWholeMenu={() => { trackDemoEvent('view_menu'); setFullMenuOpen(true); }}
          />
        </LandingPanel>
        <LandingPanel key="locations" name="locations">
          <LocationsSection currentLang={currentLang} onSelectLocationForOrder={handleSelectLocationForOrder} />
        </LandingPanel>
        <LandingPanel key="careers" name="careers">
          <RecruitmentSection currentLang={currentLang} />
        </LandingPanel>
        <LandingPanel key="footer" name="footer">
          <Footer
            onOpenOrder={() => handleOpenOrder('takeaway')}
            onOpenLoyalty={() => setLoyaltyModalOpen(true)}
            currentLang={currentLang}
            onSelectLang={setCurrentLang}
          />
        </LandingPanel>
      </LandingScroll>

      {/* Cart & Ordering Drawer */}
      <PrivacyPreferences english={currentLang === 'EN'} suspended={orderDrawerOpen || fullMenuOpen || loyaltyModalOpen} />
      <OrderDrawer
        isOpen={orderDrawerOpen}
        onClose={() => setOrderDrawerOpen(false)}
        cart={cart}
        onTotalChange={setBagTotal}
        storefrontCatalog={storefrontCatalog}
        onUpdateCart={setCart}
        initialMode={orderDrawerMode}
        currentLang={currentLang}
        onOpen={() => setOrderDrawerOpen(true)}
        onBrowseMenu={() => setFullMenuOpen(true)}
      />

      {/* Full Menu Modal */}
      {fullMenuOpen && <Suspense fallback={<span className="sr-only" role="status">
        {currentLang === 'EN' ? 'Loading menu…' : 'Carregando cardápio…'}
      </span>}><FullMenuModal
        currentLang={currentLang}
        storefrontCatalog={storefrontCatalog}
        cart={cart}
        bagTotal={bagTotal}
        onChangeQuantity={(id, delta) => setCart(previous => previous.flatMap(line =>
          line.burger.id !== id ? [line] : line.quantity + delta <= 0 ? [] : [{ ...line, quantity: Math.min(99, line.quantity + delta) }]))}
        onOpenBag={() => setOrderDrawerOpen(true)}
        isOpen={fullMenuOpen}
        onClose={() => setFullMenuOpen(false)}
        onAddBurger={(burger) => {
          handleSelectBurger(burger, false);
        }}
      /></Suspense>}

      {/* Loyalty Stamp Card Modal */}
      <LoyaltyModal
        currentLang={currentLang}
        isOpen={loyaltyModalOpen}
        onClose={() => setLoyaltyModalOpen(false)}
      />
    </div>
  );
}
