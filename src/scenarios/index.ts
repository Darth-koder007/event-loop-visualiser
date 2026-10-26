import type { Scenario } from '../engine/types';

const mixed: Scenario = {
  id: 'mixed',
  title: 'Everything at once',
  summary: 'Sync code, setTimeout, promises, nextTick and async/await in one script.',
  code: [
    'async function f() {',
    "  console.log('E');",
    '  await null;',
    "  console.log('C');",
    '}',
    '',
    "console.log('A');",
    "setTimeout(() => console.log('B'), 0);",
    'f();',
    "Promise.resolve().then(() => console.log('F'));",
    "process.nextTick(() => console.log('D'));",
    "console.log('G');",
  ],
  ops: [
    { op: 'log', text: 'A', line: 7 },
    { op: 'setTimeout', delayMs: 0, body: [{ op: 'log', text: 'B', line: 8 }], line: 8 },
    {
      op: 'callFn',
      name: 'f',
      async: true,
      line: 9,
      body: [
        { op: 'log', text: 'E', line: 2 },
        { op: 'await', line: 3, rest: [{ op: 'log', text: 'C', line: 4 }] },
      ],
    },
    { op: 'promiseThen', body: [{ op: 'log', text: 'F', line: 10 }], line: 10 },
    { op: 'nextTick', body: [{ op: 'log', text: 'D', line: 11 }], line: 11 },
    { op: 'log', text: 'G', line: 12 },
  ],
  expectedOutput: ['A', 'E', 'G', 'D', 'C', 'F', 'B'],
};

const timeoutVsImmediate: Scenario = {
  id: 'timeout-vs-immediate',
  title: 'setTimeout vs setImmediate',
  summary: 'At the top level the order depends on whether 1ms has passed when the loop starts.',
  hasTimerRace: true,
  code: [
    "setTimeout(() => console.log('timeout'), 0);",
    "setImmediate(() => console.log('immediate'));",
  ],
  ops: [
    { op: 'setTimeout', delayMs: 0, body: [{ op: 'log', text: 'timeout', line: 1 }], line: 1 },
    { op: 'setImmediate', body: [{ op: 'log', text: 'immediate', line: 2 }], line: 2 },
  ],
  // Default (timer already elapsed). Flip the toggle for the other order.
  expectedOutput: ['timeout', 'immediate'],
};

const insideIo: Scenario = {
  id: 'inside-io',
  title: 'setTimeout vs setImmediate inside I/O',
  summary: 'Inside an I/O callback the check phase comes next, so setImmediate always wins.',
  code: [
    "fs.readFile('file.txt', () => {",
    "  setTimeout(() => console.log('timeout'), 0);",
    "  setImmediate(() => console.log('immediate'));",
    '});',
  ],
  ops: [
    {
      op: 'readFile',
      line: 1,
      path: 'file.txt',
      body: [
        { op: 'setTimeout', delayMs: 0, body: [{ op: 'log', text: 'timeout', line: 2 }], line: 2 },
        { op: 'setImmediate', body: [{ op: 'log', text: 'immediate', line: 3 }], line: 3 },
      ],
    },
  ],
  expectedOutput: ['immediate', 'timeout'],
};

const starvation: Scenario = {
  id: 'tick-starvation',
  title: 'nextTick starves microtasks',
  summary: 'A nextTick that queues another nextTick keeps the microtask queue waiting.',
  code: [
    "console.log('start');",
    "Promise.resolve().then(() => console.log('promise'));",
    'process.nextTick(() => {',
    "  console.log('tick 1');",
    '  process.nextTick(() => {',
    "    console.log('tick 2');",
    "    process.nextTick(() => console.log('tick 3'));",
    '  });',
    '});',
    "setTimeout(() => console.log('timeout'), 0);",
  ],
  ops: [
    { op: 'log', text: 'start', line: 1 },
    { op: 'promiseThen', body: [{ op: 'log', text: 'promise', line: 2 }], line: 2 },
    {
      op: 'nextTick',
      line: 3,
      body: [
        { op: 'log', text: 'tick 1', line: 4 },
        {
          op: 'nextTick',
          line: 5,
          body: [
            { op: 'log', text: 'tick 2', line: 6 },
            { op: 'nextTick', body: [{ op: 'log', text: 'tick 3', line: 7 }], line: 7 },
          ],
        },
      ],
    },
    { op: 'setTimeout', delayMs: 0, body: [{ op: 'log', text: 'timeout', line: 10 }], line: 10 },
  ],
  expectedOutput: ['start', 'tick 1', 'tick 2', 'tick 3', 'promise', 'timeout'],
};

const chainVsTick: Scenario = {
  id: 'chain-vs-tick',
  title: 'Promise chain vs nextTick',
  summary: 'A nextTick queued inside a microtask waits until the whole microtask queue drains.',
  code: [
    'Promise.resolve()',
    '  .then(() => {',
    "    console.log('then 1');",
    "    process.nextTick(() => console.log('tick from then 1'));",
    '  })',
    "  .then(() => console.log('then 2'));",
    "process.nextTick(() => console.log('tick 1'));",
    "console.log('sync');",
  ],
  ops: [
    {
      op: 'promiseThen',
      line: 2,
      body: [
        { op: 'log', text: 'then 1', line: 3 },
        { op: 'nextTick', body: [{ op: 'log', text: 'tick from then 1', line: 4 }], line: 4 },
        // Chained .then: queued once the previous callback has returned.
        { op: 'promiseThen', body: [{ op: 'log', text: 'then 2', line: 6 }], line: 6 },
      ],
    },
    { op: 'nextTick', body: [{ op: 'log', text: 'tick 1', line: 7 }], line: 7 },
    { op: 'log', text: 'sync', line: 8 },
  ],
  expectedOutput: ['sync', 'tick 1', 'then 1', 'then 2', 'tick from then 1'],
};

const blocking: Scenario = {
  id: 'blocking',
  title: 'A blocking loop delays a timer',
  summary: 'A 10ms timer cannot fire while a 50ms busy loop holds the only thread.',
  code: [
    'function busyLoop() {',
    '  const end = Date.now() + 50;',
    '  while (Date.now() < end) {}',
    '}',
    '',
    "console.log('start');",
    "setTimeout(() => console.log('timer (10ms)'), 10);",
    'busyLoop();',
    "console.log('end');",
  ],
  ops: [
    { op: 'log', text: 'start', line: 6 },
    { op: 'setTimeout', delayMs: 10, body: [{ op: 'log', text: 'timer (10ms)', line: 7 }], line: 7 },
    { op: 'callFn', name: 'busyLoop', line: 8, body: [{ op: 'block', ms: 50, line: 3 }] },
    { op: 'log', text: 'end', line: 9 },
  ],
  expectedOutput: ['start', 'end', 'timer (10ms)'],
};

export const scenarios: Scenario[] = [
  mixed,
  timeoutVsImmediate,
  insideIo,
  starvation,
  chainVsTick,
  blocking,
];
