import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { readMapTilerKey, mapFailureMessage } from '../utils/locationMap';

const CENTER: [number, number] = [-48.631664, -26.991683];
const PIN_URL = '/assets/branding/tbh-location-pin.png';

export default function LocationMap({ currentLang = 'PT' }: { currentLang?: string }) {
  const english = currentLang === 'EN';
  const markerLabelRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const configuration = readMapTilerKey(import.meta.env.VITE_MAPTILER_KEY);
    if (!configuration.key) {
      setError(configuration.error ?? 'Chave MapTiler não configurada.');
      return;
    }
    const key = configuration.key;
    setError('');

    // Official MapLibre 6/Vite integration; the worker remains same-origin.
    maplibregl.setWorkerUrl(workerUrl);

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container,
        style: `https://api.maptiler.com/maps/base-v4/style.json?key=${encodeURIComponent(key)}`,
        center: CENTER,
        zoom: 13.5,
        minZoom: 10,
        maxZoom: 18,
        attributionControl: false,
        canvasContextAttributes: { antialias: true },
      });
    } catch (failure) {
      setError(mapFailureMessage(failure));
      return;
    }

    let failedBeforeLoad = false;
    let loaded = false;
    const handleError = (event: maplibregl.ErrorEventType['error']) => {
      if (loaded) return;
      failedBeforeLoad = true;
      setError(mapFailureMessage(event.error));
    };
    const handleLoad = () => {
      loaded = true;
      if (!failedBeforeLoad) setReady(true);
      map.resize();
    };
    map.on('error', handleError);
    map.on('load', handleLoad);

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: false,
      }),
      'top-right'
    );

    map.addControl(
      new maplibregl.AttributionControl({
        compact: false,
      }),
      'bottom-right'
    );

    const markerElement = document.createElement('button');
    markerLabelRef.current = markerElement;
    markerElement.type = 'button';
    markerElement.className = 'tbh-location-map-pin-image';
    markerElement.setAttribute(
      'aria-label',
      'Ver ponto ilustrativo da The Burger House'
    );

    const markerImage = document.createElement('img');
    markerImage.src = PIN_URL;
    markerImage.alt = '';
    markerImage.draggable = false;
    markerElement.appendChild(markerImage);

    const content = document.createElement('div');
    content.className = 'tbh-location-map-popup';

    const title = document.createElement('strong');
    title.textContent = 'THE BURGER HOUSE';

    const city = document.createElement('p');
    city.textContent = 'Balneário Camboriú — SC';

    content.append(title, city);

    const popup = new maplibregl.Popup({
      offset: 28,
      closeButton: true,
    }).setDOMContent(content);

    new maplibregl.Marker({
      element: markerElement,
      anchor: 'bottom',
    })
      .setLngLat(CENTER)
      .setPopup(popup)
      .addTo(map);

    const observer = new ResizeObserver(() => {
      map.resize();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      map.off('error', handleError);
      map.off('load', handleLoad);
      map.remove();
      markerLabelRef.current = null;
    };
  }, []);

  useEffect(() => {
    markerLabelRef.current?.setAttribute('aria-label', english ? 'View The Burger House illustrative location' : 'Ver ponto ilustrativo da The Burger House');
  }, [english]);

  return (
    <div className="tbh-location-map-wrapper">
      <div
        ref={containerRef}
        className="tbh-location-map-canvas"
        inert={!ready}
        aria-hidden={!ready}
        style={{ visibility: ready ? 'visible' : 'hidden' }}
        role="region"
        aria-label={english ? "Illustrative map of Balneário Camboriú" : "Mapa ilustrativo de Balneário Camboriú"}
      />

      {error && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            zIndex: 5,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            padding: '16px',
            borderRadius: '12px',
            background: '#F5F3EE',
            color: '#171717',
            textAlign: 'center',
            width: 'min(90%, 340px)',
          }}
        >
          {english ? 'The map is unavailable. Location details are listed below.' : error}
        </div>
      )}

      <span className="tbh-location-map-disclaimer">
        {english ? 'Illustrative location' : 'Localização ilustrativa'}
      </span>
    </div>
  );
}
