import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Login } from './pages/Login';
import { WaiterPOS } from './pages/WaiterPOS';
import { KitchenDisplay } from './pages/KitchenDisplay';
import { AdminDashboard } from './pages/AdminDashboard';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { LogOut, Cloud, CloudOff, RefreshCw, AlertTriangle, Pencil, X } from 'lucide-react';
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
  const { currentUser, logout, updateOwnName } = useAuth();
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [nameInput, setNameInput] = useState('');

  if (!currentUser) {
    return <Login />;
  }

  const openNameEdit = () => {
    setNameInput(currentUser.name);
    setShowNameEdit(true);
  };

  const saveName = async () => {
    await updateOwnName(nameInput);
    setShowNameEdit(false);
  };

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
            <button
              onClick={openNameEdit}
              title="Edit display name"
              className="flex items-center text-xs text-zinc-300 font-mono bg-zinc-900/80 px-2.5 py-1.5 rounded-xl border border-zinc-800/80 hover:border-orange-500/40 transition"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-2 animate-pulse" />
              <span className="truncate max-w-[100px] font-medium">{currentUser.name}</span>
              <Pencil className="w-3 h-3 ml-1.5 text-zinc-500" />
            </button>
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

        {currentUser.role === 'superadmin' && <SuperAdminDashboard />}
      </main>

      {/* Edit Display Name Modal */}
      {showNameEdit && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                Edit Display Name
              </h3>
              <button
                onClick={() => setShowNameEdit(false)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div>
              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                Name
              </label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="e.g. Jane Wanjiru"
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-orange-500"
              />
            </div>

            <button
              onClick={saveName}
              disabled={!nameInput.trim()}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition shadow-lg shadow-orange-500/20"
            >
              Save
            </button>
          </div>
        </div>
      )}
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