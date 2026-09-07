import { useEffect, useState, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { UserProfile } from '@/lib/srs';

const STARTUP_TIMEOUT = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    withTimeout(supabase.auth.getSession(), STARTUP_TIMEOUT).then((res) => {
      if (!mounted.current) return;
      const session = res?.data.session ?? null;
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (!mounted.current) return;
        if (event === 'PASSWORD_RECOVERY') {
          setRecoveryMode(true);
          setLoading(false);
          return;
        }
        setSession(newSession);
        if (newSession) {
          fetchProfile(newSession.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      },
    );

    return () => {
      mounted.current = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function fetchProfile(userId: string) {
    const res = await withTimeout(
      supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle(),
      STARTUP_TIMEOUT,
    );
    if (!mounted.current) return;
    setProfile((res?.data as UserProfile | null) ?? null);
    setLoading(false);
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  }

  async function signUp(email: string, password: string, displayName?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });
    return { data, error };
  }

  async function signOut() {
    setSession(null);
    setProfile(null);
    setLoading(false);
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore network errors during sign out
    }
  }

  return { session, profile, loading, recoveryMode, setRecoveryMode, signIn, signUp, signOut };
}
