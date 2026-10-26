import { describe, expect, it } from 'vitest';
import { simulate } from './simulate';
import { scenarios } from '../scenarios';
import type { Scenario, Step } from './types';

const output = (steps: Step[]) => steps[steps.length - 1]!.console;
const make = (ops: Scenario['ops']): Scenario => ({
  id: 't', title: 't', summary: '', code: [], ops, expectedOutput: [],
});

describe('scenarios', () => {
  for (const s of scenarios) {
    it(`${s.id} prints ${s.expectedOutput.join(' ')}`, () => {
      expect(output(simulate(s))).toEqual(s.expectedOutput);
    });
  }

  it('mixed scenario prints A E G D C F B', () => {
    const s = scenarios.find((x) => x.id === 'mixed')!;
    expect(output(simulate(s)).join(' ')).toBe('A E G D C F B');
  });

  it('top-level timeout vs immediate follows the toggle', () => {
    const s = scenarios.find((x) => x.id === 'timeout-vs-immediate')!;
    expect(output(simulate(s, { timerElapsedAtLoopStart: true }))).toEqual(['timeout', 'immediate']);
    expect(output(simulate(s, { timerElapsedAtLoopStart: false }))).toEqual(['immediate', 'timeout']);
  });

  it('inside an I/O callback setImmediate beats setTimeout regardless of the toggle', () => {
    const s = scenarios.find((x) => x.id === 'inside-io')!;
    for (const timerElapsedAtLoopStart of [true, false]) {
      expect(output(simulate(s, { timerElapsedAtLoopStart }))).toEqual(['immediate', 'timeout']);
    }
  });
});

describe('drain loop', () => {
  it('nextTicks queued by microtasks run after the microtask queue drains, then repeat', () => {
    const out = output(
      simulate(
        make([
          {
            op: 'promiseThen',
            body: [
              { op: 'log', text: 'm1' },
              { op: 'nextTick', body: [
                { op: 'log', text: 't2' },
                { op: 'promiseThen', body: [{ op: 'log', text: 'm3' }] },
              ] },
              { op: 'promiseThen', body: [{ op: 'log', text: 'm2' }] },
            ],
          },
          { op: 'nextTick', body: [{ op: 'log', text: 't1' }] },
        ]),
      ),
    );
    expect(out).toEqual(['t1', 'm1', 'm2', 't2', 'm3']);
  });

  it('drains after every callback, not just after the script', () => {
    const out = output(
      simulate(
        make([
          { op: 'setTimeout', delayMs: 0, body: [
            { op: 'promiseThen', body: [{ op: 'log', text: 'micro 1' }] },
          ] },
          { op: 'setTimeout', delayMs: 0, body: [{ op: 'log', text: 'timer 2' }] },
        ]),
      ),
    );
    expect(out).toEqual(['micro 1', 'timer 2']);
  });
});

describe('step snapshots', () => {
  it('never runs a queued callback while the stack is non-empty', () => {
    for (const s of scenarios) {
      for (const step of simulate(s)) {
        if (step.moved?.to === 'callStack' && step.moved.from !== 'callStack') {
          expect(step.callStack.length).toBe(1);
        }
      }
    }
  });

  it('has sequential indices and is deterministic', () => {
    for (const s of scenarios) {
      const a = simulate(s);
      a.forEach((st, i) => expect(st.index).toBe(i));
      expect(simulate(s)).toEqual(a);
    }
  });

  it('ends with empty stack, queues and heap', () => {
    for (const s of scenarios) {
      const last = simulate(s).at(-1)!;
      expect(last.callStack).toEqual([]);
      expect(last.nextTickQueue).toEqual([]);
      expect(last.microtaskQueue).toEqual([]);
      expect(last.pendingApis).toEqual([]);
      expect(last.heap).toEqual([]);
    }
  });

  it('blocking loop makes the timer fire late', () => {
    const s = scenarios.find((x) => x.id === 'blocking')!;
    expect(simulate(s).some((st) => st.caption.includes('ms late'))).toBe(true);
  });
});

describe('validation', () => {
  it('rejects await outside an async function', () => {
    expect(() => simulate(make([{ op: 'await', rest: [] }]))).toThrow();
  });
});
