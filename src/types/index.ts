export type UserRole = 'superadmin' | 'admin' | 'cook' | 'waiter';

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
export interface Ingredient {
  ingredient_id: string;
  name: string;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs';
  synced?: boolean;
}

// Per-branch stock level for a shared ingredient.
export interface IngredientStock {
  branch_id: string;
  ingredient_id: string;
  quantity_on_hand: number;
  last_purchase_cost: number;
  low_stock_threshold: number;
  synced?: boolean;
}

// Menu is shared across branches — unchanged from the single-branch schema.
export interface RecipeItem {
  dish_name: string;
  selling_price: number;
  ingredient_id: string;
  quantity_per_plate: number;
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

export type PaymentStatus = 'active' | 'paid' | 'credit' | 'unpaid_loss';
export type PaymentMethod = 'cash' | 'mpesa' | 'credit';
export type KitchenStatus = 'queued' | 'ready';

export interface OrderItem {
  dish_name: string;
  quantity: number;
  unit_price: number;
  selected_modifiers?: string[];
}

export interface Order {
  order_id: string;
  branch_id: string;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  mpesa_code?: string;
  kitchen_status: KitchenStatus;
  items: OrderItem[];
  total_amount: number;
  placed_by_waiter_id: string;
  confirmed_by_cook_id?: string;
  timestamp: string;
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