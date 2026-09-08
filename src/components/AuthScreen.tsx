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
        { 
          redirectTo: 'https://tikrar-app.vercel.app/' 
        }
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
        password: newPassword,
      });
      if (updateError) {
        setError(t('password_update_fail'));
        setLoading(false);
        return;
      }
      setSuccess(t('password_updated'));
      setLoading(false);
      if (onRecoveryComplete) {
        setTimeout(() => {
          onRecoveryComplete();
          setMode('signin');
        }, 2000);
      }
    }
  }

  function switchMode(newMode: AuthMode) {
    setMode(newMode);
    setError(null);
    setSuccess(null);
  }

  const isUpdateMode = mode === 'update';
  const isForgotMode = mode === 'forgot';

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8">
      <div className="w-full max-w-[420px]">
        {/* Top bar: language + theme */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <svg width="28" height="22" viewBox="0 0 34 26" fill="none">
              <path d="M1 4 Q 3 22 17 22 Q 31 22 33 4" stroke="#E8B44E" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <circle cx="17" cy="21.4" r="2.6" fill="#E8B44E" />
            </svg>
            <span className="font-display font-black text-lg text-amber">{t('app_name')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher lang={lang} onChange={setLang} t={t} />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
        </div>

        {/* Card */}
        <div className="surface p-6 sm:p-7 animate-fade-in">
          <h1 className="font-display font-black text-2xl m-0 mb-1 text-text-main">
            {isUpdateMode
              ? t('update_password')
              : isForgotMode
                ? t('forgot_password')
                : mode === 'signup'
                  ? t('signup')
                  : t('signin')}
          </h1>
          <p className="text-text-muted text-[13.5px] m-0 mb-5">
            {isUpdateMode
              ? t('update_password_sub')
              : isForgotMode
                ? t('forgot_password_sub')
                : mode === 'signup'
                  ? t('signup_sub')
                  : t('signin_sub')}
          </p>

          <form onSubmit={handleSubmit} className="grid gap-3">
            {mode === 'signup' && (
              <div>
                <label className="block text-[12.5px] text-text-muted mb-1.5">
                  {t('display_name')}
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('display_name_ph')}
                  maxLength={50}
                  className="input-dark w-full px-3.5 py-3 text-[15px] placeholder:text-text-faint"
                />
              </div>
            )}

            {!isUpdateMode && (
              <div>
                <label className="block text-[12.5px] text-text-muted mb-1.5">
                  {t('email')}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="input-dark w-full px-3.5 py-3 text-[15px] placeholder:text-text-faint"
                  dir="ltr"
                />
              </div>
            )}

            {!isForgotMode && !isUpdateMode && (
              <div>
                <label className="block text-[12.5px] text-text-muted mb-1.5">
                  {t('password')}
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-dark w-full px-3.5 py-3 text-[15px] placeholder:text-text-faint"
                  dir="ltr"
                />
              </div>
            )}

            {isUpdateMode && (
              <div>
                <label className="block text-[12.5px] text-text-muted mb-1.5">
                  {t('new_password')}
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-dark w-full px-3.5 py-3 text-[15px] placeholder:text-text-faint"
                  dir="ltr"
                />
              </div>
            )}

            {error && (
              <div className="bg-coral-dim border border-coral/30 rounded-[9px] px-3.5 py-2.5 text-[13px] text-coral animate-fade-in">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-dim border border-green/30 rounded-[9px] px-3.5 py-2.5 text-[13px] text-green animate-fade-in">
                {success}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-amber w-full py-3 text-[15px] mt-1 disabled:opacity-60"
            >
              {loading
                ? t('processing')
                : isUpdateMode
                  ? t('update_btn')
                  : isForgotMode
                    ? t('send_reset_link')
                    : mode === 'signup'
                      ? t('create_account')
                      : t('enter')}
            </button>
          </form>

          {/* Mode switching links */}
          <div className="mt-5 text-center">
            {mode === 'signin' && (
              <>
                <button
                  onClick={() => switchMode('forgot')}
                  className="text-text-muted text-[13px] hover:text-amber transition-colors cursor-pointer block mb-3"
                >
                  {t('forgot_password')}
                </button>
                <button
                  onClick={() => switchMode('signup')}
                  className="text-text-muted text-[13px] hover:text-amber transition-colors cursor-pointer"
                >
                  {t('no_account')}
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button
                onClick={() => switchMode('signin')}
                className="text-text-muted text-[13px] hover:text-amber transition-colors cursor-pointer"
              >
                {t('have_account')}
              </button>
            )}
            {(isForgotMode || isUpdateMode) && (
              <button
                onClick={() => switchMode('signin')}
                className="text-text-muted text-[13px] hover:text-amber transition-colors cursor-pointer"
              >
                {t('back_to_signin')}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-text-faint text-[12px] mt-5">
          {t('app_tagline')}
        </p>
      </div>
    </div>
  );
}
