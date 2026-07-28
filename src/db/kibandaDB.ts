import Dexie, { type Table } from 'dexie';
import type { User, Ingredient, RecipeItem, Order, WasteLog, StaffLedger } from '../types';

export class KibandaDatabase extends Dexie {
  users!: Table<User>;
  ingredients!: Table<Ingredient>;
  recipes!: Table<RecipeItem>;
  orders!: Table<Order>;
  wasteLogs!: Table<WasteLog>;
  staffLedgers!: Table<StaffLedger>;

  constructor() {
    super('GaromaxBitesDB');
    
    this.version(1).stores({
      users: 'user_id, pin_code, role',
      ingredients: 'ingredient_id, name',
      recipes: '[dish_name+ingredient_id], dish_name, ingredient_id',
      orders: 'order_id, payment_status, placed_by_waiter_id, timestamp, synced',
      wasteLogs: 'waste_id, logged_by_cook_id, timestamp, synced',
      staffLedgers: 'ledger_id, staff_id, date, synced'
    });

    // v2: kitchen prep status is now tracked separately from payment status,
    // so "mark prepared" in the kitchen no longer closes the waiter's bill.
    this.version(2).stores({
      orders: 'order_id, payment_status, kitchen_status, placed_by_waiter_id, timestamp, synced',
    }).upgrade(async (tx) => {
      await tx.table('orders').toCollection().modify((order) => {
        if (!order.kitchen_status) {
          // Best-effort backfill: orders already marked paid under the old
          // logic were also implicitly "prepared", so treat them as ready.
          order.kitchen_status = order.payment_status === 'active' ? 'queued' : 'ready';
        }
      });
    });

    // v3: staff now have a basic salary so payroll can be computed
    // automatically instead of an admin doing the maths by hand.
    this.version(3).stores({
      users: 'user_id, pin_code, role',
    }).upgrade(async (tx) => {
      await tx.table('users').toCollection().modify((user) => {
        if (user.basic_salary === undefined) {
          user.basic_salary = 0;
        }
      });
    });

    // v4: users and recipes now track `synced` like every other table, so a
    // device only ever pushes rows it actually changed instead of blindly
    // re-uploading its whole local copy of these tables on every sync tick
    // (that pattern is what let a stale/reseeded device resurrect staff
    // another device had deleted). Existing local rows are treated as
    // already-synced baseline data, not new local edits.
    this.version(4).stores({
      users: 'user_id, pin_code, role, synced',
      recipes: '[dish_name+ingredient_id], dish_name, ingredient_id, synced',
    }).upgrade(async (tx) => {
      await tx.table('users').toCollection().modify((user) => {
        if (user.synced === undefined) user.synced = true;
      });
      await tx.table('recipes').toCollection().modify((recipe) => {
        if (recipe.synced === undefined) recipe.synced = true;
      });
    });
  }
}

export const db = new KibandaDatabase();