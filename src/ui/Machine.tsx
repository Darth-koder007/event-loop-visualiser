import type { ReactNode } from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import type { HeapObject, PendingApi, Phase, Region, Step, Task } from '../engine/types';

const KIND_TAG: Record<Task['kind'], string> = {
  script: 'script',
  timer: 'timer',
  immediate: 'immediate',
  tick: 'nextTick',
  microtask: 'microtask',
  io: 'I/O',
  fn: 'call',
};

const PHASES: { phase: Phase; region: Region; label: string }[] = [
  { phase: 'timers', region: 'timersQ', label: 'timers' },
  { phase: 'pending', region: 'pendingQ', label: 'pending' },
  { phase: 'poll', region: 'pollQ', label: 'poll' },
  { phase: 'check', region: 'checkQ', label: 'check' },
  { phase: 'close', region: 'closeQ', label: 'close' },
];

function Card({ id, tag, label, detail }: { id: string; tag: string; label: string; detail?: string }) {
  return (
    <motion.div layoutId={id} layout="position" className="card">
      <span className="card-tag">{tag}</span>
      <span className="card-label">{label}</span>
      {detail && <span className="card-detail">{detail}</span>}
    </motion.div>
  );
}

const TaskCard = ({ task }: { task: Task }) => (
  <Card id={task.id} tag={KIND_TAG[task.kind]} label={task.label} />
);

function Panel({
  title,
  changed,
  className = '',
  children,
  empty,
}: {
  title: string;
  changed: boolean;
  className?: string;
  children: ReactNode;
  empty: boolean;
}) {
  return (
    <section className={`panel ${changed ? 'changed' : ''} ${className}`} aria-label={title}>
      <h3 className="panel-title">
        {title}
        {changed && <span className="updated">updated</span>}
      </h3>
      <div className="panel-body">{empty ? <span className="empty">empty</span> : children}</div>
    </section>
  );
}

const HEAP_STATE: Record<NonNullable<HeapObject['state']>, string> = {
  pending: 'running',
  resolved: 'resolved',
  suspended: 'suspended',
};

function HeapItem({ obj }: { obj: HeapObject }) {
  return (
    <div className="card heap-item">
      <span className="card-tag">{obj.type === 'asyncFrame' ? 'async frame' : obj.type}</span>
      <span className="card-label">{obj.label}</span>
      {obj.state && <span className="card-detail">{HEAP_STATE[obj.state]}</span>}
    </div>
  );
}

function ApiItem({ api, clock }: { api: PendingApi; clock: number }) {
  const wait = Math.max(0, api.dueAt - clock);
  return (
    <Card
      id={api.id}
      tag={api.kind === 'timer' ? 'timer' : 'I/O'}
      label={api.label}
      detail={`due at ${api.dueAt}ms · ${wait}ms left`}
    />
  );
}

export function Machine({ step }: { step: Step }) {
  const changed = (r: Region) => step.highlight.includes(r);
  const stackTopFirst = [...step.callStack].reverse();

  return (
    <LayoutGroup>
      <div className="machine">
        <div className="machine-row two">
          <Panel title="Call stack" changed={changed('callStack')} empty={stackTopFirst.length === 0}>
            {stackTopFirst.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </Panel>
          <Panel title="Heap" changed={changed('heap')} empty={step.heap.length === 0}>
            {step.heap.map((h) => (
              <HeapItem key={h.id} obj={h} />
            ))}
          </Panel>
        </div>

        <Panel
          title="Node APIs (timers, I/O)"
          changed={changed('apis')}
          empty={step.pendingApis.length === 0}
        >
          {step.pendingApis.map((a) => (
            <ApiItem key={a.id} api={a} clock={step.clock} />
          ))}
        </Panel>

        <div className="machine-row two">
          <Panel title="nextTick queue" changed={changed('nextTick')} empty={step.nextTickQueue.length === 0}>
            {step.nextTickQueue.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </Panel>
          <Panel title="Microtask queue" changed={changed('microtask')} empty={step.microtaskQueue.length === 0}>
            {step.microtaskQueue.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </Panel>
        </div>

        <section className={`panel loop ${changed('phase') ? 'changed' : ''}`} aria-label="Event loop phases">
          <h3 className="panel-title">
            Event loop phases
            <span className="clock">t = {step.clock}ms</span>
          </h3>
          <ol className="phases">
            {PHASES.map(({ phase, region, label }) => {
              const active = step.phase === phase;
              const queue = step.phaseQueues[phase];
              return (
                <li
                  key={phase}
                  className={`phase ${active ? 'active' : ''} ${changed(region) ? 'changed' : ''}`}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`${label} phase${active ? ' (current)' : ''}`}
                >
                  <span className="phase-name">
                    {active && <span aria-hidden="true">▶ </span>}
                    {label}
                  </span>
                  <div className="phase-queue">
                    {queue.length === 0 ? (
                      <span className="empty">–</span>
                    ) : (
                      queue.map((t) => <TaskCard key={t.id} task={t} />)
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <section className={`panel console ${changed('console') ? 'changed' : ''}`} aria-label="Console output">
          <h3 className="panel-title">
            Console
            {changed('console') && <span className="updated">updated</span>}
          </h3>
          <pre className="console-body">
            {step.console.length === 0 ? (
              <span className="empty">no output yet</span>
            ) : (
              step.console.map((line, i) => (
                <div key={i}>
                  <span aria-hidden="true">› </span>
                  {line}
                </div>
              ))
            )}
          </pre>
        </section>
      </div>
    </LayoutGroup>
  );
}
