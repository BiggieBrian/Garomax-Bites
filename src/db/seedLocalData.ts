import { db } from './kibandaDB';

export async function seedInitialData() {
  const userCount = await db.users.count();
  if (userCount === 0) {
    // Seed default staff
    await db.users.bulkAdd([
      { user_id: '1', name: 'Garomax Owner', role: 'admin', pin_code: '0000', active_shift: true, basic_salary: 0 },
      { user_id: '2', name: 'Chef James', role: 'cook', pin_code: '1111', active_shift: true, basic_salary: 15000 },
      { user_id: '3', name: 'Waitstaff Mary', role: 'waiter', pin_code: '2222', active_shift: true, basic_salary: 12000 },
    ]);

    // Seed default ingredients
    await db.ingredients.bulkAdd([
      { ingredient_id: 'i1', name: 'Unga (Maize Flour)', unit: 'kg', quantity_on_hand: 25, last_purchase_cost: 150, low_stock_threshold: 5 },
      { ingredient_id: 'i2', name: 'Potatoes (Viazi)', unit: 'kg', quantity_on_hand: 40, last_purchase_cost: 100, low_stock_threshold: 10 },
      { ingredient_id: 'i3', name: 'Cooking Oil', unit: 'l', quantity_on_hand: 15, last_purchase_cost: 250, low_stock_threshold: 3 },
    ]);

    // Seed default recipes
    await db.recipes.bulkAdd([
      { dish_name: 'Ugali', selling_price: 50, ingredient_id: 'i1', quantity_per_plate: 0.2 },
      { dish_name: 'Chips', selling_price: 120, ingredient_id: 'i2', quantity_per_plate: 0.3 },
      { dish_name: 'Chips', selling_price: 120, ingredient_id: 'i3', quantity_per_plate: 0.05 },
    ]);

    console.log('Garomax Bites local IndexedDB seeded!');
  }
}