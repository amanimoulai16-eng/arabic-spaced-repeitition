import { supabase } from './supabase';
import type { Card, ReviewLogEntry, Category, Settings, Rating, Attachment } from './srs';
import { DEFAULT_INTERVALS, DEFAULT_NEW_CARDS_PER_DAY, DEFAULT_MAX_REVIEWS_PER_DAY } from './srs';

const DB_NAME = 'tikrar-offline';
const DB_VERSION = 1;
const STORE_CARDS = 'cards';
const STORE_REVIEW_LOG = 'review_log';
const STORE_CATEGORIES = 'categories';
const STORE_SETTINGS = 'settings';
const STORE_PENDING = 'pending_ops';

export type PendingOp =
  | { type: 'insert_card'; payload: Record<string, unknown> }
  | { type: 'update_card'; id: string; payload: Record<string, unknown> }
  | { type: 'delete_card'; id: string }
  | { type: 'insert_review'; payload: Record<string, unknown> }
  | { type: 'upsert_settings'; payload: Record<string, unknown> }
  | { type: 'insert_category'; payload: Record<string, unknown> };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CARDS)) {
        db.createObjectStore(STORE_CARDS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_REVIEW_LOG)) {
        db.createObjectStore(STORE_REVIEW_LOG, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CATEGORIES)) {
        db.createObjectStore(STORE_CATEGORIES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'user_id' });
      }
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function txGetAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function txPut<T>(store: string, val: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).put(val);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function txPutMany<T>(store: string, vals: T[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    for (const v of vals) t.objectStore(store).put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function txDelete(store: string, key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

async function txClear(store: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// --- Pending ops queue ---
async function enqueuePending(op: PendingOp): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_PENDING, 'readwrite');
    t.objectStore(STORE_PENDING).add(op);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_PENDING, 'readonly');
    const req = t.objectStore(STORE_PENDING).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getAllPending(): Promise<{ id: number; op: PendingOp }[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_PENDING, 'readonly');
    const req = t.objectStore(STORE_PENDING).getAll();
    req.onsuccess = () => resolve(req.result as { id: number; op: PendingOp }[]);
    req.onerror = () => reject(req.error);
  });
}

async function deletePending(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_PENDING, 'readwrite');
    t.objectStore(STORE_PENDING).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

// --- Cache management ---
export async function cacheCards(cards: Card[]): Promise<void> {
  await txClear(STORE_CARDS);
  await txPutMany(STORE_CARDS, cards);
}

export async function cacheReviewLog(log: ReviewLogEntry[]): Promise<void> {
  await txClear(STORE_REVIEW_LOG);
  await txPutMany(STORE_REVIEW_LOG, log);
}

export async function cacheCategories(cats: Category[]): Promise<void> {
  await txClear(STORE_CATEGORIES);
  await txPutMany(STORE_CATEGORIES, cats);
}

export async function cacheSettings(userId: string, settings: Settings): Promise<void> {
  await txPut(STORE_SETTINGS, { user_id: userId, ...settings });
}

export async function getCachedCards(): Promise<Card[]> {
  return txGetAll<Card>(STORE_CARDS);
}

export async function getCachedReviewLog(): Promise<ReviewLogEntry[]> {
  return txGetAll<ReviewLogEntry>(STORE_REVIEW_LOG);
}

export async function getCachedCategories(): Promise<Category[]> {
  return txGetAll<Category>(STORE_CATEGORIES);
}

export async function getCachedSettings(userId: string): Promise<Settings | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_SETTINGS, 'readonly');
    const req = t.objectStore(STORE_SETTINGS).get(userId);
    req.onsuccess = () => {
      const r = req.result;
      if (!r) return resolve(null);
      resolve({
        intervals: r.intervals ?? DEFAULT_INTERVALS,
        newCardsPerDay: r.new_cards_per_day ?? DEFAULT_NEW_CARDS_PER_DAY,
        maxReviewsPerDay: r.max_reviews_per_day ?? DEFAULT_MAX_REVIEWS_PER_DAY,
      });
    };
    req.onerror = () => reject(req.error);
  });
}

// --- Offline mutations (write to cache + enqueue) ---
async function genId(): Promise<string> {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function offlineInsertCard(
  data: {
    userId: string;
    categoryId: string | null;
    title: string;
    notes: string;
    category: string;
    resource: string;
    linkedItemId: string;
    question: string;
    answer: string;
    intervals: number[];
    stageIndex: number;
    nextReviewAt: string;
    lastReviewAt: string;
    reviewCount: number;
    attachments: Attachment[];
  },
): Promise<string> {
  const id = await genId();
  const card: Card = {
    id,
    user_id: data.userId,
    title: data.title,
    notes: data.notes,
    category: data.category,
    category_id: data.categoryId,
    resource: data.resource,
    linked_item_id: data.linkedItemId || null,
    question: data.question,
    answer: data.answer,
    intervals: data.intervals,
    stage_index: data.stageIndex,
    next_review_at: data.nextReviewAt,
    last_review_at: data.lastReviewAt,
    created_at: new Date().toISOString(),
    review_count: data.reviewCount,
    attachments: data.attachments,
  };
  await txPut(STORE_CARDS, card);
  await enqueuePending({ type: 'insert_card', payload: { ...card, id } });
  return id;
}

export async function offlineUpdateCard(
  id: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const cards = await getCachedCards();
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  const updated = { ...card, ...updates, id } as Card;
  await txPut(STORE_CARDS, updated);
  await enqueuePending({ type: 'update_card', id, payload: updates });
}

export async function offlineDeleteCard(id: string): Promise<void> {
  await txDelete(STORE_CARDS, id);
  await enqueuePending({ type: 'delete_card', id });
}

export async function offlineInsertReview(
  cardId: string,
  rating: Rating,
  reviewedAt: string,
  userId: string,
): Promise<void> {
  const id = await genId();
  const entry: ReviewLogEntry = {
    id,
    card_id: cardId,
    rating,
    reviewed_at: reviewedAt,
    user_id: userId,
  };
  await txPut(STORE_REVIEW_LOG, entry);
  await enqueuePending({
    type: 'insert_review',
    payload: { card_id: cardId, rating, reviewed_at: reviewedAt, user_id: userId },
  });
}

export async function offlineUpsertSettings(
  userId: string,
  settings: Settings,
): Promise<void> {
  await cacheSettings(userId, settings);
  await enqueuePending({
    type: 'upsert_settings',
    payload: {
      user_id: userId,
      intervals: settings.intervals,
      new_cards_per_day: settings.newCardsPerDay,
      max_reviews_per_day: settings.maxReviewsPerDay,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function offlineInsertCategory(
  userId: string,
  name: string,
  color: string,
): Promise<string> {
  const id = await genId();
  const cat: Category = {
    id,
    user_id: userId,
    name,
    color,
    created_at: new Date().toISOString(),
  };
  await txPut(STORE_CATEGORIES, cat);
  await enqueuePending({
    type: 'insert_category',
    payload: { id, user_id: userId, name, color },
  });
  return id;
}

// --- Sync: flush pending ops to Supabase ---
export async function syncPending(): Promise<{ synced: number; failed: number }> {
  const pending = await getAllPending();
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    const op = item.op;
    let ok = false;
    try {
      if (op.type === 'insert_card') {
        const { error } = await supabase.from('cards').insert(op.payload);
        ok = !error;
      } else if (op.type === 'update_card') {
        const { error } = await supabase
          .from('cards')
          .update(op.payload)
          .eq('id', op.id);
        ok = !error;
      } else if (op.type === 'delete_card') {
        const { error } = await supabase.from('cards').delete().eq('id', op.id);
        ok = !error;
      } else if (op.type === 'insert_review') {
        const { error } = await supabase.from('review_log').insert(op.payload);
        ok = !error;
      } else if (op.type === 'upsert_settings') {
        const { error } = await supabase.from('user_settings').upsert(op.payload);
        ok = !error;
      } else if (op.type === 'insert_category') {
        const { error } = await supabase.from('categories').insert(op.payload);
        ok = !error;
      }
    } catch {
      ok = false;
    }

    if (ok) {
      await deletePending(item.id);
      synced++;
    } else {
      failed++;
    }
  }

  return { synced, failed };
}

// --- Online status hook helper ---
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
