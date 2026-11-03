import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from './supabase';

type ReminderState = {
  enabled: boolean;
  time: string; // "HH:MM" 24h
};

type Permission = 'default' | 'granted' | 'denied' | 'unsupported';

const DEFAULT_TIME = '09:00';
const STORAGE_KEY = 'tikrar_reminder_last_fired';
const PERIODIC_SYNC_TAG = 'tikrar-daily-reminder';
const VAPID_KEY_CACHE = 'tikrar_vapid_public_key';

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Fetch the VAPID public key from the edge function (cached in localStorage). */
async function fetchVapidPublicKey(): Promise<string | null> {
  const cached = localStorage.getItem(VAPID_KEY_CACHE);
  if (cached) return cached;
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/vapid-public-key`;
    console.log('[useReminders] fetching VAPID public key from', url);
    const res = await fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    });
    if (!res.ok) {
      console.error('[useReminders] VAPID key fetch returned', res.status);
      return null;
    }
    const data = (await res.json()) as { publicKey?: string };
    if (!data.publicKey) {
      console.error('[useReminders] VAPID key response missing publicKey');
      return null;
    }
    console.log('[useReminders] got VAPID public key');
    localStorage.setItem(VAPID_KEY_CACHE, data.publicKey);
    return data.publicKey;
  } catch (err) {
    console.error('[useReminders] VAPID key fetch failed:', err);
    return null;
  }
}

async function getSWRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[useReminders] serviceWorker not supported');
    return null;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.error('[useReminders] SW registration not ready:', err);
    return null;
  }
}

/**
 * Cache the reminder config in the SW's Cache Storage so the periodic
 * background sync event can read it even when no client (tab) is open.
 */
async function cacheReminderConfig(
  reg: ServiceWorkerRegistration,
  config: {
    enabled: boolean;
    time: string;
    lastFired: string | null;
    body: string;
  },
): Promise<void> {
  try {
    reg.active?.postMessage({
      type: 'CACHE_REMINDER_CONFIG',
      config,
    });
  } catch {
    // SW not active yet — ignore
  }
}

export function useReminders(dueCount: number, lastReviewDate: string | null) {
  const [state, setState] = useState<ReminderState>({
    enabled: false,
    time: DEFAULT_TIME,
  });
  const [permission, setPermission] = useState<Permission>('default');
  const [loaded, setLoaded] = useState(false);

  const timerRef = useRef<number | null>(null);
  // Mirror state into a ref so callbacks (update, maybeFireNotification) read
  // fresh values without being re-created on every state change.
  const stateRef = useRef(state);
  stateRef.current = state;
  // Keep the latest dueCount / lastReviewDate accessible to the scheduler
  // without rescheduling on every change.
  const ctxRef = useRef({ dueCount, lastReviewDate });
  ctxRef.current = { dueCount, lastReviewDate };

  // --- Notification permission tracking ---
  useEffect(() => {
    if (!('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as Permission);
  }, []);

  const requestPermission = useCallback(async (): Promise<Permission> => {
    if (!('Notification' in window)) {
      console.warn('[useReminders] Notification API not supported');
      setPermission('unsupported');
      return 'unsupported';
    }
    try {
      const result = await Notification.requestPermission();
      console.log('[useReminders] requestPermission result:', result);
      setPermission(result as Permission);
      return result as Permission;
    } catch (err) {
      console.error('[useReminders] requestPermission threw:', err);
      setPermission('denied');
      return 'denied';
    }
  }, []);

  // --- Register a Web Push subscription with the server ---
  const registerPush = useCallback(async (): Promise<void> => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('[useReminders] push not supported — SW or PushManager missing');
      return;
    }
    if (!('showNotification' in ServiceWorkerRegistration.prototype)) {
      console.warn('[useReminders] SW showNotification not supported');
      return;
    }
    console.log('[useReminders] registerPush: getting SW registration…');
    const reg = await getSWRegistration();
    if (!reg) {
      console.error('[useReminders] registerPush: no SW registration — aborting');
      return;
    }
    console.log('[useReminders] registerPush: fetching VAPID key…');
    const vapidKey = await fetchVapidPublicKey();
    if (!vapidKey) {
      console.error('[useReminders] registerPush: no VAPID key — aborting');
      return;
    }

    let sub: PushSubscription | null = null;
    try {
      sub = await reg.pushManager.getSubscription();
      console.log('[useReminders] existing subscription:', sub ? 'found' : 'none');
    } catch (err) {
      console.error('[useReminders] getSubscription failed:', err);
      sub = null;
    }
    if (!sub) {
      try {
        console.log('[useReminders] subscribing via pushManager.subscribe()…');
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(vapidKey),
        });
        console.log('[useReminders] push subscription created');
      } catch (err) {
        console.error('[useReminders] pushManager.subscribe failed:', err);
        return;
      }
    }

    // Persist subscription server-side
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        console.error('[useReminders] no auth session — cannot send subscription to server');
        return;
      }
      console.log('[useReminders] sending subscription to subscribe-push…');
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/subscribe-push`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(sub),
      });
      if (!res.ok) {
        console.error('[useReminders] subscribe-push returned', res.status);
      } else {
        console.log('[useReminders] subscription persisted server-side');
      }
    } catch (err) {
      console.error('[useReminders] subscribe-push fetch failed:', err);
    }
  }, []);

  // --- Unsubscribe from push and remove the row server-side ---
  const unregisterPush = useCallback(async (): Promise<void> => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const reg = await getSWRegistration();
    if (!reg) return;
    try {
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        console.log('[useReminders] push subscription unsubscribed');
      }
    } catch (err) {
      console.error('[useReminders] unsubscribe failed:', err);
    }
  }, []);

  // --- Load saved reminder settings from Supabase ---
  const loadSettings = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('reminder_enabled, reminder_time')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) return;
      setState({
        enabled: data?.reminder_enabled ?? false,
        time: data?.reminder_time || DEFAULT_TIME,
      });
    } catch {
      // network — keep defaults
    } finally {
      setLoaded(true);
    }
  }, []);

  // --- Persist reminder settings ---
  const saveSettings = useCallback(
    async (userId: string, next: ReminderState) => {
      try {
        await supabase
          .from('user_settings')
          .upsert({
            user_id: userId,
            reminder_enabled: next.enabled,
            reminder_time: next.time,
            updated_at: new Date().toISOString(),
          });
      } catch {
        // network — settings still applied locally
      }
    },
    [],
  );

  const update = useCallback(
    (userId: string, patch: Partial<ReminderState>) => {
      const prev = stateRef.current;
      const next = { ...prev, ...patch };
      setState(next);
      void saveSettings(userId, next);

      // When enabling: request permission + register push subscription
      if (patch.enabled === true && !prev.enabled) {
        console.log('[useReminders] toggle ON — starting push registration flow');
        void (async () => {
          try {
            console.log('[useReminders] requesting notification permission…');
            const perm = await requestPermission();
            console.log('[useReminders] permission result:', perm);
            if (perm !== 'granted') {
              console.warn('[useReminders] permission not granted — skipping push subscription');
              return;
            }
            console.log('[useReminders] registering push subscription…');
            await registerPush();
            console.log('[useReminders] push registration flow complete');
          } catch (err) {
            console.error('[useReminders] push registration flow failed:', err);
          }
        })();
      }

      // When disabling: unsubscribe from push
      if (patch.enabled === false && prev.enabled) {
        console.log('[useReminders] toggle OFF — unregistering push');
        void (async () => {
          try {
            await unregisterPush();
            console.log('[useReminders] push unregistered');
          } catch (err) {
            console.error('[useReminders] push unregistration failed:', err);
          }
        })();
      }
    },
    [saveSettings, requestPermission, registerPush, unregisterPush],
  );

  // --- Core: fire a notification if conditions are met ---
  const maybeFireNotification = useCallback(async () => {
    const { enabled, time } = stateRef.current;
    if (!enabled) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    // Only fire at the chosen time (within a 2-minute window)
    const now = new Date();
    const [h, m] = time.split(':').map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    const diffMin = Math.abs(now.getTime() - target.getTime()) / 60000;
    if (diffMin > 2) return;

    // Only once per day
    const todayKey = now.toISOString().slice(0, 10);
    const lastFired = localStorage.getItem(STORAGE_KEY);
    if (lastFired === todayKey) return;

    const { dueCount: due, lastReviewDate } = ctxRef.current;
    const reviewedToday = lastReviewDate === todayKey;
    if (reviewedToday) return;
    if (due === 0) return;

    const body = `You have ${due} card${due === 1 ? '' : 's'} due for review today.`;

    // Prefer SW-based notification (works when page is not focused)
    const reg = await getSWRegistration();
    if (reg) {
      try {
        await reg.showNotification('Tikrar — تكرار', {
          body,
          tag: 'tikrar-daily-reminder',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          data: { url: '/' },
        });
        localStorage.setItem(STORAGE_KEY, todayKey);
        // Update the cached config so periodic sync doesn't double-fire
        await cacheReminderConfig(reg, {
          enabled,
          time,
          lastFired: todayKey,
          body,
        });
        return;
      } catch {
        // fall through to page-level notification
      }
    }

    // Fallback: page-level notification
    try {
      const n = new Notification('Tikrar — تكرار', {
        body,
        tag: 'tikrar-daily-reminder',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
      localStorage.setItem(STORAGE_KEY, todayKey);
    } catch {
      // ignore
    }
  }, []);

  // --- Scheduler: check every minute while the app is open ---
  useEffect(() => {
    if (!state.enabled) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const tick = () => void maybeFireNotification();
    tick();
    timerRef.current = window.setInterval(tick, 60_000);
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.enabled, maybeFireNotification]);

  // --- Register periodic background sync (experimental, Chrome/Edge) ---
  // This lets the SW wake up periodically even when the app is closed and
  // show a notification if the user has due cards.
  useEffect(() => {
    if (!state.enabled) return;
    if (!('serviceWorker' in navigator)) return;
    if (!('PeriodicSyncManager' in window)) return;

    let cancelled = false;
    (async () => {
      const reg = await getSWRegistration();
      if (!reg || cancelled) return;
      try {
        // Check if already registered
        const tags = await (reg as ServiceWorkerRegistration & {
          periodicSync?: { getTags(): Promise<string[]> };
        }).periodicSync?.getTags();
        if (tags?.includes(PERIODIC_SYNC_TAG)) return;

        await (reg as ServiceWorkerRegistration & {
          periodicSync?: { register(
            tag: string,
            options?: { minInterval?: number },
          ): Promise<void> };
        }).periodicSync?.register(PERIODIC_SYNC_TAG, {
          // 24 hours in milliseconds — the browser may adjust this
          minInterval: 24 * 60 * 60 * 1000,
        });
      } catch {
        // Periodic sync not supported or permission denied — page-side
        // scheduler still works when the app is open
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.enabled]);

  // --- Cache reminder config in SW for periodic sync to read ---
  useEffect(() => {
    if (!state.enabled) return;
    void (async () => {
      const reg = await getSWRegistration();
      if (!reg) return;
      const todayKey = new Date().toISOString().slice(0, 10);
      const { dueCount: due } = ctxRef.current;
      const body = due > 0
        ? `You have ${due} card${due === 1 ? '' : 's'} due for review today.`
        : 'You have cards due for review today.';
      cacheReminderConfig(reg, {
        enabled: state.enabled,
        time: state.time,
        lastFired: localStorage.getItem(STORAGE_KEY) ?? todayKey,
        body,
      });
    })();
  }, [state.enabled, state.time, dueCount]);

  // --- Register push when reminders enabled and permission granted ---
  useEffect(() => {
    if (!state.enabled) return;
    if (permission !== 'granted') return;
    void registerPush();
  }, [state.enabled, permission, registerPush]);

  return {
    state,
    permission,
    loaded,
    requestPermission,
    loadSettings,
    update,
  };
}
