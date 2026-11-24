import type { BurgerItem } from '../../utils/menu';

const labels: Partial<Record<BurgerItem['badgeType'], string>> = {
  smokehouse: 'DEFUMADO',
  chicken: 'FRANGO', onion: 'CROCANTE',
};

const englishLabels: typeof labels = { smokehouse: 'SMOKED', chicken: 'CHICKEN', onion: 'CRUNCHY' };

export function BurgerShowcaseBadge({ type, english = false }: { type: BurgerItem['badgeType']; english?: boolean }) {
  const label = (english ? englishLabels : labels)[type];
  if (!label) return null;
  return <span className={`tbh-showcase-badge tbh-showcase-badge--${type}`}>{label}</span>;
}
