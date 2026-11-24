import { type ReactNode, useEffect } from 'react';
import { scrollToLandingSection } from '../utils/landingNavigation';

export function LandingPanel({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <div data-landing-panel={name}>
      <div data-landing-content>{children}</div>
    </div>
  );
}

export function LandingScroll({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => {
    let frame = 0;

    const navigateHash = () => {
      let id: string;

      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }

      if (id && document.getElementById(id)) {
        scrollToLandingSection(id);
      }
    };

    const followFragment = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>('a[href^="#"]');
      if (!anchor || anchor.target === '_blank') return;

      const root = document.querySelector('.tbh-landing-scroll');
      if (!root?.contains(anchor)) return;

      let id: string;
      try {
        id = decodeURIComponent(anchor.hash.slice(1));
      } catch {
        return;
      }

      if (!id || !document.getElementById(id)) return;

      event.preventDefault();
      scrollToLandingSection(id, true);
    };

    window.addEventListener('hashchange', navigateHash);
    document.addEventListener('click', followFragment);

    void document.fonts.ready.then(() => {
      frame = requestAnimationFrame(navigateHash);
    });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', navigateHash);
      document.removeEventListener('click', followFragment);
    };
  }, []);

  return (
    <main id="main-content" tabIndex={-1} className="tbh-landing-scroll flex-1">
      {children}
    </main>
  );
}
