import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useConsent } from '../privacy/useConsent';
import { openPrivacyPreferences } from '../privacy/PrivacyPreferences';

const LocationMap = lazy(() => import('./LocationMap'));

export default function DeferredLocationMap({ currentLang }: { currentLang: string }) {
  const consent = useConsent();
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '600px' });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const placeholder = <div className="tbh-location-map-wrapper" aria-busy="true" />;
  return <div ref={container} style={{ height: '100%' }}>
    {!consent?.maps ? <div className="tbh-map-consent"><p>{currentLang === 'EN' ? 'Illustrative map blocked. Enabling it connects to MapTiler.' : 'Mapa ilustrativo bloqueado. Ativá-lo conecta seu navegador ao MapTiler.'}</p><button type="button" onClick={openPrivacyPreferences}>{currentLang === 'EN' ? 'Choose map privacy' : 'Escolher privacidade do mapa'}</button></div> : visible ? <Suspense fallback={placeholder}><LocationMap currentLang={currentLang} /></Suspense> : placeholder}
  </div>;
}
