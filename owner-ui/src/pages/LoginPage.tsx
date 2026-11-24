import React, { useEffect, useRef } from 'react';
import { CheckCircle2, Moon, Sun } from 'lucide-react';
import { BrandIdentity } from '../components/common/BrandIdentity';
import { LoginForm } from '../components/auth/LoginForm';

interface LoginPageProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onEnterDemo: () => void;
  focusOnMount?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  isDarkMode,
  onToggleDarkMode,
  onEnterDemo,
  focusOnMount = false,
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusOnMount) {
      headingRef.current?.focus();
    }
  }, [focusOnMount]);

  return (
    <div className="min-h-dvh flex flex-col justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <header className="w-full max-w-6xl mx-auto flex items-center justify-between gap-3 shrink-0">
        <div
          title="Acesso protegido pela sessão Owner no servidor."
          className="owner-status" data-tone="teal"
        >
          <CheckCircle2
            size={13}
            aria-hidden="true"
            className="text-emerald-600 dark:text-emerald-400 shrink-0"
          />
          <span>Acesso Owner</span>
        </div>

        <button
          type="button"
          onClick={onToggleDarkMode}
          aria-label={isDarkMode ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
          className="owner-button"
        >
          {isDarkMode ? (
            <>
              <Sun size={14} aria-hidden="true" className="text-amber-400" />
              <span>Tema escuro</span>
            </>
          ) : (
            <>
              <Moon size={14} aria-hidden="true" className="text-slate-700" />
              <span>Tema claro</span>
            </>
          )}
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center py-1 sm:py-2 min-h-0">
        <div className="mb-4 sm:mb-5 flex justify-center">
          <BrandIdentity variant="login" />
        </div>

        <section
          aria-labelledby="login-heading"
          className="owner-panel w-full max-w-[520px] p-6 sm:p-8"
        >
          <div className="text-center mb-6 sm:mb-7">
            <h1 id="login-heading" ref={headingRef} tabIndex={-1} className="owner-title">
              Acesso do proprietário
            </h1>
            <p className="owner-muted mt-2 text-sm">
              Entre para gerenciar os pedidos e a operação da loja.
            </p>
          </div>
          <LoginForm
            onSuccessDemoEnter={onEnterDemo}
            emailInputRef={emailInputRef}
          />
        </section>
      </main>

      <footer className="w-full max-w-6xl mx-auto text-center shrink-0">
        <p className="owner-muted text-xs">
          THE BURGER HOUSE · BALNEÁRIO CAMBORIÚ — SC · PAINEL ADMINISTRATIVO
        </p>
      </footer>
    </div>
  );
};
