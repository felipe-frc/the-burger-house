export const DURATION = 550;
export const WHEEL_IDLE = 180;

export function nextState(state, action, fresh = true) {
  if (action === "reset") return "INITIAL";
  if (action === "release") return "RELEASED";
  if (state === "INITIAL" && action === "down") return "EXPANDING";
  if (state === "EXPANDING" && action === "finish") return "EXPANDED";
  if (state === "EXPANDED" && action === "down" && fresh) return "RELEASED";
  return state;
}

// Equal X/Y scaling reproduces the original centered object-fit: cover crop.
export function coverGeometry(width, height, circle, naturalWidth, naturalHeight) {
  const start = Math.max(circle.width / naturalWidth, circle.height / naturalHeight);
  const end = Math.max(width / naturalWidth, height / naturalHeight);
  return {
    width: naturalWidth * end, height: naturalHeight * end,
    scale: start / end, x: circle.x, y: circle.y,
    radius: circle.width / 2, endX: width / 2, endY: height / 2,
    endRadius: Math.hypot(width, height) / 2 + 1,
  };
}

export function wheelSequence() {
  let last = -Infinity;
  return (time) => {
    const fresh = time - last >= WHEEL_IDLE;
    last = time;
    return fresh;
  };
}

export async function initPhotoTransition() {
  /** @type {HTMLElement | null} */
  const hero = document.querySelector(".transition-story > .transition-hero-a");
  /** @type {HTMLElement | null} */
  const circle = hero?.querySelector(".transition-hero-circle");
  const image = circle?.querySelector("img");
  const navbar = document.querySelector(".bh-pretty-nav");
  if (!(hero instanceof HTMLElement) || !(circle instanceof HTMLElement) || !image || !navbar || hero.dataset.transitionReady) return;
  hero.dataset.transitionReady = "loading";
  try { await image.decode(); } catch { /* Failed images must never trap navigation. */ }
  if (!image.naturalWidth || !image.naturalHeight) {
    hero.dataset.transitionState = "RELEASED";
    return;
  }

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  /** @type {HTMLElement | null} */
  const diagonals = hero.querySelector(".transition-diagonals");
  /** @type {HTMLElement | null} */
  const cue = hero.querySelector(".transition-scroll-cue");
  const expandedContent = hero.querySelector(".transition-expanded-copy");
  const saved = new Map([hero, circle, image, diagonals, cue].filter(Boolean)
    .map((element) => [element, element.getAttribute("style")]));
  let state = "INITIAL", geometry, frame = 0, timeout = 0, away = false;
  let gesture = null;
  let wheel = wheelSequence();
  let previousWheelMagnitude = 0;
  const interactive = (target) => target instanceof Element && Boolean(target.closest(
    "a, button, input, textarea, select, [contenteditable]:not([contenteditable=false]), [role=dialog], [role=button]"
  ));
  const setState = (action, fresh = true) => {
    state = nextState(state, action, fresh);
    hero.dataset.transitionState = state;

    const showExpanded =
      !motion.matches &&
      (state === "EXPANDED" || state === "RELEASED");

    if (expandedContent) {
      expandedContent.inert = !showExpanded;
      expandedContent.setAttribute(
        "aria-hidden",
        String(!showExpanded)
      );
    }

    if (cue) {
      cue.tabIndex = showExpanded ? -1 : 0;
    }
  };
  const stop = () => { cancelAnimationFrame(frame); clearTimeout(timeout); frame = 0; };
  function restore() {
    hero.classList.remove("transition-photo-single");
    for (const [element, style] of saved) {
      if (style === null) element.removeAttribute("style");
      else element.setAttribute("style", style);
    }
  }
  function measure() {
    restore();
    const rect = hero.getBoundingClientRect();
    const crop = circle.getBoundingClientRect();
    const height = Math.max(1, window.innerHeight - navbar.getBoundingClientRect().height);
    geometry = coverGeometry(rect.width, height, {
      width: crop.width, height: crop.height,
      x: crop.left - rect.left + crop.width / 2,
      y: crop.top - rect.top + crop.height / 2,
    }, image.naturalWidth, image.naturalHeight);
    hero.style.height = `${height}px`;
    hero.style.minHeight = "0";
    hero.classList.add("transition-photo-single");
    image.style.width = `${geometry.width}px`;
    image.style.height = `${geometry.height}px`;
  }
  function draw(progress) {
    const g = geometry;
    const lerp = (a, b) => a + (b - a) * progress;
    const radius = lerp(g.radius, g.endRadius);
    const x = lerp(g.x, g.endX), y = lerp(g.y, g.endY);
    // Cover the mask's intersection with the stage, not just its center.
    // Otherwise the growing circle can expose the photograph's straight edges.
    const scale = Math.max(lerp(g.scale, 1),
      Math.min(radius, Math.max(x, 2 * g.endX - x)) * 2 / g.width,
      Math.min(radius, Math.max(y, 2 * g.endY - y)) * 2 / g.height);
    circle.style.clipPath = `circle(${radius}px at ${x}px ${y}px)`;
    image.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale})`;
    if (diagonals) diagonals.style.opacity = String(1 - progress);
    if (cue) cue.style.setProperty("--photo-cue-opacity", String(1 - progress));
  }
  function finish() {
    stop();
    if (geometry) draw(1);
    setState("finish");
    // The transparent link remains focusable and usable as an escape route.
  }
  function release() {
    if (state === "EXPANDING") finish();
    setState("release");
  }
  function reset() {
    stop(); restore(); geometry = null; gesture = null; wheel = wheelSequence();
    previousWheelMagnitude = 0;
    setState("reset"); away = false;
    if (motion.matches) setState("release");
  }
  function expand() {
    measure(); draw(0); setState("down");
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / DURATION);
      // Smooth acceleration and deceleration; no layout reads in the frame loop.
      draw(t * t * (3 - 2 * t));
      if (t === 1) finish();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    timeout = setTimeout(finish, DURATION + 250);
  }
  function down(event, fresh) {
    if (motion.matches || state === "RELEASED" || window.scrollY > 2 || !event.cancelable) return;
    if (state === "EXPANDED" && fresh) { release(); return; }
    event.preventDefault();
    if (state === "INITIAL") expand();
  }
  function onWheel(event) {
    if (event.ctrlKey || interactive(event.target) || !hero.contains(event.target) ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY === 0) return;

    const now = performance.now();
    const magnitude = Math.abs(event.deltaY);
    const fresh = wheel(now);

    // Uma nova intencao de rolagem pode surgir antes de
    // 180ms caso a inercia do touchpad ainda esteja terminando.
    // Detecta um novo impulso pela aceleracao do movimento.
    const renewedImpulse =
      state === "EXPANDED" &&
      magnitude >= 14 &&
      magnitude - previousWheelMagnitude >= 9 &&
      magnitude >= previousWheelMagnitude * 1.65;

    previousWheelMagnitude = magnitude;

    if (event.deltaY > 0) {
      down(event, fresh || renewedImpulse);
    } else if (state === "EXPANDING") {
      finish();
      release();
    }
  }
  function onKey(event) {
    if (interactive(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;
    if (["Escape", "End", "Home", "ArrowUp", "PageUp"].includes(event.key) ||
        (event.key === " " && event.shiftKey)) { release(); return; }
    if (["ArrowDown", "PageDown", " "].includes(event.key)) down(event, !event.repeat);
  }
  function touchStart(event) {
    if (interactive(event.target) || event.touches.length !== 1) { gesture = null; release(); return; }
    gesture = { y: event.touches[0].clientY, x: event.touches[0].clientX,
      fresh: state === "EXPANDED", consumed: false };
  }
  function touchMove(event) {
    if (!gesture || event.touches.length !== 1) return;
    const dy = gesture.y - event.touches[0].clientY;
    const dx = gesture.x - event.touches[0].clientX;
    if (gesture.consumed) { if (event.cancelable) event.preventDefault(); return; }
    if (dy > 8 && dy > Math.abs(dx)) {
      down(event, gesture.fresh);
      gesture.consumed = event.defaultPrevented;
    }
  }
  function onScroll() {
    if (window.scrollY > 2) { away = true; release(); }
    else if (away) reset();
  }
  function resize() {
    if (geometry) { stop(); measure(); draw(1); setState("finish"); }
  }
  function pageShow() {
    if (window.scrollY <= 2) reset();
    else { stop(); measure(); draw(1); release(); away = true; }
  }
  // O CTA inicial executa a mesma expansao do primeiro scroll.
  // Nao altera a duracao, a geometria nem a maquina de estados.
  cue?.addEventListener("click", (event) => {
    if (state === "INITIAL" && !motion.matches) {
      event.preventDefault();
      expand();
    } else if (state === "EXPANDING") {
      event.preventDefault();
    }
  });
  hero.addEventListener("wheel", onWheel, { passive: false });
  hero.addEventListener("touchstart", touchStart, { passive: true });
  hero.addEventListener("touchmove", touchMove, { passive: false });
  hero.addEventListener("touchend", () => { gesture = null; }, { passive: true });
  hero.addEventListener("touchcancel", () => { gesture = null; release(); }, { passive: true });
  document.addEventListener("keydown", onKey);
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[href^="#"]');
    if (link && link !== cue && link.getAttribute("href") !== "#") release();
    else if (interactive(event.target) && state === "EXPANDING") release();
  }, true);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("pageshow", pageShow);
  window.addEventListener("pagehide", stop);
  motion.addEventListener("change", () => { reset(); release(); });
  pageShow();
  hero.dataset.transitionReady = "true";
}

if (typeof document !== "undefined") {
  const boot = () => queueMicrotask(() => { void initPhotoTransition(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
