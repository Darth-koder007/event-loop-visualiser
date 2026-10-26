/** Deterministic shuffle (seeded by scenario id) that never returns the original order. */
export function shuffleSeeded<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  const same = out.length > 1 && out.every((v, i) => v === items[i]);
  return same ? [...out.slice(1), out[0]!] : out;
}

export interface Score {
  marks: boolean[]; // per position of the guess
  correct: number;
  perfect: boolean;
}

export function scorePrediction(guess: string[], actual: string[]): Score {
  const marks = actual.map((v, i) => guess[i] === v);
  const correct = marks.filter(Boolean).length;
  return { marks, correct, perfect: correct === actual.length && guess.length === actual.length };
}
