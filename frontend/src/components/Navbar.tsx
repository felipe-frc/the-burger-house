import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ShoppingBag, Menu, ArrowUpRight, ChevronDown } from 'lucide-react';
import './Navbar.css';
import { scrollToLandingSection } from '../utils/landingNavigation';

interface NavbarProps {
  onOpenOrder: (mode?: 'takeaway' | 'delivery') => void;
  onOpenMenu: () => void;
  cartCount: number;
  currentLang: string;
  onSelectLang: (lang: string) => void;
}
const destinations = [
  { id: 'about', pt: 'Sobre nós', en: 'Our story' },
  { id: 'menu', pt: 'Cardápio', en: 'Our menu' },
  { id: 'locations', pt: 'Unidade', en: 'Location' },
];
const languages = [
  { code: 'PT', label: 'Português', flag: '/assets/flags/br.svg' },
  { code: 'EN', label: 'English', flag: '/assets/flags/us.svg' },
];
function RollingLabel({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const label = ref.current;
    const control = label?.closest('a,button');
    if (!label || !control || !window.matchMedia('(hover:hover) and (pointer:fine)').matches) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const context = gsap.context(() => {}, label);
    const enter = () => { if (!media.matches) context.add(() => gsap.to('.tbh-nav-letter-inner', {
      yPercent: -100, duration: 0.5, stagger: 0.01, ease: 'back.inOut(2)', overwrite: true,
    })); };
    const leave = () => context.add(() => gsap.to('.tbh-nav-letter-inner', {
      yPercent: 0, duration: media.matches ? 0 : 0.4, stagger: { each: 0.01, from: 'end' }, ease: 'back.inOut(2)', overwrite: true,
    }));
    control.addEventListener('pointerenter', enter);
    control.addEventListener('pointerleave', leave);
    return () => { control.removeEventListener('pointerenter', enter); control.removeEventListener('pointerleave', leave); context.revert(); };
  }, [children]);
  return <span ref={ref} className="tbh-nav-label"><span className="tbh-nav-accessible-label">{children}</span>
    {Array.from(children).map((letter, index) => <span className="tbh-nav-letter" aria-hidden="true" key={index}>
      <span className="tbh-nav-letter-inner"><span>{letter === ' ' ? '\u00a0' : letter}</span><span>{letter === ' ' ? '\u00a0' : letter}</span></span>
    </span>)}
  </span>;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenOrder, onOpenMenu, cartCount, currentLang, onSelectLang }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const languageRef = useRef<HTMLDivElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const nextAction = useRef<(() => void) | null>(null);
  const english = currentLang === 'EN';

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  useEffect(() => {
    if (!languageOpen) return;
    const outside = (event: PointerEvent) => {
      if (!languageRef.current?.contains(event.target as Node)) setLanguageOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setLanguageOpen(false); languageButtonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [languageOpen]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (menuOpen && !dialog.open) dialog.showModal();
    if (!dialog.open) return;
    const context = gsap.context(() => {
      if (menuOpen) {
        gsap.fromTo('.tbh-nav-dialog-sheet', { yPercent: reduced ? 0 : -8, opacity: 0 }, {
          yPercent: 0, opacity: 1, duration: reduced ? 0 : 0.25, ease: 'power3.out',
        });
        gsap.fromTo('.tbh-nav-mobile-link', { yPercent: reduced ? 0 : 65, opacity: 0 }, {
          yPercent: 0, opacity: 1, duration: reduced ? 0 : 0.25, stagger: reduced ? 0 : 0.035, ease: 'power3.out',
        });
      } else {
        gsap.to('.tbh-nav-dialog-sheet', {
          yPercent: reduced ? 0 : -8, opacity: 0, duration: reduced ? 0 : 0.2, ease: 'power3.out',
          onComplete: () => {
            dialog.close(); triggerRef.current?.focus({ preventScroll: true });
            const action = nextAction.current; nextAction.current = null; action?.();
          },
        });
      }
    }, dialog);
    return () => context.revert();
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => { document.body.style.overflow = previousOverflow; desktop.removeEventListener('change', closeOnDesktop); };
  }, [menuOpen]);
  useEffect(() => () => { dialogRef.current?.close(); }, []);

  const afterClosingMenu = (action: () => void) => {
    if (menuOpen) { nextAction.current = action; setMenuOpen(false); } else action();
  };
  const navigate = (id: string) => afterClosingMenu(() => {
    scrollToLandingSection(id, true);
  });
  const selectLanguage = (code: string) => {
    onSelectLang(code); setLanguageOpen(false); languageButtonRef.current?.focus();
  };

  return <>
    <header className={`tbh-navbar${scrolled ? ' is-scrolled' : ''}`}>
      <div className="tbh-navbar-inner">
        <nav className="tbh-nav-desktop" aria-label={english ? 'Main navigation' : 'Navegação principal'}>
          {destinations.map(item => <a key={item.id} className="tbh-nav-link" href={`#${item.id}`} onClick={event => { event.preventDefault(); navigate(item.id); }}>
            <RollingLabel>{english ? item.en : item.pt}</RollingLabel>
          </a>)}
        </nav>
        <button ref={triggerRef} className="tbh-nav-menu-toggle" type="button" aria-label={english ? 'Open navigation' : 'Abrir navegação'}
          aria-controls="tbh-navigation-dialog" aria-expanded={menuOpen} onClick={() => { setLanguageOpen(false); setMenuOpen(true); }}>
          <Menu aria-hidden="true" size={24} /><span>MENU</span>
        </button>
        <a href="#" className="tbh-nav-logo" aria-label="The Burger House — início" onClick={event => {
          event.preventDefault(); window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        }}><img src="/assets/branding/the-burger-house-logo-440.webp" alt="The Burger House" width="220" height="96" decoding="async" /></a>
        <div className="tbh-nav-actions">
          <div className="tbh-nav-language" ref={languageRef}>
            <button ref={languageButtonRef} className="tbh-nav-language-trigger" type="button" aria-expanded={languageOpen} aria-controls="tbh-language-options"
              aria-label={english ? 'Choose language, English selected' : 'Selecionar idioma, Português selecionado'} onClick={() => setLanguageOpen(value => !value)}>
              <img src={english ? languages[1].flag : languages[0].flag} alt="" width="20" height="14" /><span>{english ? 'EN' : 'PT'}</span><ChevronDown size={13} aria-hidden="true" />
            </button>
            {languageOpen && <div id="tbh-language-options" className="tbh-nav-language-options" role="group" aria-label="Idioma / Language">
              {languages.map(language => <button key={language.code} type="button" aria-pressed={currentLang === language.code} onClick={() => selectLanguage(language.code)}>
                <img src={language.flag} alt="" width="22" height="16" />{language.label}
              </button>)}
            </div>}
          </div>
          <button className="tbh-nav-order" type="button" onClick={event => {
            event.currentTarget.focus({ preventScroll: true });
            onOpenMenu();
          }}><span>{english ? 'ORDER NOW' : 'PEDIR AGORA'}</span><ArrowUpRight size={18} aria-hidden="true" /></button>
          <button className="tbh-nav-cart" type="button" onClick={event => {
            event.currentTarget.focus({ preventScroll: true });
            onOpenOrder('takeaway');
          }} aria-label={english ? `Open bag, ${cartCount} items` : `Ver sacola de pedidos, ${cartCount} itens`}>
            <ShoppingBag size={22} aria-hidden="true" /><span className="tbh-nav-cart-count">{cartCount}</span>
          </button>
        </div>
      </div>
    </header>
    <dialog ref={dialogRef} id="tbh-navigation-dialog" className="tbh-nav-dialog" aria-labelledby="tbh-nav-dialog-title"
      onCancel={event => { event.preventDefault(); setMenuOpen(false); }}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]'))
          .filter(element => element.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div className="tbh-nav-dialog-sheet">
        <div className="tbh-nav-dialog-heading"><span id="tbh-nav-dialog-title" className="tbh-nav-accessible-label">THE BURGER HOUSE — MENU</span>
          <button type="button" className="tbh-nav-close" aria-label={english ? 'Close navigation' : 'Fechar navegação'} onClick={() => setMenuOpen(false)}>{english ? 'CLOSE' : 'FECHAR'}</button>
          <img className="tbh-nav-dialog-logo" src="/assets/branding/the-burger-house-logo-440.webp" width="137" height="59" alt="The Burger House" />
          <button type="button" className="tbh-nav-dialog-bag" aria-label={english ? 'Open bag' : 'Abrir sacola'} onClick={() => afterClosingMenu(() => onOpenOrder('takeaway'))}><ShoppingBag size={24} aria-hidden="true" /></button>
        </div>
        <nav aria-label={english ? 'Mobile navigation' : 'Navegação mobile'} className="tbh-nav-mobile-links">
          <a href="#" className="tbh-nav-mobile-link" onClick={event => { event.preventDefault(); afterClosingMenu(() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })); }}>{english ? 'HOME' : 'INÍCIO'}</a>
          {[destinations[1], destinations[0], destinations[2]].map(item => <a key={item.id} href={`#${item.id}`} className={`tbh-nav-mobile-link${item.id === 'menu' ? ' is-menu' : ''}`} onClick={event => { event.preventDefault(); navigate(item.id); }}>
            {english ? item.en : item.pt}<ArrowUpRight aria-hidden="true" />
          </a>)}
          <a href="#carreiras" className="tbh-nav-mobile-link tbh-nav-careers" onClick={event => { event.preventDefault(); navigate('carreiras'); }}>{english ? 'Join our team' : 'Trabalhe conosco'}<ArrowUpRight aria-hidden="true" /></a>
        </nav>
        <button className="tbh-nav-mobile-order tbh-nav-mobile-link" type="button" onClick={() => afterClosingMenu(onOpenMenu)}>{english ? 'FULL MENU' : 'CARDÁPIO COMPLETO'}<ArrowUpRight aria-hidden="true" /></button>
        <div className="tbh-nav-dialog-bottom"><span>GOOD FOOD. GOOD TIMES.</span><div role="group" aria-label="Idioma / Language">
          {languages.map(language => <button key={language.code} type="button" aria-pressed={currentLang === language.code} onClick={() => onSelectLang(language.code)}>{language.code}</button>)}
        </div></div>
      </div>
    </dialog>
  </>;
};
