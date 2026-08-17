import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db } from '../db/kibandaDB';
import type { RecipeItem } from '../types';
import {
  AlertTriangle,
  ShieldAlert,
  Download,
  FileText,
  Receipt,
  Users as UsersIcon,
  Package,
  XCircle,
  Flag,
} from 'lucide-react';

const money = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

// Flag thresholds — these are starting points, not gospel. Tune them once
// you've seen a few weeks of real data and know what "normal" looks like
// for your branches.
const CREDIT_FLAG_THRESHOLD = 2000; // KES a single waiter puts on credit in one day
const CANCEL_RATE_FLAG = 0.2; // 20%+ of a waiter's day cancelled/credit is worth a look
const STOCK_VARIANCE_FLAG_PCT = 0.1; // 10%+ gap between physical count and system count

interface WaiterDaySummary {
  userId: string;
  name: string;
  ordersPlaced: number;
  paidRevenue: number;
  cash: number;
  mpesa: number;
  creditValue: number;
  creditCount: number;
  cancelledCount: number;
  cancelledValue: number;
  unpaidLossValue: number;
  flags: string[];
}

/**
 * Daily Reconciliation Report — the "did anything leak today" screen.
 *
 * Three things it checks, all from data the app already has:
 *  1. Per-waiter money flow (paid/cash/mpesa/credit/cancelled/unpaid-loss),
 *     with automatic flags for outlier patterns.
 *  2. The cancellation audit trail (who, why, how much) — cancellation is
 *     already admin-only at the data layer (see AdminDashboard.tsx), this
 *     just makes the trail visible instead of buried in the orders table.
 *  3. A stock variance check: expected ingredient usage (mirrors exactly
 *     what KitchenDisplay.tsx already deducted) vs. a physical count the
 *     admin types in while walking the shelf. A gap here means stock left
 *     the kitchen that the app never saw — the strongest signal for
 *     off-book sales, since it doesn't depend on any order existing at all.
 *
 * Physical counts are session-only (not persisted) for now — re-enter them
 * each time you reconcile. If you want history, add a `stock_counts` table
 * (ingredient_id, branch_id, date, physical_count) and swap the local
 * `physicalCounts` state for a Dexie-backed query.
 *
 * Exports both PDF (via jspdf + jspdf-autotable — the version to print or
 * hand to someone) and CSV (the version to open in a spreadsheet). Run
 * `npm install jspdf jspdf-autotable` before building.
 */
export const DailyReconciliationReport: React.FC<{ branchId: string | null }> = ({ branchId }) => {
  const [date, setDate] = useState(todayIso());

  const allOrders = useLiveQuery(() => db.orders.toArray(), []) ?? [];
  const allUsers = useLiveQuery(() => db.users.toArray(), []) ?? [];
  const allIngredients = useLiveQuery(() => db.ingredients.toArray(), []) ?? [];
  const allIngredientStock = useLiveQuery(() => db.ingredientStock.toArray(), []) ?? [];
  const allRecipes = useLiveQuery(() => db.recipes.toArray(), []) ?? [];

  const dayStart = new Date(date + 'T00:00:00').getTime();
  const dayEnd = dayStart + 86400000;

  const ordersToday = useMemo(
    () =>
      allOrders.filter(
        (o) =>
          o.branch_id === branchId &&
          new Date(o.timestamp).getTime() >= dayStart &&
          new Date(o.timestamp).getTime() < dayEnd
      ),
    [allOrders, branchId, dayStart, dayEnd]
  );

  const staff = useMemo(() => allUsers.filter((u) => u.branch_id === branchId), [allUsers, branchId]);
  const staffMap = useMemo(() => new Map(staff.map((s) => [s.user_id, s.name])), [staff]);

  const recipesByDish = useMemo(() => {
    const map = new Map<string, RecipeItem[]>();
    allRecipes.forEach((r) => {
      const arr = map.get(r.dish_name) ?? [];
      arr.push(r);
      map.set(r.dish_name, arr);
    });
    return map;
  }, [allRecipes]);

  // ---------------------------------------------------------------
  // Per-waiter summary for the selected day
  // ---------------------------------------------------------------
  const waiterSummaries: WaiterDaySummary[] = useMemo(() => {
    const map = new Map<string, WaiterDaySummary>();
    const get = (id: string): WaiterDaySummary => {
      let s = map.get(id);
      if (!s) {
        s = {
          userId: id,
          name: staffMap.get(id) ?? 'Unknown',
          ordersPlaced: 0,
          paidRevenue: 0,
          cash: 0,
          mpesa: 0,
          creditValue: 0,
          creditCount: 0,
          cancelledCount: 0,
          cancelledValue: 0,
          unpaidLossValue: 0,
          flags: [],
        };
        map.set(id, s);
      }
      return s;
    };

    ordersToday.forEach((o) => {
      const s = get(o.placed_by_waiter_id);
      s.ordersPlaced += 1;
      if (o.payment_status === 'paid') {
        s.paidRevenue += o.total_amount;
        if (o.payment_method === 'cash') s.cash += o.total_amount;
        if (o.payment_method === 'mpesa') s.mpesa += o.total_amount;
      } else if (o.payment_status === 'credit') {
        s.creditValue += o.total_amount;
        s.creditCount += 1;
      } else if (o.payment_status === 'cancelled') {
        s.cancelledCount += 1;
        s.cancelledValue += o.total_amount;
      } else if (o.payment_status === 'unpaid_loss') {
        s.unpaidLossValue += o.total_amount;
      }
    });

    map.forEach((s) => {
      if (s.creditValue > CREDIT_FLAG_THRESHOLD) {
        s.flags.push(`${money(s.creditValue)} on credit today`);
      }
      const badRate = s.ordersPlaced > 0 ? (s.cancelledCount + s.creditCount) / s.ordersPlaced : 0;
      if (s.ordersPlaced >= 5 && badRate > CANCEL_RATE_FLAG) {
        s.flags.push(`${Math.round(badRate * 100)}% of today's orders cancelled/credit`);
      }
      if (s.unpaidLossValue > 0) {
        s.flags.push(`${money(s.unpaidLossValue)} marked unpaid loss`);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.paidRevenue - a.paidRevenue);
  }, [ordersToday, staffMap]);

  // ---------------------------------------------------------------
  // Cancellations audit trail for the day
  // ---------------------------------------------------------------
  const cancellations = useMemo(
    () => ordersToday.filter((o) => o.payment_status === 'cancelled'),
    [ordersToday]
  );

  // ---------------------------------------------------------------
  // Open credit — not scoped to the selected day. A tab opened last week
  // and still unpaid is still today's risk.
  // ---------------------------------------------------------------
  const openCredit = useMemo(
    () =>
      allOrders
        .filter((o) => o.branch_id === branchId && o.payment_status === 'credit')
        .map((o) => ({
          ...o,
          daysOpen: Math.floor((Date.now() - new Date(o.timestamp).getTime()) / 86400000),
        }))
        .sort((a, b) => b.daysOpen - a.daysOpen),
    [allOrders, branchId]
  );

  // ---------------------------------------------------------------
  // Expected ingredient usage today, from recipes × orders the kitchen
  // actually marked ready — this mirrors exactly what KitchenDisplay.tsx
  // already deducted from stock, it isn't a separate estimate.
  // ---------------------------------------------------------------
  const readyOrdersToday = useMemo(() => ordersToday.filter((o) => o.kitchen_status === 'ready'), [ordersToday]);

  const expectedUsage = useMemo(() => {
    const map = new Map<string, number>(); // ingredient_id -> bags used
    readyOrdersToday.forEach((o) => {
      o.items.forEach((item) => {
        const lines = recipesByDish.get(item.dish_name) ?? [];
        lines.forEach((line) => {
          if (!line.servings_per_bag || line.servings_per_bag <= 0) return;
          const bags = item.quantity / line.servings_per_bag;
          map.set(line.ingredient_id, (map.get(line.ingredient_id) ?? 0) + bags);
        });
      });
    });
    return map;
  }, [readyOrdersToday, recipesByDish]);

  const ingredientMap = useMemo(() => new Map(allIngredients.map((i) => [i.ingredient_id, i])), [allIngredients]);
  const stockRows = useMemo(
    () => allIngredientStock.filter((s) => s.branch_id === branchId && expectedUsage.has(s.ingredient_id)),
    [allIngredientStock, branchId, expectedUsage]
  );

  // Physical counts entered live while walking the shelf — see the
  // persistence note in the file header.
  const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});

  const stockVariances = useMemo(
    () =>
      stockRows.map((s) => {
        const name = ingredientMap.get(s.ingredient_id)?.name ?? s.ingredient_id;
        const usedToday = expectedUsage.get(s.ingredient_id) ?? 0;
        const physicalRaw = physicalCounts[s.ingredient_id];
        const physical = physicalRaw !== undefined && physicalRaw !== '' ? parseFloat(physicalRaw) : null;
        const variance = physical !== null ? physical - s.quantity_on_hand : null;
        const variancePct =
          physical !== null && s.quantity_on_hand > 0 ? Math.abs(variance as number) / s.quantity_on_hand : 0;
        return {
          ingredient_id: s.ingredient_id,
          name,
          usedToday,
          systemOnHand: s.quantity_on_hand,
          physical,
          variance,
          flagged: physical !== null && variancePct > STOCK_VARIANCE_FLAG_PCT,
        };
      }),
    [stockRows, ingredientMap, expectedUsage, physicalCounts]
  );

  const totalFlags =
    waiterSummaries.reduce((n, s) => n + s.flags.length, 0) + stockVariances.filter((v) => v.flagged).length;

  // ---------------------------------------------------------------
  // CSV export — one file covering everything on this screen for the
  // selected day, so the owner can keep an offline trail or forward it.
  // ---------------------------------------------------------------
  const handleExportCsv = () => {
    const lines: string[] = [];
    lines.push(`Daily Reconciliation Report,${date}`);
    lines.push('');
    lines.push('WAITER SUMMARY');
    lines.push(
      'Name,Orders,Paid Revenue,Cash,M-Pesa,Credit Value,Credit Count,Cancelled Count,Cancelled Value,Unpaid Loss,Flags'
    );
    waiterSummaries.forEach((s) => {
      lines.push(
        [
          s.name,
          s.ordersPlaced,
          s.paidRevenue,
          s.cash,
          s.mpesa,
          s.creditValue,
          s.creditCount,
          s.cancelledCount,
          s.cancelledValue,
          s.unpaidLossValue,
          `"${s.flags.join('; ')}"`,
        ].join(',')
      );
    });
    lines.push('');
    lines.push('CANCELLATIONS TODAY');
    lines.push('Time,Waiter,Cancelled By,Reason,Amount');
    cancellations.forEach((o) => {
      lines.push(
        [
          new Date(o.timestamp).toLocaleTimeString(),
          staffMap.get(o.placed_by_waiter_id) ?? o.placed_by_waiter_id,
          staffMap.get(o.cancelled_by_admin_id ?? '') ?? o.cancelled_by_admin_id ?? '',
          `"${(o.cancel_reason ?? '').replace(/"/g, '""')}"`,
          o.total_amount,
        ].join(',')
      );
    });
    lines.push('');
    lines.push('OPEN CREDIT (ALL TIME, NOT JUST THIS DAY)');
    lines.push('Waiter,Placed,Days Open,Amount');
    openCredit.forEach((o) => {
      lines.push(
        [
          staffMap.get(o.placed_by_waiter_id) ?? o.placed_by_waiter_id,
          new Date(o.timestamp).toLocaleDateString(),
          o.daysOpen,
          o.total_amount,
        ].join(',')
      );
    });
    lines.push('');
    lines.push('STOCK VARIANCE (physical count entered this session vs system)');
    lines.push('Ingredient,Used Today (bags),System On Hand,Physical Count,Variance');
    stockVariances.forEach((v) => {
      lines.push(
        [
          v.name,
          v.usedToday.toFixed(2),
          v.systemOnHand.toFixed(2),
          v.physical ?? '',
          v.variance !== null ? v.variance.toFixed(2) : '',
        ].join(',')
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reconciliation-${branchId ?? 'branch'}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ---------------------------------------------------------------
  // PDF export — the version you actually hand to someone or print.
  // Same four sections as the CSV, laid out as tables.
  // ---------------------------------------------------------------
  const handleExportPdf = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let cursorY = 14;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Daily Reconciliation Report', 14, cursorY);
    cursorY += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${date}`, 14, cursorY);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - 14, cursorY, { align: 'right' });
    cursorY += 6;
    if (totalFlags > 0) {
      doc.setTextColor(200, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.text(`${totalFlags} flag${totalFlags === 1 ? '' : 's'} raised — see highlighted rows below`, 14, cursorY);
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
      cursorY += 6;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Per-Waiter Summary', 14, cursorY + 4);
    autoTable(doc, {
      startY: cursorY + 7,
      head: [['Waiter', 'Orders', 'Paid Revenue', 'Cash', 'M-Pesa', 'Credit', 'Cancelled', 'Unpaid Loss', 'Flags']],
      body: waiterSummaries.map((s) => [
        s.name,
        String(s.ordersPlaced),
        money(s.paidRevenue),
        money(s.cash),
        money(s.mpesa),
        money(s.creditValue),
        String(s.cancelledCount),
        money(s.unpaidLossValue),
        s.flags.join('; ') || '—',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [249, 115, 22] },
      didParseCell: (data) => {
        const row = waiterSummaries[data.row.index];
        if (data.section === 'body' && row && row.flags.length > 0) {
          data.cell.styles.fillColor = [254, 226, 226];
        }
      },
    });
    // @ts-expect-error — jspdf-autotable augments doc with lastAutoTable at runtime
    cursorY = doc.lastAutoTable.finalY + 10;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Cancellations (${cancellations.length})`, 14, cursorY);
    autoTable(doc, {
      startY: cursorY + 3,
      head: [['Time', 'Waiter', 'Cancelled By', 'Reason', 'Amount']],
      body:
        cancellations.length > 0
          ? cancellations.map((o) => [
              new Date(o.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              staffMap.get(o.placed_by_waiter_id) ?? 'Unknown',
              staffMap.get(o.cancelled_by_admin_id ?? '') ?? '—',
              o.cancel_reason ?? 'No reason recorded',
              money(o.total_amount),
            ])
          : [['—', '—', '—', 'No cancellations this day', '—']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [249, 115, 22] },
    });
    // @ts-expect-error — jspdf-autotable augments doc with lastAutoTable at runtime
    cursorY = doc.lastAutoTable.finalY + 10;

    if (cursorY > 250) {
      doc.addPage();
      cursorY = 14;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Open Credit — All Time (${openCredit.length})`, 14, cursorY);
    autoTable(doc, {
      startY: cursorY + 3,
      head: [['Waiter', 'Placed', 'Days Open', 'Amount']],
      body:
        openCredit.length > 0
          ? openCredit.map((o) => [
              staffMap.get(o.placed_by_waiter_id) ?? 'Unknown',
              new Date(o.timestamp).toLocaleDateString(),
              String(o.daysOpen),
              money(o.total_amount),
            ])
          : [['—', '—', '—', 'No open credit balances']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [249, 115, 22] },
      didParseCell: (data) => {
        const row = openCredit[data.row.index];
        if (data.section === 'body' && row && row.daysOpen > 3) {
          data.cell.styles.fillColor = [254, 226, 226];
        }
      },
    });
    // @ts-expect-error — jspdf-autotable augments doc with lastAutoTable at runtime
    cursorY = doc.lastAutoTable.finalY + 10;

    if (cursorY > 250) {
      doc.addPage();
      cursorY = 14;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Stock Variance Check', 14, cursorY);
    autoTable(doc, {
      startY: cursorY + 3,
      head: [['Ingredient', 'Used Today (bags)', 'System On Hand', 'Physical Count', 'Variance']],
      body:
        stockVariances.length > 0
          ? stockVariances.map((v) => [
              v.name,
              v.usedToday.toFixed(1),
              v.systemOnHand.toFixed(1),
              v.physical !== null ? v.physical.toFixed(1) : 'not entered',
              v.variance !== null ? v.variance.toFixed(1) : '—',
            ])
          : [['—', '—', '—', '—', 'No tracked ingredients used this day']],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [249, 115, 22] },
      didParseCell: (data) => {
        const row = stockVariances[data.row.index];
        if (data.section === 'body' && row && row.flagged) {
          data.cell.styles.fillColor = [254, 226, 226];
        }
      },
    });

    doc.save(`reconciliation-${branchId ?? 'branch'}-${date}.pdf`);
  };

  return (
    <div className="space-y-5">
      {/* Header + date + export */}
      <div className="relative p-4 bg-[#0f1117] border border-zinc-800/80 rounded-2xl shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-orange-400" />
            <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">Daily Reconciliation</h3>
          </div>
          {totalFlags > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-1 rounded-lg">
              <Flag className="w-3 h-3" /> {totalFlags} flag{totalFlags === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
          />
          <button
            onClick={handleExportPdf}
            className="flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-400 text-zinc-950 font-mono font-bold uppercase tracking-wider text-[10px] rounded-xl transition active:scale-95"
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-mono font-bold uppercase tracking-wider text-[10px] rounded-xl transition active:scale-95"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Per-waiter summary */}
      <div className="bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
          <UsersIcon className="w-4 h-4 text-orange-400" />
          <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Per-Waiter Summary
          </span>
        </div>
        {waiterSummaries.length === 0 ? (
          <p className="text-[11px] font-mono text-zinc-500 text-center py-4">No orders placed this day.</p>
        ) : (
          <div className="space-y-2">
            {waiterSummaries.map((s) => (
              <div
                key={s.userId}
                className={`p-3 rounded-xl border ${
                  s.flags.length > 0 ? 'bg-red-500/5 border-red-500/30' : 'bg-zinc-900/50 border-zinc-800/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-xs font-bold text-white">{s.name}</span>
                  <span className="font-mono text-xs font-bold text-orange-400">{money(s.paidRevenue)}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono text-zinc-400">
                  <span>Orders: {s.ordersPlaced}</span>
                  <span>Cash: {money(s.cash)}</span>
                  <span>M-Pesa: {money(s.mpesa)}</span>
                  <span>Credit: {money(s.creditValue)}</span>
                  <span>Cancelled: {s.cancelledCount}</span>
                  <span>Loss: {money(s.unpaidLossValue)}</span>
                </div>
                {s.flags.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {s.flags.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono text-red-400">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" /> {f}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cancellations audit trail */}
      <div className="bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
          <XCircle className="w-4 h-4 text-orange-400" />
          <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Cancellations ({cancellations.length})
          </span>
        </div>
        {cancellations.length === 0 ? (
          <p className="text-[11px] font-mono text-zinc-500 text-center py-4">No cancellations this day.</p>
        ) : (
          <div className="space-y-2">
            {cancellations.map((o) => (
              <div
                key={o.order_id}
                className="p-2.5 rounded-xl bg-zinc-900/50 border border-zinc-800/60 text-[10px] font-mono text-zinc-300 space-y-0.5"
              >
                <div className="flex justify-between">
                  <span>{staffMap.get(o.placed_by_waiter_id) ?? 'Unknown'}</span>
                  <span className="text-orange-400 font-bold">{money(o.total_amount)}</span>
                </div>
                <div className="text-zinc-500">
                  Cancelled by {staffMap.get(o.cancelled_by_admin_id ?? '') ?? '—'} ·{' '}
                  {new Date(o.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                {o.cancel_reason ? (
                  <div className="text-zinc-400">"{o.cancel_reason}"</div>
                ) : (
                  <div className="text-red-400">No reason recorded</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open credit */}
      <div className="bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
          <Receipt className="w-4 h-4 text-orange-400" />
          <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Open Credit — All Time ({openCredit.length})
          </span>
        </div>
        {openCredit.length === 0 ? (
          <p className="text-[11px] font-mono text-zinc-500 text-center py-4">No open credit balances.</p>
        ) : (
          <div className="space-y-2">
            {openCredit.map((o) => (
              <div
                key={o.order_id}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-[10px] font-mono ${
                  o.daysOpen > 3
                    ? 'bg-red-500/5 border-red-500/30 text-red-400'
                    : 'bg-zinc-900/50 border-zinc-800/60 text-zinc-300'
                }`}
              >
                <span>
                  {staffMap.get(o.placed_by_waiter_id) ?? 'Unknown'} · {o.daysOpen}d open
                </span>
                <span className="font-bold">{money(o.total_amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stock variance */}
      <div className="bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
          <Package className="w-4 h-4 text-orange-400" />
          <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
            Stock Variance Check
          </span>
        </div>
        <p className="text-[9px] font-mono text-zinc-600">
          Walk the shelf and type in what's physically there for anything used today. The system value already
          reflects every order the kitchen marked prepared — a gap here means stock left the kitchen that the app
          never saw.
        </p>
        {stockVariances.length === 0 ? (
          <p className="text-[11px] font-mono text-zinc-500 text-center py-4">No tracked ingredients used this day.</p>
        ) : (
          <div className="space-y-2">
            {stockVariances.map((v) => (
              <div
                key={v.ingredient_id}
                className={`p-2.5 rounded-xl border ${
                  v.flagged ? 'bg-red-500/5 border-red-500/30' : 'bg-zinc-900/50 border-zinc-800/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-white">{v.name}</span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    Used today: {v.usedToday.toFixed(1)} · System: {v.systemOnHand.toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Physical count"
                    value={physicalCounts[v.ingredient_id] ?? ''}
                    onChange={(e) => setPhysicalCounts((prev) => ({ ...prev, [v.ingredient_id]: e.target.value }))}
                    className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-[11px] text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                  {v.variance !== null && (
                    <span
                      className={`text-[10px] font-mono font-bold ${v.flagged ? 'text-red-400' : 'text-zinc-400'}`}
                    >
                      {v.variance > 0 ? '+' : ''}
                      {v.variance.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};