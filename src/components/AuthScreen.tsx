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
};

export function AuthScreen({ onAuthSuccess, lang, setLang, initialMode = 'signin' }: Props) {
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
        { redirectTo: window.location.origin },
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
      setNewPassword('');
      setTimeout(() => {
        supabase.auth.signOut();
        setMode('signin');
      }, 2500);
    }
  }

  const isForgot = mode === 'forgot';
  const isUpdate = mode === 'update';
  const showEmailField = mode === 'signin' || mode === 'signup' || mode === 'forgot';
  const showPasswordField = mode === 'signin' || mode === 'signup';
  const showNewPasswordField = mode === 'update';

  const heading = isForgot
    ? t('forgot_password')
    : isUpdate
      ? t('update_password')
      : mode === 'signin'
        ? t('signin')
        : t('signup');

  const subheading = isForgot
    ? t('forgot_password_sub')
    : isUpdate
      ? t('update_password_sub')
      : mode === 'signin'
        ? t('signin_sub')
        : t('signup_sub');

  const submitLabel = loading
    ? t('processing')
    : isForgot
      ? t('send_reset_link')
      : isUpdate
        ? t('update_btn')
        : mode === 'signin'
          ? t('enter')
          : t('create_account');

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-8">
      <div className="w-full max-w-[400px]">
        {/* Top controls */}
        <div className="flex justify-end gap-2 mb-4">
          <LanguageSwitcher lang={lang} onChange={setLang} t={t} />
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display font-black text-[32px] m-0 mb-1 flex items-center justify-center">
            <svg
              className="inline-block ml-2"
              width="34"
              height="26"
              viewBox="0 0 34 26"
              fill="none"
            >
              <path
                d="M1 4 Q 3 22 17 22 Q 31 22 33 4"
                stroke="#E8B44E"
                strokeWidth="2.5"
                strokeLinecap="round"
                fill="none"
              />
              <circle cx="17" cy="21.4" r="2.6" fill="#E8B44E" />
            </svg>
            {t('app_name')}
          </h1>
          <p className="text-text-muted text-sm m-0">
            {t('app_tagline')}
          </p>
        </div>

        <div className="surface p-6">
          <h2 className="font-display font-bold text-lg m-0 mb-1">
            {heading}
          </h2>
          <p className="text-text-muted text-[13px] m-0 mb-5">
            {subheading}
          </p>

          <form onSubmit={handleSubmit} className="grid gap-3.5">
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
                  className="input-dark w-full px-3.5 py-2.5 text-[14px] placeholder:text-text-faint"
                />
              </div>
            )}
            {showEmailField && (
              <div>
                <label className="block text-[12.5px] text-text-muted mb-1.5">
                  {t('email')}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="input-dark w-full px-3.5 py-2.5 text-[14px] placeholder:text-text-faint"
                  dir="ltr"
                />
              </div>
            )}
            {showPasswordField && (
              <div>
                <label className="block text-[12.5px] text-text-muted mb-1.5">
                  {t('password')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="input-dark w-full px-3.5 py-2.5 text-[14px] placeholder:text-text-faint"
                  dir="ltr"
                />
              </div>
            )}
            {showNewPasswordField && (
              <div>
                <label className="block text-[12.5px] text-text-muted mb-1.5">
                  {t('new_password')}
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="input-dark w-full px-3.5 py-2.5 text-[14px] placeholder:text-text-faint"
                  dir="ltr"
                />
              </div>
            )}

            {error && (
              <p className="text-[13px] text-coral bg-coral-dim px-3 py-2.5 rounded-[9px] animate-fade-in">
                {error}
              </p>
            )}

            {success && (
              <p className="text-[13px] text-green bg-green-dim px-3 py-2.5 rounded-[9px] animate-fade-in">
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-amber w-full py-3 text-[15px] mt-1"
            >
              {submitLabel}
            </button>
          </form>

          <div className="text-center mt-4 space-y-2">
            {mode === 'signin' && (
              <>
                <button
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-text-muted text-[13px] cursor-pointer hover:text-amber transition-colors block w-full"
                >
                  {t('forgot_password')}
                </button>
                <button
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                    setSuccess(null);
                  }}
                  className="text-text-muted text-[13px] cursor-pointer hover:text-text-main transition-colors block"
                >
                  {t('no_account')}
                </button>
              </>
            )}
            {(isForgot || isUpdate) && (
              <button
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setSuccess(null);
                }}
                className="text-text-muted text-[13px] cursor-pointer hover:text-text-main transition-colors block"
              >
                {t('back_to_signin')}
              </button>
            )}
            {mode === 'signup' && (
              <button
                onClick={() => {
                  setMode('signin');
                  setError(null);
                  setSuccess(null);
                }}
                className="text-text-muted text-[13px] cursor-pointer hover:text-text-main transition-colors block"
              >
                {t('have_account')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
