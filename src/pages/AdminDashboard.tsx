import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { requestSync, deleteUserRemote } from '../db/sync';
import { useAuth } from '../context/AuthContext';
import { StockMenuManager } from './StockMenuManager';
import { Pagination } from '../components/Pagination';
import { usePagination } from '../components/usePagination';
import type { StaffLedger, User, UserRole } from '../types';
import {
  ClipboardList,
  Users,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  X,
  TrendingUp,
  Receipt,
  Wallet,
  Package,
  UserPlus,
  ShieldAlert,
  Trash2,
  Pencil,
  LayoutGrid,
} from 'lucide-react';

const money = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

type AdminTab = 'overview' | 'stock' | 'staff' | 'money';

export const AdminDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const staff = useLiveQuery(() => db.users.toArray(), []);
  const orders = useLiveQuery(() => db.orders.toArray(), []);
  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []);
  const ledgers = useLiveQuery(
    () => db.staffLedgers.orderBy('date').reverse().toArray(),
    []
  );

  const staffMap = new Map((staff ?? []).map((s) => [s.user_id, s]));

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // ---------------------------------------------------------------------
  // Sales overview — today's paid orders, items sold, payment split, risk
  // ---------------------------------------------------------------------
  const sales = useMemo(() => {
    const all = orders ?? [];
    const paidToday = all.filter((o) => o.payment_status === 'paid' && isToday(o.timestamp));

    const revenue = paidToday.reduce((sum, o) => sum + o.total_amount, 0);
    const orderCount = paidToday.length;
    const avgTicket = orderCount > 0 ? revenue / orderCount : 0;

    const paymentSplit: Record<string, number> = { cash: 0, mpesa: 0, credit: 0 };
    paidToday.forEach((o) => {
      if (o.payment_method) paymentSplit[o.payment_method] = (paymentSplit[o.payment_method] ?? 0) + o.total_amount;
    });

    const itemMap = new Map<string, { quantity: number; revenue: number }>();
    paidToday.forEach((o) => {
      o.items.forEach((it) => {
        const entry = itemMap.get(it.dish_name) ?? { quantity: 0, revenue: 0 };
        entry.quantity += it.quantity;
        entry.revenue += it.unit_price * it.quantity;
        itemMap.set(it.dish_name, entry);
      });
    });
    const itemsSold = Array.from(itemMap.entries())
      .map(([dish_name, v]) => ({ dish_name, ...v }))
      .sort((a, b) => b.quantity - a.quantity);

    const unsettled = all.filter((o) => o.payment_status === 'active');
    const unsettledValue = unsettled.reduce((sum, o) => sum + o.total_amount, 0);
    const credit = all.filter((o) => o.payment_status === 'credit');
    const creditValue = credit.reduce((sum, o) => sum + o.total_amount, 0);
    const loss = all.filter((o) => o.payment_status === 'unpaid_loss');
    const lossValue = loss.reduce((sum, o) => sum + o.total_amount, 0);

    return { revenue, orderCount, avgTicket, paymentSplit, itemsSold, unsettledValue, unsettledCount: unsettled.length, creditValue, lossValue };
  }, [orders]);

  const { page: itemsPage, setPage: setItemsPage, totalPages: itemsTotalPages, pageItems: pagedItemsSold } =
    usePagination(sales.itemsSold, 5);

  // ---------------------------------------------------------------------
  // Stock overview
  // ---------------------------------------------------------------------
  const stock = useMemo(() => {
    const list = ingredients ?? [];
    const lowStock = list.filter((i) => i.quantity_on_hand <= i.low_stock_threshold);
    const stockValue = list.reduce((sum, i) => sum + i.quantity_on_hand * i.last_purchase_cost, 0);
    return { list, lowStock, stockValue };
  }, [ingredients]);

  // ---------------------------------------------------------------------
  // Payroll — pending + already-deducted ledger entries reduce a staff
  // member's pay automatically; waived entries don't. This is a live
  // running total, not a period that gets "closed out" — deductions stay
  // reflected until an admin waives them or the underlying credit/waste
  // entry is resolved another way.
  // ---------------------------------------------------------------------
  const staffDeductions = useMemo(() => {
    const map = new Map<string, number>();
    (ledgers ?? []).forEach((l) => {
      if (l.payroll_deduction_status === 'waived') return;
      const amt = l.shortage_amount + l.spoilage_cost;
      map.set(l.staff_id, (map.get(l.staff_id) ?? 0) + amt);
    });
    return map;
  }, [ledgers]);

  // ---------------------------------------------------------------------
  // Staff management — create accounts, set PINs, toggle shift status
  // ---------------------------------------------------------------------
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('waiter');
  const [newPin, setNewPin] = useState('');
  const [newSalary, setNewSalary] = useState('');
  const [staffError, setStaffError] = useState('');

  const resetStaffForm = () => {
    setNewName('');
    setNewRole('waiter');
    setNewPin('');
    setNewSalary('');
    setStaffError('');
  };

  const handleCreateStaff = async () => {
    setStaffError('');
    if (!newName.trim()) {
      setStaffError('Enter a name.');
      return;
    }
    if (!/^\d{4}$/.test(newPin)) {
      setStaffError('PIN must be exactly 4 digits.');
      return;
    }
    const pinTaken = (staff ?? []).some((s) => s.pin_code === newPin);
    if (pinTaken) {
      setStaffError('That PIN is already in use — pick a different one.');
      return;
    }

    await db.users.add({
      user_id: crypto.randomUUID(),
      name: newName.trim(),
      role: newRole,
      pin_code: newPin,
      active_shift: true,
      basic_salary: parseFloat(newSalary) || 0,
    });
    requestSync();
    resetStaffForm();
    setShowStaffForm(false);
  };

  const toggleActiveShift = async (userId: string, current: boolean) => {
    await db.users.update(userId, { active_shift: !current });
    requestSync();
  };

  const [confirmDeleteStaff, setConfirmDeleteStaff] = useState<string | null>(null);

  const handleDeleteStaff = async (userId: string) => {
    const target = (staff ?? []).find((s) => s.user_id === userId);
    if (!target) return;

    if (currentUser?.user_id === userId) {
      setConfirmDeleteStaff(null);
      return; // guarded in the UI already, but double-check before any write
    }
    const adminCount = (staff ?? []).filter((s) => s.role === 'admin').length;
    if (target.role === 'admin' && adminCount <= 1) {
      setConfirmDeleteStaff(null);
      return; // must always keep at least one admin account
    }

    await db.users.delete(userId);
    deleteUserRemote(userId);
    setConfirmDeleteStaff(null);
  };

  // ---------------------------------------------------------------------
  // Edit staff — salary changes and PIN resets (e.g. after a suspected
  // internal breach) without recreating the whole account.
  // ---------------------------------------------------------------------
  const [editingStaff, setEditingStaff] = useState<User | null>(null);
  const [editSalary, setEditSalary] = useState('');
  const [editPin, setEditPin] = useState('');
  const [editError, setEditError] = useState('');

  const openEditStaff = (s: User) => {
    setEditingStaff(s);
    setEditSalary(String(s.basic_salary));
    setEditPin(s.pin_code);
    setEditError('');
  };

  const handleSaveStaffEdit = async () => {
    if (!editingStaff) return;
    setEditError('');
    if (!/^\d{4}$/.test(editPin)) {
      setEditError('PIN must be exactly 4 digits.');
      return;
    }
    const pinTaken = (staff ?? []).some(
      (s) => s.pin_code === editPin && s.user_id !== editingStaff.user_id
    );
    if (pinTaken) {
      setEditError('That PIN is already in use — pick a different one.');
      return;
    }

    await db.users.update(editingStaff.user_id, {
      pin_code: editPin,
      basic_salary: parseFloat(editSalary) || 0,
    });
    requestSync();
    setEditingStaff(null);
  };

  const { page: staffPage, setPage: setStaffPage, totalPages: staffTotalPages, pageItems: pagedStaff } =
    usePagination(staff ?? [], 5);

  // ---------------------------------------------------------------------
  // Payroll ledger (existing) — now a secondary section
  // ---------------------------------------------------------------------
  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [formStaffId, setFormStaffId] = useState('');
  const [formShortage, setFormShortage] = useState('');
  const [formSpoilage, setFormSpoilage] = useState('');
  const [formReason, setFormReason] = useState('');
  const [filter, setFilter] = useState<'all' | StaffLedger['payroll_deduction_status']>('all');

  const filteredLedgers = (ledgers ?? []).filter(
    (l) => filter === 'all' || l.payroll_deduction_status === filter
  );

  const {
    page: ledgerPage,
    setPage: setLedgerPage,
    totalPages: ledgerTotalPages,
    pageItems: pagedLedgers,
  } = usePagination(filteredLedgers, 4);

  const changeFilter = (f: typeof filter) => {
    setFilter(f);
    setLedgerPage(1);
  };

  const ledgerTotals = (ledgers ?? []).reduce(
    (acc, l) => {
      const amount = l.shortage_amount + l.spoilage_cost;
      if (l.payroll_deduction_status === 'pending') acc.pending += amount;
      if (l.payroll_deduction_status === 'deducted') acc.deducted += amount;
      if (l.payroll_deduction_status === 'waived') acc.waived += amount;
      return acc;
    },
    { pending: 0, deducted: 0, waived: 0 }
  );

  const resetLedgerForm = () => {
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
    requestSync();
    resetLedgerForm();
    setShowLedgerForm(false);
  };

  const updateLedgerStatus = async (
    ledgerId: string,
    status: StaffLedger['payroll_deduction_status']
  ) => {
    await db.staffLedgers.update(ledgerId, {
      payroll_deduction_status: status,
      synced: false,
    });
    requestSync();
  };

  // ---------------------------------------------------------------------
  // Credit / Tabs — bills a waiter settled as "credit" sit here until the
  // customer actually pays, or the owner writes the debt off as a loss.
  // ---------------------------------------------------------------------
  const creditOrders = (orders ?? [])
    .filter((o) => o.payment_status === 'credit')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const {
    page: creditPage,
    setPage: setCreditPage,
    totalPages: creditTotalPages,
    pageItems: pagedCredit,
  } = usePagination(creditOrders, 4);

  const handleCollectCredit = async (orderId: string, method: 'cash' | 'mpesa') => {
    await db.orders.update(orderId, {
      payment_status: 'paid',
      payment_method: method,
      synced: false,
    });
    requestSync();
  };

  const handleWriteOffCredit = async (orderId: string) => {
    await db.orders.update(orderId, {
      payment_status: 'unpaid_loss',
      synced: false,
    });
    requestSync();
  };

  const TABS: { id: AdminTab; label: string; icon: typeof TrendingUp; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'stock', label: 'Stock', icon: Package, badge: stock.lowStock.length },
    { id: 'staff', label: 'Staff', icon: Users },
    { id: 'money', label: 'Money', icon: Wallet, badge: creditOrders.length },
  ];

  return (
    <div className="space-y-5 max-w-md mx-auto pb-24">
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
              OWNER DASHBOARD
            </h2>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              SALES · STOCK · STAFF
            </p>
          </div>
        </div>
      </div>

      {/* ===================== OVERVIEW TAB ===================== */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <div className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
              <TrendingUp className="w-4 h-4 text-orange-400" />
              <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Today's Sales
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-2.5 text-center">
                <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Revenue</p>
                <p className="text-emerald-400 font-mono font-bold text-sm">{money(sales.revenue)}</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-2.5 text-center">
                <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Orders</p>
                <p className="text-white font-mono font-bold text-sm">{sales.orderCount}</p>
              </div>
              <div className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-2.5 text-center">
                <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Avg Ticket</p>
                <p className="text-white font-mono font-bold text-sm">{money(sales.avgTicket)}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 bg-zinc-900/40 border border-zinc-800/60 rounded-lg p-2 text-center">
                <p className="text-[9px] font-mono text-zinc-500 uppercase">Cash</p>
                <p className="text-xs font-mono font-bold text-zinc-200">{money(sales.paymentSplit.cash)}</p>
              </div>
              <div className="flex-1 bg-zinc-900/40 border border-zinc-800/60 rounded-lg p-2 text-center">
                <p className="text-[9px] font-mono text-zinc-500 uppercase">M-Pesa</p>
                <p className="text-xs font-mono font-bold text-zinc-200">{money(sales.paymentSplit.mpesa)}</p>
              </div>
              <div className="flex-1 bg-zinc-900/40 border border-zinc-800/60 rounded-lg p-2 text-center">
                <p className="text-[9px] font-mono text-zinc-500 uppercase">Credit</p>
                <p className="text-xs font-mono font-bold text-zinc-200">{money(sales.paymentSplit.credit)}</p>
              </div>
            </div>

            {(sales.unsettledCount > 0 || sales.creditValue > 0 || sales.lossValue > 0) && (
              <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/20 rounded-xl p-2.5">
                <ShieldAlert className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <div className="text-[10px] font-mono text-red-300 space-y-0.5">
                  {sales.unsettledCount > 0 && (
                    <p>{sales.unsettledCount} unsettled bill{sales.unsettledCount > 1 ? 's' : ''} — {money(sales.unsettledValue)} not yet collected</p>
                  )}
                  {sales.creditValue > 0 && <p>{money(sales.creditValue)} outstanding on credit</p>}
                  {sales.lossValue > 0 && <p>{money(sales.lossValue)} written off as unpaid loss</p>}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Receipt className="w-3.5 h-3.5 text-zinc-500" />
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Items Sold Today</span>
              </div>
              {sales.itemsSold.length === 0 ? (
                <p className="text-zinc-600 text-[11px] font-mono text-center py-4">No sales settled yet today</p>
              ) : (
                <div>
                  <div className="space-y-1.5">
                    {pagedItemsSold.map((it) => (
                      <div
                        key={it.dish_name}
                        className="flex items-center justify-between bg-zinc-900/40 px-2.5 py-1.5 rounded-lg border border-zinc-800/60"
                      >
                        <span className="text-xs text-zinc-200 truncate">{it.dish_name}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded">
                            x{it.quantity}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-500 w-14 text-right">{money(it.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Pagination page={itemsPage} totalPages={itemsTotalPages} onPageChange={setItemsPage} />
                </div>
              )}
            </div>
          </div>

          <div className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-orange-400" />
                <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Stock Monitor
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                Value: <span className="text-zinc-300 font-bold">{money(stock.stockValue)}</span>
              </span>
            </div>

            {stock.lowStock.length > 0 ? (
              <div className="flex items-center gap-2 bg-red-500/5 border border-red-500/20 rounded-xl p-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span className="text-[10px] font-mono text-red-300">
                  {stock.lowStock.length} ingredient{stock.lowStock.length > 1 ? 's' : ''} running low — see Stock tab
                </span>
              </div>
            ) : (
              <p className="text-zinc-600 text-[11px] font-mono text-center py-2">All stock levels healthy</p>
            )}
          </div>
        </div>
      )}

      {/* ===================== STOCK TAB ===================== */}
      {activeTab === 'stock' && <StockMenuManager />}

      {/* ===================== STAFF TAB ===================== */}
      {activeTab === 'staff' && (
        <div className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" />
              <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Staff & Payroll
              </span>
            </div>
            <button
              onClick={() => setShowStaffForm(true)}
              className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2.5 py-1.5 rounded-lg active:scale-95 transition"
            >
              <UserPlus className="w-3 h-3" /> Add Staff
            </button>
          </div>

          <div className="space-y-2">
            {pagedStaff.map((s) => {
              const adminCount = (staff ?? []).filter((x) => x.role === 'admin').length;
              const isSelf = currentUser?.user_id === s.user_id;
              const isLastAdmin = s.role === 'admin' && adminCount <= 1;
              const isConfirming = confirmDeleteStaff === s.user_id;
              const deductions = staffDeductions.get(s.user_id) ?? 0;
              const netPay = s.basic_salary - deductions;

              return (
                <div
                  key={s.user_id}
                  className="bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActiveShift(s.user_id, s.active_shift)}
                        title={s.active_shift ? 'On shift — tap to deactivate' : 'Inactive — tap to reactivate'}
                        className={`w-2 h-2 rounded-full transition ${
                          s.active_shift ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                        }`}
                      />
                      <span className="text-xs font-medium text-white">{s.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest border border-zinc-800 px-1.5 py-0.5 rounded">
                        {s.role}
                      </span>
                      <button
                        onClick={() => openEditStaff(s)}
                        title="Edit salary / PIN"
                        className="p-1 rounded-lg bg-zinc-800 hover:bg-orange-500/20 text-zinc-400 hover:text-orange-400"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {!isSelf && !isLastAdmin && (
                        <button
                          onClick={() => setConfirmDeleteStaff(s.user_id)}
                          title="Delete staff account"
                          className="p-1 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 pt-2 border-t border-zinc-800/60 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                      Net Pay
                    </span>
                    <div className="text-right">
                      <span className="font-mono font-bold text-sm text-emerald-400">{money(netPay)}</span>
                      {deductions > 0 && (
                        <p className="text-[9px] font-mono text-red-400">
                          {money(s.basic_salary)} - {money(deductions)} deductions
                        </p>
                      )}
                    </div>
                  </div>

                  {isConfirming && (
                    <div className="mt-2 pt-2 border-t border-zinc-800/60 flex gap-2">
                      <button
                        onClick={() => setConfirmDeleteStaff(null)}
                        className="flex-1 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg font-mono text-[10px] font-bold uppercase"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(s.user_id)}
                        className="flex-1 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg font-mono text-[10px] font-bold uppercase"
                      >
                        Confirm Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Pagination page={staffPage} totalPages={staffTotalPages} onPageChange={setStaffPage} />
        </div>
      )}

      {/* ===================== MONEY TAB ===================== */}
      {activeTab === 'money' && (
        <div className="space-y-5">
          <div className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-orange-400" />
                <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
                  Credit / Tabs
                </span>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                {creditOrders.length} open
              </span>
            </div>

            {creditOrders.length === 0 ? (
              <p className="text-zinc-600 text-[11px] font-mono text-center py-6">No open credit bills</p>
            ) : (
              <div>
                <div className="space-y-2.5">
                  {pagedCredit.map((o) => (
                    <div
                      key={o.order_id}
                      className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-white">
                            Ticket #{o.order_id.slice(0, 6)}
                          </p>
                          <p className="text-[10px] font-mono text-zinc-500">
                            {staffMap.get(o.placed_by_waiter_id)?.name ?? 'Unknown waiter'} ·{' '}
                            {new Date(o.timestamp).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                          </p>
                        </div>
                        <span className="text-orange-400 font-mono font-bold text-sm">{money(o.total_amount)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => handleCollectCredit(o.order_id, 'cash')}
                          className="py-1.5 bg-zinc-800 text-zinc-300 rounded-lg font-mono text-[9px] font-bold uppercase tracking-wider active:scale-95 transition"
                        >
                          Paid Cash
                        </button>
                        <button
                          onClick={() => handleCollectCredit(o.order_id, 'mpesa')}
                          className="py-1.5 bg-zinc-800 text-zinc-300 rounded-lg font-mono text-[9px] font-bold uppercase tracking-wider active:scale-95 transition"
                        >
                          Paid M-Pesa
                        </button>
                        <button
                          onClick={() => handleWriteOffCredit(o.order_id)}
                          className="py-1.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg font-mono text-[9px] font-bold uppercase tracking-wider active:scale-95 transition"
                        >
                          Write Off
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination page={creditPage} totalPages={creditTotalPages} onPageChange={setCreditPage} />
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-3.5 h-3.5 text-zinc-500" />
                <span className="font-mono text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                  Payroll Ledger
                </span>
              </div>
              <button
                onClick={() => setShowLedgerForm(true)}
                className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-lg active:scale-95 transition"
              >
                <Plus className="w-3 h-3" /> Log Deduction
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="relative bg-[#0f1117] border border-red-500/20 rounded-xl p-3 text-center">
                <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Pending</p>
                <p className="text-red-400 font-mono font-bold text-sm">{money(ledgerTotals.pending)}</p>
              </div>
              <div className="relative bg-[#0f1117] border border-orange-500/20 rounded-xl p-3 text-center">
                <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Deducted</p>
                <p className="text-orange-400 font-mono font-bold text-sm">{money(ledgerTotals.deducted)}</p>
              </div>
              <div className="relative bg-[#0f1117] border border-emerald-500/20 rounded-xl p-3 text-center">
                <p className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Waived</p>
                <p className="text-emerald-400 font-mono font-bold text-sm">{money(ledgerTotals.waived)}</p>
              </div>
            </div>

            <div className="flex bg-[#0f1117] p-1 rounded-2xl border border-zinc-800/80 shadow-lg mb-3">
              {(['all', 'pending', 'deducted', 'waived'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => changeFilter(f)}
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
                pagedLedgers.map((l) => {
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
                            onClick={() => updateLedgerStatus(l.ledger_id, 'waived')}
                            className="flex-1 py-2 bg-zinc-800 text-zinc-300 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider active:scale-95 transition"
                          >
                            Waive
                          </button>
                          <button
                            onClick={() => updateLedgerStatus(l.ledger_id, 'deducted')}
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
            <Pagination page={ledgerPage} totalPages={ledgerTotalPages} onPageChange={setLedgerPage} />
          </div>
        </div>
      )}

      {/* ===================== BOTTOM TAB BAR ===================== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0f1117]/95 backdrop-blur-md border-t border-zinc-800/80">
        <div className="max-w-md mx-auto grid grid-cols-4">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`relative flex flex-col items-center gap-1 py-2.5 transition ${
                  isActive ? 'text-orange-400' : 'text-zinc-500'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider">{t.label}</span>
                {!!t.badge && t.badge > 0 && (
                  <span className="absolute top-1 right-[28%] w-3.5 h-3.5 flex items-center justify-center text-[8px] font-mono font-bold bg-red-500 text-white rounded-full">
                    {t.badge > 9 ? '9+' : t.badge}
                  </span>
                )}
                {isActive && (
                  <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 bg-orange-400 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Add Staff Modal */}
      {showStaffForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                Add Staff Account
              </h3>
              <button
                onClick={() => {
                  setShowStaffForm(false);
                  resetStaffForm();
                }}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Full Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. James Mwangi"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Role
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['waiter', 'cook', 'admin'] as const).map((role) => (
                    <button
                      key={role}
                      onClick={() => setNewRole(role)}
                      className={`py-2 text-[10px] font-mono font-bold uppercase tracking-wider rounded-xl border transition ${
                        newRole === role
                          ? 'bg-orange-500 text-zinc-950 border-orange-400'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  4-Digit PIN
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="e.g. 4821"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono tracking-[0.5em] text-center focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Basic Salary (KES / month)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={newSalary}
                  onChange={(e) => setNewSalary(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              {staffError && (
                <p className="text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {staffError}
                </p>
              )}
            </div>

            <button
              onClick={handleCreateStaff}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition shadow-lg shadow-orange-500/20"
            >
              Create Account
            </button>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                Edit {editingStaff.name}
              </h3>
              <button
                onClick={() => setEditingStaff(null)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Basic Salary (KES / month)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={editSalary}
                  onChange={(e) => setEditSalary(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  4-Digit PIN
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={editPin}
                  onChange={(e) => setEditPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono tracking-[0.5em] text-center focus:outline-none focus:border-orange-500"
                />
                <p className="text-[9px] font-mono text-zinc-600 mt-1">
                  Reset this if the staff member's PIN may have been compromised.
                </p>
              </div>

              {editError && (
                <p className="text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {editError}
                </p>
              )}
            </div>

            <button
              onClick={handleSaveStaffEdit}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition shadow-lg shadow-orange-500/20"
            >
              Save Changes
            </button>
          </div>
        </div>
      )}

      {/* Add Ledger Entry Modal */}
      {showLedgerForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                Log Shortage / Spoilage
              </h3>
              <button
                onClick={() => {
                  setShowLedgerForm(false);
                  resetLedgerForm();
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