import { useState, useEffect } from 'react';
import {
  type Card,
  type Rating,
  type Attachment,
  type Category,
  getStatus,
  relativeLabel,
  stageLabel,
  categoryColor,
} from '@/lib/srs';
import { supabase } from '@/lib/supabase';
import { ForgettingCurve } from './ForgettingCurve';
import { EditCardModal } from './EditCardModal';

type TFunc = (key: string, ...args: never[]) => string;

type Props = {
  card: Card;
  linkedCard: Card | null;
  cards: Card[];
  categories: Category[];
  userId: string;
  onReview: (id: string, rating: Rating) => void;
  onDelete: (id: string) => void;
  onSnooze: (id: string) => void;
  onEdit: (id: string, data: {
    title: string;
    notes: string;
    category: string;
    resource: string;
    linkedItemId: string;
    question: string;
    answer: string;
    attachments: Attachment[];
  }) => Promise<void>;
  t: TFunc;
};

export function CardItem({
  card,
  linkedCard,
  cards,
  categories,
  userId,
  onReview,
  onDelete,
  onSnooze,
  onEdit,
  t,
}: Props) {
  const [flashOpen, setFlashOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const status = getStatus(card);
  const cardBorder =
    status === 'overdue'
      ? 'border-coral/45'
      : status === 'today'
        ? 'border-amber/40'
        : 'border-border-soft';

  useEffect(() => {
    if (!card.attachments || card.attachments.length === 0) return;
    let cancelled = false;
    (async () => {
      const urls: Record<string, string> = {};
      for (const att of card.attachments) {
        const { data } = await supabase.storage
          .from('card-attachments')
          .createSignedUrl(att.path, 3600);
        if (data?.signedUrl) urls[att.path] = data.signedUrl;
      }
      if (!cancelled) setAttachmentUrls(urls);
    })();
    return () => { cancelled = true; };
  }, [card.attachments]);

  return (
    <div className={`surface ${cardBorder} p-4 flex flex-col gap-3 animate-slide-up`}>
      {/* Top: title + actions */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-display font-bold text-base text-text-main break-words leading-snug">
            {card.title}
          </p>
          {card.notes && (
            <div className="text-text-muted text-[13px] mt-1 leading-relaxed">
              {card.notes}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setEditOpen(true)}
            className="text-text-faint hover:text-amber transition-colors text-sm px-1.5"
            title={t('edit')}
          >
            ✏️
          </button>
          <button
            onClick={() => onDelete(card.id)}
            className="text-text-faint hover:text-coral transition-colors text-sm px-1"
            title={t('delete')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Tags */}
      {((card.category && card.category !== '') || linkedCard || card.resource) && (
        <div className="flex flex-wrap gap-1.5">
          {card.category && card.category !== '' && (
            <span
              className="text-[11px] px-2.5 py-1 rounded-full font-medium"
              style={{
                background: categoryColor(card.category) + '22',
                color: categoryColor(card.category),
              }}
            >
              {card.category}
            </span>
          )}
          {linkedCard && (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-surface-2 border border-border text-text-muted">
              {t('depends_on')}{linkedCard.title}
            </span>
          )}
          {card.resource && card.resource !== '' && (
            <span className="text-[11px] px-2.5 py-1 rounded-full bg-surface-2 border border-border">
              <a
                href={card.resource}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber no-underline"
              >
                {t('source')}
              </a>
            </span>
          )}
        </div>
      )}

      {/* Attachments */}
      {card.attachments && card.attachments.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5">
          {card.attachments.map((att: Attachment, i: number) => {
            const url = attachmentUrls[att.path];
            const isImage = att.type.startsWith('image/');
            if (isImage && url) {
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block surface-2 rounded-[9px] overflow-hidden"
                >
                  <img
                    src={url}
                    alt={att.name}
                    className="w-full h-20 object-cover"
                  />
                </a>
              );
            }
            return (
              <a
                key={i}
                href={url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 surface-2 rounded-[9px] px-2.5 py-2 text-[11px] text-text-muted hover:text-amber transition-colors truncate"
              >
                <span>{'\uD83D\uDCC4'}</span>
                <span className="truncate">{att.name}</span>
              </a>
            );
          })}
        </div>
      )}

      {/* Stage dots */}
      <div className="flex items-center gap-2 text-[12px] text-text-muted">
        <div className="flex gap-1">
          {card.intervals.map((_, i) => (
            <span
              key={i}
              className={`w-1.5 h-1.5 rounded-full ${
                i <= card.stage_index ? 'bg-amber' : 'bg-border'
              }`}
            />
          ))}
        </div>
        <span>{stageLabel(card, t)}</span>
      </div>

      {/* Flashcard Q/A */}
      {card.question && card.question !== '' && (
        <>
          <button
            onClick={() => setFlashOpen(!flashOpen)}
            className="surface-2 px-3 py-2 text-[13px] text-right text-text-muted hover:text-text-main transition-colors"
          >
            <span className="text-text-main font-medium">{t('q_label')}</span>
            {card.question}
          </button>
          {flashOpen && (
            <div className="surface-2 px-3 py-2 text-[13px] text-text-muted border border-dashed border-border animate-fade-in">
              <span className="text-amber font-medium">{t('a_label')}</span>
              {card.answer || '—'}
            </div>
          )}
        </>
      )}

      {/* Curve */}
      <div className="bg-surface-2 rounded-[9px] px-2.5 pt-2 pb-1">
        <ForgettingCurve card={card} />
      </div>

      {/* Review info */}
      <div className="flex justify-between items-center text-[13px]">
        <span className="text-text-muted">{t('next_review')}</span>
        <span
          className={`font-semibold ${
            status === 'overdue'
              ? 'text-coral'
              : status === 'today'
                ? 'text-amber'
                : 'text-text-muted'
          }`}
        >
          {relativeLabel(card, t)}
        </span>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-1.5">
        <button
          onClick={() => onReview(card.id, 'forgot')}
          className="btn-coral-dim py-2.5 text-[13px] font-display font-bold"
        >
          {t('very_hard')}
        </button>
        <button
          onClick={() => onReview(card.id, 'good')}
          className="btn-amber-dim py-2.5 text-[13px] font-display font-bold"
        >
          {t('medium')}
        </button>
        <button
          onClick={() => onReview(card.id, 'easy')}
          className="btn-green-dim py-2.5 text-[13px] font-display font-bold"
        >
          {t('very_easy')}
        </button>
      </div>

      {/* Snooze */}
      {status !== 'upcoming' && (
        <button
          onClick={() => onSnooze(card.id)}
          className="text-text-faint hover:text-text-muted text-[12px] underline underline-offset-2 transition-colors text-center"
        >
          {t('snooze')}
        </button>
      )}

      {editOpen && (
        <EditCardModal
          card={card}
          cards={cards}
          categories={categories}
          userId={userId}
          onSave={async (data) => {
            await onEdit(card.id, data);
            setEditOpen(false);
          }}
          onClose={() => setEditOpen(false)}
          t={t}
        />
      )}
    </div>
  );
}
