'use client';

import { useEffect, useState } from 'react';

export default function PwaRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let active = true;
    let registration: ServiceWorkerRegistration | undefined;

    const inspectRegistration = (next: ServiceWorkerRegistration) => {
      registration = next;
      if (next.waiting && navigator.serviceWorker.controller) setWaitingWorker(next.waiting);
      next.addEventListener('updatefound', () => {
        const installing = next.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (active && installing.state === 'installed' && navigator.serviceWorker.controller) setWaitingWorker(installing);
        });
      });
    };

    navigator.serviceWorker.register('/sw.js').then(inspectRegistration).catch(() => undefined);
    const checkForUpdate = () => registration?.update().catch(() => undefined);
    window.addEventListener('online', checkForUpdate);
    return () => { active = false; window.removeEventListener('online', checkForUpdate); };
  }, []);

  function activateUpdate() {
    if (!waitingWorker) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }

  if (!waitingWorker) return null;
  return <aside className="update-toast" role="status" aria-live="polite"><div><strong>En ny version er klar</strong><span>Opdatér, når du er klar. Dine lokale data bevares.</span></div><button type="button" onClick={activateUpdate}>Opdatér appen</button></aside>;
}
