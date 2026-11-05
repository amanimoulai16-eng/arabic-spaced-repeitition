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

// --- Push event (Web Push API) ---
// Fires when the server sends a push message (even if no client is open).
const REMINDER_TEXT: Record<string, (n: number | null) => string> = {
  ar: (n) =>
    n === null ? 'لديك بطاقات للمراجعة اليوم'
    : n === 1 ? 'لديك بطاقة واحدة للمراجعة اليوم'
    : n === 2 ? 'لديك بطاقتان للمراجعة اليوم'
    : n <= 10 ? `لديك ${n} بطاقات للمراجعة اليوم`
    : `لديك ${n} بطاقة للمراجعة اليوم`,
  en: (n) =>
    n === null ? 'You have cards due for review today.'
    : n === 1 ? 'You have 1 card due for review today.'
    : `You have ${n} cards due for review today.`,
  fr: (n) =>
    n === null ? "Vous avez des cartes à réviser aujourd’hui."
    : n === 1 ? "Vous avez 1 carte à réviser aujourd’hui."
    : `Vous avez ${n} cartes à réviser aujourd’hui.`,
  es: (n) =>
    n === null ? 'Tienes tarjetas para repasar hoy.'
    : n === 1 ? 'Tienes 1 tarjeta para repasar hoy.'
    : `Tienes ${n} tarjetas para repasar hoy.`,
  hi: (n) =>
    n === null ? 'आज आपके पास समीक्षा के लिए कार्ड हैं।'
    : n === 1 ? 'आज आपके पास समीक्षा के लिए 1 कार्ड है।'
    : `आज आपके पास समीक्षा के लिए ${n} कार्ड हैं।`,
};

async function getReminderLang(): Promise<string> {
  try {
    const cache = await caches.open('tikrar-prefs');
    const res = await cache.match('/pref-lang');
    if (res) {
      const saved = (await res.text()).trim();
      if (saved in REMINDER_TEXT) return saved;
    }
  } catch {
    // ignore
  }
  const nav = (self.navigator.language || 'ar').slice(0, 2).toLowerCase();
  return nav in REMINDER_TEXT ? nav : 'en';
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let payload: { title?: string; body?: string; tag?: string; url?: string } = {};
      try {
        payload = event.data?.json() ?? {};
      } catch {
        payload = { body: event.data?.text() ?? '' };
      }
      const lang = await getReminderLang();
      const m = (payload.body || '').match(/\d+/);
      const body = REMINDER_TEXT[lang](m ? parseInt(m[0], 10) : null);
      const options: NotificationOptions = {
        body,
        tag: payload.tag || 'tikrar-daily-reminder',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: payload.url || '/' },
      };
      await self.registration.showNotification(payload.title || 'تكرار', options);
    })(),
  );
});

// --- Notification click handler ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string) || '/';
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
      // Otherwise open a new tab to the target url
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
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
