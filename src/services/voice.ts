// --- Minimal type declarations for Web Speech API ---

interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: { readonly transcript: string; readonly confidence: number };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((ev: Event) => void) | null;
}

interface WebWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}

// --- Module-level active recognition instance ---
let activeRec: SpeechRecognitionInstance | null = null;

export function stopListening(): void {
  if (!activeRec) return;
  try { activeRec.abort(); } catch (_) { /* ignore */ }
  activeRec = null;
}

// --- TTS: speak text, resolve when done, with 8s safety timeout ---
export function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.95;

    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };

    utterance.onend = finish;
    utterance.onerror = finish;
    // Android safety: if onend never fires within 8s, resolve anyway
    setTimeout(finish, 8000);

    window.speechSynthesis.speak(utterance);
  });
}

// --- STT: listen once, return transcript, reject on error/no-speech ---
// Returns a promise that resolves with the recognized text.
// Caller can call stopListening() at any time to abort.
export function listen(): Promise<string> {
  const webWindow = window as unknown as WebWindow;
  const Ctor = webWindow.SpeechRecognition ?? webWindow.webkitSpeechRecognition;

  if (!Ctor) {
    return Promise.reject(new Error('not-supported'));
  }

  return new Promise((resolve, reject) => {
    stopListening();

    const rec = new Ctor();
    activeRec = rec;

    rec.lang = 'pt-BR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 3;

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      activeRec = null;
      fn();
    };

    rec.onresult = (ev: SpeechRecognitionEvent) => {
      // Collect all alternatives
      const alternatives: string[] = [];
      for (let i = 0; i < ev.results[0].length; i++) {
        alternatives.push(ev.results[0][i].transcript);
      }
      console.log('[Voice] alternatives:', alternatives);
      // Return all alternatives joined so parseQuantity can try each word
      const combined = alternatives.join(' ');
      settle(() => resolve(combined));
    };

    rec.onerror = (ev: SpeechRecognitionErrorEvent) => {
      console.log('[Voice] error:', ev.error);
      settle(() => reject(new Error(ev.error)));
    };

    rec.onend = () => {
      settle(() => reject(new Error('no-speech')));
    };

    rec.start();
    console.log('[Voice] started');
  });
}

// --- Number parser: converts recognized speech to a number ---
// Returns -1 if no number is found.
export function parseQuantity(voiceText: string): number {
  const clean = voiceText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  if (!clean) return -1;

  // Words that mean "zero / I don't want this item"
  const zeroWords = ['zero', 'nenhum', 'nenhuma', 'nao', 'nope', 'sem', 'nada', 'negativo', 'nil'];
  if (zeroWords.some((w) => clean.split(/\s+/).includes(w))) {
    return 0;
  }
  // Also catch phrases like "não quero", "não preciso" — any utterance that starts with 'nao'
  if (clean.startsWith('nao')) {
    return 0;
  }

  const digits = clean.match(/\d+/);
  if (digits) return parseInt(digits[0], 10);

  return findWordNumber(clean);
}

function findWordNumber(text: string): number {
  // Broad map including phonetic variations and common misrecognitions
  const map: Record<string, number> = {
    'um': 1, 'uma': 1, 'uno': 1, 'hum': 1, 'hun': 1,
    'dois': 2, 'duas': 2, 'doce': 2, 'doze': 2, 'dois e': 2,
    'tres': 3, 'trez': 3, 'tras': 3,
    'quatro': 4, 'coatro': 4, 'quato': 4,
    'cinco': 5, 'sinco': 5, 'singo': 5,
    'seis': 6, 'meia': 6, 'meis': 6,
    'sete': 7, 'seti': 7,
    'oito': 8, 'oita': 8,
    'nove': 9, 'nobe': 9,
    'dez': 10, 'des': 10,
  };

  for (const word of text.split(/\s+/)) {
    if (map[word] !== undefined) return map[word];
  }
  return -1;
}
