import React, { useEffect } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import AccordionGallery from './AccordionGallery';
import { useScrollEntrance } from '../utils/useScrollEntrance';
import { afterFirstPaint } from '../utils/afterFirstPaint';


const items = [
  { image: '/assets/photography/corredor-do-sabor-autenticado-960.webp', label: 'SABOR AUTÊNTICO' },
  { image: '/assets/photography/chef-monta-o-burger-perfeito-960.webp', label: 'BURGER PERFEITO' },
  { image: '/assets/photography/cozinha-burger-house-em-acao-960.webp', label: 'NA COZINHA' },
  { image: '/assets/photography/fachada-ensolarada-do-the-burger-house-960.webp', label: 'NOSSA FACHADA' },
  { image: '/assets/photography/interior-retro-da-the-burger-house-960.webp', label: 'NOSSO ESPAÇO' },
];

export default function AboutAccordionGallery({ english = false }) {
  const galleryRef = useScrollEntrance('photo');

  useEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;
    const media = gsap.matchMedia();

    const cancel = afterFirstPaint(() => media.add({
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 1024px)',
      mobile: '(max-width: 540px)',
    }, ({ conditions }) => {
      if (!conditions.motion) return;
      gsap.registerPlugin(ScrollTrigger);
      const travel = conditions.desktop ? 12 : conditions.mobile ? 5 : 8;
      gsap.set(gallery, { '--about-photo-overscan': `${travel}px` });

      for (const panel of gallery.querySelectorAll('.ag-panel')) {
        const photo = panel.querySelector('.ag-photo-reveal > img');
        if (!photo) continue;
        gsap.fromTo(photo, { y: -travel }, {
          y: travel,
          ease: 'none',
          scrollTrigger: {
            trigger: panel,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.5,
          },
        });
      }
    }));

    return () => { cancel(); media.revert(); };
  }, [galleryRef]);

  return (
    <div ref={galleryRef} className="tbh-about-accordion w-full">
      <AccordionGallery
        items={english ? items.map((item, index) => ({ ...item, label: ['AUTHENTIC FLAVOR', 'THE PERFECT BURGER', 'IN THE KITCHEN', 'OUR STOREFRONT', 'OUR SPACE'][index] })) : items}
        ariaLabel={english ? 'The Burger House photo gallery' : 'Galeria de fotos da The Burger House'}
        defaultIndex={3}
        expandRatio={0.58}
        trigger="hover"
        accentColor="#ffdc32"
        overlayColor="#171717"
        textColor="#F5F3EE"
        grayscale={false}
        duration={0.65}
        parallax={0.25}
        tilt={3}
        height={460}
        gap={10}
        radius={16}
        showLabels={true}
        scrollParallax={true}
      />
    </div>
  );
}
