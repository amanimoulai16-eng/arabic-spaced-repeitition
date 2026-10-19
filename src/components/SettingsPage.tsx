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
import { Avatar } from '@/components/Avatar';
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
  KeyRound,
  Mail,
  Trash2,
  X,
  Camera,
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
  email: string;
  displayName: string;
  avatarUrl: string | null;
  onUpdateDisplayName: (name: string) => Promise<{ error: unknown }>;
  onUpdateAvatar: (url: string | null) => Promise<{ error: unknown }>;
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
  email,
  displayName,
  avatarUrl,
  onUpdateDisplayName,
  onUpdateAvatar,
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

  // Password change state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // Display name state
  const [nameInput, setNameInput] = useState(displayName || '');
  const [nameLoading, setNameLoading] = useState(false);

  // Account deletion state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Avatar upload state
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  async function handleChangePassword() {
    if (!currentPw) {
      showToast(t('pw_enter_current'));
      return;
    }
    if (newPw.length < 6) {
      showToast(t('pw_too_short'));
      return;
    }
    if (newPw !== confirmPw) {
      showToast(t('pw_mismatch'));
      return;
    }
    setPwLoading(true);
    try {
      const { error: verifyError } =
        await supabase.auth.signInWithPassword({
          email,
          password: currentPw,
        });
      if (verifyError) {
        showToast(t('pw_wrong_current'));
        setPwLoading(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) {
        showToast(t('pw_update_fail'));
      } else {
        showToast(t('pw_updated'));
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      }
    } catch {
      showToast(t('pw_update_fail'));
    }
    setPwLoading(false);
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast(t('avatar_must_be_image'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast(t('avatar_too_large'));
      return;
    }
    setAvatarUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });
      if (upErr) {
        showToast(t('avatar_upload_fail'));
        setAvatarUploading(false);
        return;
      }
      const { data: pub } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);
      const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: dbErr } = await onUpdateAvatar(publicUrl);
      if (dbErr) {
        showToast(t('avatar_upload_fail'));
        setAvatarUploading(false);
        return;
      }
      showToast(t('avatar_updated'));
    } catch {
      showToast(t('avatar_upload_fail'));
    }
    setAvatarUploading(false);
    if (avatarFileRef.current) avatarFileRef.current.value = '';
  }

  async function handleRemoveAvatar() {
    if (!avatarUrl) return;
    try {
      const url = new URL(avatarUrl.split('?')[0]);
      const path = decodeURIComponent(url.pathname.split('/avatars/')[1] || '');
      if (path) {
        await supabase.storage.from('avatars').remove([path]);
      }
    } catch {
      // ignore — still clear the URL
    }
    const { error } = await onUpdateAvatar(null);
    if (error) {
      showToast(t('avatar_upload_fail'));
    } else {
      showToast(t('avatar_removed'));
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      showToast(t('delete_type_confirm'));
      return;
    }
    setDeleting(true);
    try {
      const { error } = await supabase.rpc('delete_user_account');
      if (error) {
        showToast(t('delete_account_fail'));
        setDeleting(false);
        return;
      }
      showToast(t('account_deleted'));
      setShowDeleteConfirm(false);
      setDeleting(false);
      await supabase.auth.signOut();
      onSignOut();
    } catch {
      showToast(t('delete_account_fail'));
      setDeleting(false);
    }
  }

  async function handleSaveName() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === displayName) return;
    setNameLoading(true);
    const { error } = await onUpdateDisplayName(trimmed);
    if (error) {
      showToast(t('name_save_fail'));
    } else {
      showToast(t('name_saved'));
    }
    setNameLoading(false);
  }

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
    <div className="animate-fade-in w-full max-w-full px-4 mx-auto overflow-x-hidden pb-24">
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

      {/* Section 3b: Account — Change Password & Display Name */}
      <SectionCard
        icon={<KeyRound size={18} />}
        title={t('settings_account')}
      >
        {/* Profile picture */}
        <div className="mb-4">
          <label className="block text-[12.5px] text-text-muted mb-2">
            {t('profile_picture')}
          </label>
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <Avatar name={displayName || email} avatarUrl={avatarUrl} size={72} />
              {avatarUploading && (
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                  <span className="text-[10px] text-amber font-display">...</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <button
                onClick={() => avatarFileRef.current?.click()}
                disabled={avatarUploading}
                className="flex items-center gap-2 surface-2 border border-border-soft rounded-[9px] px-3 py-2 text-[13px] text-text-main font-medium hover:border-amber/40 transition-all cursor-pointer disabled:opacity-50 mb-2"
              >
                <Camera size={16} className="text-amber" />
                {t('avatar_upload')}
              </button>
              {avatarUrl && (
                <button
                  onClick={handleRemoveAvatar}
                  disabled={avatarUploading}
                  className="text-[12px] text-text-faint hover:text-coral transition-colors cursor-pointer disabled:opacity-50"
                >
                  {t('avatar_remove')}
                </button>
              )}
              <p className="text-[11.5px] text-text-faint mt-1.5">
                {t('avatar_hint')}
              </p>
            </div>
          </div>
        </div>

        <div className="h-px bg-border-soft my-1" />

        {/* Display Name */}
        <div className="mb-4">
          <label className="block text-[12.5px] text-text-muted mb-2">
            {t('display_name_setting')}
          </label>
          <p className="text-[12px] text-text-faint mb-2.5">
            {t('display_name_setting_sub')}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={t('display_name_ph2')}
              maxLength={50}
              className="input-dark w-full px-3 py-2.5 text-[14px]"
            />
            <button
              onClick={handleSaveName}
              disabled={nameLoading || !nameInput.trim() || nameInput.trim() === displayName}
              className="btn-amber px-4 py-2.5 text-[13.5px] whitespace-nowrap disabled:opacity-50 sm:flex-shrink-0"
            >
              {nameLoading ? t('processing') : t('save_name')}
            </button>
          </div>
        </div>

        <div className="h-px bg-border-soft my-1" />

        {/* Email (read-only) */}
        <div className="py-2.5 flex items-center gap-2.5">
          <Mail size={18} className="text-text-faint" />
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-text-muted">{t('current_email')}</div>
            <div className="text-[14px] text-text-main truncate" dir="ltr">{email}</div>
          </div>
        </div>

        <div className="h-px bg-border-soft my-1" />

        {/* Change Password */}
        <div className="mt-2">
          <label className="block text-[12.5px] text-text-muted mb-1.5">
            {t('change_password')}
          </label>
          <p className="text-[12px] text-text-faint mb-2.5">
            {t('change_password_sub')}
          </p>
          <div className="grid gap-2.5">
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder={t('current_pw')}
              className="input-dark w-full px-3 py-2.5 text-[14px]"
              dir="ltr"
            />
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder={t('new_pw')}
              minLength={6}
              className="input-dark w-full px-3 py-2.5 text-[14px]"
              dir="ltr"
            />
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder={t('new_pw_confirm')}
              minLength={6}
              className="input-dark w-full px-3 py-2.5 text-[14px]"
              dir="ltr"
            />
            <button
              onClick={handleChangePassword}
              disabled={pwLoading || !currentPw || !newPw || !confirmPw}
              className="btn-amber w-full py-2.5 text-[13.5px] disabled:opacity-50"
            >
              {pwLoading ? t('processing') : t('update_password_btn')}
            </button>
          </div>
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

      {/* Section 5: Danger Zone — Account Deletion */}
      <div className="surface p-4 sm:p-5 mb-4 w-full max-w-full border border-red-500/30 rounded-[12px]">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-red-500">
            <AlertTriangle size={18} />
          </span>
          <h3 className="font-display font-bold text-[15px] m-0 text-red-500">
            {t('danger_zone')}
          </h3>
        </div>

        <div className="surface-2 rounded-[10px] p-3.5 border border-red-500/20">
          <div className="flex items-start gap-2.5 mb-3">
            <Trash2 size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] text-text-main font-medium mb-1">
                {t('delete_account')}
              </div>
              <p className="text-[12.5px] text-text-faint leading-relaxed">
                {t('delete_account_sub')}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-2.5 text-[13.5px] font-medium rounded-[9px] border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-all cursor-pointer"
          >
            {t('delete_account_btn')}
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in"
          onClick={() => !deleting && setShowDeleteConfirm(false)}
        >
          <div
            className="surface rounded-[14px] p-5 max-w-md w-full border border-red-500/30"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <AlertTriangle size={20} className="text-red-500" />
                <h3 className="font-display font-bold text-[16px] m-0 text-text-main">
                  {t('delete_account_title')}
                </h3>
              </div>
              {!deleting && (
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-text-faint hover:text-text-main transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <p className="text-[13px] text-text-muted mb-4 leading-relaxed">
              {t('delete_account_warning')}
            </p>

            <label className="block text-[12.5px] text-text-muted mb-1.5">
              {t('delete_type_prompt')}{' '}
              <span className="font-display font-bold text-red-500">DELETE</span>
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              disabled={deleting}
              placeholder="DELETE"
              className="input-dark w-full px-3 py-2.5 text-[14px] mb-4"
              dir="ltr"
              autoFocus
            />

            <div className="flex gap-2.5">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="flex-1 py-2.5 text-[13.5px] font-medium rounded-[9px] border border-border-soft text-text-main hover:border-text-faint transition-all cursor-pointer disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
                className="flex-1 py-2.5 text-[13.5px] font-medium rounded-[9px] bg-red-500 text-white hover:bg-red-600 transition-all cursor-pointer disabled:opacity-50"
              >
                {deleting ? t('processing') : t('delete_account_btn')}
              </button>
            </div>
          </div>
        </div>
      )}
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
    <div className="surface p-4 sm:p-5 mb-4 w-full max-w-full">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-amber">{icon}</span>
        <h3 className="font-display font-bold text-[15px] m-0">{title}</h3>
      </div>
      {children}
    </div>
  );
}
