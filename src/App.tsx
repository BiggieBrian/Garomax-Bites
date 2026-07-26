import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { WaiterPOS } from './pages/WaiterPOS';
import { KitchenDisplay } from './pages/KitchenDisplay';
import { AdminDashboard } from './pages/AdminDashboard';
import { LogOut, Cloud, CloudOff, RefreshCw, AlertTriangle } from 'lucide-react';
import { useSyncStatus } from './hooks/useSyncStatus';

const SyncBadge: React.FC = () => {
  const { status, configured } = useSyncStatus();

  if (!configured) {
    return (
      <div
        title="Supabase not configured — running local-only, this device won't see other terminals"
        className="flex items-center gap-1 text-zinc-500 bg-zinc-900/80 px-2 py-1.5 rounded-lg border border-zinc-800/80"
      >
        <CloudOff className="w-3.5 h-3.5" />
      </div>
    );
  }

  const config = {
    offline: { icon: CloudOff, color: 'text-zinc-500', label: 'Offline — changes saved locally' },
    syncing: { icon: RefreshCw, color: 'text-orange-400 animate-spin', label: 'Syncing…' },
    synced: { icon: Cloud, color: 'text-emerald-400', label: 'Synced' },
    error: { icon: AlertTriangle, color: 'text-red-400', label: 'Sync error — retrying' },
  }[status];

  const Icon = config.icon;

  return (
    <div
      title={config.label}
      className="flex items-center gap-1 bg-zinc-900/80 px-2 py-1.5 rounded-lg border border-zinc-800/80"
    >
      <Icon className={`w-3.5 h-3.5 ${config.color}`} />
    </div>
  );
};

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

          {/* User Profile, Sync Status & Logout */}
          <div className="flex items-center gap-2">
            <SyncBadge />
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

        {currentUser.role === 'admin' && <AdminDashboard />}
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