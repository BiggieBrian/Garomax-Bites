import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import type { StaffLedger } from '../types';
import {
  ClipboardList,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  X,
} from 'lucide-react';

const money = (n: number) => `KES ${n.toLocaleString()}`;

export const AdminDashboard: React.FC = () => {
  const staff = useLiveQuery(() => db.users.toArray(), []);
  const ledgers = useLiveQuery(
    () => db.staffLedgers.orderBy('date').reverse().toArray(),
    []
  );

  const [showForm, setShowForm] = useState(false);
  const [formStaffId, setFormStaffId] = useState('');
  const [formShortage, setFormShortage] = useState('');
  const [formSpoilage, setFormSpoilage] = useState('');
  const [formReason, setFormReason] = useState('');
  const [filter, setFilter] = useState<'all' | StaffLedger['payroll_deduction_status']>('all');

  const staffMap = new Map((staff ?? []).map((s) => [s.user_id, s]));

  const filteredLedgers = (ledgers ?? []).filter(
    (l) => filter === 'all' || l.payroll_deduction_status === filter
  );

  const totals = (ledgers ?? []).reduce(
    (acc, l) => {
      const amount = l.shortage_amount + l.spoilage_cost;
      if (l.payroll_deduction_status === 'pending') acc.pending += amount;
      if (l.payroll_deduction_status === 'deducted') acc.deducted += amount;
      if (l.payroll_deduction_status === 'waived') acc.waived += amount;
      return acc;
    },
    { pending: 0, deducted: 0, waived: 0 }
  );

  const resetForm = () => {
    setFormStaffId('');
    setFormShortage('');
    setFormSpoilage('');
    setFormReason('');
  };

  const handleAddLedgerEntry = async () => {
    if (!formStaffId || !formReason.trim()) return;
    const shortage = parseFloat(formShortage) || 0;
    const spoilage = parseFloat(formSpoilage) || 0;
    if (shortage === 0 && spoilage === 0) return;

    const entry: StaffLedger = {
      ledger_id: crypto.randomUUID(),
      staff_id: formStaffId,
      date: new Date().toISOString(),
      shortage_amount: shortage,
      spoilage_cost: spoilage,
      reason: formReason.trim(),
      payroll_deduction_status: 'pending',
      synced: false,
    };

    await db.staffLedgers.add(entry);
    resetForm();
    setShowForm(false);
  };

  const updateStatus = async (
    ledgerId: string,
    status: StaffLedger['payroll_deduction_status']
  ) => {
    await db.staffLedgers.update(ledgerId, {
      payroll_deduction_status: status,
      synced: false,
    });
  };

  return (
    <div className="space-y-5 max-w-md mx-auto pb-20">
      {/* Header Badge */}
      <div className="relative p-4 bg-[#0f1117] border border-zinc-800/80 rounded-2xl shadow-xl flex items-center justify-between">
        <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 border-t border-l border-orange-500/60" />
        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 border-t border-r border-orange-500/60" />

        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
              OWNER AUDIT PANEL
            </h2>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              STAFF LEDGER &amp; PAYROLL TRACKER
            </p>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="relative bg-[#0f1117] border border-red-500/20 rounded-xl p-3 text-center">
          <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Pending</p>
          <p className="text-red-400 font-mono font-bold text-sm">{money(totals.pending)}</p>
        </div>
        <div className="relative bg-[#0f1117] border border-orange-500/20 rounded-xl p-3 text-center">
          <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Deducted</p>
          <p className="text-orange-400 font-mono font-bold text-sm">{money(totals.deducted)}</p>
        </div>
        <div className="relative bg-[#0f1117] border border-emerald-500/20 rounded-xl p-3 text-center">
          <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Waived</p>
          <p className="text-emerald-400 font-mono font-bold text-sm">{money(totals.waived)}</p>
        </div>
      </div>

      {/* Staff Roster */}
      <div className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-400" />
            <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Staff On Roll
            </span>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2.5 py-1.5 rounded-lg active:scale-95 transition"
          >
            <Plus className="w-3 h-3" /> Log Deduction
          </button>
        </div>

        <div className="space-y-2">
          {staff?.map((s) => (
            <div
              key={s.user_id}
              className="flex items-center justify-between bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    s.active_shift ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                  }`}
                />
                <span className="text-xs font-medium text-white">{s.name}</span>
              </div>
              <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest border border-zinc-800 px-1.5 py-0.5 rounded">
                {s.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Ledger Filter Tabs */}
      <div className="flex bg-[#0f1117] p-1 rounded-2xl border border-zinc-800/80 shadow-lg">
        {(['all', 'pending', 'deducted', 'waived'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-xl font-mono text-[10px] font-bold tracking-wider uppercase transition ${
              filter === f
                ? 'bg-orange-500 text-zinc-950 shadow-md shadow-orange-500/20'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Ledger Entries */}
      <div className="space-y-3">
        {filteredLedgers.length === 0 ? (
          <div className="relative text-center py-10 bg-[#0f1117] rounded-3xl border border-zinc-800/80 p-6 shadow-xl">
            <CheckCircle2 className="w-9 h-9 text-orange-500 mx-auto mb-2 opacity-80" />
            <p className="text-white font-mono font-bold text-xs uppercase tracking-wider">
              No Entries
            </p>
            <p className="text-zinc-500 text-[11px] font-mono mt-1">
              Nothing logged for this filter yet
            </p>
          </div>
        ) : (
          filteredLedgers.map((l) => {
            const amount = l.shortage_amount + l.spoilage_cost;
            const staffName = staffMap.get(l.staff_id)?.name ?? 'Unknown Staff';
            return (
              <div
                key={l.ledger_id}
                className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3"
              >
                <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 border-t border-l border-zinc-700" />
                <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 border-t border-r border-zinc-700" />

                <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                  <div>
                    <p className="text-xs font-semibold text-white">{staffName}</p>
                    <p className="text-[10px] font-mono text-zinc-500">
                      {new Date(l.date).toLocaleDateString([], {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </p>
                  </div>
                  <span className="text-orange-400 font-mono font-bold text-sm">
                    {money(amount)}
                  </span>
                </div>

                <div className="flex items-start gap-2 text-xs text-zinc-300">
                  <AlertTriangle className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />
                  <p>{l.reason}</p>
                </div>

                {(l.shortage_amount > 0 || l.spoilage_cost > 0) && (
                  <div className="flex gap-2 font-mono text-[10px] text-zinc-500">
                    {l.shortage_amount > 0 && (
                      <span className="bg-zinc-900/60 border border-zinc-800/60 px-2 py-1 rounded-lg">
                        Shortage: {money(l.shortage_amount)}
                      </span>
                    )}
                    {l.spoilage_cost > 0 && (
                      <span className="bg-zinc-900/60 border border-zinc-800/60 px-2 py-1 rounded-lg">
                        Spoilage: {money(l.spoilage_cost)}
                      </span>
                    )}
                  </div>
                )}

                {l.payroll_deduction_status === 'pending' ? (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => updateStatus(l.ledger_id, 'waived')}
                      className="flex-1 py-2 bg-zinc-800 text-zinc-300 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider active:scale-95 transition"
                    >
                      Waive
                    </button>
                    <button
                      onClick={() => updateStatus(l.ledger_id, 'deducted')}
                      className="flex-1 py-2 bg-orange-500 text-zinc-950 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider shadow-lg shadow-orange-500/20 active:scale-95 transition"
                    >
                      Mark Deducted
                    </button>
                  </div>
                ) : (
                  <div
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider ${
                      l.payroll_deduction_status === 'deducted'
                        ? 'bg-orange-500/10 border border-orange-500/30 text-orange-400'
                        : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    }`}
                  >
                    {l.payroll_deduction_status === 'deducted' ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    {l.payroll_deduction_status === 'deducted' ? 'Deducted From Payroll' : 'Waived'}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Ledger Entry Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                Log Shortage / Spoilage
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Staff Member
                </label>
                <select
                  value={formStaffId}
                  onChange={(e) => setFormStaffId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select staff...</option>
                  {staff?.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                    Shortage (KES)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={formShortage}
                    onChange={(e) => setFormShortage(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                    Spoilage (KES)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={formSpoilage}
                    onChange={(e) => setFormSpoilage(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Reason
                </label>
                <textarea
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="e.g. Till short by KES 200 on closing count"
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono resize-none focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <button
              onClick={handleAddLedgerEntry}
              disabled={!formStaffId || !formReason.trim() || (!formShortage && !formSpoilage)}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition shadow-lg shadow-orange-500/20"
            >
              Save Entry
            </button>
          </div>
        </div>
      )}
    </div>
  );
};