import React, { useState } from 'react';
import { WaiterPOS } from './WaiterPOS';
import { KitchenDisplay } from './KitchenDisplay';
import { ShoppingBag, ChefHat } from 'lucide-react';

// For staff who work both roles on the floor — a waiter on a quiet morning
// who also cooks, or a cook who takes orders when it's slow. This is purely
// a thin switcher: WaiterPOS and KitchenDisplay are used completely
// unmodified underneath, so nothing about how orders are placed, attributed,
// or confirmed changes for a hybrid worker versus a "pure" waiter or cook —
// they just have both screens one tap away instead of needing two logins.
export const HybridStaffView: React.FC = () => {
  const [view, setView] = useState<'waiter' | 'kitchen'>('waiter');

  return (
    <div className="space-y-4">
      <div className="flex bg-[#0f1117] p-1 rounded-2xl border border-zinc-800/80 shadow-lg max-w-md mx-auto">
        <button
          onClick={() => setView('waiter')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-mono text-[11px] font-bold tracking-wider uppercase transition ${
            view === 'waiter'
              ? 'bg-orange-500 text-zinc-950 shadow-md shadow-orange-500/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" /> Waiter
        </button>
        <button
          onClick={() => setView('kitchen')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl font-mono text-[11px] font-bold tracking-wider uppercase transition ${
            view === 'kitchen'
              ? 'bg-orange-500 text-zinc-950 shadow-md shadow-orange-500/20'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <ChefHat className="w-3.5 h-3.5" /> Kitchen
        </button>
      </div>

      {view === 'waiter' ? <WaiterPOS /> : <KitchenDisplay />}
    </div>
  );
};