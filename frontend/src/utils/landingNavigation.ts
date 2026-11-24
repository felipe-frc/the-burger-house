export function scrollToLandingSection(id: string, focus = false): void {
  const target = document.getElementById(id);
  if (!target) return;

  const header = document.querySelector<HTMLElement>('.tbh-navbar');
  const headerHeight = header ? header.offsetHeight + header.offsetTop : 0;

  const targetTop =
    target.getBoundingClientRect().top + window.scrollY;

  const destination = Math.max(0, targetTop - headerHeight - 12);

  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  if (focus) {
    const heading = target.querySelector<HTMLElement>('h1, h2') ?? target;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  window.scrollTo({
    top: destination,
    behavior: reducedMotion ? 'instant' : 'smooth',
  });
}
