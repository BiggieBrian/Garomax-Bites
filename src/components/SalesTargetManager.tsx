import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { requestSync } from '../db/sync';
import { useAuth } from '../context/AuthContext';
import type { PeriodType, SalesTarget } from '../types';
import { Target, Plus, CheckCircle2, XCircle } from 'lucide-react';

const money = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

function inRange(iso: string, start: string, end: string) {
  const d = iso.slice(0, 10);
  return d >= start && d <= end;
}

const PERIODS: { value: PeriodType; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

/**
 * Admin panel: set daily/weekly/monthly sales targets (with manually chosen
 * date ranges) for the active branch, and see actual-vs-target for both the
 * currently active target(s) and past ones. Setting a new target for a
 * period_type retires (not deletes) whichever one was active for that
 * period, so history for comparison is never lost.
 */
export const SalesTargetManager: React.FC<{ branchId: string | null }> = ({ branchId }) => {
  const { currentUser } = useAuth();
  const allTargets = useLiveQuery(() => db.salesTargets.orderBy('created_at').reverse().toArray(), []) ?? [];
  const targets = useMemo(
    () => allTargets.filter((t) => t.branch_id === branchId || !t.branch_id),
    [allTargets, branchId]
  );
  const allOrders = useLiveQuery(() => db.orders.toArray(), []) ?? [];

  const actualFor = (t: SalesTarget) =>
    allOrders
      .filter(
        (o) =>
          o.branch_id === branchId &&
          o.payment_status === 'paid' &&
          inRange(o.timestamp, t.start_date, t.end_date)
      )
      .reduce((sum, o) => sum + o.total_amount, 0);

  const [showForm, setShowForm] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>('daily');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  const resetForm = () => {
    setPeriodType('daily');
    setStartDate(todayIso());
    setEndDate(todayIso());
    setAmount('');
    setError('');
  };

  const handleCreate = async () => {
    setError('');
    if (!branchId) return setError('No branch selected.');
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return setError('Enter a target amount greater than zero.');
    if (endDate < startDate) return setError('End date is before the start date.');
    if (!currentUser) return;

    // Retire whichever target of this period_type is currently active for
    // this branch — keeps exactly one active target per period per branch,
    // while the retired one stays visible below for comparison.
    const toRetire = targets.filter(
      (t) => t.active && t.period_type === periodType && t.branch_id === branchId
    );
    for (const t of toRetire) {
      await db.salesTargets.update(t.target_id, { active: false, synced: false });
    }

    await db.salesTargets.add({
      target_id: crypto.randomUUID(),
      branch_id: branchId,
      period_type: periodType,
      start_date: startDate,
      end_date: endDate,
      target_amount: amt,
      set_by_user_id: currentUser.user_id,
      active: true,
      created_at: new Date().toISOString(),
      synced: false,
    });
    requestSync();
    resetForm();
    setShowForm(false);
  };

  const handleRetire = async (t: SalesTarget) => {
    await db.salesTargets.update(t.target_id, { active: false, synced: false });
    requestSync();
  };

  const activeTargets = targets.filter((t) => t.active);
  const pastTargets = targets.filter((t) => !t.active).slice(0, 10);

  return (
    <div className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-orange-400" />
          <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Sales Targets
          </span>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-mono font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-1 rounded-lg hover:bg-orange-500/20 transition"
        >
          <Plus className="w-3 h-3" /> New Target
        </button>
      </div>

      {showForm && (
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3 space-y-2">
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriodType(p.value)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase transition ${
                  periodType === p.value
                    ? 'bg-orange-500 text-zinc-950'
                    : 'bg-zinc-950 text-zinc-400 border border-zinc-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                Start date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-orange-500/50"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                End date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-orange-500/50"
              />
            </div>
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Target amount (KES)"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              className="flex-1 bg-orange-500 text-white text-xs font-bold py-2 rounded-lg hover:bg-orange-400 transition active:scale-95"
            >
              Set Target
            </button>
            <button
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
              className="px-3 text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
          {activeTargets.some((t) => t.period_type === periodType) && (
            <p className="text-[10px] font-mono text-zinc-500">
              This replaces the current active {periodType} target — its history stays visible below.
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {activeTargets.length === 0 ? (
          <p className="text-zinc-600 text-[11px] font-mono text-center py-3">
            No active targets — set one above.
          </p>
        ) : (
          activeTargets.map((t) => {
            const actual = actualFor(t);
            const pct = t.target_amount > 0 ? Math.min(1, actual / t.target_amount) : 0;
            const hit = actual >= t.target_amount;
            return (
              <div key={t.target_id} className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-orange-400 uppercase tracking-widest">
                    {t.period_type}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500">
                    {t.start_date} → {t.end_date}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono font-bold ${hit ? 'text-emerald-400' : 'text-zinc-200'}`}>
                    {money(actual)} / {money(t.target_amount)}
                  </span>
                  <button
                    onClick={() => handleRetire(t)}
                    className="text-[10px] font-mono text-zinc-500 hover:text-red-400"
                  >
                    Retire
                  </button>
                </div>
                <div className="h-1.5 w-full bg-zinc-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${hit ? 'bg-emerald-500' : 'bg-orange-500'}`}
                    style={{ width: `${Math.round(pct * 100)}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>

      {pastTargets.length > 0 && (
        <div>
          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Past targets</p>
          <div className="space-y-1.5">
            {pastTargets.map((t) => {
              const actual = actualFor(t);
              const hit = actual >= t.target_amount;
              return (
                <div
                  key={t.target_id}
                  className="flex items-center justify-between bg-zinc-900/30 px-2.5 py-1.5 rounded-lg border border-zinc-800/40"
                >
                  <span className="text-[10px] font-mono text-zinc-500">
                    {t.period_type} · {t.start_date} → {t.end_date}
                  </span>
                  <span className={`text-[10px] font-mono flex items-center gap-1 ${hit ? 'text-emerald-400' : 'text-red-400'}`}>
                    {hit ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {money(actual)} / {money(t.target_amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};