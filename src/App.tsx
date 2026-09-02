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
import { AuthScreen } from '@/components/AuthScreen';
import { BottomNav, type PageKey } from '@/components/BottomNav';
import { DashboardPage } from '@/components/DashboardPage';
import { ReviewPage } from '@/components/ReviewPage';
import { LibraryPage } from '@/components/LibraryPage';
import { SettingsPage } from '@/components/SettingsPage';

export default function App() {
  const { session, profile, loading: authLoading, recoveryMode, signOut } = useAuth();
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

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const fetchCards = useCallback(async () => {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      setDataLoading(false);
      return;
    }
    setCards((data ?? []) as Card[]);
  }, []);

  const fetchReviewLog = useCallback(async () => {
    const { data, error } = await supabase
      .from('review_log')
      .select('*')
      .order('reviewed_at', { ascending: false });
    if (error) return;
    setReviewLog((data ?? []) as ReviewLogEntry[]);
  }, []);

  const fetchCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true });
    if (error) return;
    setCategories((data ?? []) as Category[]);
  }, []);

  const fetchSettings = useCallback(async () => {
    if (!session) return;
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
    setSettings({
      intervals: (data.intervals as number[]) ?? DEFAULT_INTERVALS,
      newCardsPerDay: (data.new_cards_per_day as number) ?? DEFAULT_NEW_CARDS_PER_DAY,
      maxReviewsPerDay: (data.max_reviews_per_day as number) ?? DEFAULT_MAX_REVIEWS_PER_DAY,
    });
  }, [session]);

  useEffect(() => {
    if (!session) {
      setDataLoading(false);
      return;
    }
    (async () => {
      await Promise.all([
        fetchCards(),
        fetchReviewLog(),
        fetchCategories(),
        fetchSettings(),
      ]);
      setDataLoading(false);
    })();
  }, [session, fetchCards, fetchReviewLog, fetchCategories, fetchSettings]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchCards(), fetchReviewLog(), fetchCategories()]);
  }, [fetchCards, fetchReviewLog, fetchCategories]);

  async function ensureCategory(name: string): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = categories.find(
      (c) => c.name === trimmed,
    );
    if (existing) return existing.id;
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: trimmed, color: categoryColor(trimmed) })
      .select()
      .maybeSingle();
    if (error || !data) return null;
    await fetchCategories();
    return data.id;
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
      // Daily limit check for new cards
      const today = todayISO();
      const newToday = cards.filter(
        (c) => c.created_at.slice(0, 10) === today && c.review_count === 0,
      ).length;
      if (newToday >= settings.newCardsPerDay) {
        showToast(t('toast_daily_limit'));
        return;
      }

      const intervals = settings.intervals.slice();
      const startIdx = Math.min(
        data.familiarity || 0,
        intervals.length - 1,
      );
      const now = new Date();
      const nextReview = addDays(now, intervals[startIdx]);

      const categoryId = await ensureCategory(data.category);

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
      const days = intervals[startIdx];
      showToast(t('toast_added', days as never));
    },
    [settings, showToast, refreshAll, categories, fetchCategories, t, cards],
  );

  const handleReview = useCallback(
    async (id: string, rating: Rating) => {
      // Daily limit check for reviews
      const today = todayISO();
      const reviewsToday = reviewLog.filter(
        (r) => r.reviewed_at === today,
      ).length;
      if (reviewsToday >= settings.maxReviewsPerDay) {
        showToast(t('toast_review_limit'));
        return;
      }

      const card = cards.find((c) => c.id === id);
      if (!card) return;

      const newStage = computeNextStage(
        card.stage_index,
        card.intervals,
        rating,
      );
      const now = new Date();
      const nextReview = addDays(now, card.intervals[newStage]);

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
        reviewed_at: now.toISOString().slice(0, 10),
      });

      await refreshAll();

      const msgs: Record<Rating, string> = {
        forgot: t('toast_review_forgot'),
        good: t('toast_review_good'),
        easy: t('toast_review_easy'),
      };
      showToast(msgs[rating]);
    },
    [cards, reviewLog, settings, showToast, refreshAll, t],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('cards').delete().eq('id', id);
      if (error) {
        showToast(t('toast_delete_fail'));
        return;
      }
      await refreshAll();
      showToast(t('toast_deleted'));
    },
    [showToast, refreshAll, t],
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

      const { error } = await supabase
        .from('cards')
        .update({ next_review_at: next.toISOString() })
        .eq('id', id);
      if (error) {
        showToast(t('toast_snooze_fail'));
        return;
      }
      await refreshAll();
      showToast(t('toast_snoozed'));
    },
    [cards, showToast, refreshAll, t],
  );

  const handleSaveSettings = useCallback(
    async (newSettings: Settings) => {
      if (!session) return;
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
      setSettings(newSettings);
      showToast(t('toast_settings_saved'));
    },
    [session, showToast, t],
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

      const { error } = await supabase
        .from('cards')
        .update({
          title: data.title,
          notes: data.notes,
          category: data.category,
          category_id: categoryId,
          resource: data.resource,
          linked_item_id: data.linkedItemId || null,
          question: data.question,
          answer: data.answer,
          attachments: data.attachments,
        })
        .eq('id', id);

      if (error) {
        showToast(t('toast_edit_fail'));
        return;
      }

      await refreshAll();
      showToast(t('toast_edit_saved'));
    },
    [showToast, refreshAll, categories, fetchCategories, t],
  );

  // Auth gate
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="h-8 w-8 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return (
      <AuthScreen
        onAuthSuccess={() => {}}
        lang={lang}
        setLang={setLang}
        initialMode={recoveryMode ? 'update' : 'signin'}
      />
    );
  }

  // Derived values
  const dueCards = cards
    .filter((c) => getStatus(c) !== 'upcoming')
    .sort(
      (a, b) =>
        new Date(a.next_review_at).getTime() -
        new Date(b.next_review_at).getTime(),
    );

  const dueCount = dueCards.length;
  const totalCount = cards.length;
  const totalReviews = reviewLog.length;

  const streak = computeStreak(
    reviewLog.map((r) => ({ date: r.reviewed_at, outcome: r.rating })),
  );

  const loading = authLoading || dataLoading;

  return (
    <div className="min-h-screen px-4 sm:px-5 py-5 sm:py-6 pb-24">
      <div className="max-w-[920px] mx-auto">
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
