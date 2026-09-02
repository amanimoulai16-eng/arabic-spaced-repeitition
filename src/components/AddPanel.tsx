import { useState, useRef } from 'react';
import { type Card, type Category, type Settings, type Attachment } from '@/lib/srs';
import { supabase } from '@/lib/supabase';

type TFunc = (key: string, ...args: never[]) => string;

type Props = {
  settings: Settings;
  cards: Card[];
  categories: Category[];
  userId: string;
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
  t: TFunc;
};

export function AddPanel({ settings, cards, categories, userId, onAdd, t }: Props) {
  const [title, setTitle] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState('');
  const [familiarity, setFamiliarity] = useState(0);
  const [resource, setResource] = useState('');
  const [linkedItemId, setLinkedItemId] = useState('');
  const [flashOn, setFlashOn] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    const uploaded: Attachment[] = [];
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf';
      if (!isImage && !isPdf) continue;
      if (file.size > 10 * 1024 * 1024) continue;

      const ext = file.name.split('.').pop() || '';
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const path = `${userId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('card-attachments')
        .upload(path, file, { contentType: file.type });

      if (uploadError) continue;
      uploaded.push({ path, name: file.name, type: file.type, size: file.size });
    }

    setAttachments((prev) => [...prev, ...uploaded]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAttachment(idx: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(true);
      setTimeout(() => setError(false), 1200);
      return;
    }
    onAdd({
      title: trimmed,
      notes,
      category,
      familiarity,
      resource,
      linkedItemId,
      question: flashOn ? question : '',
      answer: flashOn ? answer : '',
      attachments,
    });
    setTitle('');
    setNotes('');
    setCategory('');
    setFamiliarity(0);
    setResource('');
    setLinkedItemId('');
    setFlashOn(false);
    setQuestion('');
    setAnswer('');
    setAttachments([]);
    setShowExtra(false);
  }

  return (
    <div className="surface p-4 mb-4">
      <div className="flex flex-col sm:flex-row gap-2.5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={t('add_placeholder')}
          maxLength={120}
          className="input-dark flex-1 px-3.5 py-3 text-[15px] placeholder:text-text-faint"
          style={error ? { borderColor: '#E2665B' } : undefined}
        />
        <button
          onClick={handleSubmit}
          className="btn-amber px-5 py-3 text-[15px] whitespace-nowrap w-full sm:w-auto"
        >
          {t('add_btn')}
        </button>
      </div>

      <button
        onClick={() => setShowExtra(!showExtra)}
        className="text-text-muted text-[13px] cursor-pointer pt-2.5 underline underline-offset-[3px] hover:text-text-main transition-colors"
      >
        {showExtra ? t('hide_details') : t('show_details')}
      </button>

      {showExtra && (
        <div className="grid gap-2.5 mt-3 animate-fade-in">
          {/* Notes */}
          <div>
            <span className="block text-[12px] text-text-muted mb-1.5">{t('notes')}</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notes_ph')}
              maxLength={300}
              className="input-dark w-full px-3 py-2.5 text-[13.5px] resize-none min-h-[40px] placeholder:text-text-faint"
            />
          </div>

          {/* File Upload */}
          <div>
            <span className="block text-[12px] text-text-muted mb-1.5">
              {t('attachments')}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="input-dark w-full px-3 py-2.5 text-[13px] text-text-muted cursor-pointer hover:text-text-main transition-colors text-center disabled:opacity-50"
            >
              {uploading
                ? t('uploading')
                : attachments.length > 0
                  ? t('add_more', attachments.length as never)
                  : t('pick_files')}
            </button>
            {attachments.length > 0 && (
              <div className="grid gap-1.5 mt-2 animate-fade-in">
                {attachments.map((att, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-2 surface-2 px-2.5 py-1.5 text-[12px]"
                  >
                    <span className="truncate text-text-muted">
                      {att.type.startsWith('image/') ? '\uD83D\uDDBC\uFE0F' : '\uD83D\uDCC4'}{' '}
                      {att.name}
                    </span>
                    <button
                      onClick={() => removeAttachment(i)}
                      className="text-text-faint hover:text-coral transition-colors flex-shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category + Familiarity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <span className="block text-[12px] text-text-muted mb-1.5">
                {t('category')}
              </span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="cat-list"
                placeholder={t('category_ph')}
                maxLength={30}
                className="input-dark w-full px-3 py-2.5 text-[13.5px] placeholder:text-text-faint"
              />
              <datalist id="cat-list">
                {categories.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div>
              <span className="block text-[12px] text-text-muted mb-1.5">
                {t('familiarity')}
              </span>
              <select
                value={familiarity}
                onChange={(e) => setFamiliarity(Number(e.target.value))}
                className="input-dark w-full px-3 py-2.5 text-[13.5px]"
              >
                <option value={0}>{t('fam_new')}</option>
                <option value={1}>{t('fam_some')}</option>
                <option value={2}>{t('fam_good')}</option>
              </select>
            </div>
          </div>

          {/* Resource + Linked */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <span className="block text-[12px] text-text-muted mb-1.5">
                {t('resource')}
              </span>
              <input
                type="url"
                value={resource}
                onChange={(e) => setResource(e.target.value)}
                placeholder="https://..."
                className="input-dark w-full px-3 py-2.5 text-[13.5px] placeholder:text-text-faint"
              />
            </div>
            <div>
              <span className="block text-[12px] text-text-muted mb-1.5">
                {t('linked')}
              </span>
              <select
                value={linkedItemId}
                onChange={(e) => setLinkedItemId(e.target.value)}
                className="input-dark w-full px-3 py-2.5 text-[13.5px]"
              >
                <option value="">{t('none')}</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Flashcard toggle */}
          <label className="flex items-center gap-2 text-[13px] text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={flashOn}
              onChange={(e) => setFlashOn(e.target.checked)}
              className="accent-amber"
            />
            {t('flash_toggle')}
          </label>

          {flashOn && (
            <div className="grid gap-2.5 animate-fade-in">
              <div>
                <span className="block text-[12px] text-text-muted mb-1.5">
                  {t('question')}
                </span>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder={t('question_ph')}
                  maxLength={200}
                  className="input-dark w-full px-3 py-2.5 text-[13.5px] placeholder:text-text-faint"
                />
              </div>
              <div>
                <span className="block text-[12px] text-text-muted mb-1.5">
                  {t('answer')}
                </span>
                <input
                  type="text"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={t('answer_ph')}
                  maxLength={200}
                  className="input-dark w-full px-3 py-2.5 text-[13.5px] placeholder:text-text-faint"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
