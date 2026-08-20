import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { db } from './kibandaDB';
import type {
  User,
  Branch,
  Ingredient,
  IngredientStock,
  RecipeItem,
  Order,
  WasteLog,
  StaffLedger,
  FixedAsset,
  SalesTarget,
  Supply,
} from '../types';

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error';

type Listener = (status: SyncStatus, lastSync: Date | null) => void;

let currentStatus: SyncStatus = isSupabaseConfigured ? 'offline' : 'offline';
let lastSync: Date | null = null;
const listeners = new Set<Listener>();

function setStatus(status: SyncStatus) {
  currentStatus = status;
  listeners.forEach((l) => l(currentStatus, lastSync));
}

export function onSyncStatusChange(cb: Listener): () => void {
  listeners.add(cb);
  cb(currentStatus, lastSync);
  return () => listeners.delete(cb);
}

// ---------------------------------------------------------------------------
// Row <-> local type mapping. Orders and WasteLog store their date under
// `timestamp` locally, but the Postgres column is called `ts` (avoids the
// reserved-word-flavoured `timestamp` name in SQL).
//
// Note on scope: every device pulls every branch's data (see pullAll below).
// Each screen is responsible for filtering by branch_id itself — this file
// doesn't do server-side branch filtering. Fine at "two mini restaurants"
// scale; revisit if branch count or data volume grows a lot.
// ---------------------------------------------------------------------------

const branchToRow = (b: Branch) => ({
  branch_id: b.branch_id,
  name: b.name,
  location: b.location ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const branchFromRow = (r: any): Branch => ({
  branch_id: r.branch_id,
  name: r.name,
  location: r.location ?? undefined,
});

const orderToRow = (o: Order) => ({
  order_id: o.order_id,
  branch_id: o.branch_id,
  payment_status: o.payment_status,
  payment_method: o.payment_method ?? null,
  payment_splits: o.payment_splits ?? null,
  mpesa_code: o.mpesa_code ?? null,
  kitchen_status: o.kitchen_status,
  items: o.items,
  total_amount: o.total_amount,
  placed_by_waiter_id: o.placed_by_waiter_id,
  confirmed_by_cook_id: o.confirmed_by_cook_id ?? null,
  cancelled_by_admin_id: o.cancelled_by_admin_id ?? null,
  cancel_reason: o.cancel_reason ?? null,
  ts: o.timestamp,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const orderFromRow = (r: any): Order => ({
  order_id: r.order_id,
  branch_id: r.branch_id,
  payment_status: r.payment_status,
  payment_method: r.payment_method ?? undefined,
  payment_splits: r.payment_splits ?? undefined,
  mpesa_code: r.mpesa_code ?? undefined,
  kitchen_status: r.kitchen_status ?? 'queued',
  items: r.items,
  total_amount: r.total_amount,
  placed_by_waiter_id: r.placed_by_waiter_id,
  confirmed_by_cook_id: r.confirmed_by_cook_id ?? undefined,
  cancelled_by_admin_id: r.cancelled_by_admin_id ?? undefined,
  cancel_reason: r.cancel_reason ?? undefined,
  timestamp: r.ts,
  synced: true,
});

const wasteToRow = (w: WasteLog) => ({
  waste_id: w.waste_id,
  branch_id: w.branch_id,
  dish_or_ingredient: w.dish_or_ingredient,
  quantity: w.quantity,
  reason: w.reason,
  logged_by_cook_id: w.logged_by_cook_id,
  deduction_flag: w.deduction_flag,
  ts: w.timestamp,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wasteFromRow = (r: any): WasteLog => ({
  waste_id: r.waste_id,
  branch_id: r.branch_id,
  dish_or_ingredient: r.dish_or_ingredient,
  quantity: r.quantity,
  reason: r.reason,
  logged_by_cook_id: r.logged_by_cook_id,
  deduction_flag: r.deduction_flag,
  timestamp: r.ts,
  synced: true,
});

const ledgerToRow = (l: StaffLedger) => ({
  ledger_id: l.ledger_id,
  branch_id: l.branch_id,
  staff_id: l.staff_id,
  date: l.date,
  shortage_amount: l.shortage_amount,
  spoilage_cost: l.spoilage_cost,
  reason: l.reason,
  payroll_deduction_status: l.payroll_deduction_status,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ledgerFromRow = (r: any): StaffLedger => ({
  ledger_id: r.ledger_id,
  branch_id: r.branch_id,
  staff_id: r.staff_id,
  date: r.date,
  shortage_amount: r.shortage_amount,
  spoilage_cost: r.spoilage_cost,
  reason: r.reason,
  payroll_deduction_status: r.payroll_deduction_status,
  synced: true,
});

// Ingredients are now shared identity only — name + unit, no branch_id.
const ingredientToRow = (i: Ingredient) => ({
  ingredient_id: i.ingredient_id,
  name: i.name,
  unit: i.unit,
  bag_unit_label: i.bag_unit_label ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ingredientFromRow = (r: any): Ingredient => ({
  ingredient_id: r.ingredient_id,
  name: r.name,
  unit: r.unit,
  bag_unit_label: r.bag_unit_label ?? undefined,
  synced: true,
});

// Stock levels are per-branch. `quantity_on_hand` is a bag count now (can be
// fractional); `last_purchase_cost` is cost per bag, refreshed on restock.
const ingredientStockToRow = (s: IngredientStock) => ({
  branch_id: s.branch_id,
  ingredient_id: s.ingredient_id,
  quantity_on_hand: s.quantity_on_hand,
  last_purchase_cost: s.last_purchase_cost,
  low_stock_threshold: s.low_stock_threshold,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ingredientStockFromRow = (r: any): IngredientStock => ({
  branch_id: r.branch_id,
  ingredient_id: r.ingredient_id,
  quantity_on_hand: r.quantity_on_hand,
  last_purchase_cost: r.last_purchase_cost,
  low_stock_threshold: r.low_stock_threshold,
  synced: true,
});

const userToRow = (u: User) => ({
  user_id: u.user_id,
  name: u.name,
  role: u.role,
  pin_code: u.pin_code,
  active_shift: u.active_shift,
  basic_salary: u.basic_salary,
  branch_id: u.branch_id,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const userFromRow = (r: any): User => ({
  user_id: r.user_id,
  name: r.name,
  role: r.role,
  pin_code: r.pin_code,
  active_shift: r.active_shift,
  basic_salary: r.basic_salary ?? 0,
  branch_id: r.branch_id ?? null,
  synced: true,
});

// `servings_per_bag` — "one bag of this ingredient makes N plates of this
// dish." Nullable: a dish can go live before every ingredient's yield is
// known: see the skip-and-flag handling in KitchenDisplay.tsx.
const recipeToRow = (r: RecipeItem) => ({
  dish_name: r.dish_name,
  ingredient_id: r.ingredient_id,
  selling_price: r.selling_price,
  servings_per_bag: r.servings_per_bag ?? null,
  category: r.category,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const recipeFromRow = (r: any): RecipeItem => ({
  dish_name: r.dish_name,
  ingredient_id: r.ingredient_id,
  selling_price: r.selling_price,
  servings_per_bag: r.servings_per_bag ?? undefined,
  category: r.category ?? 'meals',
  synced: true,
});

const assetToRow = (a: FixedAsset) => ({
  asset_id: a.asset_id,
  branch_id: a.branch_id,
  name: a.name,
  category: a.category,
  quantity: a.quantity,
  unit_cost: a.unit_cost ?? null,
  condition: a.condition,
  notes: a.notes ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const assetFromRow = (r: any): FixedAsset => ({
  asset_id: r.asset_id,
  branch_id: r.branch_id,
  name: r.name,
  category: r.category,
  quantity: r.quantity,
  unit_cost: r.unit_cost ?? undefined,
  condition: r.condition,
  notes: r.notes ?? undefined,
  synced: true,
});

const salesTargetToRow = (t: SalesTarget) => ({
  target_id: t.target_id,
  branch_id: t.branch_id,
  period_type: t.period_type,
  start_date: t.start_date,
  end_date: t.end_date,
  target_amount: t.target_amount,
  set_by_user_id: t.set_by_user_id,
  active: t.active,
  created_at: t.created_at,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const salesTargetFromRow = (r: any): SalesTarget => ({
  target_id: r.target_id,
  branch_id: r.branch_id ?? null,
  period_type: r.period_type,
  start_date: r.start_date,
  end_date: r.end_date,
  target_amount: r.target_amount,
  set_by_user_id: r.set_by_user_id,
  active: r.active,
  created_at: r.created_at,
  synced: true,
});

const supplyToRow = (s: Supply) => ({
  supply_id: s.supply_id,
  branch_id: s.branch_id,
  name: s.name,
  unit_label: s.unit_label,
  restock_interval_days: s.restock_interval_days,
  last_restocked_at: s.last_restocked_at ?? null,
  last_restock_cost: s.last_restock_cost ?? null,
  last_restock_quantity: s.last_restock_quantity ?? null,
  notes: s.notes ?? null,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supplyFromRow = (r: any): Supply => ({
  supply_id: r.supply_id,
  branch_id: r.branch_id,
  name: r.name,
  unit_label: r.unit_label,
  restock_interval_days: r.restock_interval_days,
  last_restocked_at: r.last_restocked_at ?? undefined,
  last_restock_cost: r.last_restock_cost ?? undefined,
  last_restock_quantity: r.last_restock_quantity ?? undefined,
  notes: r.notes ?? undefined,
  synced: true,
});

// ---------------------------------------------------------------------------
// Push: send local unsynced rows up to Supabase, then mark them synced.
// ---------------------------------------------------------------------------

async function pushUnsyncedBranches() {
  const rows = await db.branches.filter((b) => (b as Branch & { synced?: boolean }).synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('branches').upsert(rows.map(branchToRow));
  if (error) throw error;
  await db.branches.bulkUpdate(rows.map((r) => ({ key: r.branch_id, changes: { synced: true } })));
}

async function pushUnsyncedOrders() {
  const rows = await db.orders.filter((o) => o.synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('orders').upsert(rows.map(orderToRow));
  if (error) throw error;
  await db.orders.bulkUpdate(rows.map((r) => ({ key: r.order_id, changes: { synced: true } })));
}

async function pushUnsyncedWaste() {
  const rows = await db.wasteLogs.filter((w) => w.synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('waste_logs').upsert(rows.map(wasteToRow));
  if (error) throw error;
  await db.wasteLogs.bulkUpdate(rows.map((r) => ({ key: r.waste_id, changes: { synced: true } })));
}

async function pushUnsyncedLedgers() {
  const rows = await db.staffLedgers.filter((l) => l.synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('staff_ledgers').upsert(rows.map(ledgerToRow));
  if (error) throw error;
  await db.staffLedgers.bulkUpdate(rows.map((r) => ({ key: r.ledger_id, changes: { synced: true } })));
}

async function pushUnsyncedIngredients() {
  const rows = await db.ingredients.filter((i) => i.synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('ingredients').upsert(rows.map(ingredientToRow));
  if (error) throw error;
  await db.ingredients.bulkUpdate(
    rows.map((r) => ({ key: r.ingredient_id, changes: { synced: true } }))
  );
}

async function pushUnsyncedIngredientStock() {
  const rows = await db.ingredientStock.filter((s) => s.synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('ingredient_stock').upsert(rows.map(ingredientStockToRow));
  if (error) throw error;
  await db.ingredientStock.bulkUpdate(
    rows.map((r) => ({ key: [r.branch_id, r.ingredient_id], changes: { synced: true } }))
  );
}

async function pushUnsyncedUsers() {
  const rows = await db.users.filter((u) => u.synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('users').upsert(rows.map(userToRow));
  if (error) throw error;
  await db.users.bulkUpdate(rows.map((r) => ({ key: r.user_id, changes: { synced: true } })));
}

async function pushUnsyncedRecipes() {
  const rows = await db.recipes.filter((r) => r.synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('recipes').upsert(rows.map(recipeToRow));
  if (error) throw error;
  await db.recipes.bulkUpdate(
    rows.map((r) => ({ key: [r.dish_name, r.ingredient_id], changes: { synced: true } }))
  );
}

async function pushUnsyncedAssets() {
  const rows = await db.fixedAssets.filter((a) => a.synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('fixed_assets').upsert(rows.map(assetToRow));
  if (error) throw error;
  await db.fixedAssets.bulkUpdate(rows.map((r) => ({ key: r.asset_id, changes: { synced: true } })));
}

async function pushUnsyncedSalesTargets() {
  const rows = await db.salesTargets.filter((t) => t.synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('sales_targets').upsert(rows.map(salesTargetToRow));
  if (error) throw error;
  await db.salesTargets.bulkUpdate(rows.map((r) => ({ key: r.target_id, changes: { synced: true } })));
}

async function pushUnsyncedSupplies() {
  const rows = await db.supplies.filter((s) => s.synced === false).toArray();
  if (rows.length === 0) return;
  const { error } = await supabase.from('supplies').upsert(rows.map(supplyToRow));
  if (error) throw error;
  await db.supplies.bulkUpdate(rows.map((r) => ({ key: r.supply_id, changes: { synced: true } })));
}

/** Push every table's pending local changes up to Supabase. */
export async function pushAll() {
  if (!isSupabaseConfigured) return;
  await Promise.all([
    pushUnsyncedBranches(),
    pushUnsyncedOrders(),
    pushUnsyncedWaste(),
    pushUnsyncedLedgers(),
    pushUnsyncedIngredients(),
    pushUnsyncedIngredientStock(),
    pushUnsyncedUsers(),
    pushUnsyncedRecipes(),
    pushUnsyncedAssets(),
    pushUnsyncedSalesTargets(),
    pushUnsyncedSupplies(),
  ]);
}

// ---------------------------------------------------------------------------
// Deletes — Dexie tables don't queue offline deletes, so these push straight
// to Supabase. Every one of these returns a boolean: the caller MUST await
// it and only delete the local Dexie row on `true`. Deleting locally first
// and firing the remote delete without awaiting it (the old pattern here)
// hides real failures — e.g. a blocked foreign key — from the user: the row
// vanishes from the screen but is still on the server, then reappears the
// next time this device pulls. If the device is offline when a delete
// happens, other devices won't see it until this is called again while
// online (no retry queue yet) — surface that to the user too.
// ---------------------------------------------------------------------------

export async function deleteUserRemote(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true; // nothing to sync, just do the local delete
  if (!navigator.onLine) return false;
  const { error } = await supabase.from('users').delete().eq('user_id', userId);
  if (error) {
    console.error('[Garomax] delete user remote error', error);
    return false;
  }
  return true;
}

export async function deleteIngredientRemote(ingredientId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  if (!navigator.onLine) return false;
  // ingredient_stock rows cascade-delete in Postgres (on delete cascade), so
  // only the definition row needs an explicit delete here.
  const { error } = await supabase.from('ingredients').delete().eq('ingredient_id', ingredientId);
  if (error) {
    console.error('[Garomax] delete ingredient remote error', error);
    return false;
  }
  return true;
}

export async function deleteRecipeDishRemote(dishName: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  if (!navigator.onLine) return false;
  const { error } = await supabase.from('recipes').delete().eq('dish_name', dishName);
  if (error) {
    console.error('[Garomax] delete dish remote error', error);
    return false;
  }
  return true;
}

export async function deleteRecipeLineRemote(dishName: string, ingredientId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  if (!navigator.onLine) return false;
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('dish_name', dishName)
    .eq('ingredient_id', ingredientId);
  if (error) {
    console.error('[Garomax] delete recipe line remote error', error);
    return false;
  }
  return true;
}

export async function deleteAssetRemote(assetId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  if (!navigator.onLine) return false;
  const { error } = await supabase.from('fixed_assets').delete().eq('asset_id', assetId);
  if (error) {
    console.error('[Garomax] delete asset remote error', error);
    return false;
  }
  return true;
}

export async function deleteBranchRemote(branchId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  if (!navigator.onLine) return false;
  const { error } = await supabase.from('branches').delete().eq('branch_id', branchId);
  if (error) {
    console.error('[Garomax] delete branch remote error', error);
    return false;
  }
  return true;
}

export async function deleteSupplyRemote(supplyId: string): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  if (!navigator.onLine) return false;
  const { error } = await supabase.from('supplies').delete().eq('supply_id', supplyId);
  if (error) {
    console.error('[Garomax] delete supply remote error', error);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Pull: bring remote rows down into Dexie (used on startup and via realtime).
// Every device pulls every branch — see the note at the top of this file.
// ---------------------------------------------------------------------------

async function pullAll() {
  const [branches, users, ingredients, ingredientStock, recipes, orders, waste, ledgers, assets, targets, supplies] = await Promise.all([
    supabase.from('branches').select('*'),
    supabase.from('users').select('*'),
    supabase.from('ingredients').select('*'),
    supabase.from('ingredient_stock').select('*'),
    supabase.from('recipes').select('*'),
    supabase.from('orders').select('*'),
    supabase.from('waste_logs').select('*'),
    supabase.from('staff_ledgers').select('*'),
    supabase.from('fixed_assets').select('*'),
    supabase.from('sales_targets').select('*'),
    supabase.from('supplies').select('*'),
  ]);

  if (branches.data?.length) await db.branches.bulkPut(branches.data.map(branchFromRow));
  if (users.data?.length) await db.users.bulkPut(users.data.map(userFromRow));
  if (ingredients.data?.length) await db.ingredients.bulkPut(ingredients.data.map(ingredientFromRow));
  if (ingredientStock.data?.length) await db.ingredientStock.bulkPut(ingredientStock.data.map(ingredientStockFromRow));
  if (recipes.data?.length) await db.recipes.bulkPut(recipes.data.map(recipeFromRow));
  if (orders.data?.length) await db.orders.bulkPut(orders.data.map(orderFromRow));
  if (waste.data?.length) await db.wasteLogs.bulkPut(waste.data.map(wasteFromRow));
  if (ledgers.data?.length) await db.staffLedgers.bulkPut(ledgers.data.map(ledgerFromRow));
  if (assets.data?.length) await db.fixedAssets.bulkPut(assets.data.map(assetFromRow));
  if (targets.data?.length) await db.salesTargets.bulkPut(targets.data.map(salesTargetFromRow));
  if (supplies.data?.length) await db.supplies.bulkPut(supplies.data.map(supplyFromRow));
}

// ---------------------------------------------------------------------------
// Realtime: keep every open device's Dexie in step with Supabase as changes
// land from any other device (waiter tablet, kitchen screen, admin phone).
// ---------------------------------------------------------------------------

function subscribeRealtime() {
  const channel = supabase.channel('garomax-sync');

  channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'branches' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.branch_id) db.branches.delete(payload.old.branch_id);
        return;
      }
      db.branches.put(branchFromRow(payload.new));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.order_id) db.orders.delete(payload.old.order_id);
        return;
      }
      db.orders.put(orderFromRow(payload.new));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredients' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.ingredient_id) db.ingredients.delete(payload.old.ingredient_id);
        return;
      }
      db.ingredients.put(ingredientFromRow(payload.new));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ingredient_stock' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.branch_id && payload.old?.ingredient_id) {
          db.ingredientStock.delete([payload.old.branch_id, payload.old.ingredient_id]);
        }
        return;
      }
      db.ingredientStock.put(ingredientStockFromRow(payload.new));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'waste_logs' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.waste_id) db.wasteLogs.delete(payload.old.waste_id);
        return;
      }
      db.wasteLogs.put(wasteFromRow(payload.new));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_ledgers' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.ledger_id) db.staffLedgers.delete(payload.old.ledger_id);
        return;
      }
      db.staffLedgers.put(ledgerFromRow(payload.new));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.user_id) db.users.delete(payload.old.user_id);
        return;
      }
      db.users.put(userFromRow(payload.new));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.dish_name && payload.old?.ingredient_id) {
          db.recipes.delete([payload.old.dish_name, payload.old.ingredient_id]);
        }
        return;
      }
      db.recipes.put(recipeFromRow(payload.new));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'fixed_assets' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.asset_id) db.fixedAssets.delete(payload.old.asset_id);
        return;
      }
      db.fixedAssets.put(assetFromRow(payload.new));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_targets' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.target_id) db.salesTargets.delete(payload.old.target_id);
        return;
      }
      db.salesTargets.put(salesTargetFromRow(payload.new));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'supplies' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        if (payload.old?.supply_id) db.supplies.delete(payload.old.supply_id);
        return;
      }
      db.supplies.put(supplyFromRow(payload.new));
    })
    .subscribe();

  return channel;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

let started = false;
let pushTimer: ReturnType<typeof setInterval> | null = null;

/** Call once on app startup. No-ops safely if Supabase env vars aren't set. */
export async function startSync() {
  if (started) return;
  started = true;

  if (!isSupabaseConfigured) {
    setStatus('offline');
    return;
  }

  const runSync = async () => {
    if (!navigator.onLine) {
      setStatus('offline');
      return;
    }
    try {
      setStatus('syncing');
      await pushAll();
      lastSync = new Date();
      setStatus('synced');
    } catch (err) {
      console.error('[Garomax] sync error', err);
      setStatus('error');
    }
  };

  try {
    setStatus('syncing');
    // Pull first: hydrate this device from Supabase (the source of truth)
    // before pushing anything local up. Pushing first would let a device
    // with stale or freshly-seeded local data overwrite what other devices
    // already deleted or changed.
    await pullAll();
    await pushAll();
    lastSync = new Date();
    setStatus('synced');
  } catch (err) {
    console.error('[Garomax] initial sync error', err);
    setStatus('error');
  }

  subscribeRealtime();

  // Safety-net push loop, in case a page write happens without calling
  // requestSync() directly (e.g. future code paths).
  pushTimer = setInterval(runSync, 5000);
  window.addEventListener('online', runSync);
  window.addEventListener('offline', () => setStatus('offline'));
}

/** Call after any local write for a near-instant push instead of waiting on the interval. */
export function requestSync() {
  if (!isSupabaseConfigured || !navigator.onLine) return;
  pushAll()
    .then(() => {
      lastSync = new Date();
      setStatus('synced');
    })
    .catch((err) => {
      console.error('[Garomax] push error', err);
      setStatus('error');
    });
}

export function stopSync() {
  if (pushTimer) clearInterval(pushTimer);
  started = false;
}