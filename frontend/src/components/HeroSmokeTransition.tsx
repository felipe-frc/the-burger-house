import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createSmokeRenderer } from './heroSmokeRenderer';
import { afterFirstPaint } from '../utils/afterFirstPaint';
import './HeroSmokeTransition.css';


const SMOKE = {
  startInset: 12,
  endInset: 70,
  fadeEnd: 0.94,
  turbulence: 1.55,
  lateralDrift: 0.95,
  maxBufferWidth: 1280,
  maxBufferPixels: 144_000,
  desktop: { above: 190, below: 23, opacity: 0.73, dpr: 0.9, fineDetail: true },
  tablet: { above: 139, below: 18, opacity: 0.62, dpr: 0.8, fineDetail: false },
  mobile: { above: 102, below: 13, opacity: 0.57, dpr: 0.75, fineDetail: false },
};

function readColor(styles: CSSStyleDeclaration, token: string) {
  const hex = styles.getPropertyValue(token).trim();
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
}

export function HeroSmokeTransition() {
  const anchorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const anchor = anchorRef.current;
    const canvas = canvasRef.current;
    if (!anchor || !canvas) return;
    const media = gsap.matchMedia();

    const cancel = afterFirstPaint(() => media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.registerPlugin(ScrollTrigger);
      const scroll = { progress: 0 };
      let renderer: ReturnType<typeof createSmokeRenderer> = null;
      let unavailable = false;
      let lost = false;
      let width = anchor.clientWidth;
      let configuredWidth = 0;
      let lastProgress = -1;
      const styles = getComputedStyle(anchor);
      const colors = {
        blue: readColor(styles, '--tbh-blue'),
        coral: readColor(styles, '--tbh-coral'),
        porcelain: readColor(styles, '--tbh-porcelain'),
      };

      function render() {
        const progress = scroll.progress;
        if (unavailable || lost || document.hidden || width === 0 || progress <= 0 || progress >= SMOKE.fadeEnd) {
          canvas!.hidden = true;
          return;
        }
        if (!renderer) {
          const gl = canvas!.getContext('webgl2', {
            alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
          });
          renderer = gl ? createSmokeRenderer(gl, colors) : null;
          if (!renderer) {
            unavailable = true;
            return;
          }
        }
        if (configuredWidth !== width) {
          const profile = width <= 540 ? SMOKE.mobile : width <= 1023 ? SMOKE.tablet : SMOKE.desktop;
          const height = profile.above + profile.below;
          const dpr = Math.min(
            window.devicePixelRatio || 1,
            profile.dpr,
            SMOKE.maxBufferWidth / width,
            Math.sqrt(SMOKE.maxBufferPixels / (width * height)),
          );
          canvas!.style.setProperty('--smoke-height', `${height}px`);
          canvas!.style.setProperty('--smoke-bottom', `-${profile.below}px`);
          canvas!.width = Math.max(1, Math.round(width * dpr));
          canvas!.height = Math.max(1, Math.round(height * dpr));
          renderer.configure(width, height, profile.below, profile.opacity, profile.fineDetail,
            SMOKE.turbulence, SMOKE.lateralDrift);
          configuredWidth = width;
          lastProgress = -1;
        }
        // Keep a rendered frame while stationary. Only redraw when its inputs change.
        if (canvas!.hidden || lastProgress !== progress) {
          renderer.draw(progress);
          canvas!.hidden = false;
          lastProgress = progress;
        }
      }

      function measure() {
        width = anchor!.clientWidth;
        render();
      }
      function lose(event: Event) {
        event.preventDefault();
        lost = true;
        renderer = null;
        canvas!.hidden = true;
      }
      function restore() {
        lost = false;
        unavailable = false;
        configuredWidth = 0;
        render();
      }

      const observer = new ResizeObserver(measure);
      observer.observe(anchor);
      canvas.addEventListener('webglcontextlost', lose);
      canvas.addEventListener('webglcontextrestored', restore);
      document.addEventListener('visibilitychange', render);
      gsap.to(scroll, {
        progress: 1,
        ease: 'none',
        onUpdate: render,
        scrollTrigger: {
          id: 'tbh-hero-smoke',
          trigger: anchor,
          start: `top bottom-=${SMOKE.startInset}`,
          end: `top top+=${SMOKE.endInset}`,
          scrub: true,
          onRefresh: measure,
        },
      });

      return () => {
        observer.disconnect();
        document.removeEventListener('visibilitychange', render);
        canvas.removeEventListener('webglcontextlost', lose);
        canvas.removeEventListener('webglcontextrestored', restore);
        renderer?.dispose();
        canvas.hidden = true;
        canvas.width = canvas.height = 1;
      };
    }));

    return () => { cancel(); media.revert(); };
  }, []);

  return (
    <div ref={anchorRef} className="tbh-hero-smoke" aria-hidden="true">
      <canvas ref={canvasRef} width={1} height={1} hidden />
    </div>
  );
}
