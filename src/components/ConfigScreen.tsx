import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { db, type BaseItem } from '../db';

export function ConfigScreen(): React.ReactElement {
  const [itemName, setItemName] = useState('');

  // Always load sorted by the 'order' field
  const baseItems = useLiveQuery(
    () => db.baseItems.orderBy('order').toArray(),
    [],
    []
  );

  async function handleAdd(): Promise<void> {
    if (!itemName.trim()) return;
    const maxOrder = baseItems.length > 0
      ? Math.max(...baseItems.map((i) => i.order ?? 0))
      : -1;
    try {
      await db.baseItems.add({ name: itemName.trim(), order: maxOrder + 1 });
      setItemName('');
    } catch (err) {
      console.error('Erro ao adicionar item base:', err);
    }
  }

  async function handleRemove(id?: number): Promise<void> {
    if (id === undefined) return;
    await db.baseItems.delete(id);
  }

  // Swap the 'order' values of two items to reorder them
  async function handleMove(item: BaseItem, direction: 'up' | 'down'): Promise<void> {
    if (!baseItems) return;
    const idx = baseItems.findIndex((i) => i.id === item.id);
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= baseItems.length) return;

    const target = baseItems[targetIdx];
    await db.baseItems.bulkPut([
      { ...item, order: target.order },
      { ...target, order: item.order },
    ]);
  }

  return (
    <div className="glass-card">
      <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.2rem' }}>Itens Base para Perguntas</h2>

      <div className="config-input-group">
        <input
          type="text"
          placeholder="Ex: Arroz, Maçã, Sabão..."
          className="input-field"
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <button className="btn-primary" onClick={handleAdd}>
          <Plus size={18} />
        </button>
      </div>

      <div className="base-items-grid">
        {!baseItems || baseItems.length === 0 ? (
          <div className="empty-state">Nenhum item cadastrado.</div>
        ) : (
          baseItems.map((item, idx) => (
            <div key={item.id} className="base-item-row">
              {/* Reorder buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginRight: 6 }}>
                <button
                  className="btn-icon"
                  style={{ padding: '2px 4px', opacity: idx === 0 ? 0.25 : 1 }}
                  disabled={idx === 0}
                  onClick={() => handleMove(item, 'up')}
                  title="Mover para cima"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  className="btn-icon"
                  style={{ padding: '2px 4px', opacity: idx === baseItems.length - 1 ? 0.25 : 1 }}
                  disabled={idx === baseItems.length - 1}
                  onClick={() => handleMove(item, 'down')}
                  title="Mover para baixo"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              <span className="base-item-name">{item.name}</span>

              <button
                className="btn-icon btn-danger-icon"
                onClick={() => handleRemove(item.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>
      <p className="helper-text">Use ↑↓ para reordenar. A ordem aqui define a sequência de perguntas por voz.</p>
    </div>
  );
}
