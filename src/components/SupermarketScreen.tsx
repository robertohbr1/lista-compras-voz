import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Trash2, ShoppingBasket } from 'lucide-react';
import { db, type ShoppingItem } from '../db';

export function SupermarketScreen(): React.ReactElement {
  const shoppingList = useLiveQuery(() => db.shoppingList.toArray()) ?? [];

  async function handleToggleBought(item: ShoppingItem): Promise<void> {
    if (item.id === undefined) return;
    await db.shoppingList.update(item.id, {
      bought: !item.bought,
      updatedAt: Date.now()
    });
  }

  async function handleClearList(): Promise<void> {
    const confirm = window.confirm('Deseja limpar toda a lista de compras atual?');
    if (!confirm) return;
    await db.shoppingList.clear();
  }

  async function handleDeleteItem(id?: number): Promise<void> {
    if (id === undefined) return;
    await db.shoppingList.delete(id);
  }

  const sortedList = [...shoppingList].sort((a, b) => {
    // Not-bought items first, bought items last
    if (a.bought !== b.bought) return a.bought ? 1 : -1;
    // Within each group, sort alphabetically
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  });

  const total = shoppingList.length;
  const boughtCount = shoppingList.filter((item) => item.bought).length;

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Lista no Supermercado</h2>
        {total > 0 && (
          <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={handleClearList}>
            Limpar Tudo
          </button>
        )}
      </div>

      {total > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>
            <span>Progresso da Compra</span>
            <span>{boughtCount} de {total} itens</span>
          </div>
          <div className="progress-bar-container">
            <div className="progress-bar-fill" style={{ width: `${total > 0 ? (boughtCount / total) * 100 : 0}%` }}></div>
          </div>
        </div>
      )}

      <div className="items-list">
        {sortedList.length === 0 ? (
          <div className="empty-state">
            <ShoppingBasket size={48} style={{ color: '#475569', strokeWidth: 1.5, margin: '0 auto 12px' }} />
            <p>Sua lista está vazia.<br />Use o fluxo de voz para criar sua lista!</p>
          </div>
        ) : (
          sortedList.map((item) => (
            <div key={item.id} className={`list-item ${item.bought ? 'bought' : ''}`}>
              <div className="item-left" style={{ cursor: 'pointer' }} onClick={() => handleToggleBought(item)}>
                <button className={`custom-checkbox ${item.bought ? 'checked' : ''}`}>
                  {item.bought && <Check size={14} />}
                </button>
                <div className="item-name-info">
                  <span className="item-label">{item.name}</span>
                  <span className="item-qty">Qtd: {item.quantity}</span>
                </div>
              </div>
              <button className="btn-icon btn-danger-icon" onClick={() => handleDeleteItem(item.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
