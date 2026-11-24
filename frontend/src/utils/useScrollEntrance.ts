import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { afterFirstPaint } from './afterFirstPaint';


const effects = {
  photo: {
    selector: '.ag-panel',
    // Match CSSOM's two-value serialization so both vertical edges interpolate.
    from: { clipPath: 'inset(9% 0%)' },
    to: { clipPath: 'inset(0% 0%)', clearProps: 'clipPath' },
    duration: 0.6,
    stagger: 0.1,
  },
  burger: {
    selector: '.tbh-showcase-item',
    from: { y: 16 },
    to: { y: 0, clearProps: 'transform' },
    duration: 0.45,
    stagger: 0.075,
  },
};

export function useScrollEntrance(kind: keyof typeof effects) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(new WeakSet<HTMLElement>());

  useEffect(() => {
    const scope = ref.current;
    if (!scope || (kind === 'photo' && !window.CSS?.supports('clip-path', 'inset(0)'))) return;
    const effect = effects[kind];
    const media = gsap.matchMedia();

    const cancel = afterFirstPaint(() => media.add('(prefers-reduced-motion: no-preference)', context => {
      gsap.registerPlugin(ScrollTrigger);
      const targets = new Map<Element, HTMLElement>();
      const playing = new Map<HTMLElement, gsap.core.Tween>();
      for (const trigger of scope.querySelectorAll<HTMLElement>(effect.selector)) {
        const target = kind === 'photo'
          ? trigger.querySelector<HTMLElement>('.ag-photo-reveal') ?? trigger.querySelector('img')
          : trigger;
        if (!target || seen.current.has(target) || trigger.getClientRects().length === 0) continue;
        if (trigger.getBoundingClientRect().top < window.innerHeight) {
          // Keep content visible on initial load, including restored scroll positions.
          seen.current.add(target);
        } else {
          targets.set(trigger, target);
        }
      }
      if (!targets.size) return;

      const play = (triggers: Element[]) => context.add(() => {
        const entries = triggers.flatMap(trigger => {
          const target = targets.get(trigger);
          return target && !seen.current.has(target) ? [{ target, rect: trigger.getBoundingClientRect() }] : [];
        }).sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

        let rowTop = -Infinity;
        let column = 0;
        for (const { target, rect } of entries) {
          seen.current.add(target);
          if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
            gsap.set(target, { clearProps: effect.to.clearProps });
            continue;
          }
          if (rect.top - rowTop > 6) {
            rowTop = rect.top;
            column = 0;
          }
          playing.set(target, gsap.to(target, {
            ...effect.to,
            delay: column++ * effect.stagger,
            duration: effect.duration,
            ease: 'power2.out',
            onComplete: () => { playing.delete(target); },
          }));
        }
      });
      ScrollTrigger.batch([...targets.keys()], {
        start: 'top 85%',
        once: true,
        interval: 0.032,
        onEnter: play,
      });
      gsap.set([...targets.values()], effect.from);

      const showFocused = (event: FocusEvent) => context.add(() => {
        const trigger = event.target instanceof Element ? event.target.closest<HTMLElement>(effect.selector) : null;
        const target = trigger && targets.get(trigger);
        if (!target) return;
        const tween = playing.get(target);
        if (tween) tween.progress(1);
        else if (!seen.current.has(target)) gsap.set(target, { clearProps: effect.to.clearProps });
        seen.current.add(target);
      });
      scope.addEventListener('focusin', showFocused);
      const observer = new ResizeObserver(() => ScrollTrigger.refresh(true));
      observer.observe(scope);
      const section = scope.closest('section');
      if (section) observer.observe(section);

      return () => {
        scope.removeEventListener('focusin', showFocused);
        observer.disconnect();
      };
    }));
    return () => { cancel(); media.revert(); };
  }, [kind]);

  return ref;
}
