import { useState } from 'react';
import { type Card, type Rating } from '@/lib/srs';

type TFunc = (key: string, ...args: never[]) => string;

type Props = {
  dueCards: Card[];
  onReview: (id: string, rating: Rating) => void;
  onExit: () => void;
  t: TFunc;
};

export function ReviewPage({ dueCards, onReview, onExit, t }: Props) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(false);

  const total = dueCards.length;

  function handleRate(rating: Rating) {
    const card = dueCards[index];
    if (!card) return;
    onReview(card.id, rating);
    if (index + 1 >= total) {
      setCompleted(true);
    } else {
      setIndex(index + 1);
      setRevealed(false);
    }
  }

  function handleSkip() {
    if (index + 1 >= total) {
      setCompleted(true);
    } else {
      setIndex(index + 1);
      setRevealed(false);
    }
  }

  const card = dueCards[index];
  const progress = total > 0 ? ((index) / total) * 100 : 0;

  return (
    <div className="min-h-[calc(100vh-200px)] flex flex-col animate-fade-in">
      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <span className="font-display font-bold text-sm text-text-muted">
            {t('review_session')}
          </span>
          <span className="text-[13px] text-text-muted font-medium">
            {completed
              ? t('session_done')
              : t('of_total', (index + 1) as never, total as never)}
          </span>
        </div>
        <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber rounded-full transition-all duration-500 ease-out"
            style={{ width: `${completed ? 100 : progress}%` }}
          />
        </div>
      </div>

      {/* Card or completion */}
      {completed || !card ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-8 animate-fade-in">
            <b className="font-display text-2xl block mb-2 text-green">
              {t('session_complete')}
            </b>
            <span className="text-text-muted text-[14px]">
              {t('reviewed_n', total as never)}
            </span>
            <button
              onClick={onExit}
              className="btn-amber mt-6 px-6 py-2.5 text-[14px] block mx-auto"
            >
              {t('nav_home')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Card content */}
          <div className="surface p-6 sm:p-8 text-center mb-5 flex-1 flex flex-col items-center justify-center gap-3 min-h-[200px]">
            {card.question && card.question !== '' ? (
              <>
                <div className="font-display font-bold text-xl leading-relaxed">
                  {card.question}
                </div>
                {!revealed ? (
                  <button
                    onClick={() => setRevealed(true)}
                    className="border border-border text-text-muted rounded-[10px] px-5 py-2 text-[13px] cursor-pointer hover:text-text-main hover:border-amber/40 transition-all mt-2"
                  >
                    {t('reveal_answer')}
                  </button>
                ) : (
                  <div className="text-amber text-lg font-display animate-fade-in">
                    {card.answer || '—'}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="font-display font-bold text-xl leading-relaxed">
                  {card.title}
                </div>
                {card.notes && card.notes !== '' && (
                  <div className="text-text-muted text-[14px] leading-relaxed max-w-[400px]">
                    {card.notes}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Rating buttons */}
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            <button
              onClick={() => handleRate('forgot')}
              className="btn-coral-dim py-3.5 text-[14px] font-display font-bold"
            >
              {t('very_hard')}
            </button>
            <button
              onClick={() => handleRate('good')}
              className="btn-amber-dim py-3.5 text-[14px] font-display font-bold"
            >
              {t('medium')}
            </button>
            <button
              onClick={() => handleRate('easy')}
              className="btn-green-dim py-3.5 text-[14px] font-display font-bold"
            >
              {t('very_easy')}
            </button>
          </div>

          <button
            onClick={handleSkip}
            className="w-full text-text-faint text-[12.5px] cursor-pointer py-2 hover:text-text-muted transition-colors"
          >
            {t('skip')}
          </button>

          <button
            onClick={onExit}
            className="w-full text-text-faint text-[12px] cursor-pointer py-1 hover:text-coral transition-colors mt-1"
          >
            ✕ {t('exit_session')}
          </button>
        </div>
      )}
    </div>
  );
}
