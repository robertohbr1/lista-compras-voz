import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Square, FastForward } from 'lucide-react';
import { db, type BaseItem } from '../db';
import { speak, listen, stopListening, parseQuantity } from '../services/voice';

// --- DB helper: insert or update by name (handles &name unique constraint) ---
async function upsertShoppingItem(name: string, quantity: number): Promise<void> {
  const existing = await db.shoppingList.where('name').equals(name).first();
  if (existing?.id !== undefined) {
    await db.shoppingList.update(existing.id, { quantity, bought: false, updatedAt: Date.now() });
  } else {
    await db.shoppingList.add({ name, quantity, bought: false, updatedAt: Date.now() });
  }
}

// --- Numpad component ---
interface NumpadProps { onSelect: (n: number) => void; }
function Numpad({ onSelect }: NumpadProps): React.ReactElement {
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  return (
    <div className="numpad-grid">
      {digits.map((d) => (
        <button key={d} className="numpad-btn" onPointerDown={(e) => { e.preventDefault(); onSelect(d); }}>
          {d}
        </button>
      ))}
      <div />
      <button className="numpad-btn" onPointerDown={(e) => { e.preventDefault(); onSelect(0); }}>0</button>
      <div />
    </div>
  );
}

// --- Types ---
type FlowStage =
  | 'idle'
  | 'predefined'
  | 'additional_prompt'
  | 'additional_name'
  | 'additional_qty'
  | 'finished';

// --- Main component ---
export function VoiceFlowScreen(): React.ReactElement {
  const [stage, setStage] = useState<FlowStage>('idle');
  const [statusText, setStatusText] = useState('Pressione ▶ para iniciar');
  const [isListening, setIsListening] = useState(false);
  const [lastHeard, setLastHeard] = useState('');
  const [errorText, setErrorText] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingList, setPendingList] = useState<BaseItem[]>([]);

  // Items being asked
  const [baseItems, setBaseItems] = useState<BaseItem[]>([]);
  const [itemIdx, setItemIdx] = useState(0);
  const [extraName, setExtraName] = useState('');
  const [manualText, setManualText] = useState('');

  // Generation counter: every new "question" gets a new gen.
  // A stale async callback checks gen before acting.
  const genRef = useRef(0);

  const stopAll = useCallback(() => {
    window.speechSynthesis.cancel();
    stopListening();
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  // ---- Flow control helpers ----

  function resetToIdle(): void {
    genRef.current++;
    stopAll();
    setStage('idle');
    setStatusText('Pressione ▶ para iniciar');
    setIsListening(false);
    setLastHeard('');
    setErrorText('');
    setManualText('');
  }

  async function startFlow(): Promise<void> {
    const list = await db.baseItems.toArray();
    if (list.length === 0) {
      setStatusText('Nenhum item cadastrado na aba Configurar.');
      return;
    }
    const existingCount = await db.shoppingList.count();
    if (existingCount > 0) {
      setPendingList(list);
      setShowClearConfirm(true);
      return;
    }
    beginFlow(list);
  }

  function beginFlow(list: BaseItem[]): void {
    setShowClearConfirm(false);
    setBaseItems(list);
    setItemIdx(0);
    setStage('predefined');
    askItem(list, 0);
  }

  async function clearAndStart(): Promise<void> {
    await db.shoppingList.clear();
    beginFlow(pendingList);
  }

  async function askItem(items: BaseItem[], idx: number): Promise<void> {
    const myGen = ++genRef.current;
    const item = items[idx];

    setErrorText('');
    setLastHeard('');
    setIsListening(false);
    setStatusText(`Quanto ${item.name}?`);

    await speak(`Quanto ${item.name}?`);
    if (genRef.current !== myGen) return;

    // Retry loop: speak 'Repita' until valid answer or user uses numpad/skip
    while (genRef.current === myGen) {
      setStatusText('Ouvindo...');
      setIsListening(true);

      try {
        const text = await listen();
        if (genRef.current !== myGen) return;
        setIsListening(false);
        setLastHeard(text);

        const qty = parseQuantity(text);
        if (qty >= 0) {
          await saveAndNext(items, idx, item.name, qty);
          return;
        }
      } catch (err) {
        if (genRef.current !== myGen) return;
        setIsListening(false);
        const code = err instanceof Error ? err.message : 'unknown';
        if (code === 'aborted' || code === 'not-allowed' || code === 'not-supported') return;
      }

      // Not understood — say 'Repita' and loop
      if (genRef.current !== myGen) return;
      setIsListening(false);
      setStatusText('Repita...');
      await speak('Repita');
    }
  }

  async function saveAndNext(items: BaseItem[], idx: number, name: string, qty: number): Promise<void> {
    try {
      if (qty > 0) await upsertShoppingItem(name, qty);
    } catch (err) {
      console.error('[DB] saveAndNext error:', err);
    }
    const next = idx + 1;
    if (next < items.length) {
      setItemIdx(next);
      askItem(items, next);
    } else {
      setStage('additional_prompt');
      askAdditionalPrompt();
    }
  }

  async function askAdditionalPrompt(): Promise<void> {
    const myGen = ++genRef.current;
    setErrorText('');
    setLastHeard('');
    setIsListening(false);
    setStatusText('Quer adicionar mais algum item?');

    await speak('Quer adicionar mais algum item?');
    if (genRef.current !== myGen) return;

    while (genRef.current === myGen) {
      setStatusText('Ouvindo... (sim / não)');
      setIsListening(true);

      try {
        const text = await listen();
        if (genRef.current !== myGen) return;
        setIsListening(false);
        setLastHeard(text);

        const t = text.toLowerCase();
        if (['sim', 'quero', 'adicionar', 'mais', 'yes'].some((w) => t.includes(w))) {
          setStage('additional_name');
          askExtraName();
          return;
        }
        if (['não', 'nao', 'no', 'fim', 'chega', 'finalizar', 'pronto'].some((w) => t.includes(w))) {
          finishFlow();
          return;
        }
      } catch (err) {
        if (genRef.current !== myGen) return;
        setIsListening(false);
        const code = err instanceof Error ? err.message : 'unknown';
        if (code === 'aborted' || code === 'not-allowed' || code === 'not-supported') return;
      }

      if (genRef.current !== myGen) return;
      setIsListening(false);
      setStatusText('Repita...');
      await speak('Repita');
    }
  }

  async function askExtraName(): Promise<void> {
    const myGen = ++genRef.current;
    setErrorText('');
    setLastHeard('');
    setIsListening(false);
    setStatusText('Qual o nome do item?');

    await speak('Qual o nome do item?');
    if (genRef.current !== myGen) return;

    while (genRef.current === myGen) {
      setStatusText('Ouvindo nome...');
      setIsListening(true);

      try {
        const text = await listen();
        if (genRef.current !== myGen) return;
        setIsListening(false);
        setLastHeard(text);
        if (text.trim()) {
          setExtraName(text.trim());
          setStage('additional_qty');
          askExtraQty(text.trim());
          return;
        }
      } catch (err) {
        if (genRef.current !== myGen) return;
        setIsListening(false);
        const code = err instanceof Error ? err.message : 'unknown';
        if (code === 'aborted' || code === 'not-allowed' || code === 'not-supported') return;
      }

      if (genRef.current !== myGen) return;
      setIsListening(false);
      setStatusText('Repita...');
      await speak('Repita');
    }
  }

  async function askExtraQty(name: string): Promise<void> {
    const myGen = ++genRef.current;
    setErrorText('');
    setLastHeard('');
    setIsListening(false);
    setStatusText(`Quanto ${name}?`);

    await speak(`Quanto ${name}?`);
    if (genRef.current !== myGen) return;

    while (genRef.current === myGen) {
      setStatusText('Ouvindo quantidade...');
      setIsListening(true);

      try {
        const text = await listen();
        if (genRef.current !== myGen) return;
        setIsListening(false);
        setLastHeard(text);

        const qty = parseQuantity(text);
        if (qty >= 0) {
          await saveExtraAndLoop(name, qty);
          return;
        }
      } catch (err) {
        if (genRef.current !== myGen) return;
        setIsListening(false);
        const code = err instanceof Error ? err.message : 'unknown';
        if (code === 'aborted' || code === 'not-allowed' || code === 'not-supported') return;
      }

      if (genRef.current !== myGen) return;
      setIsListening(false);
      setStatusText('Repita...');
      await speak('Repita');
    }
  }

  async function saveExtraAndLoop(name: string, qty: number): Promise<void> {
    try {
      if (qty > 0) await upsertShoppingItem(name, qty);
    } catch (err) {
      console.error('[DB] saveExtraAndLoop error:', err);
    }
    setStage('additional_prompt');
    askAdditionalPrompt();
  }

  async function finishFlow(): Promise<void> {
    genRef.current++; // stop any pending cycle
    stopAll();
    setStage('finished');
    setIsListening(false);
    setStatusText('Lista finalizada! Boas compras 🛒');
    await speak('Lista finalizada. Boas compras!');
  }

  // ---- Numpad handler: interrupts voice immediately ----
  async function onNumpad(qty: number): Promise<void> {
    genRef.current++; // invalidate any ongoing voice cycle
    stopAll();
    setIsListening(false);
    setErrorText('');
    setLastHeard('');

    if (stage === 'predefined') {
      const name = baseItems[itemIdx]?.name ?? '';
      const next = itemIdx + 1;
      try {
        if (qty > 0 && name) await upsertShoppingItem(name, qty);
      } catch (err) {
        console.error('[DB] numpad predefined error:', err);
      }
      if (next < baseItems.length) {
        setItemIdx(next);
        askItem(baseItems, next);
      } else {
        setStage('additional_prompt');
        askAdditionalPrompt();
      }
    } else if (stage === 'additional_qty') {
      await saveExtraAndLoop(extraName, qty);
    }
  }

  // ---- Skip ----
  function skip(): void {
    genRef.current++;
    stopAll();
    setIsListening(false);
    setErrorText('');

    if (stage === 'predefined') {
      const next = itemIdx + 1;
      if (next < baseItems.length) {
        setItemIdx(next);
        askItem(baseItems, next);
      } else {
        setStage('additional_prompt');
        askAdditionalPrompt();
      }
    } else if (stage === 'additional_qty') {
      setStage('additional_prompt');
      askAdditionalPrompt();
    }
  }

  // ---- Retry voice ----
  function retry(): void {
    setErrorText('');
    setLastHeard('');
    if (stage === 'predefined') askItem(baseItems, itemIdx);
    else if (stage === 'additional_prompt') askAdditionalPrompt();
    else if (stage === 'additional_name') askExtraName();
    else if (stage === 'additional_qty') askExtraQty(extraName);
  }

  // ---- Manual text submit ----
  async function submitManual(): Promise<void> {
    const val = manualText.trim();
    setManualText('');
    setErrorText('');
    if (!val) return;

    if (stage === 'additional_name') {
      setExtraName(val);
      setStage('additional_qty');
      askExtraQty(val);
    } else if (stage === 'additional_prompt') {
      const t = val.toLowerCase();
      if (['sim', 'quero', 'mais'].some((w) => t.includes(w))) {
        genRef.current++; stopAll(); setErrorText('');
        setStage('additional_name'); askExtraName();
      } else {
        genRef.current++; stopAll(); setErrorText('');
        finishFlow();
      }
    }
  }

  // ---- Render ----
  const isQtyStage = stage === 'predefined' || stage === 'additional_qty';
  const isAdditionalPrompt = stage === 'additional_prompt';
  const needsNameInput = stage === 'additional_name';
  const isActive = stage !== 'idle' && stage !== 'finished';

  const progressPct = stage === 'predefined' && baseItems.length > 0
    ? (itemIdx / baseItems.length) * 100
    : null;

  return (
    <div className="glass-card">

      {/* Confirmação: lista ativa já existe */}
      {showClearConfirm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ margin: 0, color: '#fbbf24', fontSize: '1.1rem' }}>⚠️ Lista ativa encontrada</h3>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.95rem', lineHeight: 1.4 }}>
            Você já tem <strong style={{ color: '#f1f5f9' }}>{pendingList.length > 0 ? '' : ''}</strong>
            itens na lista atual. Deseja <strong style={{ color: '#ef4444' }}>limpar a lista</strong> e começar uma nova, ou manter os itens existentes e apenas adicionar mais?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn-primary" style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 4px 15px rgba(239,68,68,0.3)' }} onClick={clearAndStart}>
              🗑️ Limpar e começar nova lista
            </button>
            <button className="btn-secondary" onClick={() => beginFlow(pendingList)}>
              ➕ Manter itens e adicionar mais
            </button>
            <button className="btn-secondary" onClick={() => setShowClearConfirm(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!showClearConfirm && (
      <div className="voice-container">

        {/* Progress bar */}
        {progressPct !== null && (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginBottom: 4 }}>
              <span>Progresso</span>
              <span>{itemIdx + 1} / {baseItems.length}</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        )}

        {/* Mic button */}
        <button
          className={`mic-circle ${isListening ? 'listening' : ''}`}
          onClick={!isActive ? startFlow : resetToIdle}
        >
          {!isActive ? <Play size={32} fill="white" /> : <Square size={24} fill="white" />}
        </button>

        {/* Status */}
        <div className="voice-status">{statusText}</div>

        {/* Last recognized text */}
        {lastHeard && !errorText && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Entendi por voz:</span>
            <div className="voice-recognized">"{lastHeard}"</div>
          </div>
        )}

        {/* Error + recovery */}
        {errorText && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 14, padding: '14px 16px', width: '100%', boxSizing: 'border-box' }}>
            <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: '#fca5a5', lineHeight: 1.4 }}>{errorText}</p>

            {lastHeard && (
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: '0.76rem', color: '#64748b' }}>O que ouvi: </span>
                <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>"{lastHeard}"</span>
              </div>
            )}

            {/* Numpad inside error for qty stages */}
            {isQtyStage && <Numpad onSelect={onNumpad} />}

            {/* Yes/No for additional_prompt */}
            {isAdditionalPrompt && (
              <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                <button className="btn-primary" style={{ flex: 1 }} onClick={() => { genRef.current++; stopAll(); setErrorText(''); setStage('additional_name'); askExtraName(); }}>Sim</button>
                <button className="btn-secondary" style={{ flex: 1 }} onClick={() => { genRef.current++; stopAll(); setErrorText(''); finishFlow(); }}>Não</button>
              </div>
            )}

            {/* Text input for name/prompt */}
            {(needsNameInput || isAdditionalPrompt) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <input
                  className="input-field"
                  placeholder={needsNameInput ? 'Nome do item...' : 'sim ou não...'}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitManual()}
                />
                <button className="btn-primary" style={{ padding: '10px 16px' }} onClick={submitManual}>OK</button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={resetToIdle}>Cancelar</button>
              <button className="btn-primary" onClick={retry}>🎤 Tentar novamente</button>
            </div>
          </div>
        )}

        {/* Numpad always visible during qty stages (no error) */}
        {isQtyStage && !errorText && (
          <Numpad onSelect={onNumpad} />
        )}

        {/* Bottom action buttons */}
        {isActive && !errorText && (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={resetToIdle}>Cancelar</button>
            {isQtyStage && (
              <button className="btn-primary" onClick={skip}>
                <FastForward size={15} /> Pular
              </button>
            )}
            {isAdditionalPrompt && (
              <>
                <button className="btn-primary" onClick={() => { genRef.current++; stopAll(); setErrorText(''); setStage('additional_name'); askExtraName(); }}>Sim</button>
                <button className="btn-secondary" onClick={() => { genRef.current++; stopAll(); setErrorText(''); finishFlow(); }}>Não</button>
              </>
            )}
          </div>
        )}

      </div>
      )}

    </div>
  );
}
