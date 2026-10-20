import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from './supabase';

type ReminderState = {
  enabled: boolean;
  time: string; // "HH:MM" 24h
};

type Permission = 'default' | 'granted' | 'denied' | 'unsupported';

const DEFAULT_TIME = '09:00';
const STORAGE_KEY = 'tikrar_reminder_last_fired';

export function useReminders(dueCount: number, lastReviewDate: string | null) {
  const [state, setState] = useState<ReminderState>({
    enabled: false,
    time: DEFAULT_TIME,
  });
  const [permission, setPermission] = useState<Permission>('default');
  const [loaded, setLoaded] = useState(false);

  const timerRef = useRef<number | null>(null);
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
      setPermission('unsupported');
      return 'unsupported';
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result as Permission);
      return result as Permission;
    } catch {
      setPermission('denied');
      return 'denied';
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
      setState((prev) => {
        const next = { ...prev, ...patch };
        void saveSettings(userId, next);
        return next;
      });
    },
    [saveSettings],
  );

  // --- Core: fire a notification if conditions are met ---
  const maybeFireNotification = useCallback(() => {
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

    try {
      const n = new Notification('Tikrar — تكرار', {
        body: `You have ${due} card${due === 1 ? '' : 's'} due for review today.`,
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

  // Mirror state into a ref so the scheduler reads fresh values.
  const stateRef = useRef(state);
  stateRef.current = state;

  // --- Scheduler: check every minute while the app is open ---
  useEffect(() => {
    if (!state.enabled) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    const tick = () => maybeFireNotification();
    tick();
    timerRef.current = window.setInterval(tick, 60_000);
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.enabled, maybeFireNotification]);

  return {
    state,
    permission,
    loaded,
    requestPermission,
    loadSettings,
    update,
  };
}
