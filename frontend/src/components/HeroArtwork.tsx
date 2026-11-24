import { type Ref } from 'react';

export function HeroHeadline() {
  return <div className="tbh-hero-headline"><h1 className="tbh-hero-title" aria-label="GOOD FOOD GOOD TIMES">
    <span className="tbh-hero-line" aria-hidden="true"><span className="tbh-hero-word">GOOD</span>{' '}<span className="tbh-hero-word">FOOD</span></span>
    <span className="tbh-hero-line" aria-hidden="true"><span className="tbh-hero-word">GOOD</span>{' '}<span className="tbh-hero-word">TIMES</span></span>
  </h1></div>;
}

export function HeroPoster({ imageRef, hidden }: { imageRef?: Ref<HTMLImageElement>; hidden?: boolean }) {
  return <img ref={imageRef} className={hidden ? 'tbh-mascot-poster is-hidden' : 'tbh-mascot-poster'}
    src="/assets/mascots/mascot-recovered-poster-optimized.webp" alt="" width="516" height="552"
    decoding="async" fetchPriority="high" />;
}

export function HeroFirstPaint() {
  return <main className="tbh-hero-scroll-scene">
    <div className="tbh-hero-stage">
      <div className="tbh-hero-scale">
        <HeroHeadline />
        <div className="tbh-hero-mascot" aria-hidden="true"><HeroPoster /></div>
      </div>
    </div>
  </main>;
}
