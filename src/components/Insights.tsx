import {
  type Card,
  type ReviewLogEntry,
  startOfDay,
  addDays,
  dateKey,
  getShortDayName,
} from '@/lib/srs';

type TFunc = (key: string, ...args: never[]) => string;
type TArrFunc = (key: string) => string[];

type Props = {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  t: TFunc;
  tArr: TArrFunc;
};

export function Insights({ cards, reviewLog, t, tArr }: Props) {
  const today = startOfDay(new Date());
  const counts: { date: Date; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = dateKey(d);
    const c = reviewLog.filter((r) => r.reviewed_at === key).length;
    counts.push({ date: d, count: c });
  }
  const max = Math.max(1, ...counts.map((c) => c.count));
  const totalWeek = counts.reduce((s, c) => s + c.count, 0);

  // Hardest items: most "forgot" ratings
  const forgotCounts = new Map<string, number>();
  reviewLog
    .filter((r) => r.rating === 'forgot')
    .forEach((r) => {
      forgotCounts.set(r.card_id, (forgotCounts.get(r.card_id) || 0) + 1);
    });
  const hardList = Array.from(forgotCounts.entries())
    .map(([cardId, cnt]) => ({
      title: cards.find((c) => c.id === cardId)?.title || '—',
      cnt,
    }))
    .sort((a, b) => b.cnt - a.cnt)
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1.3fr_1fr] gap-3 sm:gap-3.5 mb-5">
      {/* Chart */}
      <div className="surface p-4">
        <p className="font-display font-bold text-sm text-text-muted mb-0">
          {t('reviews_7days')}
        </p>
        {totalWeek === 0 ? (
          <div className="text-text-faint text-[13px] text-center py-3.5">
            {t('no_reviews_week')}
          </div>
        ) : (
          <div className="flex items-end gap-2 h-[70px] mt-2.5">
            {counts.map((c, i) => {
              const pct = Math.round((c.count / max) * 100);
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col items-center gap-1.5"
                >
                  <div
                    className="w-full bg-amber-dim rounded-t-[4px] relative"
                    style={{ height: '52px' }}
                  >
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-amber rounded-t-[4px] transition-all duration-500"
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-text-faint">
                    {getShortDayName(c.date, tArr)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hard list */}
      <div className="surface p-4">
        <p className="font-display font-bold text-sm text-text-muted mb-0">
          {t('hardest')}
        </p>
        {hardList.length === 0 ? (
          <div className="text-text-faint text-[13px] text-center py-3.5">
            {t('no_hard')}
          </div>
        ) : (
          <ul className="list-none m-0 mt-2.5 p-0 grid gap-2">
            {hardList.map((item, i) => (
              <li
                key={i}
                className="flex justify-between items-center text-[13px]"
              >
                <span className="truncate text-text-main">{item.title}</span>
                <span className="text-coral font-display font-bold text-[12px] bg-coral-dim px-2.5 py-0.5 rounded-full flex-shrink-0 mr-2">
                  {item.cnt}×
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
