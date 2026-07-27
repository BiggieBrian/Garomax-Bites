import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** Compact page-number strip: first, last, current ±1, with ellipses between. */
export const Pagination: React.FC<PaginationProps> = ({ page, totalPages, onPageChange }) => {
  if (totalPages <= 1) return null;

  const pages: (number | 'ellipsis')[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <div className="flex items-center justify-between pt-3 mt-1 border-t border-zinc-800/60">
      <button
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center gap-1">
        {pages.map((p, idx) =>
          p === 'ellipsis' ? (
            <span key={`e-${idx}`} className="text-zinc-600 text-[10px] font-mono px-1 select-none">
              ⋯
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[1.75rem] h-7 rounded-lg font-mono text-[10px] font-bold transition ${
                p === page
                  ? 'bg-orange-500 text-zinc-950 shadow-md shadow-orange-500/20'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
              }`}
            >
              {p}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-30 disabled:pointer-events-none active:scale-95 transition"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};