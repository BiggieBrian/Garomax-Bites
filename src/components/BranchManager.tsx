import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { requestSync } from '../db/sync';
import type { Branch } from '../types';
import { Building2, Plus, Pencil, Check, X, MapPin } from 'lucide-react';

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'branch';
}

export const BranchManager: React.FC = () => {
  const branches = useLiveQuery(() => db.branches.toArray(), []) ?? [];

  // -------------------------------------------------------------------
  // Add branch
  // -------------------------------------------------------------------
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');

  const resetAddForm = () => {
    setName('');
    setLocation('');
    setError('');
  };

  const handleAddBranch = async () => {
    setError('');
    if (!name.trim()) return setError('Enter a branch name.');

    const baseId = slugify(name);
    let branchId = baseId;
    let suffix = 2;
    // Guard against two branches slugifying to the same id (e.g. two
    // branches both named "Town Centre").
    while (branches.some((b) => b.branch_id === branchId)) {
      branchId = `${baseId}-${suffix}`;
      suffix += 1;
    }

    await db.branches.add({
      branch_id: branchId,
      name: name.trim(),
      location: location.trim() || undefined,
      synced: false,
    });
    requestSync();
    resetAddForm();
    setShowAddForm(false);
  };

  // -------------------------------------------------------------------
  // Rename / edit branch
  // -------------------------------------------------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLocation, setEditLocation] = useState('');

  const startEditing = (branch: Branch) => {
    setEditingId(branch.branch_id);
    setEditName(branch.name);
    setEditLocation(branch.location ?? '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditLocation('');
  };

  const saveEditing = async () => {
    if (!editingId || !editName.trim()) return;
    await db.branches.update(editingId, {
      name: editName.trim(),
      location: editLocation.trim() || undefined,
      synced: false,
    });
    requestSync();
    cancelEditing();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Branches</h2>
        </div>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1.5 rounded-lg hover:bg-orange-500/20 transition active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Branch
        </button>
      </div>

      {showAddForm && (
        <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3 space-y-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Branch name (e.g. Westlands Branch)"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleAddBranch}
              className="flex-1 bg-orange-500 text-white text-xs font-bold py-2 rounded-lg hover:bg-orange-400 transition active:scale-95"
            >
              Save Branch
            </button>
            <button
              onClick={() => {
                resetAddForm();
                setShowAddForm(false);
              }}
              className="px-3 text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {branches.length === 0 && (
          <p className="text-xs text-zinc-500 text-center py-6">
            No branches yet — add your first one above.
          </p>
        )}

        {branches.map((branch) => (
          <div
            key={branch.branch_id}
            className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-3"
          >
            {editingId === branch.branch_id ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-orange-500/50"
                />
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  placeholder="Location (optional)"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveEditing}
                    className="flex items-center gap-1 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/20 transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button
                    onClick={cancelEditing}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-2.5 py-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-100">{branch.name}</p>
                  {branch.location && (
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3" />
                      {branch.location}
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-600 font-mono mt-1">{branch.branch_id}</p>
                </div>
                <button
                  onClick={() => startEditing(branch)}
                  className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
                  title="Rename branch"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};