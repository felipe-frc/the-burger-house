import React from 'react';

interface CurrencyValueProps {
  value: number | null | undefined;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'kpi';
  showSign?: boolean;
}

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatBRL = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'R$\u00A00,00';
  }
  // Intl.NumberFormat pt-BR outputs "R$ 1.234,56" with a regular or NBSP space;
  // enforce non-breaking space between R$ and digits so the symbol never breaks onto its own line.
  return brlFormatter.format(value).replace(/\s+/g, '\u00A0');
};

export const CurrencyValue: React.FC<CurrencyValueProps> = ({
  value,
  className = '',
  size = 'md',
  showSign = false,
}) => {
  const safeVal = typeof value === 'number' && !Number.isNaN(value) ? value : 0;
  const formatted = formatBRL(Math.abs(safeVal));
  const prefix = safeVal < 0 ? '-' : showSign && safeVal > 0 ? '+' : '';

  const fullLength = formatted.length + prefix.length;

  const getResponsiveSizeClass = () => {
    switch (size) {
      case 'xs':
        return 'text-xs';
      case 'sm':
        return 'text-sm';
      case 'md':
        return 'text-base';
      case 'lg':
        return fullLength >= 14
          ? 'text-[clamp(0.95rem,1.25vw,1.15rem)]'
          : 'text-[clamp(1.05rem,1.5vw,1.32rem)]';
      case 'xl':
        if (fullLength >= 15) return 'text-[clamp(1.05rem,1.45vw,1.42rem)] leading-tight';
        if (fullLength >= 12) return 'text-[clamp(1.15rem,1.7vw,1.58rem)] leading-tight';
        return 'text-[clamp(1.25rem,1.95vw,1.75rem)] leading-tight';
      case 'kpi':
        if (fullLength >= 15) return 'text-[clamp(0.92rem,1.2vw,1.32rem)] leading-tight';
        if (fullLength >= 12) return 'text-[clamp(1.02rem,1.42vw,1.48rem)] leading-tight';
        return 'text-[clamp(1.15rem,1.75vw,1.7rem)] leading-tight';
    }
  };

  return (
    <span
      className={`inline-block whitespace-nowrap tabular-nums min-w-0 max-w-full ${getResponsiveSizeClass()} ${className}`}
      title={`${prefix}${formatted}`}
    >
      {prefix}
      {formatted}
    </span>
  );
};
