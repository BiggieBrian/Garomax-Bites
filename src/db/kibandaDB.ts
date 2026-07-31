import Dexie, { type Table } from 'dexie';
import type {
  User,
  Branch,
  Ingredient,
  IngredientStock,
  RecipeItem,
  Order,
  WasteLog,
  StaffLedger,
  FixedAsset,
} from '../types';

export class KibandaDatabase extends Dexie {
  users!: Table<User>;
  branches!: Table<Branch>;
  ingredients!: Table<Ingredient>;
  ingredientStock!: Table<IngredientStock>;
  recipes!: Table<RecipeItem>;
  orders!: Table<Order>;
  wasteLogs!: Table<WasteLog>;
  staffLedgers!: Table<StaffLedger>;
  fixedAssets!: Table<FixedAsset>;

  constructor() {
    super('GaromaxBitesDB');

    this.version(1).stores({
      users: 'user_id, pin_code, role',
      ingredients: 'ingredient_id, name',
      recipes: '[dish_name+ingredient_id], dish_name, ingredient_id',
      orders: 'order_id, payment_status, placed_by_waiter_id, timestamp, synced',
      wasteLogs: 'waste_id, logged_by_cook_id, timestamp, synced',
      staffLedgers: 'ledger_id, staff_id, date, synced',
    });

    this.version(2).stores({
      orders: 'order_id, payment_status, kitchen_status, placed_by_waiter_id, timestamp, synced',
    }).upgrade(async (tx) => {
      await tx.table('orders').toCollection().modify((order) => {
        if (!order.kitchen_status) {
          order.kitchen_status = order.payment_status === 'active' ? 'queued' : 'ready';
        }
      });
    });

    this.version(3).stores({
      users: 'user_id, pin_code, role',
    }).upgrade(async (tx) => {
      await tx.table('users').toCollection().modify((user) => {
        if (user.basic_salary === undefined) {
          user.basic_salary = 0;
        }
      });
    });

    // v4: multi-branch support.
    //  - New `branches` and `ingredientStock` tables.
    //  - `ingredients` becomes shared identity only (name, unit); its old
    //    per-row stock fields move into `ingredientStock`, keyed by branch.
    //  - `users`, `orders`, `wasteLogs`, `staffLedgers` gain a `branch_id`.
    //
    // This app is being re-cloned fresh for the multi-branch build, so this
    // upgrade path is a courtesy for any device that still has old v3 data
    // sitting in its browser — it assumes a single existing branch (id
    // 'main') to migrate into, since there's no way to ask "which branch is
    // this old data?" from inside an upgrade function. Delete/rename 'main'
    // once real branches are set up.
    this.version(4).stores({
      branches: 'branch_id',
      users: 'user_id, pin_code, role, branch_id',
      ingredients: 'ingredient_id, name',
      ingredientStock: '[branch_id+ingredient_id], branch_id, ingredient_id',
      recipes: '[dish_name+ingredient_id], dish_name, ingredient_id',
      orders: 'order_id, payment_status, kitchen_status, placed_by_waiter_id, timestamp, synced, branch_id',
      wasteLogs: 'waste_id, logged_by_cook_id, timestamp, synced, branch_id',
      staffLedgers: 'ledger_id, staff_id, date, synced, branch_id',
    }).upgrade(async (tx) => {
      const FALLBACK_BRANCH_ID = 'main';

      const hasExistingData = (await tx.table('users').count()) > 0;
      if (hasExistingData) {
        await tx.table('branches').put({ branch_id: FALLBACK_BRANCH_ID, name: 'Main Branch' });
      }

      await tx.table('users').toCollection().modify((user) => {
        if (user.role !== 'superadmin' && !user.branch_id) {
          user.branch_id = FALLBACK_BRANCH_ID;
        }
      });

      // Old `ingredients` rows carried stock fields directly — split those
      // off into ingredientStock, then strip them from the ingredient row.
      const oldIngredients = await tx.table('ingredients').toArray();
      for (const ing of oldIngredients) {
        if ('quantity_on_hand' in ing) {
          await tx.table('ingredientStock').put({
            branch_id: FALLBACK_BRANCH_ID,
            ingredient_id: ing.ingredient_id,
            quantity_on_hand: ing.quantity_on_hand ?? 0,
            last_purchase_cost: ing.last_purchase_cost ?? 0,
            low_stock_threshold: ing.low_stock_threshold ?? 0,
          });
        }
      }
      await tx.table('ingredients').toCollection().modify((ing) => {
        delete ing.quantity_on_hand;
        delete ing.last_purchase_cost;
        delete ing.low_stock_threshold;
      });

      await tx.table('orders').toCollection().modify((o) => {
        if (!o.branch_id) o.branch_id = FALLBACK_BRANCH_ID;
      });
      await tx.table('wasteLogs').toCollection().modify((w) => {
        if (!w.branch_id) w.branch_id = FALLBACK_BRANCH_ID;
      });
      await tx.table('staffLedgers').toCollection().modify((l) => {
        if (!l.branch_id) l.branch_id = FALLBACK_BRANCH_ID;
      });
    });

    // v5: fixed-asset inventory — tables, chairs, sufurias, cups, spoons.
    // A new table, so no data migration needed, just the schema.
    this.version(5).stores({
      fixedAssets: 'asset_id, branch_id, category, synced',
    });
  }
}

export const db = new KibandaDatabase();