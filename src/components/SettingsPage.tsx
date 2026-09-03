import { useState, useRef } from 'react';
import {
  type Settings,
  type Card,
  type Category,
  DEFAULT_INTERVALS,
  DEFAULT_NEW_CARDS_PER_DAY,
  DEFAULT_MAX_REVIEWS_PER_DAY,
} from '@/lib/srs';
import { type Theme } from '@/lib/useTheme';
import { type Lang, LANGS } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import {
  Calendar,
  Gauge,
  User,
  Database,
  Sun,
  Moon,
  Globe,
  LogOut,
  Download,
  Upload,
  Share2,
  Plus,
  Check,
  AlertTriangle,
} from 'lucide-react';

type TFunc = (key: string, ...args: never[]) => string;

type Props = {
  settings: Settings;
  onSave: (settings: Settings) => void;
  onReset: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  lang: Lang;
  onChangeLang: (l: Lang) => void;
  onSignOut: () => void;
  cards: Card[];
  categories: Category[];
  userId: string;
  onRefresh: () => Promise<void>;
  showToast: (msg: string) => void;
  t: TFunc;
};

export function SettingsPage({
  settings,
  onSave,
  onReset,
  theme,
  onToggleTheme,
  lang,
  onChangeLang,
  onSignOut,
  cards,
  categories,
  userId,
  onRefresh,
  showToast,
  t,
}: Props) {
  const [intervals, setIntervals] = useState<number[]>(
    settings.intervals.length === 6 ? settings.intervals : DEFAULT_INTERVALS,
  );
  const [newCardsPerDay, setNewCardsPerDay] = useState(
    settings.newCardsPerDay ?? DEFAULT_NEW_CARDS_PER_DAY,
  );
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState(
    settings.maxReviewsPerDay ?? DEFAULT_MAX_REVIEWS_PER_DAY,
  );
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [shareDeckName, setShareDeckName] = useState('');
  const [shareDeckCategory, setShareDeckCategory] = useState('');
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [importCode, setImportCode] = useState('');
  const [importing, setImporting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  function handleSaveSchedule() {
    const vals = intervals.map((v) => Math.max(1, v || 1));
    onSave({
      intervals: vals,
      newCardsPerDay,
      maxReviewsPerDay,
    });
  }

  function handleResetSchedule() {
    setIntervals(DEFAULT_INTERVALS.slice());
    setNewCardsPerDay(DEFAULT_NEW_CARDS_PER_DAY);
    setMaxReviewsPerDay(DEFAULT_MAX_REVIEWS_PER_DAY);
    onReset();
  }

  // --- Export JSON ---
  function exportJSON() {
    const data = {
      exportedAt: new Date().toISOString(),
      cards: cards.map((c) => ({
        title: c.title,
        notes: c.notes,
        category: c.category,
        resource: c.resource,
        question: c.question,
        answer: c.answer,
        intervals: c.intervals,
        stage_index: c.stage_index,
        review_count: c.review_count,
        attachments: c.attachments,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    downloadBlob(blob, 'tikrar-export.json');
    showToast(t('export_success'));
  }

  // --- Export CSV ---
  function exportCSV() {
    const headers = [
      'title',
      'notes',
      'category',
      'question',
      'answer',
      'resource',
      'stage_index',
      'review_count',
      'next_review_at',
    ];
    const rows = cards.map((c) =>
      [
        csvEscape(c.title),
        csvEscape(c.notes),
        csvEscape(c.category),
        csvEscape(c.question),
        csvEscape(c.answer),
        csvEscape(c.resource),
        c.stage_index,
        c.review_count,
        c.next_review_at,
      ].join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');
    downloadBlob(new Blob([csv], { type: 'text/csv' }), 'tikrar-cards.csv');
    showToast(t('export_success'));
  }

  function csvEscape(val: string): string {
    if (!val) return '';
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  }

  function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Import JSON ---
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.cards || !Array.isArray(data.cards)) {
        showToast(t('import_fail'));
        return;
      }
      const now = new Date();
      const rows = data.cards.map((c: Record<string, unknown>) => {
        const intervals = Array.isArray(c.intervals)
          ? (c.intervals as number[])
          : DEFAULT_INTERVALS.slice();
        const startIdx = Math.min(
          (c.stage_index as number) ?? 0,
          intervals.length - 1,
        );
        return {
          title: (c.title as string) ?? '',
          notes: (c.notes as string) ?? '',
          category: (c.category as string) ?? '',
          resource: (c.resource as string) ?? '',
          question: (c.question as string) ?? '',
          answer: (c.answer as string) ?? '',
          intervals,
          stage_index: startIdx,
          next_review_at: addDaysSafe(now, intervals[startIdx]).toISOString(),
          last_review_at: now.toISOString(),
          review_count: (c.review_count as number) ?? 0,
          attachments: Array.isArray(c.attachments) ? c.attachments : [],
        };
      });
      const { error } = await supabase.from('cards').insert(rows);
      if (error) {
        showToast(t('import_fail'));
        return;
      }
      await onRefresh();
      showToast(t('import_success'));
    } catch {
      showToast(t('import_fail'));
    }
    if (importFileRef.current) importFileRef.current.value = '';
  }

  function addDaysSafe(date: Date, n: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  // --- Deck Sharing ---
  async function handleShareDeck() {
    const deckName = shareDeckName.trim();
    if (!deckName) return;
    const deckCards = cards.filter(
      (c) =>
        shareDeckCategory === '' ||
        c.category === shareDeckCategory,
    );
    if (deckCards.length === 0) return;
    setSharing(true);
    const deckData = deckCards.map((c) => ({
      title: c.title,
      notes: c.notes,
      category: c.category,
      resource: c.resource,
      question: c.question,
      answer: c.answer,
      attachments: c.attachments,
    }));
    const { data, error } = await supabase
      .from('shared_decks')
      .insert({
        owner_id: userId,
        deck_name: deckName,
        deck_data: deckData,
      })
      .select()
      .maybeSingle();
    if (error || !data) {
      showToast(t('import_deck_fail'));
      setSharing(false);
      return;
    }
    setShareCode(data.share_code);
    setSharing(false);
  }

  async function handleImportSharedDeck() {
    const code = importCode.trim();
    if (!code) return;
    setImporting(true);
    const { data, error } = await supabase
      .from('shared_decks')
      .select('*')
      .eq('share_code', code)
      .maybeSingle();
    if (error || !data) {
      showToast(t('no_shared_deck'));
      setImporting(false);
      return;
    }
    const deckCards = data.deck_data as Array<{
      title: string;
      notes: string;
      category: string;
      resource: string;
      question: string;
      answer: string;
      attachments: Attachment[];
    }>;
    const now = new Date();
    const intervals = DEFAULT_INTERVALS.slice();
    const rows = deckCards.map((c) => ({
      title: c.title,
      notes: c.notes ?? '',
      category: c.category ?? '',
      resource: c.resource ?? '',
      question: c.question ?? '',
      answer: c.answer ?? '',
      intervals,
      stage_index: 0,
      next_review_at: addDaysSafe(now, intervals[0]).toISOString(),
      last_review_at: now.toISOString(),
      review_count: 0,
      attachments: c.attachments ?? [],
    }));
    const { error: insertError } = await supabase.from('cards').insert(rows);
    if (insertError) {
      showToast(t('import_deck_fail'));
      setImporting(false);
      return;
    }
    await onRefresh();
    showToast(t('shared_deck_imported'));
    setImportCode('');
    setImporting(false);
  }

  const uniqueCategories = Array.from(
    new Set(cards.map((c) => c.category).filter(Boolean)),
  ) as string[];

  return (
    <div className="animate-fade-in w-full max-w-[560px] mx-auto">
      {/* Section 1: Spaced Repetition Schedule */}
      <SectionCard
        icon={<Calendar size={18} />}
        title={t('settings_schedule')}
      >
        <label className="block text-[12.5px] text-text-muted mb-2.5">
          {t('six_stages')}
        </label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {intervals.map((v, i) => (
            <input
              key={i}
              type="number"
              min={1}
              max={365}
              value={v}
              onChange={(e) => {
                const next = [...intervals];
                next[i] = parseInt(e.target.value) || 1;
                setIntervals(next);
              }}
              className="input-dark w-full px-1 py-2.5 text-center text-[14px]"
            />
          ))}
        </div>
        <p className="text-[12px] text-text-faint leading-relaxed mt-4">
          {t('schedule_note')}
        </p>
        <div className="flex gap-2.5 mt-5">
          <button
            onClick={handleResetSchedule}
            className="flex-1 surface-2 text-text-muted border border-border rounded-[9px] py-2.5 text-[13.5px] font-display font-bold cursor-pointer hover:text-text-main transition-colors"
          >
            {t('restore_default')}
          </button>
          <button
            onClick={handleSaveSchedule}
            className="flex-1 btn-amber py-2.5 text-[13.5px]"
          >
            {t('save')}
          </button>
        </div>
      </SectionCard>

      {/* Section 2: Daily Limits */}
      <SectionCard
        icon={<Gauge size={18} />}
        title={t('settings_daily_limits')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[12.5px] text-text-muted mb-2">
              {t('new_cards_day')}
            </label>
            <input
              type="number"
              min={1}
              max={999}
              value={newCardsPerDay}
              onChange={(e) =>
                setNewCardsPerDay(
                  Math.max(1, parseInt(e.target.value) || 1),
                )
              }
              className="input-dark w-full px-3 py-2.5 text-center text-[15px] font-display font-bold"
            />
          </div>
          <div>
            <label className="block text-[12.5px] text-text-muted mb-2">
              {t('max_reviews_day')}
            </label>
            <input
              type="number"
              min={1}
              max={999}
              value={maxReviewsPerDay}
              onChange={(e) =>
                setMaxReviewsPerDay(
                  Math.max(1, parseInt(e.target.value) || 1),
                )
              }
              className="input-dark w-full px-3 py-2.5 text-center text-[15px] font-display font-bold"
            />
          </div>
        </div>
        <button
          onClick={handleSaveSchedule}
          className="btn-amber w-full py-2.5 text-[13.5px] mt-4"
        >
          {t('save')}
        </button>
      </SectionCard>

      {/* Section 3: Preferences & Account */}
      <SectionCard
        icon={<User size={18} />}
        title={t('settings_preferences')}
      >
        {/* Theme toggle */}
        <div className="flex items-center justify-between py-2.5">
          <div className="flex items-center gap-2.5">
            {theme === 'dark' ? (
              <Moon size={18} className="text-amber" />
            ) : (
              <Sun size={18} className="text-amber" />
            )}
            <span className="text-[14px] text-text-main">
              {theme === 'dark' ? t('dark_mode') : t('light_mode')}
            </span>
          </div>
          <button
            onClick={onToggleTheme}
            className="surface-2 border border-border rounded-[9px] px-4 py-2 text-[13px] font-display font-bold cursor-pointer hover:border-amber/40 transition-all"
          >
            {theme === 'dark' ? t('light_mode') : t('dark_mode')}
          </button>
        </div>

        <div className="h-px bg-border-soft my-1" />

        {/* Language selector */}
        <div className="py-2.5">
          <div className="flex items-center gap-2.5 mb-3">
            <Globe size={18} className="text-amber" />
            <span className="text-[14px] text-text-main">{t('language')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => onChangeLang(l.code)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] border transition-all cursor-pointer min-w-0 ${
                  lang === l.code
                    ? 'border-amber/50 bg-amber-dim text-amber'
                    : 'border-border-soft surface-2 text-text-muted hover:text-text-main hover:border-border'
                }`}
              >
                <span className="text-lg flex-shrink-0">{l.flag}</span>
                <span className="text-[13.5px] font-medium truncate">{l.name}</span>
                {lang === l.code && (
                  <Check size={16} className="mr-auto text-amber flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-border-soft my-1" />

        {/* Logout */}
        <div className="py-2.5">
          {!showLogoutConfirm ? (
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] surface-2 border border-border-soft text-coral text-[14px] font-display font-bold cursor-pointer hover:border-coral/40 transition-all"
            >
              <LogOut size={18} />
              {t('logout')}
            </button>
          ) : (
            <div className="surface-2 border border-coral/30 rounded-[10px] p-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={18} className="text-coral" />
                <span className="font-display font-bold text-[14px] text-text-main">
                  {t('logout_confirm')}
                </span>
              </div>
              <p className="text-[13px] text-text-muted mb-3">
                {t('logout_confirm_sub')}
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowLogoutConfirm(false)}
                  className="flex-1 surface-2 text-text-muted border border-border rounded-[9px] py-2.5 text-[13.5px] font-display font-bold cursor-pointer hover:text-text-main transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={onSignOut}
                  className="flex-1 btn-coral-dim py-2.5 text-[13.5px] font-display font-bold"
                >
                  {t('confirm')}
                </button>
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Section 4: Data Management */}
      <SectionCard
        icon={<Database size={18} />}
        title={t('settings_data')}
      >
        {/* Export */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
          <button
            onClick={exportJSON}
            className="flex items-center gap-2.5 surface-2 border border-border-soft rounded-[9px] px-3 py-2.5 text-[13.5px] text-text-main font-medium cursor-pointer hover:border-amber/40 transition-all"
          >
            <Download size={18} className="text-amber" />
            {t('export_data')}
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-2.5 surface-2 border border-border-soft rounded-[9px] px-3 py-2.5 text-[13.5px] text-text-main font-medium cursor-pointer hover:border-amber/40 transition-all"
          >
            <Download size={18} className="text-amber" />
            {t('export_csv')}
          </button>
        </div>

        {/* Import */}
        <input
          ref={importFileRef}
          type="file"
          accept=".json"
          onChange={handleImportFile}
          className="hidden"
        />
        <button
          onClick={() => importFileRef.current?.click()}
          className="w-full flex items-center gap-2.5 surface-2 border border-border-soft rounded-[9px] px-3 py-2.5 text-[13.5px] text-text-main font-medium cursor-pointer hover:border-amber/40 transition-all mb-4"
        >
          <Upload size={18} className="text-amber" />
          {t('import_data')}
        </button>

        <div className="h-px bg-border-soft my-2" />

        {/* Deck Sharing */}
        <div className="flex items-center gap-2.5 mb-3 mt-2">
          <Share2 size={18} className="text-amber" />
          <span className="font-display font-bold text-[14px] text-text-main">
            {t('share_deck')}
          </span>
        </div>

        {/* Share a deck */}
        <div className="surface-2 rounded-[10px] p-3.5 mb-3">
          <input
            type="text"
            value={shareDeckName}
            onChange={(e) => setShareDeckName(e.target.value)}
            placeholder={t('title')}
            maxLength={50}
            className="input-dark w-full px-3 py-2.5 text-[13.5px] mb-2"
          />
          <select
            value={shareDeckCategory}
            onChange={(e) => setShareDeckCategory(e.target.value)}
            className="input-dark w-full px-3 py-2.5 text-[13.5px] mb-2"
          >
            <option value="">{t('all_folders')}</option>
            {uniqueCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <button
            onClick={handleShareDeck}
            disabled={sharing || !shareDeckName.trim()}
            className="btn-amber w-full py-2.5 text-[13.5px] disabled:opacity-50"
          >
            {sharing ? t('processing') : t('share_deck')}
          </button>
          {shareCode && (
            <div className="mt-3 animate-fade-in">
              <div className="flex items-center gap-2 surface rounded-[9px] px-3 py-2.5">
                <span className="text-[12px] text-text-muted flex-shrink-0">
                  {t('share_code')}:
                </span>
                <code className="text-amber font-display font-bold text-[15px] tracking-wider flex-1">
                  {shareCode}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareCode);
                    showToast(t('copied'));
                  }}
                  className="text-text-faint hover:text-amber transition-colors text-[12px] flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={14} />
                  {t('copy_code')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Import shared deck */}
        <div className="surface-2 rounded-[10px] p-3.5">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={importCode}
              onChange={(e) => setImportCode(e.target.value)}
              placeholder={t('enter_share_code')}
              className="input-dark w-full px-3 py-2.5 text-[13.5px]"
              dir="ltr"
            />
            <button
              onClick={handleImportSharedDeck}
              disabled={importing || !importCode.trim()}
              className="btn-amber px-4 py-2.5 text-[13.5px] whitespace-nowrap disabled:opacity-50 sm:flex-shrink-0"
            >
              {importing ? t('processing') : t('add_shared_deck')}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

type Attachment = {
  path: string;
  name: string;
  type: string;
  size: number;
};

function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface p-4 sm:p-5 mb-4 w-full">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-amber">{icon}</span>
        <h3 className="font-display font-bold text-[15px] m-0">{title}</h3>
      </div>
      {children}
    </div>
  );
}
