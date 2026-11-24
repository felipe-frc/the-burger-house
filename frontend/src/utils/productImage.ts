/** The curated storefront product photos have matching transparent WebP derivatives. */
export function productImage(src: string, sizes: string, uploadedImage?: string | null) {
  if (uploadedImage) return { src: uploadedImage };
  const stem = src.replace(/(?:-384|-768)?\.webp$/, '');
  return { src: `${stem}-384.webp`, srcSet: `${stem}-384.webp 384w, ${stem}-768.webp 768w`, sizes };
}

/** Transparent padding bounds of the approved photos, with a two-percent safety margin. */
const productViewBoxes: Record<string, string> = {
  "agua-gas": "inset(1.84% 17.79% 3.12% 17.53%)",
  "agua-mineral": "inset(1.95% 17.79% 3.02% 17.92%)",
  "chicken-tenders": "inset(17.92% 12.58% 17.72% 12.32%)",
  "classic-fries": "inset(13.62% 29.77% 13.62% 29.51%)",
  "coca-cola": "inset(3.20% 24.30% 3.85% 24.30%)",
  "coca-zero": "inset(3.46% 24.30% 3.46% 24.30%)",
  "crispy-cheddar": "inset(2.39% 0.00% 0.00% 0.00%)",
  "double-smash": "inset(2.00% 0.00% 0.00% 0.47%)",
  "loaded-fries": "inset(17.92% 14.40% 17.92% 14.40%)",
  "o-praiano": "inset(0.00% 0.00% 0.00% 0.00%)",
  "onion-crunch": "inset(0.60% 0.00% 1.02% 0.00%)",
  "smokehouse-bbq": "inset(0.00% 0.00% 0.00% 0.00%)",
  "strawberry-soda": "inset(0.00% 25.73% 5.16% 25.86%)",
  "suco-laranja": "inset(0.00% 25.99% 5.01% 26.12%)",
  "the-classic": "inset(6.26% 0.08% 0.29% 0.00%)"
};

export function productViewBox(src: string, uploadedImage?: string | null) {
  if (uploadedImage) return 'none';
  const name = src.split('/').pop()?.replace(/(?:-384|-768)?\.webp$/, '') ?? '';
  return productViewBoxes[name] ?? 'none';
}
