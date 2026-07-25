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
  }
}

export const db = new KibandaDatabase();