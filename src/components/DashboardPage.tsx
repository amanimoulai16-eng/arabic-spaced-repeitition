import { Flame, Clock, CheckCircle, Layers } from 'lucide-react';
import { type Card, type ReviewLogEntry, getStatus, computeStreak } from '@/lib/srs';

type TFunc = (key: string, ...args: never[]) => string;

type Props = {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  dueCount: number;
  totalCount: number;
  streak: number;
  totalReviews: number;
  loading: boolean;
  onStartReview: () => void;
  t: TFunc;
};

export function DashboardPage({
  cards: _cards,
  reviewLog,
  dueCount,
  totalCount,
  streak,
  totalReviews,
  loading,
  onStartReview,
  t,
}: Props) {
  const streakCalc = computeStreak(
    reviewLog.map((r) => ({ date: r.reviewed_at, outcome: r.rating })),
  );

  return (
    <div className="animate-fade-in">
      {/* Welcome card */}
      <div className="surface p-5 sm:p-6 mb-4 bg-gradient-to-br from-amber-dim to-transparent">
        <h2 className="font-display font-bold text-xl m-0 mb-1">
          {t('welcome_back')}
        </h2>
        <p className="text-text-muted text-[13.5px] m-0">
          {t('app_tagline')}
        </p>
      </div>

      {/* Quick stats */}
      <p className="font-display font-bold text-sm text-text-muted mb-2.5">
        {t('quick_stats')}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
        <StatCard
          icon={<Clock size={18} />}
          value={loading ? '—' : dueCount}
          label={t('stat_due')}
          accent="amber"
        />
        <StatCard
          icon={<Flame size={18} />}
          value={loading ? '—' : streakCalc}
          label={t('stat_streak')}
          accent="green"
        />
        <StatCard
          icon={<Layers size={18} />}
          value={loading ? '—' : totalCount}
          label={t('stat_total')}
        />
        <StatCard
          icon={<CheckCircle size={18} />}
          value={loading ? '—' : totalReviews}
          label={t('stat_reviews')}
        />
      </div>

      {/* Review CTA */}
      {dueCount > 0 ? (
        <div className="surface border-amber/35 p-5 sm:p-6 text-center animate-fade-in">
          <p className="font-display font-bold text-2xl text-amber m-0 mb-1">
            {dueCount}
          </p>
          <p className="text-text-muted text-[13.5px] m-0 mb-4">
            {dueCount === 1
              ? t('due_today_count')
              : t('due_today_count_plural')}
          </p>
          <button
            onClick={onStartReview}
            className="btn-amber w-full py-3.5 text-[16px] font-display font-extrabold"
          >
            {t('review_now')}
          </button>
        </div>
      ) : (
        <div className="surface border-dashed border-border p-5 sm:p-6 text-center">
          <b className="font-display text-lg block mb-1.5 text-green">
            {t('no_due_cards')}
          </b>
          <span className="text-text-muted text-[13.5px]">
            {t('no_due_cards_sub')}
          </span>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  accent?: 'amber' | 'green';
}) {
  const color =
    accent === 'amber'
      ? 'text-amber'
      : accent === 'green'
        ? 'text-green'
        : 'text-text-main';
  return (
    <div className="surface p-3.5 flex flex-col gap-2">
      <div className={`${color} opacity-80`}>{icon}</div>
      <div>
        <div className={`font-display font-extrabold text-xl leading-none ${color}`}>
          {value}
        </div>
        <div className="text-text-muted text-[11.5px] mt-1">{label}</div>
      </div>
    </div>
  );
}
