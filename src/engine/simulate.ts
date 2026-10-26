import type {
  HeapObject,
  Op,
  PendingApi,
  Phase,
  Region,
  Scenario,
  SimulateOptions,
  Step,
  Task,
  TaskKind,
} from './types';

const IO_LATENCY_MS = 5;
const MAX_STEPS = 5000;
const PHASES: Phase[] = ['timers', 'pending', 'poll', 'check', 'close'];
const PHASE_REGION: Record<Phase, Region> = {
  timers: 'timersQ',
  pending: 'pendingQ',
  poll: 'pollQ',
  check: 'checkQ',
  close: 'closeQ',
};

interface InternalTask extends Task {
  body: Op[];
  asyncFrameId?: string;
  heapIds: string[];
  line?: number;
}

interface Frame {
  task: InternalTask;
  ops: Op[];
  pc: number;
  asyncFrameId?: string;
}

interface InternalApi extends PendingApi {
  seq: number;
  task: InternalTask;
}

type OpName = Op['op'];

function validate(ops: Op[], inAsync: boolean): void {
  ops.forEach((op, i) => {
    switch (op.op) {
      case 'await':
        if (!inAsync) throw new Error('await used outside an async callFn');
        if (i !== ops.length - 1) throw new Error('await must be the last op of its body');
        validate(op.rest, true);
        break;
      case 'callFn':
        validate(op.body, op.async === true);
        break;
      case 'setTimeout':
      case 'setImmediate':
      case 'nextTick':
      case 'promiseThen':
      case 'readFile':
        validate(op.body, false);
        break;
      default:
        break;
    }
  });
}

/** First log text in a body, used to make callback cards recognisable. */
function describe(body: Op[]): string {
  for (const op of body) if (op.op === 'log') return ` "${op.text}"`;
  return '';
}

export function simulate(scenario: Scenario, options: SimulateOptions = {}): Step[] {
  validate(scenario.ops, false);
  const timerElapsed = options.timerElapsedAtLoopStart ?? true;

  const steps: Step[] = [];
  const frames: Frame[] = [];
  const heap: HeapObject[] = [];
  const nextTickQ: InternalTask[] = [];
  const microQ: InternalTask[] = [];
  const phaseQ: Record<Phase, InternalTask[]> = {
    timers: [],
    pending: [],
    poll: [],
    check: [],
    close: [],
  };
  const apis: InternalApi[] = [];
  const consoleOut: string[] = [];
  let clock = 0;
  let phase: Phase | null = null;
  let seq = 0;

  const nextId = (prefix: string) => `${prefix}${++seq}`;
  const pub = (t: Task): Task => ({ id: t.id, label: t.label, kind: t.kind });

  function emit(
    caption: string,
    highlight: Region[],
    extra: { line?: number; moved?: Step['moved'] } = {},
  ): void {
    if (steps.length >= MAX_STEPS) throw new Error(`Simulation exceeded ${MAX_STEPS} steps`);
    const step: Step = {
      index: steps.length,
      caption,
      highlight,
      phase,
      clock,
      callStack: frames.map((f) => pub(f.task)),
      heap: heap.map((h) => ({ ...h })),
      nextTickQueue: nextTickQ.map(pub),
      microtaskQueue: microQ.map(pub),
      phaseQueues: {
        timers: phaseQ.timers.map(pub),
        pending: phaseQ.pending.map(pub),
        poll: phaseQ.poll.map(pub),
        check: phaseQ.check.map(pub),
        close: phaseQ.close.map(pub),
      },
      pendingApis: apis.map(({ id, kind, label, dueAt }) => ({ id, kind, label, dueAt })),
      console: [...consoleOut],
    };
    if (extra.line !== undefined) step.activeLine = extra.line;
    if (extra.moved) step.moved = extra.moved;
    steps.push(step);
  }

  function addHeap(obj: Omit<HeapObject, 'id'>): string {
    const id = nextId('h');
    heap.push({ id, ...obj });
    return id;
  }

  function dropHeap(ids: string[]): void {
    for (const id of ids) {
      const i = heap.findIndex((h) => h.id === id);
      if (i >= 0) heap.splice(i, 1);
    }
  }

  function makeTask(kind: TaskKind, label: string, body: Op[], line?: number): InternalTask {
    const t: InternalTask = { id: nextId('t'), kind, label, body, heapIds: [] };
    if (line !== undefined) t.line = line;
    const closureId = addHeap({ type: 'closure', label: `closure · ${label}` });
    t.heapIds.push(closureId);
    return t;
  }

  function pushFrame(task: InternalTask, asyncFrameId?: string): void {
    const frame: Frame = { task, ops: task.body, pc: 0 };
    if (asyncFrameId !== undefined) frame.asyncFrameId = asyncFrameId;
    frames.push(frame);
  }

  function innermostAsync(): string | undefined {
    for (let i = frames.length - 1; i >= 0; i--) {
      const id = frames[i]?.asyncFrameId;
      if (id) return id;
    }
    return undefined;
  }

  /** Execute one op; each op is exactly one emitted step. */
  function execute(frame: Frame, op: Op): void {
    const line = op.line;
    const at = { ...(line !== undefined ? { line } : {}) };
    const fromStack = (t: InternalTask, to: Region) => ({
      line: at.line,
      moved: { taskId: t.id, from: 'callStack' as Region, to },
    });

    switch (op.op) {
      case 'log': {
        consoleOut.push(op.text);
        emit(`console.log prints "${op.text}".`, ['console'], at);
        break;
      }
      case 'callFn': {
        const t = makeTask('fn', `${op.name}()`, op.body, line);
        dropHeap(t.heapIds); // a direct call needs no closure object
        t.heapIds = [];
        let afId: string | undefined;
        if (op.async) {
          afId = addHeap({ type: 'asyncFrame', label: `async ${op.name}`, state: 'pending' });
          t.heapIds.push(afId);
        }
        pushFrame(t, afId);
        emit(`${op.name}() is called, so a frame is pushed onto the call stack.`, ['callStack', ...(op.async ? ['heap' as Region] : [])], {
          ...at,
          moved: { taskId: t.id, from: 'callStack', to: 'callStack' },
        });
        break;
      }
      case 'setTimeout': {
        const delay = Math.max(1, op.delayMs);
        const label = op.label ?? `timeout cb${describe(op.body)}`;
        const t = makeTask('timer', label, op.body, line);
        const api: InternalApi = {
          id: nextId('a'),
          kind: 'timer',
          label: `setTimeout ${op.delayMs}ms${describe(op.body)}`,
          dueAt: clock + delay,
          seq: ++seq,
          task: t,
        };
        apis.push(api);
        emit(
          `setTimeout hands the timer to Node's timer API; it will fire at ${api.dueAt}ms at the earliest${op.delayMs < 1 ? ' (0 is clamped to 1ms)' : ''}.`,
          ['apis', 'heap'],
          { ...at, moved: { taskId: t.id, from: 'callStack', to: 'apis' } },
        );
        break;
      }
      case 'readFile': {
        const label = op.label ?? `readFile cb${describe(op.body)}`;
        const t = makeTask('io', label, op.body, line);
        apis.push({
          id: nextId('a'),
          kind: 'io',
          label: `readFile ${op.path ?? 'file.txt'}`,
          dueAt: clock + IO_LATENCY_MS,
          seq: ++seq,
          task: t,
        });
        emit(
          'readFile starts an asynchronous read; the callback will arrive in the poll phase once it completes.',
          ['apis', 'heap'],
          { ...at, moved: { taskId: t.id, from: 'callStack', to: 'apis' } },
        );
        break;
      }
      case 'setImmediate': {
        const t = makeTask('immediate', op.label ?? `immediate cb${describe(op.body)}`, op.body, line);
        phaseQ.check.push(t);
        emit('setImmediate queues its callback for the check phase.', ['checkQ', 'heap'], fromStack(t, 'checkQ'));
        break;
      }
      case 'nextTick': {
        const t = makeTask('tick', op.label ?? `nextTick cb${describe(op.body)}`, op.body, line);
        nextTickQ.push(t);
        emit('process.nextTick puts its callback in the nextTick queue.', ['nextTick', 'heap'], fromStack(t, 'nextTick'));
        break;
      }
      case 'promiseThen': {
        const t = makeTask('microtask', op.label ?? `then cb${describe(op.body)}`, op.body, line);
        const pid = addHeap({ type: 'promise', label: 'Promise', state: 'resolved' });
        t.heapIds.push(pid);
        microQ.push(t);
        emit(
          'The promise is already resolved, so .then queues its callback in the microtask queue right away.',
          ['microtask', 'heap'],
          fromStack(t, 'microtask'),
        );
        break;
      }
      case 'await': {
        const afId = innermostAsync();
        const af = heap.find((h) => h.id === afId);
        if (af) af.state = 'suspended';
        const name = frame.task.label.replace(/\(\)$/, '').replace(/ \(continued\)$/, '');
        const t = makeTask('microtask', `${name}() continues${describe(op.rest)}`, op.rest, line);
        if (afId) t.asyncFrameId = afId;
        microQ.push(t);
        // The async function suspends and returns to its caller immediately.
        frames.pop();
        emit(
          `await suspends ${name}(); the code after it becomes a microtask and control returns to the caller.`,
          ['callStack', 'microtask', 'heap'],
          { ...at, moved: { taskId: t.id, from: 'callStack', to: 'microtask' } },
        );
        break;
      }
      case 'block': {
        clock += op.ms;
        emit(
          `A busy loop blocks the single thread for ${op.ms}ms (now ${clock}ms). Nothing else can run meanwhile.`,
          ['callStack'],
          at,
        );
        break;
      }
      default: {
        const _never: never = op;
        throw new Error(`Unknown op ${(_never as { op: OpName }).op}`);
      }
    }
  }

  /** Run a task that has already been removed from its queue, from stack push to stack empty. */
  function runTask(task: InternalTask, fromRegion: Region, caption: string): void {
    pushFrame(task, task.asyncFrameId);
    // Closure/promise objects are consumed once the callback is running.
    const keepAsync = task.asyncFrameId;
    const resumed = heap.find((h) => h.id === keepAsync);
    if (resumed) resumed.state = 'pending'; // running again, no longer suspended
    dropHeap(task.heapIds.filter((id) => id !== keepAsync));
    task.heapIds = task.heapIds.filter((id) => id === keepAsync);
    emit(caption, ['callStack', fromRegion, 'heap'], {
      ...(task.line !== undefined ? { line: task.line } : {}),
      moved: { taskId: task.id, from: fromRegion, to: 'callStack' },
    });

    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!;
      const op = frame.ops[frame.pc++];
      if (op) {
        execute(frame, op);
        continue;
      }
      frames.pop();
      const asyncId = frame.asyncFrameId;
      if (asyncId && !heap.some((h) => h.id === asyncId && h.state === 'suspended')) {
        dropHeap([asyncId]);
      }
      const done = frame.task.label;
      emit(
        frames.length === 0
          ? `${done} returns and the call stack is empty.`
          : `${done} returns to its caller.`,
        ['callStack', ...(asyncId ? ['heap' as Region] : [])],
      );
    }
  }

  /** nextTick queue fully, then microtasks fully; repeat until both are empty. */
  function drain(): void {
    while (nextTickQ.length > 0 || microQ.length > 0) {
      if (nextTickQ.length > 0) {
        emit('The call stack is empty, so Node drains the nextTick queue first.', ['nextTick']);
        while (nextTickQ.length > 0) {
          const t = nextTickQ.shift()!;
          runTask(t, 'nextTick', `${t.label} moves from the nextTick queue onto the empty stack.`);
        }
      }
      if (microQ.length > 0) {
        emit('The nextTick queue is empty, so Node drains the microtask queue.', ['microtask']);
        // Microtasks queued by microtasks run in this same drain; nextTicks wait.
        while (microQ.length > 0) {
          const t = microQ.shift()!;
          runTask(t, 'microtask', `${t.label} moves from the microtask queue onto the empty stack.`);
        }
        if (nextTickQ.length > 0) {
          emit('The microtask queue is empty but nextTick callbacks were queued meanwhile; they run now.', ['nextTick']);
        }
      }
    }
  }

  /** Run a callback from a phase queue, then drain nextTick/microtasks. */
  function runCallback(task: InternalTask, region: Region): void {
    runTask(task, region, `${task.label} moves from its queue onto the empty stack.`);
    drain();
  }

  function moveDueApis(kind: PendingApi['kind'], to: Phase): void {
    const due = apis
      .filter((a) => a.kind === kind && a.dueAt <= clock)
      .sort((a, b) => a.dueAt - b.dueAt || a.seq - b.seq);
    for (const api of due) {
      apis.splice(apis.indexOf(api), 1);
      phaseQ[to].push(api.task);
      const late = clock - api.dueAt;
      emit(
        kind === 'timer'
          ? `The ${api.label} timer has elapsed${late > 0 ? ` (${late}ms late)` : ''}; its callback joins the timers queue.`
          : `${api.label} finished; its callback joins the poll queue.`,
        ['apis', PHASE_REGION[to]],
        { moved: { taskId: api.task.id, from: 'apis', to: PHASE_REGION[to] } },
      );
    }
  }

  function runQueue(p: Phase, count: number): void {
    for (let i = 0; i < count; i++) {
      const t = phaseQ[p].shift()!;
      runCallback(t, PHASE_REGION[p]);
    }
  }

  function enterPhase(p: Phase, caption: string): void {
    phase = p;
    emit(caption, ['phase']);
  }

  // ---- main script ----
  emit('Ready. Node is about to run the main script.', []);
  const script = makeTask('script', 'main script', scenario.ops);
  dropHeap(script.heapIds);
  script.heapIds = [];
  runTask(script, 'callStack', 'The main script starts running on the call stack.');
  drain();

  // ---- event loop ----
  if (apis.length > 0 || PHASES.some((p) => phaseQ[p].length > 0)) {
    if (timerElapsed) clock += 1;
    emit(
      timerElapsed
        ? 'The script is done. The event loop starts; at least 1ms has passed, so 1ms timers are already due.'
        : 'The script is done. The event loop starts quickly, before any 1ms timer is due.',
      ['phase'],
    );
  }

  while (apis.length > 0 || PHASES.some((p) => phaseQ[p].length > 0)) {
    // timers
    enterPhase('timers', 'Timers phase: run callbacks of timers that have elapsed.');
    moveDueApis('timer', 'timers');
    if (phaseQ.timers.length === 0) emit('No timer is due yet, so the loop moves on.', ['phase']);
    runQueue('timers', phaseQ.timers.length);

    // pending (system-level callbacks): always empty in this simulation, so skipped silently
    phase = 'pending';

    // poll
    enterPhase('poll', 'Poll phase: run completed I/O callbacks.');
    moveDueApis('io', 'poll');
    if (phaseQ.poll.length === 0 && phaseQ.check.length === 0 && apis.length > 0) {
      const next = Math.min(...apis.map((a) => a.dueAt));
      if (next > clock) {
        clock = next;
        emit(`Nothing is ready and nothing is queued for check, so poll waits; the clock advances to ${clock}ms.`, ['phase']);
      }
      moveDueApis('io', 'poll');
    }
    if (phaseQ.poll.length === 0) emit('No I/O callbacks are ready, so the loop moves on.', ['phase']);
    runQueue('poll', phaseQ.poll.length);

    // check — only callbacks queued before the phase started run now
    enterPhase('check', 'Check phase: run setImmediate callbacks.');
    if (phaseQ.check.length === 0) emit('No setImmediate callbacks are queued.', ['phase']);
    runQueue('check', phaseQ.check.length);

    // close: always empty, skipped silently
    phase = 'close';
  }

  phase = null;
  emit('Nothing is left to do, so the event loop exits.', []);
  return steps;
}
