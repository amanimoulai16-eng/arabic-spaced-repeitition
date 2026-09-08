import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { type Lang } from '@/lib/i18n';
import { useLanguage, LanguageSwitcher } from '@/lib/useLanguage';
import { useTheme, ThemeToggle } from '@/lib/useTheme';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'update';

type Props = {
  onAuthSuccess: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  initialMode?: AuthMode;
  onRecoveryComplete?: () => void;
};

const PRODUCTION_URL = 'https://tikrar-app.vercel.app';

function getRedirectURL(): string {
  const envURL = import.meta.env.VITE_SITE_URL as string | undefined;
  if (envURL && /^https?:\/\//.test(envURL)) return envURL.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    return window.location.origin;
  }
  return PRODUCTION_URL;
}

export function AuthScreen({ onAuthSuccess, lang, setLang, initialMode = 'signin', onRecoveryComplete }: Props) {
  const { t } = useLanguage();
  const { theme, toggle: toggleTheme } = useTheme();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (mode === 'signin') {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(t('auth_error'));
        setLoading(false);
        return;
      }
      onAuthSuccess();
    } else if (mode === 'signup') {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() || undefined } },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      if (data.user && !data.session) {
        setError(t('email_confirm'));
        setMode('signin');
        setLoading(false);
        return;
      }
      onAuthSuccess();
    } else if (mode === 'forgot') {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo: getRedirectURL() }
      );
      if (resetError) {
        setError(t('reset_send_fail'));
        setLoading(false);
        return;
      }
      setSuccess(t('reset_email_sent'));
      setLoading(false);
    } else if (mode === 'update') {
      if (newPassword.length < 6) {
        setError(t('password_update_fail'));
        setLoading(false);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
