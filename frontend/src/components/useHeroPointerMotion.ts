import { useEffect, type RefObject } from 'react';
import gsap from 'gsap';

const reactions: Record<string, { x: number; y: number; rotation: number }> = {
  mascot: { x: 10, y: 8, rotation: 4 },
  'onion-1': { x: 8, y: 7, rotation: -3 },
  cheddar: { x: 5, y: 7, rotation: 2 },
  'pickle-2': { x: 6, y: 5, rotation: -2 },
  'fry-2': { x: 9, y: 9, rotation: 3 },
};

/** Local decorative feedback on an isolated layer; entrance, drift and scroll keep ownership. */
export function useHeroPointerMotion(root: RefObject<HTMLElement | null>, ready: boolean) {
  useEffect(() => {
    const scene = root.current;
    if (!scene || !ready) return;
    const media = gsap.matchMedia();
    media.add('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
      let frame = 0;
      let pointer: { x: number; y: number } | null = null;
      let visible = true;
      const context = gsap.context(() => {}, scene);
      const targets = [...scene.querySelectorAll<HTMLElement>('[data-hero-reaction]')].map(host => {
        const layer = host.querySelector<HTMLElement>('.tbh-cursor-reaction')!;
        const settings = reactions[host.dataset.heroReaction!]!;
        return context.add(() => ({
          host, settings,
          x: gsap.quickTo(layer, 'x', { duration: .5, ease: 'power3.out' }),
          y: gsap.quickTo(layer, 'y', { duration: .5, ease: 'power3.out' }),
          rotation: gsap.quickTo(layer, 'rotation', { duration: .5, ease: 'power3.out' }),
          previous: { x: 0, y: 0, rotation: 0 },
        }));
      });
      const update = () => {
        frame = 0;
        // Read all geometry before queuing transforms: no layout writes in the pointer path.
        const bounds = targets.map(({ host }) => host.getBoundingClientRect());
        const sceneBounds = scene.getBoundingClientRect();
        targets.forEach((target, index) => {
          const box = bounds[index];
          const nearby = pointer && visible && !document.hidden && box.width > 0 && box.height > 0
            && pointer.x >= box.left - 24 && pointer.x <= box.right + 24
            && pointer.y >= box.top - 24 && pointer.y <= box.bottom + 24;
          const x = nearby ? gsap.utils.clamp(-1, 1, (pointer!.x - box.left - box.width / 2) / (box.width / 2)) : 0;
          const y = nearby ? gsap.utils.clamp(-1, 1, (pointer!.y - box.top - box.height / 2) / (box.height / 2)) : 0;
          let offsetY = y * target.settings.y;
          let rotation = x * target.settings.rotation;
          if (nearby && target.host.dataset.heroReaction === 'mascot' && box.bottom >= sceneBounds.bottom - 16) {
            // The approved pose already sits at the stage floor. Reserve room for
            // rotation instead of pushing a shoe below the original frame.
            rotation = gsap.utils.clamp(-1.6, 1.6, rotation);
            const angle = Math.abs(rotation) * Math.PI / 180;
            const extraBottom = Math.sin(angle) * box.width / 2
              + (Math.cos(angle) - 1) * box.height * .35; // CSS origin is 65%.
            offsetY = Math.min(offsetY, -Math.max(0, extraBottom));
          }
          const offsetX = x * target.settings.x;
          // Leave neutral ingredients completely idle; do not restart 15 tweens
          // on every pointer event when only one decorative element is nearby.
          if (offsetX !== target.previous.x) target.x(offsetX);
          if (offsetY !== target.previous.y) target.y(offsetY);
          if (rotation !== target.previous.rotation) target.rotation(rotation);
          target.previous = { x: offsetX, y: offsetY, rotation };
        });
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
      const move = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse') return;
        pointer = { x: event.clientX, y: event.clientY }; schedule();
      };
      const reset = () => { pointer = null; schedule(); };
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting; if (!visible) reset();
      });
      observer.observe(scene);
      scene.addEventListener('pointermove', move, { passive: true });
      scene.addEventListener('pointerleave', reset);
      window.addEventListener('blur', reset);
      document.addEventListener('visibilitychange', reset);
      return () => {
        cancelAnimationFrame(frame); observer.disconnect();
        scene.removeEventListener('pointermove', move); scene.removeEventListener('pointerleave', reset);
        window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', reset);
        context.revert();
      };
    });
    return () => media.revert();
  }, [root, ready]);
}
