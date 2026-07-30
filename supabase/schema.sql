-- Garomax Bites — Supabase schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query)

create table if not exists users (
  user_id text primary key,
  name text not null,
  role text not null check (role in ('admin', 'cook', 'waiter')),
  pin_code text not null,
  active_shift boolean not null default true,
  basic_salary numeric not null default 0
);

create table if not exists ingredients (
  ingredient_id text primary key,
  name text not null,
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'pcs')),
  quantity_on_hand numeric not null default 0,
  last_purchase_cost numeric not null default 0,
  low_stock_threshold numeric not null default 0
);

create table if not exists recipes (
  dish_name text not null,
  ingredient_id text not null references ingredients(ingredient_id) on delete cascade,
  selling_price numeric not null,
  quantity_per_plate numeric not null,
  primary key (dish_name, ingredient_id)
);

create table if not exists orders (
  order_id text primary key,
  payment_status text not null check (payment_status in ('active', 'paid', 'credit', 'unpaid_loss')),
  payment_method text check (payment_method in ('cash', 'mpesa', 'credit')),
  mpesa_code text,
  items jsonb not null,
  total_amount numeric not null,
  placed_by_waiter_id text not null references users(user_id),
  confirmed_by_cook_id text references users(user_id),
  ts timestamptz not null
);

create table if not exists waste_logs (
  waste_id text primary key,
  dish_or_ingredient text not null,
  quantity numeric not null,
  reason text not null check (reason in ('burnt_overcooked', 'spilled_dropped', 'spoiled_raw')),
  logged_by_cook_id text not null references users(user_id),
  deduction_flag boolean not null default false,
  ts timestamptz not null
);

create table if not exists staff_ledgers (
  ledger_id text primary key,
  staff_id text not null references users(user_id),
  date timestamptz not null,
  shortage_amount numeric not null default 0,
  spoilage_cost numeric not null default 0,
  reason text not null,
  payroll_deduction_status text not null check (payroll_deduction_status in ('pending', 'deducted', 'waived'))
);

-- Realtime: let all clients subscribe to row-level changes for cross-device sync
alter publication supabase_realtime add table orders, ingredients, waste_logs, staff_ledgers, users, recipes;

-- RLS: enabled with policies scoped to what the app actually does to each
-- table (checked against the client code). Staff auth is PIN-based, not
-- Supabase Auth, and every device shares one anon key — see the note in
-- supabase/migrations_tighten_rls.sql for the honest limitation this implies
-- for the `users` table specifically (offline PIN login needs every device
-- to read every user's PIN, which real per-user RLS can't restrict without
-- moving to real Supabase Auth). Orders, waste logs, and payroll ledger
-- entries are never deleted by the app, so DELETE is withheld on those.
alter table users enable row level security;
alter table ingredients enable row level security;
alter table recipes enable row level security;
alter table orders enable row level security;
alter table waste_logs enable row level security;
alter table staff_ledgers enable row level security;

create policy "users_select" on users for select using (true);
create policy "users_insert" on users for insert with check (true);
create policy "users_update" on users for update using (true) with check (true);
create policy "users_delete" on users for delete using (true);

create policy "ingredients_select" on ingredients for select using (true);
create policy "ingredients_insert" on ingredients for insert with check (true);
create policy "ingredients_update" on ingredients for update using (true) with check (true);
create policy "ingredients_delete" on ingredients for delete using (true);

create policy "recipes_select" on recipes for select using (true);
create policy "recipes_insert" on recipes for insert with check (true);
create policy "recipes_update" on recipes for update using (true) with check (true);
create policy "recipes_delete" on recipes for delete using (true);

create policy "orders_select" on orders for select using (true);
create policy "orders_insert" on orders for insert with check (true);
create policy "orders_update" on orders for update using (true) with check (true);

create policy "waste_logs_select" on waste_logs for select using (true);
create policy "waste_logs_insert" on waste_logs for insert with check (true);

create policy "staff_ledgers_select" on staff_ledgers for select using (true);
create policy "staff_ledgers_insert" on staff_ledgers for insert with check (true);
create policy "staff_ledgers_update" on staff_ledgers for update using (true) with check (true);