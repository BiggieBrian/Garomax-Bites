import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { requestSync } from '../db/sync';
import { useAuth } from '../context/AuthContext';
import { Check, Flame, Package, AlertTriangle, X } from 'lucide-react';
import type { Ingredient, OrderItem, WasteReason } from '../types';

// A branch's view of a shared ingredient: identity fields from `Ingredient`
// joined with this branch's own quantity/cost/threshold from `IngredientStock`
// (see StockMenuManager.tsx for the same join).
type StockedIngredient = Ingredient & {
  quantity_on_hand: number;
  last_purchase_cost: number;
  low_stock_threshold: number;
};

const WASTE_REASONS: { value: WasteReason; label: string; target: 'dish' | 'ingredient' }[] = [
  { value: 'burnt_overcooked', label: 'Burnt / Overcooked', target: 'dish' },
  { value: 'spilled_dropped', label: 'Spilled / Dropped', target: 'dish' },
  { value: 'spoiled_raw', label: 'Spoiled Raw Stock', target: 'ingredient' },
];

export const KitchenDisplay: React.FC = () => {
  const { currentUser } = useAuth();

  const myBranchId = currentUser?.branch_id ?? null;

  // Live query the kitchen queue by prep status — independent of whether the
  // waiter has collected payment yet. A ticket can be "ready" and still unpaid.
  const allQueuedOrders = useLiveQuery(
    () => db.orders.where('kitchen_status').equals('queued').reverse().toArray(),
    []
  );
  const orders = allQueuedOrders?.filter((o) => o.branch_id === myBranchId);

  const ingredientDefs = useLiveQuery(() => db.ingredients.toArray(), []);
  const allIngredientStock = useLiveQuery(() => db.ingredientStock.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);

  const ingredients: StockedIngredient[] = useMemo(() => {
    const defMap = new Map((ingredientDefs ?? []).map((i) => [i.ingredient_id, i]));
    return (allIngredientStock ?? [])
      .filter((s) => s.branch_id === myBranchId)
      .map((s) => {
        const def = defMap.get(s.ingredient_id);
        if (!def) return null;
        return {
          ...def,
          quantity_on_hand: s.quantity_on_hand,
          last_purchase_cost: s.last_purchase_cost,
          low_stock_threshold: s.low_stock_threshold,
        };
      })
      .filter((i): i is StockedIngredient => i !== null);
  }, [ingredientDefs, allIngredientStock, myBranchId]);

  const dishes = Array.from(new Map((recipes ?? []).map((r) => [r.dish_name, r])).values());

  // ---------------------------------------------------------------------
  // Waste / spoilage logging — burnt or dropped plates and spoiled raw
  // stock. Optionally deducts the cost straight into the cook's payroll
  // ledger so the admin isn't typing shortages in by hand.
  // ---------------------------------------------------------------------
  const [showWasteForm, setShowWasteForm] = useState(false);
  const [wasteReason, setWasteReason] = useState<WasteReason>('burnt_overcooked');
  const [wasteTargetId, setWasteTargetId] = useState(''); // dish_name or ingredient_id
  const [wasteQty, setWasteQty] = useState('');
  const [deductFromPay, setDeductFromPay] = useState(false);
  const [wasteError, setWasteError] = useState('');

  const wasteTargetKind = WASTE_REASONS.find((r) => r.value === wasteReason)?.target ?? 'dish';

  const resetWasteForm = () => {
    setWasteReason('burnt_overcooked');
    setWasteTargetId('');
    setWasteQty('');
    setDeductFromPay(false);
    setWasteError('');
  };

  // Estimate the cost of one plate of a dish from its recipe's ingredient costs.
  const dishUnitCost = (dishName: string) =>
    (recipes ?? [])
      .filter((r) => r.dish_name === dishName)
      .reduce((sum, r) => {
        const ing = ingredients?.find((i) => i.ingredient_id === r.ingredient_id);
        return sum + r.quantity_per_plate * (ing?.last_purchase_cost ?? 0);
      }, 0);

  const handleLogWaste = async () => {
    setWasteError('');
    if (!currentUser || !myBranchId) return;
    const qty = parseFloat(wasteQty);
    if (!wasteTargetId) {
      setWasteError(wasteTargetKind === 'dish' ? 'Select a dish.' : 'Select an ingredient.');
      return;
    }
    if (!qty || qty <= 0) {
      setWasteError('Enter a quantity greater than 0.');
      return;
    }

    let name: string;
    let cost: number;

    if (wasteTargetKind === 'ingredient') {
      const ing = ingredients?.find((i) => i.ingredient_id === wasteTargetId);
      if (!ing) return;
      name = ing.name;
      cost = qty * ing.last_purchase_cost;
      // Raw stock spoiled before use — take it out of the shelf count now.
      await db.ingredientStock.update([myBranchId, ing.ingredient_id], {
        quantity_on_hand: Math.max(0, ing.quantity_on_hand - qty),
        synced: false,
      });
    } else {
      name = wasteTargetId; // dish_name
      cost = qty * dishUnitCost(wasteTargetId);
      // A burnt/dropped plate was already cooked from stock already deducted
      // when the ticket was marked prepared, so ingredient stock is untouched here.
    }

    await db.wasteLogs.add({
      waste_id: crypto.randomUUID(),
      branch_id: myBranchId,
      dish_or_ingredient: name,
      quantity: qty,
      reason: wasteReason,
      logged_by_cook_id: currentUser.user_id,
      deduction_flag: deductFromPay,
      timestamp: new Date().toISOString(),
      synced: false,
    });

    if (deductFromPay) {
      const reasonLabel = WASTE_REASONS.find((r) => r.value === wasteReason)?.label ?? wasteReason;
      await db.staffLedgers.add({
        ledger_id: crypto.randomUUID(),
        branch_id: myBranchId,
        staff_id: currentUser.user_id,
        date: new Date().toISOString(),
        shortage_amount: 0,
        spoilage_cost: cost,
        reason: `Waste: ${qty} x ${name} — ${reasonLabel}`,
        payroll_deduction_status: 'pending',
        synced: false,
      });
    }

    requestSync();
    resetWasteForm();
    setShowWasteForm(false);
  };

  // Handle Mark as Prepared & Deplete Ingredients
  const handleCompleteOrder = async (orderId: string, items: OrderItem[]) => {
    if (!recipes || !ingredients || !myBranchId) return;

    // 1. Deduct ingredients for every item in the ticket based on recipe mappings
    for (const item of items) {
      const matchingRecipes = recipes.filter((r) => r.dish_name === item.dish_name);

      for (const recipe of matchingRecipes) {
        // Calculate total amount needed for this order item
        const requiredAmount = recipe.quantity_per_plate * item.quantity;
        
        // Find matching ingredient by ingredient_id
        const ingredientItem = ingredients.find((ing) => ing.ingredient_id === recipe.ingredient_id);

        if (ingredientItem) {
          const newQty = Math.max(0, ingredientItem.quantity_on_hand - requiredAmount);
          await db.ingredientStock
            .where('[branch_id+ingredient_id]')
            .equals([myBranchId, ingredientItem.ingredient_id])
            .modify({
              quantity_on_hand: newQty,
              synced: false,
            });
        }
      }
    }

    // 2. Mark the ticket ready for pickup — payment status is untouched;
    // the waiter closes the bill independently, whenever the customer pays.
    await db.orders
      .where('order_id')
      .equals(orderId)
      .modify({
        kitchen_status: 'ready',
        confirmed_by_cook_id: currentUser?.user_id,
        synced: false,
      });
    requestSync();
  };

  return (
    <div className="space-y-6 max-w-md mx-auto pb-20">
      {/* Header Badge */}
      <div className="relative p-4 bg-[#0f1117] border border-zinc-800/80 rounded-2xl shadow-xl flex items-center justify-between">
        <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 border-t border-l border-orange-500/60" />
        <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 border-t border-r border-orange-500/60" />

        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center">
            <Flame className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h2 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
              KITCHEN DISPLAY TERMINAL
            </h2>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
              LIVE TICKETS & INGREDIENT DEPLETION
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="font-mono text-xs font-bold text-orange-400">
            {orders?.length || 0}
          </span>
          <span className="block text-[9px] font-mono text-zinc-500 uppercase">QUEUED</span>
        </div>
      </div>

      {/* Log Waste / Spoilage */}
      <button
        onClick={() => setShowWasteForm(true)}
        className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-mono font-bold uppercase tracking-wider rounded-xl text-xs transition flex items-center justify-center gap-1.5"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Log Waste / Spoilage
      </button>

      {/* Orders List */}
      <div className="space-y-4">
        {!orders || orders.length === 0 ? (
          <div className="relative text-center py-12 bg-[#0f1117] rounded-3xl border border-zinc-800/80 p-6 shadow-xl">
            <Flame className="w-10 h-10 text-zinc-700 mx-auto mb-2 opacity-50" />
            <p className="text-white font-mono font-bold text-xs uppercase tracking-wider">
              KITCHEN QUEUE CLEAR
            </p>
            <p className="text-zinc-500 text-[11px] font-mono mt-1">
              WAITING FOR NEW TICKETS FROM WAITERS
            </p>
          </div>
        ) : (
          orders.map((order) => (
            <div
              key={order.order_id}
              className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-4"
            >
              {/* Corner Accents */}
              <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 border-t border-l border-zinc-700" />
              <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 border-t border-r border-zinc-700" />

              {/* Ticket Top Meta */}
              <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  <span className="text-[11px] font-mono font-bold text-white tracking-wider uppercase">
                    TICKET #{order.order_id.slice(0, 6)}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-zinc-400">
                  {new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {order.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60"
                  >
                    <div>
                      <span className="font-medium text-sm text-white block">{item.dish_name}</span>
                      {item.selected_modifiers && item.selected_modifiers.length > 0 && (
                        <span className="text-[10px] font-mono text-zinc-400">
                          {item.selected_modifiers.join(', ')}
                        </span>
                      )}
                    </div>
                    <span className="font-mono font-bold text-xs bg-orange-500/10 border border-orange-500/30 text-orange-400 px-2 py-0.5 rounded-lg">
                      x{item.quantity}
                    </span>
                  </div>
                ))}
              </div>

              {/* Mark as Done & Deplete Action */}
              <button
                onClick={() => handleCompleteOrder(order.order_id, order.items)}
                className="w-full py-3 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
              >
                <Check className="w-4 h-4" /> MARK PREPARED & DEDUCT INGREDIENTS
              </button>
            </div>
          ))
        )}
      </div>

      {/* Low Stock Live Monitor */}
      <div className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center gap-2 border-b border-zinc-800/80 pb-2">
          <Package className="w-4 h-4 text-orange-400" />
          <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
            STOCK MONITOR
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1">
          {ingredients?.map((item) => {
            const isLow = item.quantity_on_hand <= item.low_stock_threshold;
            return (
              <div
                key={item.ingredient_id}
                className={`p-2 rounded-xl border font-mono text-xs flex justify-between items-center ${
                  isLow
                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-zinc-900/40 border-zinc-800/60 text-zinc-300'
                }`}
              >
                <span className="truncate max-w-[80px]">{item.name}</span>
                <span className="font-bold">
                  {item.quantity_on_hand} {item.unit}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Log Waste Modal */}
      {showWasteForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                Log Waste / Spoilage
              </h3>
              <button
                onClick={() => {
                  setShowWasteForm(false);
                  resetWasteForm();
                }}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Reason
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {WASTE_REASONS.map((r) => (
                    <button
                      key={r.value}
                      onClick={() => {
                        setWasteReason(r.value);
                        setWasteTargetId('');
                      }}
                      className={`py-2 text-[10px] font-mono font-bold uppercase tracking-wider rounded-xl border transition ${
                        wasteReason === r.value
                          ? 'bg-orange-500 text-zinc-950 border-orange-400'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  {wasteTargetKind === 'dish' ? 'Dish' : 'Ingredient'}
                </label>
                <select
                  value={wasteTargetId}
                  onChange={(e) => setWasteTargetId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                >
                  <option value="">Select...</option>
                  {wasteTargetKind === 'dish'
                    ? dishes.map((d) => (
                        <option key={d.dish_name} value={d.dish_name}>
                          {d.dish_name}
                        </option>
                      ))
                    : ingredients?.map((i) => (
                        <option key={i.ingredient_id} value={i.ingredient_id}>
                          {i.name} ({i.unit})
                        </option>
                      ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Quantity {wasteTargetKind === 'dish' ? '(plates)' : ''}
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={wasteQty}
                  onChange={(e) => setWasteQty(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <label className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={deductFromPay}
                  onChange={(e) => setDeductFromPay(e.target.checked)}
                  className="w-3.5 h-3.5 accent-orange-500"
                />
                Deduct cost from my payroll ledger
              </label>

              {wasteError && (
                <p className="text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {wasteError}
                </p>
              )}
            </div>

            <button
              onClick={handleLogWaste}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition shadow-lg shadow-orange-500/20"
            >
              Log Waste
            </button>
          </div>
        </div>
      )}
    </div>
  );
};