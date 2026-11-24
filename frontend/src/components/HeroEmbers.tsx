import { useEffect, useRef } from 'react';
import { getHeroVisibility } from './heroVisibility';

export const HERO_EMBERS = {
  strength: .85, trails: true, maxParticles: 64, mobileMaxParticles: 28,
  desktopDpr: 1.5, mobileDpr: 1.25, burstInterval: [.22, .47],
  burstSize: [10, 17], mobileBurstSize: [6, 10],
  opacity: 1, glowOpacity: .96, radius: [1.45, 2.65],
  microRadius: [.55, 1.05], microChance: .28, trailLength: 6,
  dispersion: [23, 60], riseSpeed: [70, 155], turbulence: 10,
  colors: ['#FF8B32', '#FF6A36', '#FFB947', '#FFDC75'],
} as const;

interface Ember {
  x: number; y: number; vx: number; vy: number; age: number; life: number;
  radius: number; color: number; trail: boolean; micro: boolean; phase: number;
  history: Array<{ x: number; y: number }>;
}

/** One bounded canvas loop, outside React's render cycle. */
export function HeroEmbers({ animationReady }: { animationReady: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !animationReady) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.dataset.state = 'unsupported'; return; }
    const stage = canvas.closest<HTMLElement>('.tbh-hero-stage')!;
    const mascot = stage.querySelector<HTMLElement>('.tbh-hero-mascot')!;
    const title = stage.querySelector<HTMLElement>('.tbh-hero-headline')!;
    const visible = getHeroVisibility(canvas);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const mobileQuery = matchMedia('(max-width: 540px)'), tabletQuery = matchMedia('(max-width: 991px)');
    const particles: Ember[] = [];
    let frame = 0, visibilityFrame = 0, last = 0, accumulator = 0, nextBurst = .35;
    let width = 0, height = 0, ceiling = 0, mobile = mobileQuery.matches, active = false, disposed = false;
    let body = { x: 0, y: 0, width: 0, height: 0 };
    let bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    const random = (min: number, max: number) => min + Math.random() * (max - min);
    const randomRange = (range: readonly [number, number]) => random(range[0], range[1]);
    // Cache tiny glow sprites; no shadowBlur or new gradients in the frame loop.
    const glows = HERO_EMBERS.colors.map(color => {
      const sprite = document.createElement('canvas'); sprite.width = sprite.height = 32;
      const paint = sprite.getContext('2d')!;
      const glow = paint.createRadialGradient(16, 16, 0, 16, 16, 16);
      glow.addColorStop(0, `${color}F2`); glow.addColorStop(.32, `${color}80`); glow.addColorStop(1, `${color}00`);
      paint.fillStyle = glow; paint.fillRect(0, 0, 32, 32); return sprite;
    });
    const clear = () => ctx.clearRect(0, 0, width, height);
    const resize = () => {
      width = canvas.clientWidth; height = canvas.clientHeight; mobile = mobileQuery.matches;
      if (!width || !height) return;
      const ratio = Math.min(devicePixelRatio || 1, mobile ? HERO_EMBERS.mobileDpr : HERO_EMBERS.desktopDpr, Math.sqrt(3_000_000 / (width * height)));
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      const area = canvas.getBoundingClientRect(), figure = mascot.getBoundingClientRect(), heading = title.getBoundingClientRect();
      const sx = width / Math.max(1, area.width), sy = height / Math.max(1, area.height);
      body = { x: (figure.left - area.left) * sx, y: (figure.top - area.top) * sy, width: figure.width * sx, height: figure.height * sy };
      ceiling = Math.max(0, (heading.bottom - area.top) * sy + 12);
      // Keep the glow at burger height, never across the face, title or page.
      bounds = { left: Math.max(0, body.x - body.width * .24), right: Math.min(width, body.x + body.width * 1.24),
        top: Math.max(ceiling, body.y + body.height * .23), bottom: Math.min(height, body.y + body.height * .84) };
      particles.length = 0; clear();
    };
    const burst = () => {
      const limit = mobile ? HERO_EMBERS.mobileMaxParticles : HERO_EMBERS.maxParticles;
      const count = Math.min(limit - particles.length, Math.floor(randomRange(mobile ? HERO_EMBERS.mobileBurstSize : HERO_EMBERS.burstSize)));
      for (let i = 0; i < count; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const speed = (.4 + HERO_EMBERS.strength) * (tabletQuery.matches ? .75 : 1);
        const micro = Math.random() < HERO_EMBERS.microChance, tone = Math.random();
        particles.push({ x: body.x + body.width * (side < 0 ? random(.07, .21) : random(.79, .93)), y: body.y + body.height * random(.52, .73),
          vx: side * random(...HERO_EMBERS.dispersion) * speed, vy: -random(...HERO_EMBERS.riseSpeed) * speed * (micro ? .8 : 1),
          age: 0, life: micro ? random(.5, .95) : random(.95, 1.6),
          radius: randomRange(micro ? HERO_EMBERS.microRadius : HERO_EMBERS.radius),
          color: tone < .45 ? 0 : tone < .7 ? 1 : tone < .94 ? 2 : 3,
          trail: HERO_EMBERS.trails && !micro && Math.random() > .12, micro, phase: random(0, Math.PI * 2), history: [] });
      }
    };
    const draw = (dt: number) => {
      clear(); nextBurst -= dt;
      if (nextBurst <= 0) { burst(); nextBurst = random(...HERO_EMBERS.burstInterval) * (mobile ? 1.3 : 1); }
      ctx.save(); ctx.beginPath(); ctx.rect(bounds.left, bounds.top, Math.max(0, bounds.right - bounds.left), Math.max(0, bounds.bottom - bounds.top)); ctx.clip();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.age += dt;
        if (p.age >= p.life || p.y < bounds.top || p.x < bounds.left || p.x > bounds.right) { particles.splice(i, 1); continue; }
        p.history.push({ x: p.x, y: p.y }); if (p.history.length > HERO_EMBERS.trailLength) p.history.shift();
        p.x += (p.vx + Math.sin(p.age * 6 + p.phase) * HERO_EMBERS.turbulence) * dt; p.y += p.vy * dt; p.vy += 19 * dt;
        const edge = Math.max(0, Math.min(1, (p.x - bounds.left) / 16, (bounds.right - p.x) / 16, (p.y - bounds.top) / 18, (bounds.bottom - p.y) / 16));
        const fade = Math.pow(Math.sin(Math.PI * p.age / p.life), .7) * HERO_EMBERS.opacity * edge * (p.micro ? .7 : 1), color = HERO_EMBERS.colors[p.color];
        if (p.trail) {
          ctx.lineWidth = Math.max(.6, p.radius * .7); ctx.lineCap = 'round'; ctx.strokeStyle = color;
          p.history.forEach((point, index) => {
            const next = p.history[index + 1] ?? p;
            ctx.globalAlpha = fade * (index + 1) / (p.history.length + 1) * .8;
            ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(next.x, next.y); ctx.stroke();
          });
        }
        const size = p.radius * (p.micro ? 6 : 9);
        ctx.globalAlpha = fade * HERO_EMBERS.glowOpacity; ctx.drawImage(glows[p.color], p.x - size / 2, p.y - size / 2, size, size);
        ctx.globalAlpha = fade; ctx.fillStyle = color; ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.radius * (p.micro ? 1 : 1.25), p.radius * .65, Math.atan2(p.vy, p.vx), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };
    const tick = (now: number) => {
      frame = 0;
      if (!active || disposed) return;
      const elapsed = last ? Math.min((now - last) / 1000, .05) : 0; last = now; accumulator += elapsed;
      if (accumulator + .0005 >= (mobile ? 1 / 30 : 1 / 60)) { draw(Math.min(accumulator, .07)); accumulator = 0; }
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      if (disposed) return;
      const next = !disposed && !reduced.matches && !document.hidden && visible();
      canvas.dataset.state = reduced.matches ? 'reduced' : next ? 'running' : 'paused';
      if (next === active) return;
      active = next; last = 0; accumulator = 0;
      if (active) { if (!frame) frame = requestAnimationFrame(tick); }
      else { cancelAnimationFrame(frame); frame = 0; particles.length = 0; nextBurst = .35; clear(); }
    };
    const schedule = () => { if (!visibilityFrame) visibilityFrame = requestAnimationFrame(() => { visibilityFrame = 0; sync(); }); };
    const resized = () => { resize(); sync(); };
    const observer = new IntersectionObserver(schedule); observer.observe(stage);
    const sizes = new ResizeObserver(resized); sizes.observe(stage);
    window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('resize', resized);
    document.addEventListener('visibilitychange', sync); reduced.addEventListener('change', sync);
    resize(); sync();
    return () => {
      disposed = true; active = false; cancelAnimationFrame(frame); cancelAnimationFrame(visibilityFrame);
      observer.disconnect(); sizes.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', resized);
      document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync);
      particles.length = 0; clear(); canvas.dataset.state = 'disposed';
    };
  }, [animationReady]);
  return <canvas ref={ref} className="tbh-hero-embers" aria-hidden="true" data-state="waiting" data-strength={HERO_EMBERS.strength} data-trails={HERO_EMBERS.trails} />;
}
