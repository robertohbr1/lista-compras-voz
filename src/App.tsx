import React, { useState } from 'react';
import { Header } from './components/Header';
import { Tabs } from './components/Tabs';
import { ConfigScreen } from './components/ConfigScreen';
import { VoiceFlowScreen } from './components/VoiceFlowScreen';
import { SupermarketScreen } from './components/SupermarketScreen';

export default function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<string>('voice');

  return (
    <>
      <Header />
      <main className="main-content">
        {activeTab === 'config' && <ConfigScreen />}
        {activeTab === 'voice' && <VoiceFlowScreen />}
        {activeTab === 'super' && <SupermarketScreen />}
      </main>
      <Tabs activeTab={activeTab} setActiveTab={setActiveTab} />
    </>
  );
}
