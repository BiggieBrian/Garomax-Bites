import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { useAuth } from '../context/AuthContext';
import type { OrderItem, PaymentMethod } from '../types';
import { Plus, Minus, Send, Clock, CheckCircle, ShoppingBag, CreditCard, DollarSign } from 'lucide-react';

export const WaiterPOS: React.FC = () => {
  const { currentUser } = useAuth();
  
  // Navigation tab for mobile view
  const [activeTab, setActiveTab] = useState<'menu' | 'pending'>('menu');

  // Live queries from Dexie DB
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const activeOrders = useLiveQuery(() => 
    db.orders.where('payment_status').equals('active').reverse().toArray(), []
  );

  // Get unique list of dishes from recipe mappings
  const dishes = Array.from(
    new Map(recipes?.map((r) => [r.dish_name, r])).values()
  );

  // Cart state
  const [cart, setCart] = useState<OrderItem[]>([]);

  // Settlement modal state for pending orders
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [mpesaCode, setMpesaCode] = useState('');

  // Add dish to cart
  const addToCart = (dishName: string, price: number) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.dish_name === dishName);
      if (existing) {
        return prev.map((item) =>
          item.dish_name === dishName
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { dish_name: dishName, quantity: 1, unit_price: price }];
    });
  };

  // Adjust item quantity
  const updateQuantity = (dishName: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.dish_name === dishName) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as OrderItem[]
    );
  };

  const totalAmount = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

  // Send Order to Kitchen (Strictly Active/Unpaid)
  const handleSendToKitchen = async () => {
    if (cart.length === 0 || !currentUser) return;

    const newOrder = {
      order_id: crypto.randomUUID(),
      payment_status: 'active' as const,
      items: cart,
      total_amount: totalAmount,
      placed_by_waiter_id: currentUser.user_id,
      timestamp: new Date().toISOString(),
      synced: false,
    };

    await db.orders.add(newOrder);

    // Reset cart state after sending ticket
    setCart([]);
  };

  // Settle Payment after the customer finishes eating
  const handleConfirmSettlement = async (orderId: string) => {
    await db.orders.update(orderId, {
      payment_status: 'paid',
      payment_method: paymentMethod,
      mpesa_code: paymentMethod === 'mpesa' ? mpesaCode : undefined,
      synced: false,
    });

    setSelectedOrderForPayment(null);
    setMpesaCode('');
    setPaymentMethod('cash');
  };

  return (
    <div className="pb-20 max-w-md mx-auto">
      {/* PayRoller-Style Segmented Navigation Switcher */}
      <div className="flex bg-[#0f1117] p-1 rounded-2xl border border-zinc-800/80 mb-5 shadow-lg">
        <button
          onClick={() => setActiveTab('menu')}
          className={`flex-1 py-2.5 rounded-xl font-mono text-[11px] font-bold tracking-wider uppercase transition flex items-center justify-center gap-2 ${
            activeTab === 'menu'
              ? 'bg-orange-500 text-zinc-950 shadow-md shadow-orange-500/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" /> TAKE ORDER
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-2.5 rounded-xl font-mono text-[11px] font-bold tracking-wider uppercase transition flex items-center justify-center gap-2 ${
            activeTab === 'pending'
              ? 'bg-orange-500 text-zinc-950 shadow-md shadow-orange-500/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" /> PENDING BILLS
          {activeOrders && activeOrders.length > 0 && (
            <span className="ml-1 bg-zinc-900 text-orange-400 border border-orange-500/30 font-mono text-[10px] px-1.5 py-0.2 rounded-full">
              {activeOrders.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: MENU & ORDER ENTRY */}
      {activeTab === 'menu' && (
        <div className="space-y-4">
          {/* Menu Grid */}
          <div className="grid grid-cols-2 gap-3">
            {dishes.map((dish) => (
              <button
                key={dish.dish_name}
                onClick={() => addToCart(dish.dish_name, dish.selling_price)}
                className="group relative p-4 bg-[#0f1117] border border-zinc-800/80 hover:border-orange-500/50 rounded-2xl text-left transition-all active:scale-[0.98] shadow-md flex flex-col justify-between h-28 overflow-hidden"
              >
                {/* PayRoller Corner Accent */}
                <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 border-t border-l border-zinc-700 group-hover:border-orange-500 transition-colors" />
                <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 border-t border-r border-zinc-700 group-hover:border-orange-500 transition-colors" />

                <span className="font-semibold text-white text-sm tracking-tight line-clamp-2 mt-1">
                  {dish.dish_name}
                </span>
                <div className="flex justify-between items-end">
                  <span className="text-orange-400 font-mono font-bold text-xs tracking-wider">
                    KES {dish.selling_price}
                  </span>
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    ADD +
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Cart Tray (Appears when items are selected) */}
          {cart.length > 0 && (
            <div className="relative mt-6 bg-[#0f1117] border border-zinc-800/80 rounded-3xl p-4 shadow-2xl space-y-3">
              {/* PayRoller Corner Accents */}
              <div className="absolute top-2 left-2 w-2 h-2 border-t-2 border-l-2 border-orange-500/40" />
              <div className="absolute top-2 right-2 w-2 h-2 border-t-2 border-r-2 border-orange-500/40" />

              <div className="flex justify-between items-center pb-2 border-b border-zinc-800/80">
                <span className="font-mono text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  ORDER SUMMARY
                </span>
                <button
                  onClick={() => setCart([])}
                  className="text-zinc-500 hover:text-red-400 font-mono text-[10px] uppercase tracking-wider"
                >
                  CLEAR
                </button>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div
                    key={item.dish_name}
                    className="flex items-center justify-between bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800/60"
                  >
                    <div>
                      <p className="font-medium text-white text-xs">{item.dish_name}</p>
                      <p className="text-[10px] text-zinc-400 font-mono">
                        KES {item.unit_price * item.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.dish_name, -1)}
                        className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-mono font-bold text-orange-400 text-xs w-4 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => addToCart(item.dish_name, item.unit_price)}
                        className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-zinc-800/80 flex justify-between items-center">
                <span className="text-zinc-400 font-mono text-xs uppercase tracking-wider">
                  TOTAL AMOUNT
                </span>
                <span className="text-orange-400 font-mono font-bold text-base tracking-wider">
                  KES {totalAmount}
                </span>
              </div>

              {/* Action Button */}
              <button
                onClick={handleSendToKitchen}
                className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-orange-500/20"
              >
                <Send className="w-4 h-4" /> SEND TICKET TO KITCHEN
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PENDING UNPAID BILLS */}
      {activeTab === 'pending' && (
        <div className="space-y-3">
          {!activeOrders || activeOrders.length === 0 ? (
            <div className="relative text-center py-12 bg-[#0f1117] rounded-3xl border border-zinc-800/80 p-6 shadow-xl">
              <CheckCircle className="w-10 h-10 text-orange-500 mx-auto mb-2 opacity-80" />
              <p className="text-white font-mono font-bold text-xs uppercase tracking-wider">
                ALL TABLES CLEARED
              </p>
              <p className="text-zinc-500 text-[11px] font-mono mt-1">NO ACTIVE UNPAID MEALS LOGGED</p>
            </div>
          ) : (
            activeOrders.map((order) => {
              const isSelected = selectedOrderForPayment === order.order_id;

              return (
                <div
                  key={order.order_id}
                  className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3"
                >
                  {/* PayRoller Corner Accents */}
                  <div className="absolute top-1.5 left-1.5 w-1.5 h-1.5 border-t border-l border-zinc-700" />
                  <div className="absolute top-1.5 right-1.5 w-1.5 h-1.5 border-t border-r border-zinc-700" />

                  <div className="flex justify-between items-center border-b border-zinc-800/80 pb-2">
                    <span className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest">
                      TIME: {new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-orange-400 font-bold font-mono text-sm tracking-wider">
                      KES {order.total_amount}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-300 space-y-1 font-sans">
                    {order.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span className="font-medium text-zinc-200">
                          {it.quantity}x {it.dish_name}
                        </span>
                        <span className="text-zinc-500 font-mono text-xs">
                          KES {it.unit_price * it.quantity}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Settle Payment Drawer */}
                  {isSelected ? (
                    <div className="pt-3 border-t border-zinc-800/80 space-y-3 bg-zinc-900/80 p-3 rounded-xl">
                      <p className="text-[11px] font-mono font-bold text-zinc-300 uppercase tracking-wider">
                        SELECT PAYMENT METHOD:
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setPaymentMethod('cash')}
                          className={`py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-xl border transition ${
                            paymentMethod === 'cash'
                              ? 'bg-orange-500 text-zinc-950 border-orange-400'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          CASH
                        </button>
                        <button
                          onClick={() => setPaymentMethod('mpesa')}
                          className={`py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-xl border transition ${
                            paymentMethod === 'mpesa'
                              ? 'bg-orange-500 text-zinc-950 border-orange-400'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          M-PESA
                        </button>
                      </div>

                      {paymentMethod === 'mpesa' && (
                        <input
                          type="text"
                          placeholder="M-PESA TRANSACTION CODE"
                          value={mpesaCode}
                          onChange={(e) => setMpesaCode(e.target.value.toUpperCase())}
                          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white uppercase font-mono tracking-wider focus:outline-none focus:border-orange-500"
                        />
                      )}

                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setSelectedOrderForPayment(null)}
                          className="flex-1 py-2 bg-zinc-800 text-zinc-400 rounded-xl font-mono text-[11px] font-bold uppercase tracking-wider"
                        >
                          CANCEL
                        </button>
                        <button
                          onClick={() => handleConfirmSettlement(order.order_id)}
                          className="flex-1 py-2 bg-orange-500 text-zinc-950 rounded-xl font-mono text-[11px] font-bold uppercase tracking-wider shadow-lg shadow-orange-500/20"
                        >
                          CONFIRM PAID
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setSelectedOrderForPayment(order.order_id)}
                      className="w-full py-2.5 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 text-orange-400 font-mono font-bold uppercase tracking-wider rounded-xl text-xs transition"
                    >
                      COLLECT PAYMENT & CLOSE BILL
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};