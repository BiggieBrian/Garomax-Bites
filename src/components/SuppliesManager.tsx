import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { requestSync, deleteSupplyRemote } from '../db/sync';
import type { Supply } from '../types';
import { Boxes, Plus, RotateCcw, Trash2, X, AlertTriangle } from 'lucide-react';

const money = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

function daysSince(dateIso: string): number {
  const then = new Date(dateIso).getTime();
  const now = new Date().getTime();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/**
 * "Untrackable" consumables — oil, onions, tomatoes, gas, water — tracked by
 * restock cadence instead of an exact quantity, since nobody's measuring
 * grams of onion per plate. Admin taps "Mark Restocked" when they buy more;
 * the app just watches the calendar against the expected interval and flags
 * anything overdue, the same way low-stock warnings work for real ingredients.
 */
export const SuppliesManager: React.FC<{ branchId: string | null }> = ({ branchId }) => {
  const allSupplies = useLiveQuery(() => db.supplies.toArray(), []) ?? [];
  const supplies = allSupplies
    .filter((s) => s.branch_id === branchId)
    .sort((a, b) => a.name.localeCompare(b.name));

  // -------------------------------------------------------------------
  // Add supply
  // -------------------------------------------------------------------
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [unitLabel, setUnitLabel] = useState('');
  const [intervalDays, setIntervalDays] = useState('7');
  const [error, setError] = useState('');

  const resetAddForm = () => {
    setName('');
    setUnitLabel('');
    setIntervalDays('7');
    setError('');
  };

  const handleAdd = async () => {
    setError('');
    if (!branchId) return setError('No branch selected.');
    if (!name.trim()) return setError('Enter a name.');
    const interval = parseInt(intervalDays, 10);
    if (!interval || interval <= 0) return setError('Enter a restock interval greater than zero days.');

    await db.supplies.add({
      supply_id: crypto.randomUUID(),
      branch_id: branchId,
      name: name.trim(),
      unit_label: unitLabel.trim() || 'unit',
      restock_interval_days: interval,
      synced: false,
    });
    requestSync();
    resetAddForm();
    setShowAddForm(false);
  };

  // -------------------------------------------------------------------
  // Mark restocked — the one action this whole screen exists for.
  // Optionally logs a cost, which feeds the Expenses/Profit numbers on
  // the Overview tab.
  // -------------------------------------------------------------------
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockCost, setRestockCost] = useState('');
  const [restockQuantity, setRestockQuantity] = useState('');
  const [restockInterval, setRestockInterval] = useState('');

  const openRestock = (s: Supply) => {
    setRestockingId(s.supply_id);
    setRestockCost(s.last_restock_cost ? String(s.last_restock_cost) : '');
    setRestockQuantity(s.last_restock_quantity ?? '');
    setRestockInterval(String(s.restock_interval_days));
  };

  const confirmRestock = async (s: Supply) => {
    const cost = restockCost.trim() ? parseFloat(restockCost) : undefined;
    const interval = parseInt(restockInterval, 10);
    await db.supplies.update(s.supply_id, {
      last_restocked_at: todayIso(),
      last_restock_cost: cost !== undefined && !isNaN(cost) ? cost : s.last_restock_cost,
      last_restock_quantity: restockQuantity.trim() || undefined,
      restock_interval_days: interval && interval > 0 ? interval : s.restock_interval_days,
      synced: false,
    });
    requestSync();
    setRestockingId(null);
    setRestockCost('');
    setRestockQuantity('');
    setRestockInterval('');
  };

  // -------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async (s: Supply) => {
    setDeleteError('');
    const ok = await deleteSupplyRemote(s.supply_id);
    if (!ok) {
      setDeleteError('Could not delete on the server — check your connection and try again.');
      setConfirmDeleteId(null);
      return;
    }
    await db.supplies.delete(s.supply_id);
    setConfirmDeleteId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Supplies</h2>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1.5 rounded-lg hover:bg-orange-500/20 transition active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Supply
        </button>
      </div>

      <p className="text-[11px] font-mono text-zinc-500">
        Oil, onions, tomatoes, gas, water — items too vague to portion per dish. Tracked by
        restock date instead of quantity.
      </p>

      {showAddForm && (
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3 space-y-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Cooking Oil)"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
          />
          <input
            value={unitLabel}
            onChange={(e) => setUnitLabel(e.target.value)}
            placeholder="Unit (e.g. 5L jerrican, 13kg cylinder)"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
          />
          <div>
            <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
              Restock every (days)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAdd}
              className="flex-1 bg-orange-500 text-white text-xs font-bold py-2 rounded-lg hover:bg-orange-400 transition active:scale-95"
            >
              Save Supply
            </button>
            <button
              onClick={() => {
                resetAddForm();
                setShowAddForm(false);
              }}
              className="px-3 text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}

      <div className="space-y-2">
        {supplies.length === 0 && (
          <p className="text-xs text-zinc-500 text-center py-6">
            No supplies tracked yet — add oil, gas, or produce above.
          </p>
        )}

        {supplies.map((s) => {
          const overdueBy = s.last_restocked_at
            ? daysSince(s.last_restocked_at) - s.restock_interval_days
            : null;
          const isOverdue = overdueBy !== null && overdueBy > 0;
          const neverRestocked = !s.last_restocked_at;

          return (
            <div
              key={s.supply_id}
              className={`bg-zinc-900/80 border rounded-xl p-3 ${
                isOverdue || neverRestocked ? 'border-red-500/30' : 'border-zinc-800/80'
              }`}
            >
              {restockingId === s.supply_id ? (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-300">
                    Mark <span className="font-semibold text-white">{s.name}</span> restocked today?
                  </p>
                  <input
                    type="text"
                    value={restockQuantity}
                    onChange={(e) => setRestockQuantity(e.target.value)}
                    placeholder={`How much this time? (e.g. 10kg) — optional`}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    value={restockCost}
                    onChange={(e) => setRestockCost(e.target.value)}
                    placeholder="Cost this restock (KES) — optional"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
                  />
                  <div>
                    <label className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                      Next restock in (days) — adjust if this buy will last a different amount of time
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={restockInterval}
                      onChange={(e) => setRestockInterval(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => confirmRestock(s)}
                      className="flex-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold py-2 rounded-lg hover:bg-emerald-500/20 transition"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setRestockingId(null)}
                      className="px-3 text-xs text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : confirmDeleteId === s.supply_id ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-red-300">Delete {s.name}?</p>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(s)}
                      className="px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-[11px] font-bold transition"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-100">{s.name}</p>
                    <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      {s.unit_label} · every {s.restock_interval_days}d
                    </p>
                    {neverRestocked ? (
                      <p className="text-[10px] font-mono text-red-400 flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3" /> Never marked restocked
                      </p>
                    ) : isOverdue ? (
                      <p className="text-[10px] font-mono text-red-400 flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3" /> Overdue by {overdueBy}d
                        {s.last_restock_quantity ? ` · bought ${s.last_restock_quantity}` : ''}
                        {s.last_restock_cost ? ` · last cost ${money(s.last_restock_cost)}` : ''}
                      </p>
                    ) : (
                      <p className="text-[10px] font-mono text-zinc-500 mt-1">
                        Last restocked {daysSince(s.last_restocked_at!)}d ago
                        {s.last_restock_quantity ? ` · bought ${s.last_restock_quantity}` : ''}
                        {s.last_restock_cost ? ` · ${money(s.last_restock_cost)}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => openRestock(s)}
                      className="p-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 hover:bg-orange-500/20 text-orange-400 transition"
                      title="Mark restocked today"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setDeleteError(''); setConfirmDeleteId(s.supply_id); }}
                      className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};