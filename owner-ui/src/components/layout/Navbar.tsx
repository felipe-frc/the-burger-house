import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Search,
  Bell,
  Sun,
  Moon,
  CalendarDays,
  History,
  LogOut,
  ChevronDown,
  User,
} from 'lucide-react';
import type { NavModule } from './Sidebar';
import { OFFICIAL_LOGO_SRC } from '../common/BrandIdentity';

interface NavbarProps {
  modulePaths: Record<NavModule, string>;
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
  onOpenSearch: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  unreadCount: number;
  onOpenNotifications: () => void;
  onNavigateToModule: (module: NavModule) => void;
  onOpenAgenda: () => void;
  onOpenAudit: () => void;
  onLogoutDemo: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  modulePaths,
  onToggleSidebar,
  isSidebarOpen,
  onOpenSearch,
  isDarkMode,
  onToggleDarkMode,
  unreadCount,
  onOpenNotifications,
  onNavigateToModule,
  onOpenAgenda,
  onOpenAudit,
  onLogoutDemo,
}) => {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);

  function navigate(event: React.MouseEvent<HTMLAnchorElement>, module: NavModule) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigateToModule(module);
  }

  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProfileMenuOpen(false);
        profileButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isProfileMenuOpen]);

  return (
    <header className="owner-toolbar">
      <div className="owner-navbar">
        <div className="owner-navbar-leading">
          <button type="button" onClick={onToggleSidebar} className="owner-icon-button owner-drawer-open" aria-label="Abrir menu lateral"
            aria-controls="owner-sidebar" aria-expanded={isSidebarOpen}>
            <Menu size={19} aria-hidden="true" />
          </button>
          <a className="owner-navbar-brand" href={`/admin/${modulePaths.overview}`} aria-label="The Burger House · Visão Geral"
            onClick={event => navigate(event, 'overview')}>
            <img src={OFFICIAL_LOGO_SRC} width={34} height={34} alt="" />
            <span>The Burger House</span>
          </a>
        </div>

        <div className="owner-navbar-actions">
          <div className="owner-navbar-tools">
            <button type="button" onClick={onOpenSearch} className="owner-icon-button" aria-label="Busca global (Ctrl + K)" title="Busca global (Ctrl + K)">
              <Search size={16} aria-hidden="true" />
            </button>
            <button type="button" className="owner-icon-button" onClick={onOpenAgenda} aria-label="Abrir agenda" title="Agenda">
              <CalendarDays size={17} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onToggleDarkMode}
              className="owner-icon-button"
              title={isDarkMode ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
              aria-label={isDarkMode ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
            >
              {isDarkMode ? (
                <Sun size={17} aria-hidden="true" />
              ) : (
                <Moon size={17} aria-hidden="true" />
              )}
            </button>

            {/* Notification Button */}
            <button
              type="button"
              onClick={onOpenNotifications}
              className="owner-icon-button relative"
              aria-label={`Notificações${unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}`}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[8px] h-2 rounded-full bg-[#E85D4A] ring-2 ring-white dark:ring-slate-900" />
              )}
            </button>

          </div>
          <div className="relative" ref={profileRef}>
            <button
              ref={profileButtonRef}
              type="button"
              onClick={() => setIsProfileMenuOpen((v) => !v)}
              aria-expanded={isProfileMenuOpen}
              aria-haspopup="menu"
              aria-label="Menu do proprietário"
              className="owner-icon-button owner-navbar-profile"
            >
              <span className="owner-profile-avatar"><User size={16} aria-hidden="true" /></span>
              <span className="owner-profile-label">Proprietário</span>
              <ChevronDown size={14} className="text-slate-500 dark:text-slate-400 hidden sm:block" />
            </button>

            {isProfileMenuOpen && (
              <div
                role="menu"
                aria-label="Menu do proprietário"
                onKeyDown={event => {
                  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                  const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
                  if (!items.length) return;
                  const index = items.indexOf(document.activeElement as HTMLButtonElement);
                  event.preventDefault();
                  items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
                }}
                className="owner-profile-menu owner-dialog-surface"
              >
                <div className="px-3 py-2 border-b border-slate-900/10 dark:border-white/10">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    Proprietário
                  </p>
                  <p className="owner-muted text-xs">The Burger House</p>
                </div>
                <div className="py-1.5 space-y-1">
                  <button type="button" role="menuitem" className="owner-button w-full justify-start"
                    onClick={() => { profileButtonRef.current?.focus(); setIsProfileMenuOpen(false); onOpenAudit(); }}>
                    <History size={15} aria-hidden="true" /> Histórico de auditoria
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      onNavigateToModule('settings');
                    }}
                    className="owner-button w-full justify-start"
                  >
                    <User size={14} />
                    <span>Perfil e Configurações</span>
                  </button>
                </div>
                <div className="pt-1 border-t border-slate-900/10 dark:border-white/10">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      onLogoutDemo();
                    }}
                    className="owner-button owner-button-critical w-full justify-start"
                  >
                    <LogOut size={14} />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
