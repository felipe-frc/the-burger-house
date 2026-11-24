import {createRoot} from 'react-dom/client';
import {lazy, Suspense} from 'react';
import App from './App.tsx';
import './index.css';

const CourierTrackingPage = lazy(() => import('./pages/CourierTrackingPage'));
const courier = /^\/admin\/courier\/([1-9]\d{0,9})\/?$/.exec(window.location.pathname);
createRoot(document.getElementById('root')!).render(courier
  ? <Suspense fallback={<p role="status">Carregando compartilhamento…</p>}><CourierTrackingPage orderId={courier[1]} /></Suspense>
  : <App />);
