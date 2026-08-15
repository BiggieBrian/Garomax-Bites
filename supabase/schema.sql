-- Garomax Bites — Supabase schema (multi-branch)
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query)

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
create table if not exists branches (
  branch_id text primary key,
  name text not null,
  location text
);

-- ---------------------------------------------------------------------------
-- Users — staff are fixed to one branch. superadmin is the exception: no
-- branch_id, sees/manages across every branch.
-- ---------------------------------------------------------------------------
create table if not exists users (
  user_id text primary key,
  name text not null,
  role text not null check (role in ('superadmin', 'admin', 'cook', 'waiter')),
  pin_code text not null,
  active_shift boolean not null default true,
  basic_salary numeric not null default 0,
  branch_id text references branches(branch_id),
  constraint users_branch_required check (
    (role = 'superadmin' and branch_id is null)
    or (role != 'superadmin' and branch_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- Ingredients — shared identity only (name, unit). A recipe references one
-- ingredient_id regardless of which branch is cooking it. Stock levels live
-- separately, per branch, in ingredient_stock below.
-- ---------------------------------------------------------------------------
create table if not exists ingredients (
  ingredient_id text primary key,
  name text not null,
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'pcs')),
  bag_unit_label text -- what one bag actually is, e.g. "2kg packet", "1 chicken"
);

-- Shared "untracked" placeholder — dishes like tea/coffee point their one
-- recipe line at this instead of a real ingredient, so they can exist and
-- sell with no stock tracking at all. See UNTRACKED_INGREDIENT_ID in
-- StockMenuManager.tsx.
insert into ingredients (ingredient_id, name, unit, bag_unit_label)
values ('__untracked__', 'No Ingredient (Untracked Dish)', 'pcs', null)
on conflict (ingredient_id) do nothing;

create table if not exists ingredient_stock (
  branch_id text not null references branches(branch_id),
  ingredient_id text not null references ingredients(ingredient_id) on delete cascade,
  quantity_on_hand numeric not null default 0,
  last_purchase_cost numeric not null default 0,
  low_stock_threshold numeric not null default 0,
  primary key (branch_id, ingredient_id)
);

-- ---------------------------------------------------------------------------
-- Recipes — the menu. Shared across branches by design (both restaurants
-- sell the same dishes at the same price), so no branch_id here.
-- ---------------------------------------------------------------------------
create table if not exists recipes (
  dish_name text not null,
  ingredient_id text not null references ingredients(ingredient_id) on delete cascade,
  selling_price numeric not null,
  servings_per_bag numeric, -- one bag/unit of this ingredient yields N plates; optional while yield data is collected
  category text not null default 'meals' check (category in ('drinks', 'snacks', 'meals')),
  primary key (dish_name, ingredient_id)
);

-- ---------------------------------------------------------------------------
-- Transactional tables — each row happened at a specific branch.
-- ---------------------------------------------------------------------------
create table if not exists orders (
  order_id text primary key,
  branch_id text not null references branches(branch_id),
  payment_status text not null check (payment_status in ('active', 'paid', 'credit', 'unpaid_loss')),
  payment_method text check (payment_method in ('cash', 'mpesa', 'credit')),
  mpesa_code text,
  kitchen_status text not null default 'queued' check (kitchen_status in ('queued', 'ready')),
  items jsonb not null,
  total_amount numeric not null,
  placed_by_waiter_id text not null references users(user_id),
  confirmed_by_cook_id text references users(user_id),
  ts timestamptz not null
);

create table if not exists waste_logs (
  waste_id text primary key,
  branch_id text not null references branches(branch_id),
  dish_or_ingredient text not null,
  quantity numeric not null,
  reason text not null check (reason in ('burnt_overcooked', 'spilled_dropped', 'spoiled_raw')),
  logged_by_cook_id text not null references users(user_id),
  deduction_flag boolean not null default false,
  ts timestamptz not null
);

create table if not exists staff_ledgers (
  ledger_id text primary key,
  branch_id text not null references branches(branch_id),
  staff_id text not null references users(user_id),
  date timestamptz not null,
  shortage_amount numeric not null default 0,
  spoilage_cost numeric not null default 0,
  reason text not null,
  payroll_deduction_status text not null check (payroll_deduction_status in ('pending', 'deducted', 'waived'))
);

-- ---------------------------------------------------------------------------
-- Fixed assets — tables, chairs, sufurias, cups, spoons. Belongs to exactly
-- one branch.
-- ---------------------------------------------------------------------------
create table if not exists fixed_assets (
  asset_id text primary key,
  branch_id text not null references branches(branch_id),
  name text not null,
  category text not null check (category in ('furniture', 'kitchenware', 'cutlery', 'electronics', 'other')),
  quantity numeric not null,
  unit_cost numeric,
  condition text not null check (condition in ('good', 'fair', 'damaged', 'lost')),
  notes text
);

-- ---------------------------------------------------------------------------
-- Sales targets — branch_id null means a company-wide target.
-- ---------------------------------------------------------------------------
create table if not exists sales_targets (
  target_id text primary key,
  branch_id text references branches(branch_id),
  period_type text not null check (period_type in ('daily', 'weekly', 'monthly')),
  start_date date not null,
  end_date date not null,
  target_amount numeric not null,
  set_by_user_id text not null references users(user_id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Supplies — "untrackable" consumables tracked by restock cadence, not count.
-- ---------------------------------------------------------------------------
create table if not exists supplies (
  supply_id text primary key,
  branch_id text not null references branches(branch_id),
  name text not null,
  unit_label text not null,
  restock_interval_days numeric not null,
  last_restocked_at timestamptz,
  last_restock_cost numeric,
  last_restock_quantity text, -- free text, e.g. "10kg" — amount bought varies restock to restock
  notes text
);

-- ---------------------------------------------------------------------------
-- Monthly profit rollup — one row per branch per month. Cheaper to query
-- from a view than to recompute in the app every time the Overview tab loads.
-- COGS is estimated from recipe ingredient quantities × current stock cost,
-- which is an approximation (it uses today's cost, not the cost at the time
-- each order was placed) — good enough for a monthly P&L glance, flag if the
-- owner wants historical-cost accuracy instead, that needs cost captured on
-- the order itself.
-- ---------------------------------------------------------------------------
create or replace view monthly_branch_stats as
with base as (
  select
    o.order_id,
    o.branch_id,
    date_trunc('month', o.ts) as month,
    o.payment_status,
    o.total_amount
  from orders o
)
select
  b.branch_id,
  b.month,
  sum(b.total_amount) filter (where b.payment_status = 'paid') as revenue,
  coalesce((
    select sum(oi.quantity * s.last_purchase_cost / nullif(r.servings_per_bag, 0))
    from orders o2
    cross join lateral jsonb_to_recordset(o2.items) as oi(dish_name text, quantity numeric)
    join recipes r on r.dish_name = oi.dish_name
    join ingredient_stock s on s.ingredient_id = r.ingredient_id and s.branch_id = o2.branch_id
    where o2.branch_id = b.branch_id
      and date_trunc('month', o2.ts) = b.month
      and o2.payment_status = 'paid'
      and r.servings_per_bag is not null
  ), 0) as cogs,
  coalesce((
    select sum(w.quantity)
    from waste_logs w
    where w.branch_id = b.branch_id and date_trunc('month', w.ts) = b.month
  ), 0) as waste_units,
  coalesce((
    select sum(u.basic_salary)
    from users u
    where u.branch_id = b.branch_id and u.active_shift = true
  ), 0) as monthly_payroll,
  coalesce((
    select sum(l.shortage_amount + l.spoilage_cost)
    from staff_ledgers l
    where l.branch_id = b.branch_id and date_trunc('month', l.date) = b.month
  ), 0) as shortages_and_spoilage_cost
from base b
group by b.branch_id, b.month;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  branches, users, ingredients, ingredient_stock, recipes, orders, waste_logs, staff_ledgers,
  fixed_assets, sales_targets, supplies;

-- ---------------------------------------------------------------------------
-- RLS — still permissive "allow all" for now, same reasoning as the single-
-- branch schema: staff auth is PIN-based, one shared anon key, one trusted
-- business. This is the piece that MUST change before this becomes a
-- multi-tenant product (see the notes from our last discussion) — at that
-- point these need to scope by a real per-session branch_id/business_id
-- claim instead of `using (true)`.
-- ---------------------------------------------------------------------------
alter table branches enable row level security;
alter table users enable row level security;
alter table ingredients enable row level security;
alter table ingredient_stock enable row level security;
alter table recipes enable row level security;
alter table orders enable row level security;
alter table waste_logs enable row level security;
alter table staff_ledgers enable row level security;
alter table fixed_assets enable row level security;
alter table sales_targets enable row level security;
alter table supplies enable row level security;

create policy "allow all - branches" on branches for all using (true) with check (true);
create policy "allow all - users" on users for all using (true) with check (true);
create policy "allow all - ingredients" on ingredients for all using (true) with check (true);
create policy "allow all - ingredient_stock" on ingredient_stock for all using (true) with check (true);
create policy "allow all - recipes" on recipes for all using (true) with check (true);
create policy "allow all - orders" on orders for all using (true) with check (true);
create policy "allow all - waste_logs" on waste_logs for all using (true) with check (true);
create policy "allow all - staff_ledgers" on staff_ledgers for all using (true) with check (true);
create policy "allow all - fixed_assets" on fixed_assets for all using (true) with check (true);
create policy "allow all - sales_targets" on sales_targets for all using (true) with check (true);
create policy "allow all - supplies" on supplies for all using (true) with check (true);