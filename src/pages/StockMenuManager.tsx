import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/kibandaDB';
import { useActiveBranchId } from '../context/BranchScopeContext';
import {
  requestSync,
  deleteIngredientRemote,
  deleteRecipeDishRemote,
  deleteRecipeLineRemote,
} from '../db/sync';
import type { Ingredient, RecipeItem } from '../types';

// A branch's view of a shared ingredient: identity fields from `Ingredient`
// joined with this branch's own quantity/cost/threshold from `IngredientStock`.
type StockedIngredient = Ingredient & {
  quantity_on_hand: number;
  last_purchase_cost: number;
  low_stock_threshold: number;
};
import { Pagination } from '../components/Pagination';
import { usePagination } from '../components/usePagination';
import { SearchInput } from '../components/SearchInput';
import {
  Package,
  UtensilsCrossed,
  Plus,
  X,
  Trash2,
  PackagePlus,
  Pencil,
  Check,
  AlertTriangle,
} from 'lucide-react';

const money = (n: number) => `KES ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const UNITS: Ingredient['unit'][] = ['g', 'kg', 'ml', 'l', 'pcs'];

export const StockMenuManager: React.FC = () => {
  const myBranchId = useActiveBranchId();

  const ingredientDefs = useLiveQuery(() => db.ingredients.toArray(), []);
  const allIngredientStock = useLiveQuery(() => db.ingredientStock.toArray(), []);
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);

  // Only ingredients this branch actually stocks — i.e. has a matching
  // ingredientStock row for. (Sharing an existing ingredient definition
  // into a second branch isn't wired up in this UI yet; each branch's
  // "Add Ingredient" creates its own definition + stock row together.)
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

  const ingredientMap = new Map(ingredients.map((i) => [i.ingredient_id, i]));

  const dishes = useMemo(() => {
    const map = new Map<string, { dish_name: string; selling_price: number; lines: RecipeItem[] }>();
    (recipes ?? []).forEach((r) => {
      const entry = map.get(r.dish_name) ?? { dish_name: r.dish_name, selling_price: r.selling_price, lines: [] };
      entry.lines.push(r);
      entry.selling_price = r.selling_price;
      map.set(r.dish_name, entry);
    });
    return Array.from(map.values()).sort((a, b) => a.dish_name.localeCompare(b.dish_name));
  }, [recipes]);

  const ingredientUsage = useMemo(() => {
    const usage = new Map<string, number>();
    (recipes ?? []).forEach((r) => usage.set(r.ingredient_id, (usage.get(r.ingredient_id) ?? 0) + 1));
    return usage;
  }, [recipes]);

  const incompleteDishNames = useMemo(() => {
    const names = new Set<string>();
    (recipes ?? []).forEach((r) => {
      if (!r.servings_per_bag || r.servings_per_bag <= 0) names.add(r.dish_name);
    });
    return names;
  }, [recipes]);

  // -------------------------------------------------------------------
  // Add ingredient
  // -------------------------------------------------------------------
  const [showIngredientForm, setShowIngredientForm] = useState(false);
  const [ingName, setIngName] = useState('');
  const [ingUnit, setIngUnit] = useState<Ingredient['unit']>('kg');
  const [ingBagUnitLabel, setIngBagUnitLabel] = useState('');
  const [ingQty, setIngQty] = useState('');
  const [ingCost, setIngCost] = useState('');
  const [ingThreshold, setIngThreshold] = useState('');
  const [ingError, setIngError] = useState('');

  const resetIngredientForm = () => {
    setIngName('');
    setIngUnit('kg');
    setIngBagUnitLabel('');
    setIngQty('');
    setIngCost('');
    setIngThreshold('');
    setIngError('');
  };

  const handleAddIngredient = async () => {
    setIngError('');
    if (!myBranchId) return setIngError('Your account has no branch assigned — contact the owner.');
    if (!ingName.trim()) return setIngError('Enter an ingredient name.');
    const qty = parseFloat(ingQty);
    const cost = parseFloat(ingCost);
    const threshold = parseFloat(ingThreshold);
    if (isNaN(qty) || qty < 0) return setIngError('Enter a valid starting bag count.');
    if (isNaN(cost) || cost < 0) return setIngError('Enter a valid cost per bag.');
    if (isNaN(threshold) || threshold < 0) return setIngError('Enter a valid low-stock threshold (in bags).');
    const ingredient_id = crypto.randomUUID();
    await db.ingredients.add({
      ingredient_id,
      name: ingName.trim(),
      unit: ingUnit,
      bag_unit_label: ingBagUnitLabel.trim() || undefined,
      synced: false,
    });
    await db.ingredientStock.add({
      branch_id: myBranchId,
      ingredient_id,
      quantity_on_hand: qty,
      last_purchase_cost: cost,
      low_stock_threshold: threshold,
      synced: false,
    });
    requestSync();
    resetIngredientForm();
    setShowIngredientForm(false);
  };

  // -------------------------------------------------------------------
  // Restock existing ingredient
  // -------------------------------------------------------------------
  const [restockTarget, setRestockTarget] = useState<StockedIngredient | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockCost, setRestockCost] = useState('');

  const handleRestock = async () => {
    if (!restockTarget || !myBranchId) return;
    const addQty = parseFloat(restockQty);
    if (isNaN(addQty) || addQty <= 0) return;
    const newCost = restockCost.trim() ? parseFloat(restockCost) : restockTarget.last_purchase_cost;

    await db.ingredientStock.update([myBranchId, restockTarget.ingredient_id], {
      quantity_on_hand: restockTarget.quantity_on_hand + addQty,
      last_purchase_cost: newCost,
      synced: false,
    });
    requestSync();
    setRestockTarget(null);
    setRestockQty('');
    setRestockCost('');
  };

  // -------------------------------------------------------------------
  // Delete ingredient
  // -------------------------------------------------------------------
  const [confirmDeleteIngredient, setConfirmDeleteIngredient] = useState<string | null>(null);

  const handleDeleteIngredient = async (id: string) => {
    const ok = await deleteIngredientRemote(id);
    if (!ok) {
      setIngError('Could not delete on the server — check your connection and try again.');
      setConfirmDeleteIngredient(null);
      return;
    } await db.ingredients.delete(id);
    if (myBranchId) await db.ingredientStock.delete([myBranchId, id]);
    setConfirmDeleteIngredient(null);
  };

  // -------------------------------------------------------------------
  // Add dish
  // -------------------------------------------------------------------
  const [showDishForm, setShowDishForm] = useState(false);
  const [dishName, setDishName] = useState('');
  const [dishPrice, setDishPrice] = useState('');
  const [dishLines, setDishLines] = useState<{ ingredient_id: string; servings_per_bag: string }[]>([
    { ingredient_id: '', servings_per_bag: '' },
  ]);
  const [dishError, setDishError] = useState('');

  const resetDishForm = () => {
    setDishName('');
    setDishPrice('');
    setDishLines([{ ingredient_id: '', servings_per_bag: '' }]);
    setDishError('');
  };

  const updateDishLine = (idx: number, field: 'ingredient_id' | 'servings_per_bag', value: string) => {
    setDishLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const handleCreateDish = async () => {
    setDishError('');
    const name = dishName.trim();
    if (!name) return setDishError('Enter a dish name.');
    if (dishes.some((d) => d.dish_name.toLowerCase() === name.toLowerCase()))
      return setDishError('A dish with that name already exists.');
    const price = parseFloat(dishPrice);
    if (isNaN(price) || price <= 0) return setDishError('Enter a valid selling price.');

    const validLines = dishLines.filter((l) => l.ingredient_id);
    if (validLines.length === 0) return setDishError('Add at least one ingredient.');
    const ids = validLines.map((l) => l.ingredient_id);
    if (new Set(ids).size !== ids.length) return setDishError('Each ingredient can only appear once per dish.');
    for (const l of validLines) {
      if (l.servings_per_bag.trim() && (isNaN(parseFloat(l.servings_per_bag)) || parseFloat(l.servings_per_bag) <= 0)) {
        return setDishError('Servings per bag must be a positive number, or left blank if not known yet.');
      }
    }

    await db.recipes.bulkAdd(
      validLines.map((l) => ({
        dish_name: name,
        selling_price: price,
        ingredient_id: l.ingredient_id,
        servings_per_bag: l.servings_per_bag.trim() ? parseFloat(l.servings_per_bag) : undefined,
        synced: false,
      }))
    );
    requestSync();
    resetDishForm();
    setShowDishForm(false);
  };

  // -------------------------------------------------------------------
  // Edit dish price inline
  // -------------------------------------------------------------------
  const [editingPriceDish, setEditingPriceDish] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState('');

  const handleSavePrice = async (dish_name: string) => {
    const price = parseFloat(editingPriceValue);
    if (isNaN(price) || price <= 0) {
      setEditingPriceDish(null);
      return;
    }
    await db.recipes.where('dish_name').equals(dish_name).modify({ selling_price: price, synced: false });
    requestSync();
    setEditingPriceDish(null);
    setEditingPriceValue('');
  };

  // -------------------------------------------------------------------
  // Delete dish / remove a single ingredient line from a dish
  // -------------------------------------------------------------------
  const [confirmDeleteDish, setConfirmDeleteDish] = useState<string | null>(null);

  const handleDeleteDish = async (dish_name: string) => {
    const ok = await deleteRecipeDishRemote(dish_name);
    if (!ok) {
      setDishError('Could not delete on the server — check your connection and try again.');
      setConfirmDeleteDish(null);
      return;
    }
    await db.recipes.where('dish_name').equals(dish_name).delete();
    setConfirmDeleteDish(null);
  };

  const handleRemoveDishLine = async (dish_name: string, ingredient_id: string, lineCount: number) => {
    const ok = await deleteRecipeLineRemote(dish_name, ingredient_id);
    if (!ok) {
      setDishError('Could not remove that ingredient on the server — check your connection and try again.');
      return;
    }
    await db.recipes.delete([dish_name, ingredient_id]);
  };

  // -------------------------------------------------------------------
  // Add an ingredient line to an existing dish
  // -------------------------------------------------------------------
  const [addingLineTo, setAddingLineTo] = useState<string | null>(null);
  const [newLineIngredient, setNewLineIngredient] = useState('');
  const [newLineQty, setNewLineQty] = useState('');

  const handleAddLineToDish = async (dish_name: string, selling_price: number) => {
   if (!newLineIngredient) return;
    if (newLineQty.trim() && (isNaN(parseFloat(newLineQty)) || parseFloat(newLineQty) <= 0)) return;
    await db.recipes.put({
      dish_name,
      ingredient_id: newLineIngredient,
      selling_price,
      servings_per_bag: newLineQty.trim() ? parseFloat(newLineQty) : undefined,
      synced: false,
    });
    requestSync();
    setAddingLineTo(null);
    setNewLineIngredient('');
    setNewLineQty('');
  };

  const [ingredientSearch, setIngredientSearch] = useState('');
  const searchedIngredients = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase();
    const list = ingredients ?? [];
    return q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list;
  }, [ingredients, ingredientSearch]);

  const {
    page: ingredientsPage,
    setPage: setIngredientsPage,
    totalPages: ingredientsTotalPages,
    pageItems: pagedIngredients,
  } = usePagination(searchedIngredients, 5);

  const [dishSearch, setDishSearch] = useState('');
  const searchedDishes = useMemo(() => {
    const q = dishSearch.trim().toLowerCase();
    return q ? dishes.filter((d) => d.dish_name.toLowerCase().includes(q)) : dishes;
  }, [dishes, dishSearch]);

  const {
    page: dishesPage,
    setPage: setDishesPage,
    totalPages: dishesTotalPages,
    pageItems: pagedDishes,
  } = usePagination(searchedDishes, 4);

  return (
    <div className="space-y-5">
      {/* ===================== INGREDIENTS ===================== */}
      <div className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-orange-400" />
            <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Ingredients
            </span>
          </div>
          <button
            onClick={() => setShowIngredientForm(true)}
            className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2.5 py-1.5 rounded-lg active:scale-95 transition"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        <div className="space-y-2">
          {(ingredients ?? []).length === 0 ? (
            <p className="text-zinc-600 text-[11px] font-mono text-center py-6">No ingredients yet</p>
          ) : (
            <>
              <SearchInput
                value={ingredientSearch}
                onChange={(v) => { setIngredientSearch(v); setIngredientsPage(1); }}
                placeholder="Search ingredients..."
              />
              {searchedIngredients.length === 0 && (
                <p className="text-zinc-600 text-[11px] font-mono text-center py-6">No ingredients match your search</p>
              )}
              {pagedIngredients.map((ing) => {
                const isLow = ing.quantity_on_hand <= ing.low_stock_threshold;
                const usedIn = ingredientUsage.get(ing.ingredient_id) ?? 0;
                const isConfirmingDelete = confirmDeleteIngredient === ing.ingredient_id;

                return (
                  <div
                    key={ing.ingredient_id}
                    className={`p-2.5 rounded-xl border ${isLow ? 'bg-red-500/5 border-red-500/20' : 'bg-zinc-900/60 border-zinc-800/60'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-white">{ing.name}</p>
                        <p className="text-[10px] font-mono text-zinc-500">
                          {ing.quantity_on_hand.toFixed(1)} bag{ing.quantity_on_hand === 1 ? '' : 's'} on hand
                          {ing.bag_unit_label ? ` (${ing.bag_unit_label})` : ''} · {money(ing.last_purchase_cost)}/bag
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isLow && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
                        <button
                          onClick={() => setRestockTarget(ing)}
                          title="Restock"
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                        >
                          <PackagePlus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteIngredient(ing.ingredient_id)}
                          title="Delete"
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {isConfirmingDelete && (
                      <div className="mt-2 pt-2 border-t border-zinc-800/60">
                        {usedIn > 0 ? (
                          <p className="text-[10px] font-mono text-red-400">
                            Used in {usedIn} dish{usedIn > 1 ? 'es' : ''} — remove it from those recipes first.
                          </p>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setConfirmDeleteIngredient(null)}
                              className="flex-1 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg font-mono text-[10px] font-bold uppercase"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDeleteIngredient(ing.ingredient_id)}
                              className="flex-1 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg font-mono text-[10px] font-bold uppercase"
                            >
                              Confirm Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <Pagination page={ingredientsPage} totalPages={ingredientsTotalPages} onPageChange={setIngredientsPage} />
            </>
          )}
        </div>
      </div>

      {/* ===================== DISHES / RECIPES ===================== */}
      <div className="relative bg-[#0f1117] border border-zinc-800/80 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="w-4 h-4 text-orange-400" />
            <span className="font-mono text-xs font-bold text-zinc-300 uppercase tracking-wider">
              Menu / Dishes
            </span>
          </div>
          <button
            onClick={() => setShowDishForm(true)}
            disabled={(ingredients ?? []).length === 0}
            className="flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2.5 py-1.5 rounded-lg active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none"
          >
            <Plus className="w-3 h-3" /> Add Dish
          </button>
        </div>

        {incompleteDishNames.size > 0 && (
          <div className="flex items-start gap-2 bg-red-500/5 border border-red-500/20 rounded-xl p-2.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-[10px] font-mono text-red-300">
              {incompleteDishNames.size} dish{incompleteDishNames.size > 1 ? 'es have' : ' has'} an ingredient
              with no servings-per-bag set — sales still go through, but stock won't deplete for that
             ingredient until it's filled in below.
            </p>
          </div>
        )}


        {(ingredients ?? []).length === 0 && (
          <p className="text-[10px] font-mono text-zinc-600">Add at least one ingredient before creating a dish.</p>
        )}

        <div className="space-y-3">
          {dishes.length === 0 ? (
            <p className="text-zinc-600 text-[11px] font-mono text-center py-6">No dishes yet</p>
          ) : (
            <>
              <SearchInput
                value={dishSearch}
                onChange={(v) => { setDishSearch(v); setDishesPage(1); }}
                placeholder="Search dishes..."
              />
              {searchedDishes.length === 0 && (
                <p className="text-zinc-600 text-[11px] font-mono text-center py-6">No dishes match your search</p>
              )}
              {pagedDishes.map((dish) => {
                const isEditingPrice = editingPriceDish === dish.dish_name;
                const isConfirmingDelete = confirmDeleteDish === dish.dish_name;
                const isAddingLine = addingLineTo === dish.dish_name;
                const availableIngredients = (ingredients ?? []).filter(
                  (i) => !dish.lines.some((l) => l.ingredient_id === i.ingredient_id)
                );

                return (
                  <div key={dish.dish_name} className="bg-zinc-900/60 border border-zinc-800/60 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">{dish.dish_name}</span>
                      <div className="flex items-center gap-1.5">
                        {isEditingPrice ? (
                          <>
                            <input
                              type="number"
                              autoFocus
                              value={editingPriceValue}
                              onChange={(e) => setEditingPriceValue(e.target.value)}
                              className="w-16 bg-zinc-950 border border-orange-500/40 rounded-lg px-1.5 py-0.5 text-xs text-white font-mono text-right focus:outline-none"
                            />
                            <button
                              onClick={() => handleSavePrice(dish.dish_name)}
                              className="p-1 rounded-lg bg-orange-500 text-zinc-950"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingPriceDish(dish.dish_name);
                              setEditingPriceValue(String(dish.selling_price));
                            }}
                            className="flex items-center gap-1 text-orange-400 font-mono font-bold text-xs"
                          >
                            {money(dish.selling_price)} <Pencil className="w-3 h-3 opacity-60" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDeleteDish(dish.dish_name)}
                          title="Delete dish"
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Ingredient composition */}
                    <div className="space-y-1">
                      {dish.lines.map((line) => {
                        const ing = ingredientMap.get(line.ingredient_id);
                        return (
                          <div
                            key={line.ingredient_id}
                            className="flex items-center justify-between text-[10px] font-mono text-zinc-400 bg-zinc-950/60 px-2 py-1 rounded-lg"
                          >
                            <span>{ing?.name ?? 'Unknown ingredient'}</span>
                            <div className="flex items-center gap-2">
                              {line.servings_per_bag ? (
                              <span>{line.servings_per_bag}/bag</span>
                            ) : (
                              <span className="text-red-400 flex items-center gap-1">
                               <AlertTriangle className="w-2.5 h-2.5" /> not set
                              </span>
                            )}
                              {dish.lines.length > 1 && (
                                <button
                                  onClick={() => handleRemoveDishLine(dish.dish_name, line.ingredient_id, dish.lines.length)}
                                  className="text-zinc-600 hover:text-red-400"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Add ingredient line */}
                    {isAddingLine ? (
                      <div className="flex items-center gap-1.5 pt-1">
                        <select
                          value={newLineIngredient}
                          onChange={(e) => setNewLineIngredient(e.target.value)}
                          className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-1.5 text-[10px] text-white font-mono focus:outline-none focus:border-orange-500"
                        >
                          <option value="">Ingredient...</option>
                          {availableIngredients.map((i) => (
                            <option key={i.ingredient_id} value={i.ingredient_id}>
                              {i.name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          placeholder="Servings/bag"
                          value={newLineQty}
                          onChange={(e) => setNewLineQty(e.target.value)}
                          className="w-20 bg-zinc-950 border border-zinc-700 rounded-lg px-1.5 py-1.5 text-[10px] text-white font-mono focus:outline-none focus:border-orange-500"
                        />
                        <button
                          onClick={() => handleAddLineToDish(dish.dish_name, dish.selling_price)}
                          className="p-1.5 rounded-lg bg-orange-500 text-zinc-950"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setAddingLineTo(null)}
                          className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      availableIngredients.length > 0 && (
                        <button
                          onClick={() => setAddingLineTo(dish.dish_name)}
                          className="text-[10px] font-mono text-zinc-500 hover:text-orange-400 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add ingredient
                        </button>
                      )
                    )}

                    {isConfirmingDelete && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => setConfirmDeleteDish(null)}
                          className="flex-1 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg font-mono text-[10px] font-bold uppercase"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDeleteDish(dish.dish_name)}
                          className="flex-1 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg font-mono text-[10px] font-bold uppercase"
                        >
                          Confirm Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
        {dishes.length > 0 && (
          <Pagination page={dishesPage} totalPages={dishesTotalPages} onPageChange={setDishesPage} />
        )}
      </div>

      {/* Add Ingredient Modal */}
      {showIngredientForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">Add Ingredient</h3>
              <button
                onClick={() => {
                  setShowIngredientForm(false);
                  resetIngredientForm();
                }}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">Name</label>
                <input
                  type="text"
                  value={ingName}
                  onChange={(e) => setIngName(e.target.value)}
                  placeholder="e.g. Tomatoes"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">Unit</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {UNITS.map((u) => (
                    <button
                      key={u}
                      onClick={() => setIngUnit(u)}
                      className={`py-2 text-[10px] font-mono font-bold uppercase rounded-lg border transition ${
                        ingUnit === u
                          ? 'bg-orange-500 text-zinc-950 border-orange-400'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  What's a bag? (optional)
                </label>
                <input
                  type="text"
                  value={ingBagUnitLabel}
                  onChange={(e) => setIngBagUnitLabel(e.target.value)}
                  placeholder="e.g. 2kg packet, 1 chicken, 1 gorogoro bucket"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                    Starting Bags
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={ingQty}
                    onChange={(e) => setIngQty(e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                    Cost / Bag (KES)
                  </label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={ingCost}
                    onChange={(e) => setIngCost(e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Low Stock Threshold (bags)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={ingThreshold}
                  onChange={(e) => setIngThreshold(e.target.value)}
                  placeholder="e.g. 2"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              {ingError && (
                <p className="text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {ingError}
                </p>
              )}
            </div>

            <button
              onClick={handleAddIngredient}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition shadow-lg shadow-orange-500/20"
            >
              Add Ingredient
            </button>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {restockTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">
                Restock {restockTarget.name}
              </h3>
              <button
                onClick={() => {
                  setRestockTarget(null);
                  setRestockQty('');
                  setRestockCost('');
                }}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-[10px] font-mono text-zinc-500">
              Currently {restockTarget.quantity_on_hand.toFixed(1)} bag{restockTarget.quantity_on_hand === 1 ? '' : 's'} on hand
              {restockTarget.bag_unit_label ? ` (${restockTarget.bag_unit_label})` : ''}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Add Bags
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  autoFocus
                  value={restockQty}
                  onChange={(e) => setRestockQty(e.target.value)}
                  placeholder="0"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  New Cost / Bag
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={restockCost}
                  onChange={(e) => setRestockCost(e.target.value)}
                  placeholder={String(restockTarget.last_purchase_cost)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>

            <button
              onClick={handleRestock}
              disabled={!restockQty}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition shadow-lg shadow-orange-500/20"
            >
              Confirm Restock
            </button>
          </div>
        </div>
      )}

      {/* Add Dish Modal */}
      {showDishForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm bg-[#0f1117] border border-zinc-800 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-xs font-bold text-white uppercase tracking-wider">Add Dish</h3>
              <button
                onClick={() => {
                  setShowDishForm(false);
                  resetDishForm();
                }}
                className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Dish Name
                </label>
                <input
                  type="text"
                  value={dishName}
                  onChange={(e) => setDishName(e.target.value)}
                  placeholder="e.g. Beef Stew"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Selling Price (KES)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={dishPrice}
                  onChange={(e) => setDishPrice(e.target.value)}
                  placeholder="0"
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1 block">
                  Recipe (1 bag makes ___ plates)
                </label>
                <p className="text-[9px] font-mono text-zinc-600 mb-2">
                  Leave the number blank if you don't know the yield yet — the dish can still be
                  created and sold, that ingredient just won't deduct stock until it's filled in.
                </p>
                <div className="space-y-2">
                  {dishLines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <select
                        value={line.ingredient_id}
                        onChange={(e) => updateDishLine(idx, 'ingredient_id', e.target.value)}
                        className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-2 text-[11px] text-white font-mono focus:outline-none focus:border-orange-500"
                      >
                        <option value="">Ingredient...</option>
                        {(ingredients ?? []).map((i) => (
                          <option key={i.ingredient_id} value={i.ingredient_id}>
                            {i.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Servings/bag"
                        value={line.servings_per_bag}
                        onChange={(e) => updateDishLine(idx, 'servings_per_bag', e.target.value)}
                        className="w-24 bg-zinc-950 border border-zinc-700 rounded-lg px-2 py-2 text-[11px] text-white font-mono focus:outline-none focus:border-orange-500"
                      />
                      {dishLines.length > 1 && (
                        <button
                          onClick={() => setDishLines((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-red-400"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setDishLines((prev) => [...prev, { ingredient_id: '', servings_per_bag: '' }])}
                  className="mt-2 text-[10px] font-mono text-zinc-500 hover:text-orange-400 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add ingredient line
                </button>
              </div>

              {dishError && (
                <p className="text-[11px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {dishError}
                </p>
              )}
            </div>

            <button
              onClick={handleCreateDish}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-400 active:scale-[0.98] text-zinc-950 font-mono font-bold uppercase tracking-wider text-xs rounded-2xl transition shadow-lg shadow-orange-500/20"
            >
              Create Dish
            </button>
          </div>
        </div>
      )}
    </div>
  );
};