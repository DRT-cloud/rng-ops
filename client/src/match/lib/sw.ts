/**
 * Service worker registration + page-side offline indicators.
 *
 * Call registerMatchServiceWorker() once on app boot. The hook
 * useOfflineStatus() exposes the current online state and queue size.
 */

import { useEffect, useState } from 'react';

export function registerMatchServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Only register when running on the same origin as the API (i.e. tablets
  // pointing at the laptop). Skip in preview / dev iframes when location is
  // about:blank.
  if (window.location.protocol === 'about:') return;
  navigator.serviceWorker
    .register('/match-sw.js', { scope: '/' })
    .catch((err) => console.warn('match-sw registration failed', err));

  // Trigger a sync attempt whenever connectivity returns
  window.addEventListener('online', () => {
    navigator.serviceWorker.controller?.postMessage({ type: 'sync' });
  });
}

export interface OfflineStatus {
  online: boolean;
  queueSize: number;
}

export function useOfflineStatus(): OfflineStatus {
  const [status, setStatus] = useState<OfflineStatus>({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    queueSize: 0,
  });

  useEffect(() => {
    const updateOnline = () => setStatus((s) => ({ ...s, online: navigator.onLine }));
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'queued') {
        setStatus((s) => ({ ...s, queueSize: s.queueSize + 1 }));
      } else if (data.type === 'queue-replayed') {
        setStatus((s) => ({ ...s, queueSize: typeof data.remaining === 'number' ? data.remaining : 0 }));
      } else if (data.type === 'queue-status') {
        setStatus((s) => ({ ...s, queueSize: data.size ?? 0 }));
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage);

    // Ask SW for current queue size
    const ask = () => navigator.serviceWorker?.controller?.postMessage({ type: 'queue-status' });
    ask();
    const t = setInterval(ask, 5000);

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      clearInterval(t);
    };
  }, []);

  return status;
}
