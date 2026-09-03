import { useState, useMemo } from 'react';
import { Folder, FolderOpen, Search, ArrowRight } from 'lucide-react';
import {
  type Card,
  type Category,
  type Rating,
  type Attachment,
  type ReviewLogEntry,
  type Settings,
  getStatus,
  categoryColor,
} from '@/lib/srs';
import { AddPanel } from './AddPanel';
import { CardItem } from './CardItem';
import { Insights } from './Insights';

type TFunc = (key: string, ...args: never[]) => string;
type TArrFunc = (key: string) => string[];

type FilterKey = 'all' | 'due' | 'upcoming';

type Props = {
  cards: Card[];
  reviewLog: ReviewLogEntry[];
  categories: Category[];
  settings: Settings;
  userId: string;
  loading: boolean;
  onAdd: (data: {
    title: string;
    notes: string;
    category: string;
    familiarity: number;
    resource: string;
    linkedItemId: string;
    question: string;
    answer: string;
    attachments: Attachment[];
  }) => void;
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
  tArr: TArrFunc;
};

export function LibraryPage({
  cards,
  reviewLog,
  categories,
  settings,
  userId,
  loading,
  onAdd,
  onReview,
  onDelete,
  onSnooze,
  onEdit,
  t,
  tArr,
}: Props) {
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const totalCount = cards.length;
  const dueCount = cards.filter((c) => getStatus(c) !== 'upcoming').length;

  // Build folder list from card categories
  const folders = useMemo(() => {
    const map = new Map<string, { name: string; count: number; dueCount: number }>();
    cards.forEach((c) => {
      const name = c.category || t('no_category');
      const existing = map.get(name);
      if (existing) {
        existing.count++;
        if (getStatus(c) !== 'upcoming') existing.dueCount++;
      } else {
        map.set(name, {
          name,
          count: 1,
          dueCount: getStatus(c) !== 'upcoming' ? 1 : 0,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.name === t('no_category')) return 1;
      if (b.name === t('no_category')) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [cards, t]);

  const searchLower = searchQuery.trim().toLowerCase();
  const hasSearch = searchLower.length > 0;

  // Global search results (across all folders)
  const searchResults = useMemo(() => {
    if (!hasSearch) return [];
    return cards
      .filter(
        (c) =>
          c.title.toLowerCase().includes(searchLower) ||
          (c.notes && c.notes.toLowerCase().includes(searchLower)) ||
          (c.category && c.category.toLowerCase().includes(searchLower)) ||
          (c.question && c.question.toLowerCase().includes(searchLower)),
      )
      .sort(
        (a, b) =>
          new Date(a.next_review_at).getTime() -
          new Date(b.next_review_at).getTime(),
      );
  }, [cards, searchLower, hasSearch]);

  // Cards in the active folder
  const folderCards = useMemo(() => {
    if (!activeFolder) return [];
    let result = cards.filter(
      (c) => (c.category || t('no_category')) === activeFolder,
    );
    if (filter === 'due')
      result = result.filter((c) => getStatus(c) !== 'upcoming');
    if (filter === 'upcoming')
      result = result.filter((c) => getStatus(c) === 'upcoming');
    return [...result].sort(
      (a, b) =>
        new Date(a.next_review_at).getTime() -
        new Date(b.next_review_at).getTime(),
    );
  }, [cards, activeFolder, filter, t]);

  const folderDueCount = folderCards.filter(
    (c) => getStatus(c) !== 'upcoming',
  ).length;

  const tabs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: t('tab_all'), count: folderCards.length },
    {
      key: 'due',
      label: t('tab_due'),
      count: folderDueCount,
    },
    {
      key: 'upcoming',
      label: t('tab_upcoming'),
      count: folderCards.length - folderDueCount,
    },
  ];

  // Global search view
  if (hasSearch) {
    return (
      <div className="animate-fade-in">
        <AddPanel
          settings={settings}
          cards={cards}
          categories={categories}
          userId={userId}
          onAdd={onAdd}
          t={t}
        />

        <div className="mb-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute top-1/2 -translate-y-1/2 rtl:right-3.5 ltr:left-3.5 text-text-faint pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_all_folders')}
              className="input-dark w-full px-4 py-2.5 text-[14px] placeholder:text-text-faint"
              autoFocus
            />
          </div>
        </div>

        <p className="font-display font-bold text-sm text-text-muted mb-3">
          {t('search_placeholder')} ({searchResults.length})
        </p>

        {loading ? (
          <div className="text-center text-text-muted py-10 text-sm">
            {t('loading_data')}
          </div>
        ) : searchResults.length === 0 ? (
          <div className="text-center text-text-muted py-15 px-5 text-[14.5px] border border-dashed border-border rounded-[14px]">
            <b className="text-text-main block font-display text-[17px] mb-1.5">
              {t('no_results')}
            </b>
            {t('no_results_sub')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 sm:gap-3.5">
            {searchResults.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                linkedCard={
                  card.linked_item_id
                    ? (cards.find((c) => c.id === card.linked_item_id) ?? null)
                    : null
                }
                cards={cards}
                categories={categories}
                userId={userId}
                onReview={onReview}
                onDelete={onDelete}
                onSnooze={onSnooze}
                onEdit={onEdit}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Inside a folder view
  if (activeFolder) {
    return (
      <div className="animate-fade-in">
        <button
          onClick={() => setActiveFolder(null)}
          className="text-text-muted text-[13px] cursor-pointer mb-4 hover:text-amber transition-colors flex items-center gap-1.5"
        >
          {t('back_to_folders')}
        </button>

        <div className="flex items-center gap-2.5 mb-4">
          <FolderOpen size={22} className="text-amber" />
          <h2 className="font-display font-bold text-lg m-0">{activeFolder}</h2>
          <span className="text-text-faint text-[13px]">
            ({folderCards.length})
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`chip px-4 py-1.5 text-[13px] ${
                filter === tab.key ? 'chip-active' : ''
              }`}
            >
              {tab.label}{' '}
              <span className="opacity-70 text-[11.5px] mr-1">{tab.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-text-muted py-10 text-sm">
            {t('loading_data')}
          </div>
        ) : folderCards.length === 0 ? (
          <div className="text-center text-text-muted py-15 px-5 text-[14.5px] border border-dashed border-border rounded-[14px]">
            <b className="text-text-main block font-display text-[17px] mb-1.5">
              {t('nothing_here')}
            </b>
            {t('nothing_here_sub')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3 sm:gap-3.5">
            {folderCards.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                linkedCard={
                  card.linked_item_id
                    ? (cards.find((c) => c.id === card.linked_item_id) ?? null)
                    : null
                }
                cards={cards}
                categories={categories}
                userId={userId}
                onReview={onReview}
                onDelete={onDelete}
                onSnooze={onSnooze}
                onEdit={onEdit}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Folder list view (default)
  return (
    <div className="animate-fade-in">
      <AddPanel
        settings={settings}
        cards={cards}
        categories={categories}
        userId={userId}
        onAdd={onAdd}
        t={t}
      />

      <Insights cards={cards} reviewLog={reviewLog} t={t} tArr={tArr} />

      {/* Global search */}
      {totalCount > 0 && (
        <div className="mb-5">
          <div className="relative">
            <Search
              size={16}
              className="absolute top-1/2 -translate-y-1/2 rtl:right-3.5 ltr:left-3.5 text-text-faint pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_all_folders')}
              className="input-dark w-full px-4 py-2.5 text-[14px] placeholder:text-text-faint"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display font-bold text-base m-0">{t('folders')}</h2>
        <span className="text-text-faint text-[12.5px]">{totalCount}</span>
      </div>

      {loading ? (
        <div className="text-center text-text-muted py-10 text-sm">
          {t('loading_data')}
        </div>
      ) : totalCount === 0 ? (
        <div className="text-center text-text-muted py-15 px-5 text-[14.5px] border border-dashed border-border rounded-[14px]">
          <b className="text-text-main block font-display text-[17px] mb-1.5">
            {t('no_topics')}
          </b>
          {t('no_topics_sub')}
        </div>
      ) : folders.length === 0 ? (
        <div className="text-center text-text-muted py-15 px-5 text-[14.5px] border border-dashed border-border rounded-[14px]">
          <b className="text-text-main block font-display text-[17px] mb-1.5">
            {t('no_folders_yet')}
          </b>
          {t('no_folders_yet_sub')}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full">
          {folders.map((folder) => {
            const isUncat = folder.name === t('no_category');
            const color = isUncat ? '#8B92A5' : categoryColor(folder.name);
            return (
              <button
                key={folder.name}
                onClick={() => setActiveFolder(folder.name)}
                className="surface p-4 flex flex-col gap-2.5 text-right cursor-pointer hover:border-amber/40 transition-all animate-slide-up w-full min-w-0"
              >
                <div className="flex items-center justify-between">
                  <Folder size={22} style={{ color }} />
                  {folder.dueCount > 0 && (
                    <span className="bg-coral-dim text-coral text-[11px] font-bold px-2 py-0.5 rounded-full">
                      {folder.dueCount}
                    </span>
                  )}
                </div>
                <div>
                  <div className="font-display font-bold text-[14.5px] truncate text-text-main">
                    {folder.name}
                  </div>
                  <div className="text-text-faint text-[11.5px] mt-0.5">
                    {t('folder_count', folder.count as never)}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-text-faint text-[11px]">
                  <span>{t('tab_due')}</span>
                  <ArrowRight size={12} className="rtl:rotate-180" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
