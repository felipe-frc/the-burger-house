import { useEffect, useRef, type CSSProperties } from 'react';
import gsap from 'gsap';
import { HERO_INGREDIENTS, type HeroIngredient } from '../data/heroIngredients';
import { getHeroVisibility } from './heroVisibility';

function layoutStyle(ingredient: HeroIngredient): CSSProperties {
  return Object.fromEntries((['desktop', 'tablet', 'mobile'] as const).flatMap(breakpoint => {
    const value = ingredient[breakpoint];
    return [[`--${breakpoint}-width`, `${value.width}px`], [`--${breakpoint}-x`, `${value.x}%`], [`--${breakpoint}-y`, `${value.y}%`]];
  })) as CSSProperties;
}

export function HeroIngredients({ animationReady }: { animationReady: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !animationReady) return;
    const stage = element.closest<HTMLElement>('.tbh-hero-stage')!;
    const visible = getHeroVisibility(element);
    const media = gsap.matchMedia();
    media.add({ normal: '(prefers-reduced-motion: no-preference)', desktop: '(min-width: 992px)', tablet: '(min-width: 541px) and (max-width: 991px)', mobile: '(max-width: 540px)' }, scope => {
      if (!scope.conditions?.normal) return;
      const desktop = scope.conditions.desktop;
      const amplitude = desktop ? 1 : scope.conditions.tablet ? .55 : .3;
      const nodes = HERO_INGREDIENTS.map(ingredient => element.querySelector<HTMLElement>(`[data-ingredient="${ingredient.id}"]`)!);
      const floating: gsap.core.Tween[] = [], entrances: gsap.core.Tween[] = [];
      const setters: Array<{ x: ReturnType<typeof gsap.quickTo>; y: ReturnType<typeof gsap.quickTo> }> = [];
      let pointerX = 0, pointerY = 0, frame = 0;
      const fine = matchMedia('(hover: hover) and (pointer: fine)');
      const context = gsap.context(() => {
        HERO_INGREDIENTS.forEach((ingredient, index) => {
          const node = nodes[index], motion = ingredient.motion;
          const drift = node.querySelector<HTMLElement>('.tbh-ingredient-float')!;
          const parallax = node.querySelector<HTMLElement>('.tbh-ingredient-parallax')!;
          entrances.push(gsap.fromTo(node.querySelector('.tbh-ingredient-enter'), {
            xPercent: ingredient.entry.xPercent, yPercent: ingredient.entry.yPercent, autoAlpha: 0,
          }, { xPercent: 0, yPercent: 0, autoAlpha: 1, duration: ingredient.entry.duration, delay: .15 + ingredient.entry.delay, ease: 'power3.out' }));
          floating.push(gsap.fromTo(drift, {
            x: -motion.x * amplitude, y: -motion.y * amplitude, rotation: -motion.rotation * amplitude,
            rotationX: -motion.rotationX * amplitude, rotationY: -motion.rotationY * amplitude,
            scale: 1, z: ingredient.depth, transformPerspective: 700,
          }, {
            x: motion.x * amplitude, y: motion.y * amplitude, rotation: motion.rotation * amplitude,
            rotationX: motion.rotationX * amplitude, rotationY: motion.rotationY * amplitude,
            scale: 1 + motion.scale * amplitude, duration: motion.duration,
            repeat: -1, yoyo: true, ease: 'sine.inOut', delay: .6 + motion.delay,
          }));
          setters.push({ x: gsap.quickTo(parallax, 'x', { duration: .7, ease: 'power3.out' }), y: gsap.quickTo(parallax, 'y', { duration: .7, ease: 'power3.out' }) });
        });
      }, element);
      const sync = () => {
        frame = 0;
        const active = visible() && !document.hidden;
        const progress = Math.max(0, Math.min(1, scrollY / Math.max(1, stage.offsetHeight)));
        nodes.forEach((node, index) => {
          const shown = active && getComputedStyle(node).display !== 'none';
          floating[index].paused(!shown); entrances[index].paused(!shown);
          if (shown) {
            const amount = HERO_INGREDIENTS[index].parallax;
            setters[index].x(desktop ? pointerX * amount : 0);
            setters[index].y((desktop ? pointerY * amount : 0) - progress * amount * amplitude);
          }
        });
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
      const move = (event: PointerEvent) => {
        if (!desktop || !fine.matches) return;
        const box = stage.getBoundingClientRect();
        pointerX = Math.max(-.5, Math.min(.5, (event.clientX - box.left) / box.width - .5));
        pointerY = Math.max(-.5, Math.min(.5, (event.clientY - box.top) / box.height - .5));
        schedule();
      };
      const leave = () => { pointerX = pointerY = 0; schedule(); };
      const observer = new IntersectionObserver(schedule); observer.observe(stage);
      stage.addEventListener('pointermove', move); stage.addEventListener('pointerleave', leave);
      window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', schedule);
      document.addEventListener('visibilitychange', schedule); sync();
      return () => {
        cancelAnimationFrame(frame); observer.disconnect();
        stage.removeEventListener('pointermove', move); stage.removeEventListener('pointerleave', leave);
        window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule);
        document.removeEventListener('visibilitychange', schedule); context.revert();
      };
    });
    return () => media.revert();
  }, [animationReady]);
  return <div ref={root} className="tbh-hero-ingredients" aria-hidden="true">
    {(['left', 'right'] as const).map(side => <div className={`tbh-ingredient-rail is-${side}`} key={side}>
      {HERO_INGREDIENTS.filter(ingredient => ingredient.side === side).map(ingredient => <div key={ingredient.id}
        data-hero-reaction={ingredient.id} data-ingredient={ingredient.id} data-side={side} data-food={ingredient.type}
        style={layoutStyle(ingredient)} className={`tbh-ingredient-position${ingredient.mobile.visible ? ' is-mobile-visible' : ''}`}>
        <div className="tbh-ingredient-enter"><div className="tbh-ingredient-parallax"><div className="tbh-cursor-reaction"><div className="tbh-ingredient-float">
          <img src={`/assets/hero/ingredients/${ingredient.asset}.webp`}
            srcSet={`/assets/hero/ingredients/${ingredient.asset}-small.webp 256w, /assets/hero/ingredients/${ingredient.asset}.webp 512w`}
            sizes="(max-width: 540px) 44px, (max-width: 991px) 92px, 176px" alt="" width="512" height="512" decoding="async" />
        </div></div></div></div>
      </div>)}
    </div>)}
  </div>;
}
