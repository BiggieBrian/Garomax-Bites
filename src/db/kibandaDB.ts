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
  }
}

export const db = new KibandaDatabase();