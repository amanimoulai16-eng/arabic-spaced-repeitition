import { useState } from 'react';
import { type Settings, DEFAULT_INTERVALS } from '@/lib/srs';

type TFunc = (key: string, ...args: never[]) => string;

type Props = {
  settings: Settings;
  onSave: (intervals: number[]) => void;
  onReset: () => void;
  t: TFunc;
};

export function SettingsPage({ settings, onSave, onReset, t }: Props) {
  const [intervals, setIntervals] = useState<number[]>(
    settings.intervals.length === 6 ? settings.intervals : DEFAULT_INTERVALS,
  );

  function handleSave() {
    const vals = intervals.map((v) => Math.max(1, v || 1));
    onSave(vals);
  }

  function handleReset() {
    setIntervals(DEFAULT_INTERVALS.slice());
    onReset();
  }

  return (
    <div className="animate-fade-in max-w-[500px]">
      <h2 className="font-display font-bold text-lg m-0 mb-1">
        {t('customize_schedule')}
      </h2>
      <p className="text-text-muted text-[13px] m-0 mb-5">
        {t('schedule_desc')}
      </p>

      <div className="surface p-5 mb-4">
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
            onClick={handleReset}
            className="flex-1 surface-2 text-text-muted border border-border rounded-[9px] py-2.5 text-[13.5px] font-display font-bold cursor-pointer hover:text-text-main transition-colors"
          >
            {t('restore_default')}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 btn-amber py-2.5 text-[13.5px]"
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
