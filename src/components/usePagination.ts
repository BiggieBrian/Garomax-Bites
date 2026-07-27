import { useState } from 'react';

/**
 * Slices `items` into pages of `pageSize`. If the underlying list shrinks
 * (e.g. a filter changes) and the current page no longer exists, the
 * returned `page` clamps back to the last valid page automatically.
 */
export function usePagination<T>(items: T[], pageSize = 5) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Derive the safe page rather than writing it back to state — if the list
  // shrinks (e.g. a filter changes), this instantly clamps for rendering
  // without a render-then-correct effect cycle.
  const clampedPage = Math.min(page, totalPages);
  const start = (clampedPage - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return { page: clampedPage, setPage, totalPages, pageItems };
}