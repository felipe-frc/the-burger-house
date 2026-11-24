import { useEffect, useRef, useState } from 'react';
import { getHeroVisibility } from './heroVisibility';
import { HeroPoster } from './HeroArtwork';

/** The media owns the gesture; GSAP only moves a separate entrance wrapper. */
export function HeroMascot({ animationReady }: { animationReady: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const poster = useRef<HTMLImageElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const media = video.current;
    const image = poster.current;
    if (!media || !image || !root.current) return;
    let disposed = false, visible = false;
    let frameCallback: number | undefined;
    let fallbackFrame = 0;
    let visibilityFrame = 0;
    let loadTimer = 0;
    let canLoad = false;
    const onScreen = getHeroVisibility(root.current);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (disposed) return;
      if (canLoad && animationReady && visible && !document.hidden && !reduced.matches && !media.getAttribute('src')) {
        media.preload = 'auto';
        media.src = '/assets/hero/mascot-wave-optimized.webm';
      }
      if (!animationReady || !visible || !onScreen() || document.hidden || reduced.matches || media.ended || failed) media.pause();
      else if (media.paused && media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        // An interrupted play() must not replace a previously presented frame
        // with another pose. Until the first frame, the clean poster stays up.
        void media.play().catch(() => undefined);
      }
    };
    const afterPoster = () => {
      loadTimer = window.setTimeout(() => { canLoad = true; sync(); }, 1000);
    };
    const presented = () => {
      if (!disposed && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) setReady(true);
    };
    const loaded = () => sync();
    const scrolled = () => {
      if (!visibilityFrame) visibilityFrame = requestAnimationFrame(() => { visibilityFrame = 0; sync(); });
    };
    const playing = () => {
      // loadeddata/playing alone do not guarantee a presented frame. Swap both
      // layers atomically only once the decoder has delivered a video frame.
      if (frameCallback !== undefined) media.cancelVideoFrameCallback(frameCallback);
      cancelAnimationFrame(fallbackFrame);
      if ('requestVideoFrameCallback' in media) frameCallback = media.requestVideoFrameCallback(presented);
      else fallbackFrame = requestAnimationFrame(() => { fallbackFrame = requestAnimationFrame(presented); });
    };
    const error = () => { setFailed(true); setReady(false); };
    // The repaired edit has complete hands and a held, clean final pose.
    const ended = () => media.pause();
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: 0 });
    observer.observe(root.current);
    media.addEventListener('canplay', loaded); media.addEventListener('playing', playing);
    media.addEventListener('error', error); media.addEventListener('ended', ended);
    document.addEventListener('visibilitychange', sync); reduced.addEventListener('change', sync);
    window.addEventListener('scroll', scrolled, { passive: true });
    if (image.complete) afterPoster();
    else {
      image.addEventListener('load', afterPoster, { once: true });
      image.addEventListener('error', afterPoster, { once: true });
    }
    if (media.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) sync();
    return () => {
      disposed = true; observer.disconnect(); media.pause();
      if (frameCallback !== undefined) media.cancelVideoFrameCallback(frameCallback);
      cancelAnimationFrame(fallbackFrame);
      cancelAnimationFrame(visibilityFrame);
      clearTimeout(loadTimer);
      media.removeEventListener('canplay', loaded); media.removeEventListener('playing', playing);
      media.removeEventListener('error', error); media.removeEventListener('ended', ended);
      document.removeEventListener('visibilitychange', sync); reduced.removeEventListener('change', sync);
      window.removeEventListener('scroll', scrolled);
      image.removeEventListener('load', afterPoster);
      image.removeEventListener('error', afterPoster);
    };
  }, [animationReady, failed]);
  return <div ref={root} className="tbh-hero-mascot" data-hero-reaction="mascot" aria-hidden="true" data-video-state={failed ? 'fallback' : ready ? 'ready' : 'loading'}>
    <div className="tbh-mascot-entrance"><div className="tbh-cursor-reaction tbh-mascot-reaction">
      <HeroPoster imageRef={poster} hidden={ready && !failed} />
      <video className={ready && !failed ? 'is-ready' : ''} ref={video} muted playsInline preload="none" disablePictureInPicture width="516" height="552" />
    </div></div>
  </div>;
}
