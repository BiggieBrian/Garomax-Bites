export type UserRole = 'superadmin' | 'admin' | 'cook' | 'waiter' | 'hybrid';

export interface Branch {
  branch_id: string;
  name: string;
  location?: string;
  synced?: boolean;
}

export interface User {
  user_id: string;
  name: string;
  role: UserRole;
  pin_code: string;
  active_shift: boolean;
  basic_salary: number;
  // null only for role === 'superadmin' — every other role belongs to exactly one branch.
  branch_id: string | null;
  synced?: boolean;
}

// Shared identity — same ingredient exists once no matter how many branches stock it.
// Stock is now tracked in "bags" (a restock unit the admin defines in plain
// language) rather than raw weight — `unit` stays as a fallback label for
// ingredients that haven't been given a bag definition yet.
export interface Ingredient {
  ingredient_id: string;
  name: string;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs';
  bag_unit_label?: string; // what one bag actually is, e.g. "2kg packet", "1 chicken", "1 gorogoro bucket"
  synced?: boolean;
}

// Per-branch stock level for a shared ingredient. `quantity_on_hand` is now a
// bag count (can be fractional, e.g. 2.4 bags left) rather than a raw
// weight, and `last_purchase_cost` is the cost of one whole bag — updated at
// each restock rather than fixed once, since bag price/size can vary
// (see Potatoes: "1 gunia, var dep on size").
export interface IngredientStock {
  branch_id: string;
  ingredient_id: string;
  quantity_on_hand: number;
  last_purchase_cost: number;
  low_stock_threshold: number;
  synced?: boolean;
}

export type DishCategory = 'drinks' | 'snacks' | 'meals';

// Menu is shared across branches — unchanged from the single-branch schema.
// `servings_per_bag` replaces the old exact-weight `quantity_per_plate`:
// "one bag of this ingredient makes N plates of this dish." Optional/blank
// while the real yield numbers are still being collected — see the
// skip-and-flag handling in KitchenDisplay.tsx and StockMenuManager.tsx.
export interface RecipeItem {
  dish_name: string;
  selling_price: number;
  ingredient_id: string;
  servings_per_bag?: number;
  category: DishCategory;
  synced?: boolean;
}

export type AssetCategory = 'furniture' | 'kitchenware' | 'cutlery' | 'electronics' | 'other';
export type AssetCondition = 'good' | 'fair' | 'damaged' | 'lost';

// Fixed assets — tables, chairs, sufurias, cups, spoons. Unlike Ingredient,
// there's no shared-identity split: a physical chair belongs to exactly one
// branch, so branch_id lives directly on the row.
export interface FixedAsset {
  asset_id: string;
  branch_id: string;
  name: string;
  category: AssetCategory;
  quantity: number;
  unit_cost?: number;
  condition: AssetCondition;
  notes?: string;
  synced?: boolean;
}

export type PaymentStatus = 'active' | 'paid' | 'credit' | 'unpaid_loss' | 'cancelled';
export type PaymentMethod = 'cash' | 'mpesa' | 'credit' | 'split';
export type KitchenStatus = 'queued' | 'ready';

export interface OrderItem {
  dish_name: string;
  quantity: number;
  unit_price: number;
  selected_modifiers?: string[];
}

// Amounts collected per method for a single order. Only used when
// payment_method === 'split' — a bill paid entirely in one method still
// just uses payment_method directly, no splits object needed. `credit`
// here means "still outstanding," not "collected as credit" — once that
// portion is later collected (AdminDashboard's Credit/Tabs), it moves out
// of `credit` and into whichever method actually collected it.
export interface PaymentSplit {
  cash?: number;
  mpesa?: number;
  credit?: number;
}

export interface Order {
  order_id: string;
  branch_id: string;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  payment_splits?: PaymentSplit;
  mpesa_code?: string;
  kitchen_status: KitchenStatus;
  items: OrderItem[];
  total_amount: number;
  placed_by_waiter_id: string;
  confirmed_by_cook_id?: string;
  timestamp: string;
  // Cancellation is admin-only (see AdminDashboard.tsx) — a waiter can never
  // set payment_status to 'cancelled' themselves. These two fields exist so
  // a cancelled order still has an audit trail: who cancelled it, and why.
  cancelled_by_admin_id?: string;
  cancel_reason?: string;
  // True when the same hybrid-role account both placed and confirmed this
  // order — see the self-confirmation warning in KitchenDisplay.tsx. Only
  // ever set on hybrid accounts; a plain cook confirming someone else's
  // order is the normal flow and never sets this.
  self_confirmed?: boolean;
  synced?: boolean;
}

export type WasteReason = 'burnt_overcooked' | 'spilled_dropped' | 'spoiled_raw';

export interface WasteLog {
  waste_id: string;
  branch_id: string;
  dish_or_ingredient: string;
  quantity: number;
  reason: WasteReason;
  logged_by_cook_id: string;
  deduction_flag: boolean;
  timestamp: string;
  synced?: boolean;
}

export interface StaffLedger {
  ledger_id: string;
  branch_id: string;
  staff_id: string;
  date: string;
  shortage_amount: number;
  spoilage_cost: number;
  reason: string;
  payroll_deduction_status: 'pending' | 'deducted' | 'waived';
  synced?: boolean;
}

// "Untrackable" consumables — oil, onions, tomatoes, gas, water — that don't
// map to a dish in exact portions. Tracked by restock cadence instead of
// stock count: admin taps "Mark Restocked" when they buy more, the app just
// watches the calendar against the expected interval.
export interface Supply {
  supply_id: string;
  branch_id: string;
  name: string;
  unit_label: string; // free text, e.g. "5L jerrican", "13kg cylinder"
  restock_interval_days: number; // expected cadence; can be adjusted at each restock as buying patterns change
  last_restocked_at?: string; // ISO date of the most recent restock
  last_restock_cost?: number; // what that restock cost — feeds Expenses
  last_restock_quantity?: string; // free text, e.g. "10kg" — amount bought varies restock to restock
  notes?: string;
  synced?: boolean;
}

export type PeriodType = 'daily' | 'weekly' | 'monthly';

// A target the admin sets for a branch (or company-wide when branch_id is
// unset). Only one target per period_type per branch should be `active` at
// a time — creating a new one retires the old one instead of deleting it,
// so past targets stay around for actual-vs-target comparison.
export interface SalesTarget {
  target_id: string;
  branch_id: string | null;
  period_type: PeriodType;
  start_date: string; // 'YYYY-MM-DD'
  end_date: string; // 'YYYY-MM-DD'
  target_amount: number;
  set_by_user_id: string;
  active: boolean;
  created_at: string;
  synced?: boolean;
}

// One row per branch per month — mirrors the `monthly_branch_stats` SQL view,
// queried directly from Supabase for the SuperAdmin Overview tab (not stored
// locally in Dexie — this is a reporting view, not offline-first data).
export interface MonthlyBranchStats {
  branch_id: string;
  month: string; // first-of-month date, e.g. "2026-07-01"
  revenue: number;
  cogs: number;
  waste_units: number;
  monthly_payroll: number;
  shortages_and_spoilage_cost: number;
}