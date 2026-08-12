import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { Target } from 'lucide-react';

const money = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function inRange(iso: string, start: string, end: string) {
  const d = iso.slice(0, 10);
  return d >= start && d <= end;
}

const PERIOD_PRIORITY: Record<string, number> = { daily: 0, weekly: 1, monthly: 2 };

/**
 * Compact progress badge for employee-facing screens (WaiterPOS,
 * KitchenDisplay). Shows the tightest currently-active target for this
 * branch (daily takes priority over weekly/monthly if more than one is
 * active and in range today) against actual paid revenue in that target's
 * date range. Renders nothing if there's no active target covering today.
 */
export const SalesTargetBadge: React.FC<{ branchId: string | null }> = ({ branchId }) => {
  const allTargets = useLiveQuery(() => db.salesTargets.toArray(), []) ?? [];
  const allOrders = useLiveQuery(() => db.orders.toArray(), []) ?? [];

  if (!branchId) return null;

  const todayIso = new Date().toISOString().slice(0, 10);
  const activeTargets = allTargets.filter(
    (t) =>
      t.active &&
      (t.branch_id === branchId || !t.branch_id) &&
      t.start_date <= todayIso &&
      t.end_date >= todayIso
  );
  if (activeTargets.length === 0) return null;

  const target = [...activeTargets].sort(
    (a, b) => PERIOD_PRIORITY[a.period_type] - PERIOD_PRIORITY[b.period_type]
  )[0];

  const actual = allOrders
    .filter(
      (o) =>
        o.branch_id === branchId &&
        o.payment_status === 'paid' &&
        inRange(o.timestamp, target.start_date, target.end_date)
    )
    .reduce((sum, o) => sum + o.total_amount, 0);

  const pct = target.target_amount > 0 ? Math.min(1, actual / target.target_amount) : 0;
  const hit = actual >= target.target_amount;

  return (
    <div className="bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-3 mb-4 shadow-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Target className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
            {target.period_type} target
          </span>
        </div>
        <span className={`text-[10px] font-mono font-bold ${hit ? 'text-emerald-400' : 'text-zinc-300'}`}>
          {money(actual)} / {money(target.target_amount)}
        </span>
      </div>
      <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${hit ? 'bg-emerald-500' : 'bg-orange-500'}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  );
};