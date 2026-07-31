import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { BranchManager } from '../components/BranchManager';
import { AdminDashboard } from './AdminDashboard';
import { BranchScopeProvider } from '../context/BranchScopeContext';
import { Building2, LayoutGrid, ChevronDown } from 'lucide-react';

type SuperAdminSection = 'branches' | 'manage';

/**
 * SuperAdmin's home screen. Branches (create/rename branches) stays its own
 * section. Manage Branch lets the owner pick any branch and drop straight
 * into the same AdminDashboard an admin at that branch would see — same
 * Overview/Stock/Assets/Staff/Money tabs, same create/edit/delete actions —
 * scoped to whichever branch is selected instead of a fixed branch_id.
 */
export const SuperAdminDashboard: React.FC = () => {
  const branches = useLiveQuery(() => db.branches.toArray(), []) ?? [];
  const [section, setSection] = useState<SuperAdminSection>('branches');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  const SECTIONS: { id: SuperAdminSection; label: string; icon: typeof Building2 }[] = [
    { id: 'branches', label: 'Branches', icon: Building2 },
    { id: 'manage', label: 'Manage Branch', icon: LayoutGrid },
  ];

  return (
    <div className="space-y-4">
      {/* ===================== SECTION SWITCHER ===================== */}
      <div className="grid grid-cols-2 gap-2 bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-1.5">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const isActive = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-mono font-bold uppercase tracking-wider transition ${
                isActive
                  ? 'bg-orange-500 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* ===================== BRANCHES ===================== */}
      {section === 'branches' && <BranchManager />}

      {/* ===================== MANAGE BRANCH ===================== */}
      {section === 'manage' && (
        <div className="space-y-4">
          <div className="relative">
            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
              Branch
            </label>
            <div className="relative">
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full appearance-none bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-orange-500"
              >
                <option value="">Select a branch...</option>
                {branches.map((b) => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-zinc-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {!selectedBranchId && (
            <div className="text-center py-10 text-zinc-500 text-xs font-mono">
              {branches.length === 0
                ? 'Create a branch first, then come back here to manage it.'
                : 'Pick a branch above to manage its stock, staff, and money.'}
            </div>
          )}

          {selectedBranchId && (
            <BranchScopeProvider branchId={selectedBranchId}>
              <AdminDashboard />
            </BranchScopeProvider>
          )}
        </div>
      )}
    </div>
  );
};