/** Pixel-space contour: the shoulder blends into a concave pocket around the arrow.
 * Only the straight spans grow; neither the pocket nor the corner radii stretch. */
export function metallicKpiPath(width: number, height: number, inset = 2) {
  const w = Math.max(110, width), h = Math.max(110, height);
  const r = 16;
  return `M ${inset + r} ${inset} H ${w - 74 - inset}
    C ${w - 61 - inset} ${inset} ${w - 59 - inset} ${10 + inset} ${w - 54 - inset} ${21 + inset}
    C ${w - 49 - inset} ${32 + inset} ${w - 43 - inset} ${37 + inset} ${w - 28 - inset} ${37 + inset}
    H ${w - r - inset} Q ${w - inset} ${37 + inset} ${w - inset} ${53 + inset}
    V ${h - r - inset} Q ${w - inset} ${h - inset} ${w - r - inset} ${h - inset}
    H ${r + inset} Q ${inset} ${h - inset} ${inset} ${h - r - inset}
    V ${r + inset} Q ${inset} ${inset} ${r + inset} ${inset} Z`;
}
