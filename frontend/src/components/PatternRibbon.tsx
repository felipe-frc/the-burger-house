import React from 'react';

export const PatternRibbon: React.FC<{ variant?: 'blue' | 'light' }> = () => {
  const items = [
    'GOOD FOOD GOOD TIMES.',
    '✦',
    'THE BURGER HOUSE',
    '✦',
    'GOOD FOOD GOOD TIMES.',
    '✦',
    'GOOD FOOD GOOD TIMES.',
    '✦',
    'GOOD FOOD GOOD TIMES.',
    '✦',
  ];

  return (
    <div data-tbh-marquee="true"
      className="w-full overflow-hidden h-14 sm:h-16 bg-[var(--tbh-coral)] border-y-2 border-[#FFDC32]/40 select-none relative flex items-center"
      aria-hidden="true"
    >
      <div className="flex whitespace-nowrap animate-marquee">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-6 sm:gap-8 mx-3 sm:mx-4">
            {items.map((text, idx) => (
              <span
                key={idx}
                className={`font-display text-base sm:text-xl tracking-widest uppercase ${
                  text === '✦'
                    ? 'text-[#FFDC32] text-sm'
                    : 'text-[var(--tbh-porcelain)]'
                }`}
              >
                {text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
