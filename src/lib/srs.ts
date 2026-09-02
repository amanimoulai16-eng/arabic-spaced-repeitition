export type Rating = 'forgot' | 'good' | 'easy';

export type ReviewHistoryEntry = {
  date: string;
  outcome: Rating;
};

export type Attachment = {
  path: string;
  name: string;
  type: string;
  size: number;
};

export type Card = {
  id: string;
  user_id: string | null;
  title: string;
  notes: string;
  category: string;
  category_id: string | null;
  resource: string;
  linked_item_id: string | null;
  question: string;
  answer: string;
  intervals: number[];
  stage_index: number;
  next_review_at: string;
  last_review_at: string;
  created_at: string;
  review_count: number;
  attachments: Attachment[];
};

export type ReviewLogEntry = {
  id: string;
  card_id: string;
  rating: Rating;
  reviewed_at: string;
  user_id: string | null;
};

export type Category = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
};

export type UserProfile = {
  id: string;
  display_name: string | null;
  created_at: string;
};

export type Settings = {
  intervals: number[];
};

export const DEFAULT_INTERVALS = [1, 3, 7, 14, 30, 30];

export const CATEGORY_PALETTE = [
  '#4FB8A6',
  '#9B8CE0',
  '#5FA8D6',
  '#D98CB3',
  '#C9A46B',
  '#7C8699',
];

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000,
  );
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function dateKey(d: Date): string {
  return startOfDay(d).toISOString().slice(0, 10);
}

export function categoryColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_PALETTE[h % CATEGORY_PALETTE.length];
}

export type CardStatus = 'overdue' | 'today' | 'upcoming';

export function getStatus(card: Card): CardStatus {
  const d = daysBetween(new Date(), new Date(card.next_review_at));
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  return 'upcoming';
}

export function relativeLabel(card: Card, t: (k: string, ...a: never[]) => string): string {
  const d = daysBetween(new Date(), new Date(card.next_review_at));
  if (d < 0) return t('overdue', Math.abs(d) as never);
  if (d === 0) return t('due_today');
  if (d === 1) return t('tomorrow');
  return t('within_days', d as never);
}

export function stageLabel(card: Card, t: (k: string, ...a: never[]) => string): string {
  const days = card.intervals[card.stage_index];
  if (card.stage_index === card.intervals.length - 1)
    return t('review_every', days as never);
  return t('after_days', days as never);
}

export function computeNextStage(
  currentStage: number,
  intervals: number[],
  rating: Rating,
): number {
  if (rating === 'forgot') return 0;
  if (rating === 'good')
    return Math.min(currentStage + 1, intervals.length - 1);
  return Math.min(currentStage + 2, intervals.length - 1);
}

export function computeStreak(history: ReviewHistoryEntry[]): number {
  const days = new Set(history.map((h) => dateKey(new Date(h.date))));
  let streak = 0;
  let cursor = new Date();
  while (days.has(dateKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function buildCurvePath(card: Card): {
  path: string;
  dotX: number;
  dotY: number;
  dotColor: string;
} {
  const w = 240;
  const h = 56;
  const pad = 6;
  const last = new Date(card.last_review_at || card.created_at);
  const next = new Date(card.next_review_at);
  const now = new Date();
  const totalSpan = Math.max(1, daysBetween(last, next));
  const elapsed = Math.min(Math.max(daysBetween(last, now), 0), totalSpan);
  const k = Math.log(2) / totalSpan;
  const pts: [number, number][] = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * totalSpan;
    const ret = Math.exp(-k * t);
    pts.push([
      pad + (t / totalSpan) * (w - pad * 2),
      pad + (1 - ret) * (h - pad * 2),
    ]);
  }
  const path = pts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1))
    .join(' ');
  const retNow = Math.exp(-k * elapsed);
  const xNow = pad + (elapsed / totalSpan) * (w - pad * 2);
  const yNow = pad + (1 - retNow) * (h - pad * 2);
  const status = getStatus(card);
  const dotColor =
    status === 'overdue' ? '#E2665B' : status === 'today' ? '#E8B44E' : '#8B92A5';
  return { path, dotX: xNow, dotY: yNow, dotColor };
}

export function getShortDayName(date: Date, tArr: (k: string) => string[]): string {
  const names = tArr('days');
  return names[date.getDay()] ?? '?';
}
