import { useState, useEffect, useCallback } from 'react';
import { type Lang, LANGS, getT, getTArr } from './i18n';

export function useLanguage() {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'ar';
    const stored = localStorage.getItem('tikrar-lang');
    if (stored === 'ar' || stored === 'en' || stored === 'fr') return stored;
    return 'ar';
  });

  useEffect(() => {
    const entry = LANGS.find((l) => l.code === lang)!;
    document.documentElement.lang = lang;
    document.documentElement.dir = entry.dir;
    localStorage.setItem('tikrar-lang', lang);
  }, [lang]);

  const t = useCallback((key: string, ...args: never[]): string => getT(lang)(key, ...args), [lang]);
  const tArr = useCallback((key: string): string[] => getTArr(lang)(key), [lang]);

  return { lang, setLang, t, tArr };
}

export function LanguageSwitcher({
  lang,
  onChange,
  t,
}: {
  lang: Lang;
  onChange: (l: Lang) => void;
  t: (k: string) => string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="surface border-border-soft text-text-muted rounded-[9px] px-3 py-2 sm:px-3.5 sm:py-2.5 text-base cursor-pointer hover:text-text-main hover:border-border transition-all flex items-center gap-1.5"
        title={t('app_name')}
      >
        {LANGS.find((l) => l.code === lang)?.flag}
        <span className="text-[11px] hidden sm:inline">{LANGS.find((l) => l.code === lang)?.code.toUpperCase()}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1.5 surface border-border rounded-[10px] py-1.5 z-50 min-w-[140px] animate-scale-in">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  onChange(l.code);
                  setOpen(false);
                }}
                className={`w-full text-right px-3 py-2 text-[13px] flex items-center gap-2.5 cursor-pointer transition-colors hover:bg-surface-2 ${
                  lang === l.code ? 'text-amber font-semibold' : 'text-text-muted'
                }`}
              >
                <span className="text-base">{l.flag}</span>
                <span>{l.name}</span>
                {lang === l.code && <span className="mr-auto text-amber">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
