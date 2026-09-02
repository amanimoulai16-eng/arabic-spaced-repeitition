import { Home, Repeat, Library, Settings } from 'lucide-react';

export type PageKey = 'dashboard' | 'review' | 'library' | 'settings';

type Props = {
  active: PageKey;
  onChange: (page: PageKey) => void;
  t: (key: string) => string;
};

export function BottomNav({ active, onChange, t }: Props) {
  const items: { key: PageKey; label: string; icon: typeof Home }[] = [
    { key: 'dashboard', label: t('nav_home'), icon: Home },
    { key: 'review', label: t('nav_review'), icon: Repeat },
    { key: 'library', label: t('nav_library'), icon: Library },
    { key: 'settings', label: t('nav_settings'), icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border-soft px-2 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
      <div className="max-w-[920px] mx-auto flex justify-around">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onChange(item.key)}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-[10px] transition-all cursor-pointer ${
                isActive
                  ? 'text-amber'
                  : 'text-text-faint hover:text-text-muted'
              }`}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.5 : 2}
                className={isActive ? 'scale-110 transition-transform' : ''}
              />
              <span className="text-[10.5px] font-medium leading-none">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
