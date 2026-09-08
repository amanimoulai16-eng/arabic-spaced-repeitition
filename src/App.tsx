import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/useAuth';
import { useTheme } from '@/lib/useTheme';
import { useLanguage } from '@/lib/useLanguage';
import {
  type Card,
  type Rating,
  type ReviewLogEntry,
  type Category,
  type Settings,
  type Attachment,
  DEFAULT_INTERVALS,
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_MAX_REVIEWS_PER_DAY,
  getStatus,
  computeNextStage,
  addDays,
  computeStreak,
  categoryColor,
  todayISO,
} from '@/lib/srs';
import {
  cacheCards,
  cacheReviewLog,
  cacheCategories,
  cacheSettings,
  getCachedCards,
  getCachedReviewLog,
  getCachedCategories,
  getCachedSettings,
  offlineInsertCard,
  offlineUpdateCard,
  offlineDeleteCard,
  offlineInsertReview,
  offlineUpsertSettings,
  offlineInsertCategory,
  syncPending,
  getPendingCount,
  isOnline,
} from '@/lib/offline';
import { AuthScreen } from '@/components/AuthScreen';
import { BottomNav, type PageKey } from '@/components/BottomNav';
import { DashboardPage } from '@/components/DashboardPage';
import { ReviewPage } from '@/components/ReviewPage';
import { LibraryPage } from '@/components/LibraryPage';
import { SettingsPage } from '@/components/SettingsPage';
import { WifiOff, Cloud } from 'lucide-react';

export default function App() {
  const { session, profile, loading: authLoading, recoveryMode, setRecoveryMode, signOut } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const { lang, setLang, t, tArr } = useLanguage();
  const [cards, setCards] = useState<Card[]>([]);
  const [reviewLog, setReviewLog] = useState<ReviewLogEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settings, setSettings] = useState<Settings>({
    intervals: DEFAULT_INTERVALS,
    newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY,
    maxReviewsPerDay: DEFAULT_MAX_REVIEWS_PER_DAY,
  });
  const [dataLoading, setDataLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState<PageKey>('dashboard');
  const [toast, setToast] = useState<string | null>(null);
  const [online, setOnline] = useState(isOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const updatePendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  // --- Online/offline event listeners ---
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
    };
    const handleOffline = () => {
      setOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Auto-sync when coming back online ---
  const doSync = useCallback(async () => {
    if (!isOnline()) return;
    const count = await getPendingCount();
    if (count === 0) return;
    setSyncing(true);
    const result = await syncPending();
    setSyncing(false);
    if (result.synced > 0) {
      showToast(`${result.synced} synced`);
    }
    await updatePendingCount();
  }, [showToast, updatePendingCount]);

  useEffect(() => {
    if (online) {
      doSync();
    }
  }, [online, doSync]);

  // --- Fetch from Supabase and update cache ---
  const fetchCards = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return;
      const rows = (data ?? []) as Card[];
      setCards(rows);
      await cacheCards(rows);
    } catch {
      // network error — keep cached data
    }
  }, []);

  const fetchReviewLog = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('review_log')
        .select('*')
        .order('reviewed_at', { ascending: false });
      if (error) return;
      const rows = (data ?? []) as ReviewLogEntry[];
      setReviewLog(rows);
      await cacheReviewLog(rows);
    } catch {
      // network error — keep cached data
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });
      if (error) return;
      const rows = (data ?? []) as Category[];
      setCategories(rows);
      await cacheCategories(rows);
    } catch {
      // network error — keep cached data
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (error || !data) {
        setSettings({
          intervals: DEFAULT_INTERVALS,
          newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY,
          maxReviewsPerDay: DEFAULT_MAX_REVIEWS_PER_DAY,
        });
        return;
      }
      const s: Settings = {
        intervals: (data.intervals as number[]) ?? DEFAULT_INTERVALS,
        newCardsPerDay: (data.new_cards_per_day as number) ?? DEFAULT_NEW_CARDS_PER_DAY,
        maxReviewsPerDay: (data.max_reviews_per_day as number) ?? DEFAULT_MAX_REVIEWS_PER_DAY,
      };
      setSettings(s);
      await cacheSettings(session.user.id, s);
    } catch {
      // network error — keep cached/default settings
    }
  }, [session]);

  // --- Safety timeout: never stay in loading state more than 1.5s ---
  useEffect(() => {
    const timer = setTimeout(() => setDataLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  // --- Load from cache first (instant), then fetch from Supabase ---
  useEffect(() => {
    if (!session) {
      setDataLoading(false);
      return;
    }
    (async () => {
      try {
        // Load from cache immediately
        const [cachedCards, cachedLog, cachedCats, cachedSettings] = await Promise.all([
          getCachedCards(),
          getCachedReviewLog(),
          getCachedCategories(),
          getCachedSettings(session.user.id),
        ]);
        if (cachedCards.length > 0) setCards(cachedCards);
        if (cachedLog.length > 0) setReviewLog(cachedLog);
        if (cachedCats.length > 0) setCategories(cachedCats);
        if (cachedSettings) setSettings(cachedSettings);
        setDataLoading(false);

        // Then fetch from Supabase if online (non-blocking — UI already visible)
        if (isOnline()) {
          await Promise.allSettled([
            fetchCards(),
            fetchReviewLog(),
            fetchCategories(),
            fetchSettings(),
          ]);
          await doSync();
        }
        await updatePendingCount();
      } catch {
        setDataLoading(false);
      }
    })();
  }, [session, fetchCards, fetchReviewLog, fetchCategories, fetchSettings, doSync, updatePendingCount]);

  const refreshAll = useCallback(async () => {
    if (isOnline()) {
      await Promise.all([fetchCards(), fetchReviewLog(), fetchCategories()]);
    } else {
      // Just reload from cache
      const [c, l, cat] = await Promise.all([
        getCachedCards(),
        getCachedReviewLog(),
        getCachedCategories(),
      ]);
      setCards(c);
      setReviewLog(l);
      setCategories(cat);
    }
    await updatePendingCount();
  }, [fetchCards, fetchReviewLog, fetchCategories, updatePendingCount]);

  async function ensureCategory(name: string): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = categories.find((c) => c.name === trimmed);
    if (existing) return existing.id;
    if (isOnline()) {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name: trimmed, color: categoryColor(trimmed) })
        .select()
        .maybeSingle();
      if (error || !data) return null;
      await fetchCategories();
      return data.id;
    }
    // Offline: create locally
    const id = await offlineInsertCategory(trimmed, categoryColor(trimmed));
    const newCat: Category = {
      id,
      user_id: session?.user.id ?? '',
      name: trimmed,
      color: categoryColor(trimmed),
      created_at: new Date().toISOString(),
    };
    setCategories((prev) => [...prev, newCat]);
    await updatePendingCount();
    return id;
  }

  const handleAdd = useCallback(
    async (data: {
      title: string;
      notes: string;
      category: string;
      familiarity: number;
      resource: string;
      linkedItemId: string;
      question: string;
      answer: string;
      attachments: Attachment[];
    }) => {
      const today = todayISO();
      const newToday = cards.filter(
        (c) => c.created_at.slice(0, 10) === today && c.review_count === 0,
      ).length;
      if (newToday >= settings.newCardsPerDay) {
        showToast(t('toast_daily_limit'));
        return;
      }

      const intervals = settings.intervals.slice();
      const startIdx = Math.min(data.familiarity || 0, intervals.length - 1);
      const now = new Date();
      const nextReview = addDays(now, intervals[startIdx]);
      const categoryId = await ensureCategory(data.category);

      if (isOnline()) {
        const { error } = await supabase.from('cards').insert({
          title: data.title,
          notes: data.notes,
          category: data.category,
          category_id: categoryId,
          resource: data.resource,
          linked_item_id: data.linkedItemId || null,
          question: data.question,
          answer: data.answer,
          intervals,
          stage_index: startIdx,
          next_review_at: nextReview.toISOString(),
          last_review_at: now.toISOString(),
          review_count: 0,
          attachments: data.attachments,
        });
        if (error) {
          showToast(t('toast_save_fail'));
          return;
        }
        await refreshAll();
      } else {
        // Offline insert
        const id = await offlineInsertCard({
          title: data.title,
          notes: data.notes,
          category: data.category,
          resource: data.resource,
          linkedItemId: data.linkedItemId,
          question: data.question,
          answer: data.answer,
          intervals,
          stageIndex: startIdx,
          nextReviewAt: nextReview.toISOString(),
          lastReviewAt: now.toISOString(),
          reviewCount: 0,
          attachments: data.attachments,
        });
        // Update local state
        const newCard: Card = {
          id,
          user_id: session?.user.id ?? null,
          title: data.title,
          notes: data.notes,
          category: data.category,
          category_id: categoryId,
          resource: data.resource,
          linked_item_id: data.linkedItemId || null,
          question: data.question,
          answer: data.answer,
          intervals,
          stage_index: startIdx,
          next_review_at: nextReview.toISOString(),
          last_review_at: now.toISOString(),
          created_at: now.toISOString(),
          review_count: 0,
          attachments: data.attachments,
        };
        setCards((prev) => [newCard, ...prev]);
        await cacheCards([newCard, ...cards]);
        await updatePendingCount();
      }

      const days = intervals[startIdx];
      showToast(t('toast_added', days as never));
    },
    [settings, showToast, refreshAll, categories, t, cards, session],
  );

  const handleReview = useCallback(
    async (id: string, rating: Rating) => {
      const today = todayISO();
      const reviewsToday = reviewLog.filter((r) => r.reviewed_at === today).length;
      if (reviewsToday >= settings.maxReviewsPerDay) {
        showToast(t('toast_review_limit'));
        return;
      }

      const card = cards.find((c) => c.id === id);
      if (!card) return;

      const newStage = computeNextStage(card.stage_index, card.intervals, rating);
      const now = new Date();
      const nextReview = addDays(now, card.intervals[newStage]);
      const reviewedAt = now.toISOString().slice(0, 10);

      if (isOnline()) {
        const { error: updateError } = await supabase
          .from('cards')
          .update({
            stage_index: newStage,
            next_review_at: nextReview.toISOString(),
            last_review_at: now.toISOString(),
            review_count: card.review_count + 1,
          })
          .eq('id', id);
        if (updateError) {
          showToast(t('toast_review_fail'));
          return;
        }
        await supabase.from('review_log').insert({
          card_id: id,
          rating,
          reviewed_at: reviewedAt,
        });
        await refreshAll();
      } else {
        // Offline: update cache + enqueue
        await offlineUpdateCard(id, {
          stage_index: newStage,
          next_review_at: nextReview.toISOString(),
          last_review_at: now.toISOString(),
          review_count: card.review_count + 1,
        });
        await offlineInsertReview(id, rating, reviewedAt);
        // Update local state
        const updatedCards = cards.map((c) =>
          c.id === id
            ? {
                ...c,
                stage_index: newStage,
                next_review_at: nextReview.toISOString(),
                last_review_at: now.toISOString(),
                review_count: c.review_count + 1,
              }
            : c,
        );
        setCards(updatedCards);
        await cacheCards(updatedCards);
        const newEntry: ReviewLogEntry = {
          id: crypto.randomUUID(),
          card_id: id,
          rating,
          reviewed_at: reviewedAt,
          user_id: null,
        };
        const updatedLog = [newEntry, ...reviewLog];
        setReviewLog(updatedLog);
        await cacheReviewLog(updatedLog);
        await updatePendingCount();
      }

      const msgs: Record<Rating, string> = {
        forgot: t('toast_review_forgot'),
        good: t('toast_review_good'),
        easy: t('toast_review_easy'),
      };
      showToast(msgs[rating]);
    },
    [cards, reviewLog, settings, showToast, refreshAll, t, updatePendingCount],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (isOnline()) {
        const { error } = await supabase.from('cards').delete().eq('id', id);
        if (error) {
          showToast(t('toast_delete_fail'));
          return;
        }
        await refreshAll();
      } else {
        await offlineDeleteCard(id);
        const updated = cards.filter((c) => c.id !== id);
        setCards(updated);
        await cacheCards(updated);
        await updatePendingCount();
      }
      showToast(t('toast_deleted'));
    },
    [showToast, refreshAll, t, cards, updatePendingCount],
  );

  const handleSnooze = useCallback(
    async (id: string) => {
      const card = cards.find((c) => c.id === id);
      if (!card) return;
      const base =
        new Date(card.next_review_at) < new Date()
          ? new Date()
          : new Date(card.next_review_at);
      const next = addDays(base, 1);

      if (isOnline()) {
        const { error } = await supabase
          .from('cards')
          .update({ next_review_at: next.toISOString() })
          .eq('id', id);
        if (error) {
          showToast(t('toast_snooze_fail'));
          return;
        }
        await refreshAll();
      } else {
        await offlineUpdateCard(id, { next_review_at: next.toISOString() });
        const updated = cards.map((c) =>
          c.id === id ? { ...c, next_review_at: next.toISOString() } : c,
        );
        setCards(updated);
        await cacheCards(updated);
        await updatePendingCount();
      }
      showToast(t('toast_snoozed'));
    },
    [cards, showToast, refreshAll, t, updatePendingCount],
  );

  const handleSaveSettings = useCallback(
    async (newSettings: Settings) => {
      if (!session) return;
      if (isOnline()) {
        const { error } = await supabase.from('user_settings').upsert({
          user_id: session.user.id,
          intervals: newSettings.intervals,
          new_cards_per_day: newSettings.newCardsPerDay,
          max_reviews_per_day: newSettings.maxReviewsPerDay,
          updated_at: new Date().toISOString(),
        });
        if (error) {
          showToast(t('toast_settings_fail'));
          return;
        }
        await cacheSettings(session.user.id, newSettings);
      } else {
        await offlineUpsertSettings(session.user.id, newSettings);
        await updatePendingCount();
      }
      setSettings(newSettings);
      showToast(t('toast_settings_saved'));
    },
    [session, showToast, t, updatePendingCount],
  );

  const handleResetSettings = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      intervals: DEFAULT_INTERVALS.slice(),
    }));
  }, []);

  const handleEdit = useCallback(
    async (
      id: string,
      data: {
        title: string;
        notes: string;
        category: string;
        resource: string;
        linkedItemId: string;
        question: string;
        answer: string;
        attachments: Attachment[];
      },
    ) => {
      const categoryId = await ensureCategory(data.category);
      const updates = {
        title: data.title,
        notes: data.notes,
        category: data.category,
        category_id: categoryId,
        resource: data.resource,
        linked_item_id: data.linkedItemId || null,
        question: data.question,
        answer: data.answer,
        attachments: data.attachments,
      };

      if (isOnline()) {
        const { error } = await supabase.from('cards').update(updates).eq('id', id);
        if (error) {
          showToast(t('toast_edit_fail'));
          return;
        }
        await refreshAll();
      } else {
        await offlineUpdateCard(id, updates);
        const updated = cards.map((c) => (c.id === id ? { ...c, ...updates } : c));
        setCards(updated);
        await cacheCards(updated);
        await updatePendingCount();
      }
      showToast(t('toast_edit_saved'));
    },
    [showToast, refreshAll, categories, t, cards, updatePendingCount, session],
  );

  // Auth gate
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="h-8 w-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || recoveryMode) {
  return (
    <AuthScreen
      onAuthSuccess={() => {}}
      lang={lang}
      setLang={setLang}
      initialMode={recoveryMode ? 'update' : 'signin'}
      onRecoveryComplete={() => setRecoveryMode(false)}
    />
  );
}
  // Derived values
  const dueCards = cards
    .filter((c) => getStatus(c) !== 'upcoming')
    .sort(
      (a, b) =>
        new Date(a.next_review_at).getTime() - new Date(b.next_review_at).getTime(),
    );

  const dueCount = dueCards.length;
  const totalCount = cards.length;
  const totalReviews = reviewLog.length;

  const streak = computeStreak(
    reviewLog.map((r) => ({ date: r.reviewed_at, outcome: r.rating })),
  );

  const loading = authLoading || dataLoading;

  return (
    <div className="min-h-screen px-4 sm:px-5 py-5 sm:py-6 pb-28 sm:pb-24">
      <div className="max-w-[920px] mx-auto w-full">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 sm:gap-4 mb-5 sm:mb-6 flex-wrap">
          <div className="brand">
            <h1 className="font-display font-black text-[24px] sm:text-[28px] m-0 mb-0.5 tracking-tight flex items-center">
              <svg
                className="inline-block ml-2"
                width="30"
                height="24"
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
            <p className="m-0 text-text-muted text-[12px] sm:text-[13px]">
              {profile?.display_name || session.user.email}
            </p>
          </div>

          {/* Online/offline status badge */}
          <div className="flex items-center gap-2">
            {!online && (
              <span className="flex items-center gap-1.5 surface-2 border border-border-soft rounded-full px-3 py-1.5 text-[11.5px] text-text-muted">
                <WifiOff size={14} className="text-coral" />
                <span>Offline</span>
              </span>
            )}
            {online && pendingCount > 0 && (
              <span className="flex items-center gap-1.5 surface-2 border border-border-soft rounded-full px-3 py-1.5 text-[11.5px] text-text-muted">
                <Cloud
                  size={14}
                  className={syncing ? 'text-amber animate-pulse' : 'text-amber'}
                />
                <span>{pendingCount} pending</span>
              </span>
            )}
          </div>
        </header>

        {/* Page content */}
        {currentPage === 'dashboard' && (
          <DashboardPage
            cards={cards}
            reviewLog={reviewLog}
            dueCount={dueCount}
            totalCount={totalCount}
            streak={streak}
            totalReviews={totalReviews}
            loading={loading}
            onStartReview={() => setCurrentPage('review')}
            t={t}
          />
        )}

        {currentPage === 'review' && (
          <ReviewPage
            dueCards={dueCards}
            onReview={handleReview}
            onExit={() => setCurrentPage('dashboard')}
            t={t}
          />
        )}

        {currentPage === 'library' && (
          <LibraryPage
            cards={cards}
            reviewLog={reviewLog}
            categories={categories}
            settings={settings}
            userId={session.user.id}
            loading={loading}
            onAdd={handleAdd}
            onReview={handleReview}
            onDelete={handleDelete}
            onSnooze={handleSnooze}
            onEdit={handleEdit}
            t={t}
            tArr={tArr}
          />
        )}

        {currentPage === 'settings' && (
          <SettingsPage
            settings={settings}
            onSave={handleSaveSettings}
            onReset={handleResetSettings}
            theme={theme}
            onToggleTheme={toggleTheme}
            lang={lang}
            onChangeLang={setLang}
            onSignOut={signOut}
            cards={cards}
            categories={categories}
            userId={session.user.id}
            onRefresh={refreshAll}
            showToast={showToast}
            t={t}
          />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-surface-3 border border-border text-text-main px-5 py-2.5 rounded-full text-[13.5px] z-80 animate-fade-in">
          {toast}
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNav active={currentPage} onChange={setCurrentPage} t={t} />
    </div>
  );
}
