import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { db } from './kibandaDB';
import type {
  User,
  Ingredient,
  RecipeItem,
  Order,
  WasteLog,
  StaffLedger,
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
// ---------------------------------------------------------------------------

const orderToRow = (o: Order) => ({
  order_id: o.order_id,
  payment_status: o.payment_status,
  payment_method: o.payment_method ?? null,
  mpesa_code: o.mpesa_code ?? null,
  kitchen_status: o.kitchen_status,
  items: o.items,
  total_amount: o.total_amount,
  placed_by_waiter_id: o.placed_by_waiter_id,
  confirmed_by_cook_id: o.confirmed_by_cook_id ?? null,
  ts: o.timestamp,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const orderFromRow = (r: any): Order => ({
  order_id: r.order_id,
  payment_status: r.payment_status,
  payment_method: r.payment_method ?? undefined,
  mpesa_code: r.mpesa_code ?? undefined,
  kitchen_status: r.kitchen_status ?? 'queued',
  items: r.items,
  total_amount: r.total_amount,
  placed_by_waiter_id: r.placed_by_waiter_id,
  confirmed_by_cook_id: r.confirmed_by_cook_id ?? undefined,
  timestamp: r.ts,
  synced: true,
});

const wasteToRow = (w: WasteLog) => ({
  waste_id: w.waste_id,
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
  staff_id: r.staff_id,
  date: r.date,
  shortage_amount: r.shortage_amount,
  spoilage_cost: r.spoilage_cost,
  reason: r.reason,
  payroll_deduction_status: r.payroll_deduction_status,
  synced: true,
});

const ingredientToRow = (i: Ingredient) => ({
  ingredient_id: i.ingredient_id,
  name: i.name,
  unit: i.unit,
  quantity_on_hand: i.quantity_on_hand,
  last_purchase_cost: i.last_purchase_cost,
  low_stock_threshold: i.low_stock_threshold,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ingredientFromRow = (r: any): Ingredient => ({
  ingredient_id: r.ingredient_id,
  name: r.name,
  unit: r.unit,
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
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const userFromRow = (r: any): User => ({
  user_id: r.user_id,
  name: r.name,
  role: r.role,
  pin_code: r.pin_code,
  active_shift: r.active_shift,
  basic_salary: r.basic_salary ?? 0,
  synced: true,
});

const recipeToRow = (r: RecipeItem) => ({
  dish_name: r.dish_name,
  ingredient_id: r.ingredient_id,
  selling_price: r.selling_price,
  quantity_per_plate: r.quantity_per_plate,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const recipeFromRow = (r: any): RecipeItem => ({
  dish_name: r.dish_name,
  ingredient_id: r.ingredient_id,
  selling_price: r.selling_price,
  quantity_per_plate: r.quantity_per_plate,
  synced: true,
});

// ---------------------------------------------------------------------------
// Push: send local unsynced rows up to Supabase, then mark them synced.
// ---------------------------------------------------------------------------

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

/** Push every table's pending local changes up to Supabase. */
export async function pushAll() {
  if (!isSupabaseConfigured) return;
  await Promise.all([
    pushUnsyncedOrders(),
    pushUnsyncedWaste(),
    pushUnsyncedLedgers(),
    pushUnsyncedIngredients(),
    pushUnsyncedUsers(),
    pushUnsyncedRecipes(),
  ]);
}

// ---------------------------------------------------------------------------
// Deletes — Dexie tables don't queue offline deletes, so these push straight
// to Supabase. Call them right after the matching local db.<table>.delete().
// If the device is offline when a delete happens, other devices won't see it
// until this is called again while online (no retry queue yet).
// ---------------------------------------------------------------------------

export async function deleteUserRemote(userId: string) {
  if (!isSupabaseConfigured || !navigator.onLine) return;
  const { error } = await supabase.from('users').delete().eq('user_id', userId);
  if (error) console.error('[Garomax] delete user remote error', error);
}

export async function deleteIngredientRemote(ingredientId: string) {
  if (!isSupabaseConfigured || !navigator.onLine) return;
  const { error } = await supabase.from('ingredients').delete().eq('ingredient_id', ingredientId);
  if (error) console.error('[Garomax] delete ingredient remote error', error);
}

export async function deleteRecipeDishRemote(dishName: string) {
  if (!isSupabaseConfigured || !navigator.onLine) return;
  const { error } = await supabase.from('recipes').delete().eq('dish_name', dishName);
  if (error) console.error('[Garomax] delete dish remote error', error);
}

export async function deleteRecipeLineRemote(dishName: string, ingredientId: string) {
  if (!isSupabaseConfigured || !navigator.onLine) return;
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('dish_name', dishName)
    .eq('ingredient_id', ingredientId);
  if (error) console.error('[Garomax] delete recipe line remote error', error);
}

// ---------------------------------------------------------------------------
// Pull: bring remote rows down into Dexie (used on startup and via realtime).
// ---------------------------------------------------------------------------

async function pullAll() {
  const [users, ingredients, recipes, orders, waste, ledgers] = await Promise.all([
    supabase.from('users').select('*'),
    supabase.from('ingredients').select('*'),
    supabase.from('recipes').select('*'),
    supabase.from('orders').select('*'),
    supabase.from('waste_logs').select('*'),
    supabase.from('staff_ledgers').select('*'),
  ]);

  if (users.data?.length) await db.users.bulkPut(users.data.map(userFromRow));
  if (ingredients.data?.length) await db.ingredients.bulkPut(ingredients.data.map(ingredientFromRow));
  if (recipes.data?.length) await db.recipes.bulkPut(recipes.data.map(recipeFromRow));
  if (orders.data?.length) await db.orders.bulkPut(orders.data.map(orderFromRow));
  if (waste.data?.length) await db.wasteLogs.bulkPut(waste.data.map(wasteFromRow));
  if (ledgers.data?.length) await db.staffLedgers.bulkPut(ledgers.data.map(ledgerFromRow));
}

// ---------------------------------------------------------------------------
// Realtime: keep every open device's Dexie in step with Supabase as changes
// land from any other device (waiter tablet, kitchen screen, admin phone).
// ---------------------------------------------------------------------------

function subscribeRealtime() {
  const channel = supabase.channel('garomax-sync');

  channel
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