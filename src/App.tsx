import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { WaiterPOS } from './pages/WaiterPOS';
import { KitchenDisplay } from './pages/KitchenDisplay';
import { LogOut, UserCheck,} from 'lucide-react';

const DashboardSwitch: React.FC = () => {
  const { currentUser, logout } = useAuth();

  if (!currentUser) {
    return <Login />;
  }

  return (
    <div className="min-h-screen bg-[#090a0f] text-zinc-100 font-sans selection:bg-orange-500 selection:text-white">
      {/* PayRoller-Inspired Minimal Dark Header */}
      <header className="bg-[#0f1117]/90 backdrop-blur-md border-b border-zinc-800/80 px-4 py-3 sticky top-0 z-50">
        <div className="max-w-md mx-auto flex items-center justify-between">
          {/* Logo Brand */}
          <div className="flex items-center space-x-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-white text-base tracking-wider uppercase font-mono">
                  GAROMAX
                </span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20 uppercase tracking-widest">
                  {currentUser.role}
                </span>
              </div>
            </div>
          </div>

          {/* User Profile & Logout */}
          <div className="flex items-center gap-2">
            <div className="flex items-center text-xs text-zinc-300 font-mono bg-zinc-900/80 px-2.5 py-1.5 rounded-xl border border-zinc-800/80">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-2 animate-pulse" />
              <span className="truncate max-w-[100px] font-medium">{currentUser.name}</span>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white transition active:scale-95 border border-zinc-800"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-4 max-w-md mx-auto">
        {currentUser.role === 'waiter' && <WaiterPOS />}

        {currentUser.role === 'cook' && <KitchenDisplay/>}

        {currentUser.role === 'admin' && (
          <div className="relative p-8 bg-[#0f1117] border border-zinc-800/80 rounded-3xl text-center shadow-2xl">
            {/* PayRoller Corner Accents */}
            <div className="absolute top-2 left-2 w-2 h-2 border-t-2 border-l-2 border-orange-500/40" />
            <div className="absolute top-2 right-2 w-2 h-2 border-t-2 border-r-2 border-orange-500/40" />
            <div className="absolute bottom-2 left-2 w-2 h-2 border-b-2 border-l-2 border-orange-500/40" />
            <div className="absolute bottom-2 right-2 w-2 h-2 border-b-2 border-r-2 border-orange-500/40" />

            <h2 className="text-lg font-bold text-white tracking-wide">OWNER AUDIT PANEL</h2>
            <p className="text-zinc-500 text-xs mt-2 font-mono">STAFF LEDGER & PAYROLL TRACKER</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <DashboardSwitch />
    </AuthProvider>
  );
}