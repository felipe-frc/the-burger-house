import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { HeroMascot } from './HeroMascot';
import { HeroIngredients } from './HeroIngredients';
import { HeroEmbers } from './HeroEmbers';
import { HeroHeadline } from './HeroArtwork';
import './HeroAnimation.css';
import { useHeroPointerMotion } from './useHeroPointerMotion';
import { afterFirstPaint } from '../utils/afterFirstPaint';

// The Hero owns its animation; ordering remains in the catalogue and OrderDrawer.
export function HeroSection() {
  const root = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [animationReady, setAnimationReady] = useState(false);
  useHeroPointerMotion(root, animationReady);
  useEffect(() => {
    if (!root.current || !stage.current) return;
    const scene = root.current;
    const media = gsap.matchMedia();
    const cancel = afterFirstPaint(() => media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.registerPlugin(ScrollTrigger);
      const context = gsap.context(() => {
        gsap.timeline({
          onStart: () => setAnimationReady(true),
          onComplete: () => { scene.dataset.entered = 'true'; },
        })
          .from('.tbh-hero-word', { yPercent: 5, duration: .5, stagger: .04, ease: 'power2.out' }, 0)
          .from('.tbh-mascot-entrance', { y: -16, duration: .8, ease: 'power4.out' }, .12);
        gsap.timeline({ scrollTrigger: { trigger: scene, start: 'top top', end: 'bottom top', scrub: 1.4, invalidateOnRefresh: true } })
          .to('.tbh-hero-scale', { scale: .9, duration: .5, ease: 'back.out(1.2)' }, 0);
      }, stage);
      return () => {
        context.revert();
        scene.dataset.entered = 'false';
        setAnimationReady(false);
      };
    }));
    return () => { cancel(); media.revert(); };
  }, []);
  return <section ref={root} id="home" className="tbh-hero-scroll-scene" aria-label="The Burger House — Good food Good times">
    <div ref={stage} className="tbh-hero-stage">
      <div className="tbh-hero-scale">
        <HeroHeadline />
        <HeroEmbers animationReady={animationReady} /><HeroMascot animationReady={animationReady} /><HeroIngredients animationReady={animationReady} />
      </div>
    </div>
  </section>;
}
