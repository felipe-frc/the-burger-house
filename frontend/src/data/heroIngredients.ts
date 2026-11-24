/** Hero-only art direction. Positions are percentages within the side rail. */
export interface HeroIngredient {
  id: string; type: string; side: 'left' | 'right'; asset: string;
  desktop: { width: number; x: number; y: number };
  tablet: { width: number; x: number; y: number };
  mobile: { visible: boolean; width: number; x: number; y: number };
  entry: { xPercent: number; yPercent: number; duration: number; delay: number };
  motion: { x: number; y: number; rotation: number; rotationX: number; rotationY: number; scale: number; duration: number; delay: number };
  depth: number; parallax: number;
}

export const HERO_INGREDIENTS: readonly HeroIngredient[] = [
  {
    id: 'onion-1', type: 'onion-rings', side: 'left', asset: 'onion-rings',
    desktop: { width: 168, x: 50, y: 25 }, tablet: { width: 92, x: 50, y: 24 },
    mobile: { visible: true, width: 44, x: 48, y: 23 },
    entry: { xPercent: -180, yPercent: 12, duration: .8, delay: 0 },
    motion: { x: 3, y: 7, rotation: 5, rotationX: 8, rotationY: 14, scale: .025, duration: 4.3, delay: 0 },
    depth: 8, parallax: 4,
  },
  {
    id: 'cheddar', type: 'cheddar', side: 'left', asset: 'cheddar',
    desktop: { width: 156, x: 50, y: 66 }, tablet: { width: 88, x: 50, y: 66 },
    mobile: { visible: false, width: 40, x: 48, y: 67 },
    entry: { xPercent: -180, yPercent: 6, duration: .9, delay: .14 },
    motion: { x: 2, y: 5, rotation: 3, rotationX: 0, rotationY: 0, scale: .012, duration: 4.6, delay: .27 },
    depth: 0, parallax: 2.5,
  },
  {
    id: 'pickle-2', type: 'pickles', side: 'right', asset: 'pickles',
    desktop: { width: 148, x: 50, y: 45 }, tablet: { width: 86, x: 50, y: 46 },
    mobile: { visible: true, width: 40, x: 52, y: 41 },
    entry: { xPercent: 180, yPercent: -6, duration: .8, delay: .07 },
    motion: { x: 2, y: 6, rotation: 4, rotationX: 0, rotationY: 0, scale: .02, duration: 3.7, delay: .14 },
    depth: 3, parallax: 3,
  },
  {
    id: 'fry-2', type: 'french-fries', side: 'right', asset: 'french-fries',
    desktop: { width: 164, x: 50, y: 81 }, tablet: { width: 92, x: 50, y: 80 },
    mobile: { visible: false, width: 40, x: 52, y: 80 },
    entry: { xPercent: 180, yPercent: -55, duration: .85, delay: .21 },
    motion: { x: 6, y: 10, rotation: 7, rotationX: 0, rotationY: 0, scale: .02, duration: 2.8, delay: .4 },
    depth: 5, parallax: 4.5,
  },
];
