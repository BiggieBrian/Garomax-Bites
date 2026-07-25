import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { Check, Flame, Package } from 'lucide-react';
import type { OrderItem } from '../types';

export const KitchenDisplay: React.FC = () => {
  // Live query active orders waiting in the kitchen queue
  const orders = useLiveQuery(
    () => db.orders.where('payment_status').equals('active').reverse().toArray(),
    []
  );

  const ingredients = useLiveQuery(() => db.ingredients.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);

  // Handle Mark as Prepared & Deplete Ingredients
  const handleCompleteOrder = async (orderId: string, items: OrderItem[]) => {
    if (!recipes || !ingredients) return;

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
          await db.ingredients
            .where('ingredient_id')
            .equals(ingredientItem.ingredient_id)
            .modify({
              quantity_on_hand: newQty,
              synced: false,
            });
        }
      }
    }

    // 2. Clear ticket from active kitchen queue
    await db.orders
      .where('order_id')
      .equals(orderId)
      .modify({
        payment_status: 'paid', // or your target status once cooked
        synced: false,
      });
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
    </div>
  );
};