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

-- RLS: enabled with permissive policies for now, since staff auth is PIN-based (not Supabase Auth)
-- and every device shares one anon key. This is fine for a single-location internal tool but is
-- NOT safe if the anon key could ever be exposed to the public internet without restriction —
-- tighten this later if you add real user accounts.
alter table users enable row level security;
alter table ingredients enable row level security;
alter table recipes enable row level security;
alter table orders enable row level security;
alter table waste_logs enable row level security;
alter table staff_ledgers enable row level security;

create policy "allow all - users" on users for all using (true) with check (true);
create policy "allow all - ingredients" on ingredients for all using (true) with check (true);
create policy "allow all - recipes" on recipes for all using (true) with check (true);
create policy "allow all - orders" on orders for all using (true) with check (true);
create policy "allow all - waste_logs" on waste_logs for all using (true) with check (true);
create policy "allow all - staff_ledgers" on staff_ledgers for all using (true) with check (true);