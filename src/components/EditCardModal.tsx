import { useState, useRef, useEffect } from 'react';
import { type Card, type Category, type Attachment } from '@/lib/srs';
import { supabase } from '@/lib/supabase';

type TFunc = (key: string, ...args: never[]) => string;

type Props = {
  card: Card;
  cards: Card[];
  categories: Category[];
  userId: string;
  onSave: (data: {
    title: string;
    notes: string;
    category: string;
    resource: string;
    linkedItemId: string;
    question: string;
    answer: string;
    attachments: Attachment[];
  }) => Promise<void>;
  onClose: () => void;
  t: TFunc;
};

export function EditCardModal({
  card,
  cards,
  categories,
  userId,
  onSave,
  onClose,
  t,
}: Props) {
  const [title, setTitle] = useState(card.title);
  const [notes, setNotes] = useState(card.notes || '');
  const [category, setCategory] = useState(card.category || '');
  const [resource, setResource] = useState(card.resource || '');
  const [linkedItemId, setLinkedItemId] = useState(card.linked_item_id || '');
  const [question, setQuestion] = useState(card.question || '');
  const [answer, setAnswer] = useState(card.answer || '');
  const [attachments, setAttachments] = useState<Attachment[]>(
    card.attachments || [],
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

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

  async function handleSubmit() {
    const trimmed = title.trim();
    if (!trimmed) {
      setError(true);
      setTimeout(() => setError(false), 1200);
      return;
    }
    setSaving(true);
    await onSave({
      title: trimmed,
      notes,
      category,
      resource,
      linkedItemId,
      question,
      answer,
      attachments,
    });
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-90 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="surface w-full max-w-[560px] max-h-[88vh] overflow-y-auto p-5 sm:p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-bold text-lg text-text-main m-0">
            {t('edit_card')}
          </h2>
          <button
            onClick={onClose}
            className="text-text-faint hover:text-coral transition-colors text-lg px-1"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-3">
          {/* Title */}
          <div>
            <span className="block text-[12px] text-text-muted mb-1.5">{t('title')}</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="input-dark w-full px-3 py-2.5 text-[14px] placeholder:text-text-faint"
              style={error ? { borderColor: '#E2665B' } : undefined}
            />
          </div>

          {/* Notes */}
          <div>
            <span className="block text-[12px] text-text-muted mb-1.5">{t('notes')}</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('notes_ph')}
              maxLength={300}
              className="input-dark w-full px-3 py-2.5 text-[13.5px] resize-none min-h-[50px] placeholder:text-text-faint"
            />
          </div>

          {/* Category + Resource */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <span className="block text-[12px] text-text-muted mb-1.5">
                {t('category')}
              </span>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                list="edit-cat-list"
                placeholder={t('category_ph')}
                maxLength={30}
                className="input-dark w-full px-3 py-2.5 text-[13.5px] placeholder:text-text-faint"
              />
              <datalist id="edit-cat-list">
                {categories.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
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
          </div>

          {/* Linked item */}
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
              {cards
                .filter((c) => c.id !== card.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </select>
          </div>

          {/* Question + Answer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <span className="block text-[12px] text-text-muted mb-1.5">
                {t('question_opt')}
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
                {t('answer_opt')}
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
              id="edit-file-upload"
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

          {/* Actions */}
          <div className="flex gap-2.5 mt-2">
            <button
              onClick={onClose}
              className="surface-2 border-border text-text-muted rounded-[9px] px-4 py-2.5 text-[14px] cursor-pointer hover:text-text-main transition-colors flex-1"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="btn-amber px-5 py-2.5 text-[14px] flex-1 disabled:opacity-60"
            >
              {saving ? t('saving') : t('save_changes')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
