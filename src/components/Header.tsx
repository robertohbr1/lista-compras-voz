import React from 'react';
import { ShoppingBag } from 'lucide-react';

export function Header(): React.ReactElement {
  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <ShoppingBag style={{ color: '#6366f1' }} />
        <h1 className="app-title">ListaVoz</h1>
      </div>
    </header>
  );
}
