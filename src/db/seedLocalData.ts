import { db } from './kibandaDB';
import { isSupabaseConfigured } from '../lib/supabase';

/**
 * Seeds demo data into a brand-new local database — but ONLY when this
 * device has no backend configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * unset), i.e. pure local-only/demo mode.
 *
 * This used to run on every device unconditionally, keyed off `db.users.count()
 * === 0`. That's exactly the condition a device hits after a fresh install, a
 * cleared browser/PWA cache, or (commonly on iOS Safari/PWAs) IndexedDB being
 * cleared automatically after a period of inactivity. When that happened on a
 * device that WAS connected to Supabase, it would recreate demo staff with
 * fixed IDs and push them straight back up to the shared database — silently
 * undoing a deletion an admin made on a totally different device, sometimes
 * hours earlier.
 *
 * With a real backend configured, a fresh device should always pull its
 * starting state from Supabase (see startSync in ./sync). A real deployment
 * gets its first branch and its superadmin account created through the app
 * itself — see BranchManager — never invented here.
 */
export async function seedInitialData() {
  if (isSupabaseConfigured) return;

  const userCount = await db.users.count();
  if (userCount === 0) {
    // Seed one demo branch
    await db.branches.bulkAdd([{ branch_id: 'main', name: 'Garomax Bites — Demo Branch', location: 'Nairobi' }]);

    // Seed default staff — one per role, all pinned to the demo branch
    // except the superadmin, who oversees every branch and belongs to none.
    await db.users.bulkAdd([
      { user_id: '0', name: 'Garomax Owner', role: 'superadmin', pin_code: '9999', active_shift: true, basic_salary: 0, branch_id: null },
      { user_id: '1', name: 'Branch Admin', role: 'admin', pin_code: '0000', active_shift: true, basic_salary: 0, branch_id: 'main' },
      { user_id: '2', name: 'Chef James', role: 'cook', pin_code: '1111', active_shift: true, basic_salary: 15000, branch_id: 'main' },
      { user_id: '3', name: 'Waitstaff Mary', role: 'waiter', pin_code: '2222', active_shift: true, basic_salary: 12000, branch_id: 'main' },
    ]);

    // Seed default ingredients — shared definition ...
    await db.ingredients.bulkAdd([
      { ingredient_id: 'i1', name: 'Unga (Maize Flour)', unit: 'kg' },
      { ingredient_id: 'i2', name: 'Potatoes (Viazi)', unit: 'kg' },
      { ingredient_id: 'i3', name: 'Cooking Oil', unit: 'l' },
    ]);

    // ... plus per-branch stock levels for the one demo branch.
    await db.ingredientStock.bulkAdd([
      { branch_id: 'main', ingredient_id: 'i1', quantity_on_hand: 25, last_purchase_cost: 150, low_stock_threshold: 5 },
      { branch_id: 'main', ingredient_id: 'i2', quantity_on_hand: 40, last_purchase_cost: 100, low_stock_threshold: 10 },
      { branch_id: 'main', ingredient_id: 'i3', quantity_on_hand: 15, last_purchase_cost: 250, low_stock_threshold: 3 },
    ]);

    // Seed default recipes — shared menu, same at every branch.
    // `servings_per_bag`: "one bag/unit of this ingredient makes N plates."
    await db.recipes.bulkAdd([
      { dish_name: 'Ugali', selling_price: 50, ingredient_id: 'i1', servings_per_bag: 5, category: 'meals' },
      { dish_name: 'Chips', selling_price: 120, ingredient_id: 'i2', servings_per_bag: 3, category: 'meals' },
      { dish_name: 'Chips', selling_price: 120, ingredient_id: 'i3', servings_per_bag: 20, category: 'meals' },
    ]);

    console.log('Garomax Bites local IndexedDB seeded (local-only demo mode).');
  }
}