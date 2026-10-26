import { describe, expect, it } from 'vitest';
import { scorePrediction, shuffleSeeded } from './predict';

describe('shuffleSeeded', () => {
  const items = ['A', 'B', 'C', 'D', 'E'];
  it('is deterministic, a permutation, and never the original order', () => {
    const a = shuffleSeeded(items, 'x');
    expect(shuffleSeeded(items, 'x')).toEqual(a);
    expect([...a].sort()).toEqual(items);
    expect(a).not.toEqual(items);
  });
});

describe('scorePrediction', () => {
  it('marks each position', () => {
    const s = scorePrediction(['A', 'C', 'B'], ['A', 'B', 'C']);
    expect(s.marks).toEqual([true, false, false]);
    expect(s.correct).toBe(1);
    expect(s.perfect).toBe(false);
  });
  it('detects a perfect guess', () => {
    expect(scorePrediction(['A', 'B'], ['A', 'B']).perfect).toBe(true);
  });
  it('is not perfect when the guess is incomplete', () => {
    expect(scorePrediction(['A'], ['A', 'B']).perfect).toBe(false);
  });
});
