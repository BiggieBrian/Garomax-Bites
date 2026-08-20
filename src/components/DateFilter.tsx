import React from 'react';
import type { DatePreset } from '../lib/dateFilter';
import { DATE_PRESET_LABELS } from '../lib/dateFilter';

interface DateFilterProps {
  value: DatePreset;
  onChange: (preset: DatePreset) => void;
  presets?: DatePreset[];
}

/** Preset chip row (Today / 7 Days / 30 Days / All) — same pattern as the payroll ledger's status filter. */
export const DateFilter: React.FC<DateFilterProps> = ({
  value,
  onChange,
  presets = ['today', 'week', 'month', 'all'],
}) => {
  return (
    <div className="flex gap-1.5">
      {presets.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`flex-1 py-1.5 rounded-lg font-mono text-[9px] font-bold uppercase tracking-wider transition ${
            value === p
              ? 'bg-orange-500 text-zinc-950'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
          }`}
        >
          {DATE_PRESET_LABELS[p]}
        </button>
      ))}
    </div>
  );
};