import React from 'react';
import { Settings, Mic, ShoppingCart } from 'lucide-react';

interface TabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

interface TabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export function Tabs({ activeTab, setActiveTab }: TabsProps): React.ReactElement {
  const tabs: TabItem[] = [
    { id: 'config', label: 'Configurar', icon: <Settings size={20} /> },
    { id: 'voice', label: 'Voz', icon: <Mic size={20} /> },
    { id: 'super', label: 'Supermercado', icon: <ShoppingCart size={20} /> }
  ];

  return (
    <nav className="tabs-nav">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
