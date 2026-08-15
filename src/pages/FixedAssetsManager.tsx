import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { useActiveBranchId } from '../context/BranchScopeContext';
import { requestSync, deleteAssetRemote } from '../db/sync';
import type { AssetCategory, AssetCondition, FixedAsset } from '../types';
import { Pagination } from '../components/Pagination';
import { usePagination } from '../components/usePagination';
import { SearchInput } from '../components/SearchInput';
import {
  Boxes,
  Plus,
  X,
  Trash2,
  Pencil,
  Check,
  AlertTriangle,
  Armchair,
  UtensilsCrossed,
  Coffee,
  Zap,
  Package,
} from 'lucide-react';

const money = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const CATEGORIES: AssetCategory[] = ['furniture', 'kitchenware', 'cutlery', 'electronics', 'other'];
const CONDITIONS: AssetCondition[] = ['good', 'fair', 'damaged', 'lost'];

const CATEGORY_ICON: Record<AssetCategory, typeof Armchair> = {
  furniture: Armchair,
  kitchenware: UtensilsCrossed,
  cutlery: Coffee,
  electronics: Zap,
  other: Package,
};

const CONDITION_STYLE: Record<AssetCondition, string> = {
  good: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  fair: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  damaged: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  lost: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export const FixedAssetsManager: React.FC = () => {
  const myBranchId = useActiveBranchId();

  const allAssets = useLiveQuery(() => db.fixedAssets.toArray(), []);
  const assets = useMemo(
    () => (allAssets ?? []).filter((a) => a.branch_id === myBranchId),
    [allAssets, myBranchId]
  );

  const totalValue = useMemo(
    () => assets.reduce((sum, a) => sum + a.quantity * (a.unit_cost ?? 0), 0),
    [assets]
  );
  const flagged = useMemo(
    () => assets.filter((a) => a.condition === 'damaged' || a.condition === 'lost'),
    [assets]
  );

  // -------------------------------------------------------------------
  // Add asset
  // -------------------------------------------------------------------
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<AssetCategory>('furniture');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [condition, setCondition] = useState<AssetCondition>('good');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');

  const resetForm = () => {
    setName('');
    setCategory('furniture');
    setQuantity('');
    setUnitCost('');
    setCondition('good');
    setNotes('');
    setFormError('');
  };

  const handleAddAsset = async () => {
    setFormError('');
    if (!myBranchId) return setFormError('Your account has no branch assigned — contact the owner.');
    if (!name.trim()) return setFormError('Enter an asset name.');
    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) return setFormError('Enter a valid quantity.');
    const cost = unitCost.trim() ? parseFloat(unitCost) : undefined;
    if (unitCost.trim() && (isNaN(cost as number) || (cost as number) < 0)) {
      return setFormError('Enter a valid cost per unit, or leave it blank.');
    }

    await db.fixedAssets.add({
      asset_id: crypto.randomUUID(),
      branch_id: myBranchId,
      name: name.trim(),
      category,
      quantity: qty,
      unit_cost: cost,
      condition,
      notes: notes.trim() || undefined,
      synced: false,
    });
    requestSync();
    resetForm();
    setShowAddForm(false);
  };

  // -------------------------------------------------------------------
  // Edit asset — quantity, cost, condition, notes
  // -------------------------------------------------------------------
  const [editingAsset, setEditingAsset] = useState<FixedAsset | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editCondition, setEditCondition] = useState<AssetCondition>('good');
  const [editNotes, setEditNotes] = useState('');

  const openEdit = (a: FixedAsset) => {
    setEditingAsset(a);
    setEditQty(String(a.quantity));
    setEditCost(a.unit_cost !== undefined ? String(a.unit_cost) : '');
    setEditCondition(a.condition);
    setEditNotes(a.notes ?? '');
  };

  const handleSaveEdit = async () => {
    if (!editingAsset) return;
    const qty = parseFloat(editQty);
    if (isNaN(qty) || qty < 0) return;
    const cost = editCost.trim() ? parseFloat(editCost) : undefined;

    await db.fixedAssets.update(editingAsset.asset_id, {
      quantity: qty,
      unit_cost: cost,
      condition: editCondition,
      notes: editNotes.trim() || undefined,
      synced: false,
    });
    requestSync();
    setEditingAsset(null);
  };

  // -------------------------------------------------------------------
  // Delete asset
  // -------------------------------------------------------------------
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    const ok = await deleteAssetRemote(id);
    if (!ok) {
      setFormError('Could not delete on the server — check your connection and try again.');
      setConfirmDelete(null);
      return;
    }
    await db.fixedAssets.delete(id);
    setConfirmDelete(null);
  };

  // -------------------------------------------------------------------
  // Search + pagination
  // -------------------------------------------------------------------
  const [search, setSearch] = useState('');
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? assets.filter((a) => a.name.toLowerCase().includes(q)) : assets;
  }, [assets, search]);

  const { page, setPage, totalPages, pageItems: pagedAssets } = usePagination(searched, 6);

  return (
    <div className="space-y-5">
      <div className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-orange-400" />
            <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Fixed Assets
            </span>
          </div>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2.5 py-1.5 rounded-lg active:scale-95 transition"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span>
            Est. Value: <span className="text-zinc-300 font-bold">{money(totalValue)}</span>
          </span>
          {flagged.length > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertTriangle className="w-3 h-3" />
              {flagged.length} damaged/lost
            </span>
          )}
        </div>

        <div className="space-y-2">
          {assets.length === 0 ? (
            <p className="text-zinc-600 text-[11px] font-mono text-center py-6">
              No fixed assets logged yet — add tables, chairs, sufurias, cups, spoons...
            </p>
          ) : (
            <>
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder="Search assets..."
              />
              {searched.length === 0 && (
                <p className="text-zinc-600 text-[11px] font-mono text-center py-6">No assets match your search</p>
              )}
              {pagedAssets.map((a) => {
                const Icon = CATEGORY_ICON[a.category];
                const isConfirming = confirmDelete === a.asset_id;
                return (
                  <div
                    key={a.asset_id}
                    className="p-2.5 rounded-xl border bg-zinc-900/60 border-zinc-800/60"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 shrink-0 rounded-lg bg-zinc-800 flex items-center justify-center">
                          <Icon className="w-3.5 h-3.5 text-zinc-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">{a.name}</p>
                          <p className="text-[10px] font-mono text-zinc-500">
                            {a.quantity} unit{a.quantity !== 1 ? 's' : ''}
                            {a.unit_cost !== undefined && ` · ${money(a.unit_cost)}/unit`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${CONDITION_STYLE[a.condition]}`}
                        >
                          {a.condition}
                        </span>
                        <button
                          onClick={() => openEdit(a)}
                          title="Edit"
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDelete(a.asset_id)}
                          title="Delete"
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {a.notes && <p className="text-[10px] font-mono text-zinc-600 mt-1.5">{a.notes}</p>}

                    {isConfirming && (
                      <div className="flex gap-2 mt-2 pt-2 border-t border-zinc-800/60">
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="flex-1 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg font-mono text-[10px] font-bold uppercase"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(a.asset_id)}
                          className="flex-1 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg font-mono text-[10px] font-bold uppercase"
                        >
                          Confirm Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
            </>
          )}
        </div>
      </div>

      {/* Add Asset Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 pt-10 sm:pt-4 pb-10">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">Add Asset</h3>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Plastic Chair, Sufuria (Large)"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Category
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`py-2 text-[9px] font-mono font-bold uppercase rounded-lg border transition ${category === c
                          ? 'bg-orange-500 text-zinc-950 border-orange-400'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                    Quantity
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                    Cost / Unit (optional)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Condition
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setCondition(c)}
                      className={`py-2 text-[9px] font-mono font-bold uppercase rounded-lg border transition ${condition === c
                          ? 'bg-orange-500 text-zinc-950 border-orange-400'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Stored in back kitchen"
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono resize-none focus:outline-none focus:border-orange-500"
                />
              </div>

              {formError && (
                <p className="text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
            </div>

            <button
              onClick={handleAddAsset}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition shadow-lg shadow-orange-500/20"
            >
              Add Asset
            </button>
          </div>
        </div>
      )}

      {/* Edit Asset Modal */}
      {editingAsset && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 pt-10 sm:pt-4 pb-10">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                Edit {editingAsset.name}
              </h3>
              <button
                onClick={() => setEditingAsset(null)}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                    Quantity
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                    Cost / Unit
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={editCost}
                    onChange={(e) => setEditCost(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Condition
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {CONDITIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setEditCondition(c)}
                      className={`py-2 text-[9px] font-mono font-bold uppercase rounded-lg border transition ${editCondition === c
                          ? 'bg-orange-500 text-zinc-950 border-orange-400'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Notes
                </label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono resize-none focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <button
              onClick={handleSaveEdit}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition shadow-lg shadow-orange-500/20"
            >
              <Check className="w-3.5 h-3.5 inline -mt-0.5 mr-1" /> Save Changes
            </button>
          </div>
        </div>
      )}
    </div>
  );
};