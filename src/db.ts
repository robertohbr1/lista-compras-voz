import Dexie, { type Table } from 'dexie';

export interface BaseItem {
  id?: number;
  name: string;
  order: number;
}

export interface ShoppingItem {
  id?: number;
  name: string;
  quantity: number;
  bought: boolean;
  updatedAt: number;
}

export class ShoppingDatabase extends Dexie {
  baseItems!: Table<BaseItem>;
  shoppingList!: Table<ShoppingItem>;

  constructor() {
    super('ShoppingDatabase');
    this.version(1).stores({
      baseItems: '++id, &name',
      shoppingList: '++id, &name, quantity, bought, updatedAt'
    });
    // Version 2: adds 'order' field to baseItems for manual sorting
    this.version(2).stores({
      baseItems: '++id, &name, order',
      shoppingList: '++id, &name, quantity, bought, updatedAt'
    }).upgrade(async (tx) => {
      const items = await tx.table('baseItems').toArray();
      for (let i = 0; i < items.length; i++) {
        await tx.table('baseItems').update(items[i].id, { order: i });
      }
    });
  }
}

export const db = new ShoppingDatabase();

// Prepopulate default items if empty
export async function populateDefaultItems(): Promise<void> {
  const count = await db.baseItems.count();
  if (count > 0) {
    return;
  }

  const defaults = [
    'Arroz',
    'Feijão',
    'Café',
    'Leite',
    'Açúcar',
    'Pão',
    'Manteiga',
    'Ovos',
    'Sabonete',
    'Creme Dental'
  ];

  await db.baseItems.bulkAdd(
    defaults.map((name, i) => ({ name, order: i }))
  );
}

// Ensure database is populated
populateDefaultItems().catch((err) => {
  console.error('Falha ao popular itens iniciais:', err);
});
