export type UserRole = 'admin' | 'cook' | 'waiter';

export interface User {
  user_id: string;
  name: string;
  role: UserRole;
  pin_code: string;
  active_shift: boolean;
  basic_salary: number;
}

export interface Ingredient {
  ingredient_id: string;
  name: string;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs';
  quantity_on_hand: number;
  last_purchase_cost: number;
  low_stock_threshold: number;
  synced?: boolean;
}

export interface RecipeItem {
  dish_name: string;
  selling_price: number;
  ingredient_id: string;
  quantity_per_plate: number;
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
  staff_id: string;
  date: string;
  shortage_amount: number;
  spoilage_cost: number;
  reason: string;
  payroll_deduction_status: 'pending' | 'deducted' | 'waived';
  synced?: boolean;
}