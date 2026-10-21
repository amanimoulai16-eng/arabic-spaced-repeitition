/// <reference lib="webworker" />

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute, NavigationRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

// Precache the manifest injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST || []);

// Clean up old caches from previous versions
cleanupOutdatedCaches();

// Claim clients immediately on activation so the SW controls the page
clientsClaim();

// SPA navigation fallback — serve index.html for all routes
const navigationRoute = new NavigationRoute(
  createHandlerBoundToURL('/index.html'),
  { denylist: [/^\/api\//] },
);
registerRoute(navigationRoute);

// --- Notification click handler ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Focus an existing tab if one is open
      for (const client of allClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          await client.focus();
          return;
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) {
        await self.clients.openWindow('/');
      }
    })(),
  );
});

// --- Periodic Background Sync (experimental, Chrome/Edge on Android) ---
// Fires periodically even when the app is closed. The browser decides the
// interval (min ~12h), so we check on every fire and show a notification if
// the user has due cards and hasn't reviewed today.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'tikrar-daily-reminder') {
    event.waitUntil(
      (async () => {
        // Ask all controlled clients whether a reminder should fire
        const allClients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        // If any client is open, let the page-side scheduler handle it
        if (allClients.length > 0) return;

        // No open client — read reminder config from IndexedDB via a
        // broadcast to any window, or fall back to showing the notification
        // using cached settings stored in the SW's Cache Storage.
        try {
          const cache = await caches.open('tikrar-reminder-config');
          const resp = await cache.match('reminder-config');
          if (!resp) return;
          const config = await resp.json();
          if (!config.enabled) return;

          const now = new Date();
          const todayKey = now.toISOString().slice(0, 10);
          if (config.lastFired === todayKey) return;

          self.registration.showNotification('Tikrar — تكرار', {
            body: config.body || 'You have cards due for review today.',
            tag: 'tikrar-daily-reminder',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            data: { url: '/' },
          });
        } catch {
          // config not available — skip
        }
      })(),
    );
  }
});

// --- Message handler: page can ask SW to show a notification ---
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_REMINDER') {
    const { title, body } = event.data;
    event.waitUntil(
      self.registration.showNotification(title || 'Tikrar — تكرار', {
        body: body || 'You have cards due for review today.',
        tag: 'tikrar-daily-reminder',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: '/' },
      }),
    );
  }

  if (event.data?.type === 'CACHE_REMINDER_CONFIG') {
    // Persist reminder config in Cache Storage so the SW can read it
    // even when no client is open (for periodicsync).
    event.waitUntil(
      (async () => {
        const cache = await caches.open('tikrar-reminder-config');
        const resp = new Response(JSON.stringify(event.data.config));
        await cache.put('reminder-config', resp);
      })(),
    );
  }
});
