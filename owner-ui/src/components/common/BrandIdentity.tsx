import React from 'react';

export const OFFICIAL_LOGO_SRC = import.meta.env.BASE_URL + 'assets/aistudio/the-burger-house-logo_4f1b711f.webp';

interface BrandIdentityProps {
  variant?: 'sidebar' | 'login';
  isCollapsed?: boolean;
  subtitle?: string;
  className?: string;
}

export const BrandIdentity: React.FC<BrandIdentityProps> = ({
  variant = 'sidebar',
  isCollapsed = false,
  subtitle = 'Painel administrativo',
  className = '',
}) => {
  if (variant === 'login') {
    return (
      <div className={`inline-flex items-center gap-3.5 select-none ${className}`}>
        <div className="w-12 h-12 sm:w-[52px] sm:h-[52px] shrink-0 flex items-center justify-center rounded-2xl dark:bg-slate-800 dark:p-1 dark:ring-1 dark:ring-white/35 transition-colors">
          <img
            src={OFFICIAL_LOGO_SRC}
            alt="Logo oficial The Burger House"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="text-left min-w-0">
          <span className="block text-[18px] sm:text-[19px] font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
            Owner
          </span>
          <span className="block text-[11.5px] font-medium tracking-[0.04em] text-slate-600 dark:text-slate-300 mt-0.5">
            {subtitle}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2.5 min-w-0 ${
        isCollapsed ? 'lg:mx-auto' : ''
      } ${className}`}
    >
      <div
        className={`${
          isCollapsed ? 'w-9 h-9' : 'w-11 h-11'
        } shrink-0 flex items-center justify-center rounded-xl dark:bg-slate-800 dark:p-1 dark:ring-1 dark:ring-white/25 transition-all`}
      >
        <img
          src={OFFICIAL_LOGO_SRC}
          alt="Logo oficial The Burger House"
          className="w-full h-full object-contain"
        />
      </div>
      {!isCollapsed && (
        <div className="min-w-0">
          <p className="owner-sidebar-wordmark">The Burger House</p>
          <p className="text-[11px] font-['Barlow_Condensed'] font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-200 leading-tight truncate">
            {subtitle}
          </p>
        </div>
      )}
    </div>
  );
};
