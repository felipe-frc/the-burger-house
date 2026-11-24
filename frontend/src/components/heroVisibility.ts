/** Read-only visibility across the existing global overlap; never creates a pin. */
export function getHeroVisibility(element: HTMLElement) {
  const scene = element.closest<HTMLElement>('.tbh-hero-scroll-scene')!;
  const panel = scene.closest<HTMLElement>('[data-landing-panel]');
  const panels = [...(panel?.closest('.tbh-landing-scroll')?.querySelectorAll<HTMLElement>('[data-landing-panel]') ?? [])];
  const next = panels[panels.indexOf(panel!) + 1];
  return () => {
    const box = scene.getBoundingClientRect();
    if (box.bottom <= 0 || box.top >= innerHeight) return false;
    const header = document.querySelector('.tbh-navbar')?.getBoundingClientRect().bottom ?? 0;
    return !next || next.getBoundingClientRect().top > Math.max(header, box.top);
  };
}
