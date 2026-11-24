import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapFailureMessage, readMapTilerKey } from '../utils/locationMap';

export default function DeliveryTrackingMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const container = useRef<HTMLDivElement>(null);
  const coordinates = useRef<[number, number]>([longitude, latitude]);
  const engine = useRef<{ map: maplibregl.Map; marker: maplibregl.Marker } | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  coordinates.current = [longitude, latitude];

  useEffect(() => {
    if (!container.current) return;
    const config = readMapTilerKey(import.meta.env.VITE_MAPTILER_KEY);
    if (!config.key) { setError(config.error ?? 'Mapa sem chave MapTiler configurada.'); return; }
    maplibregl.setWorkerUrl(workerUrl);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({ container: container.current, center: coordinates.current, zoom: 15,
        style: `https://api.maptiler.com/maps/base-v4/style.json?key=${encodeURIComponent(config.key)}` });
    } catch (failure) { setError(mapFailureMessage(failure)); return; }
    const marker = new maplibregl.Marker({ color: '#2864F0' }).setLngLat(coordinates.current).addTo(map);
    engine.current = { map, marker };
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => { setReady(true); setError(''); });
    map.on('error', () => { if (!map.loaded()) setError('Não foi possível carregar o mapa de referência.'); });
    return () => { engine.current = null; map.remove(); };
  }, []);

  useEffect(() => {
    engine.current?.marker.setLngLat([longitude, latitude]);
    engine.current?.map.jumpTo({ center: [longitude, latitude] });
  }, [latitude, longitude]);

  return <>
    <div ref={container} inert={!ready} aria-hidden={!ready} role="region" aria-label="Mapa da posição do entregador"
      style={{ minHeight: error ? 0 : 260, height: error && !ready ? 0 : 260, visibility: ready ? 'visible' : 'hidden' }} />
    {error && <p className="owner-muted">{error}</p>}
    {!error && !ready && <p role="status">Carregando mapa…</p>}
  </>;
}
