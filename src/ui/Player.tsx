import { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import type { Scenario, Step } from '../engine/types';
import { CodePanel } from './CodePanel';
import { Controls } from './Controls';
import { Machine } from './Machine';
import { Predict } from './Predict';

interface Props {
  scenario: Scenario;
  steps: Step[];
  predictMode: boolean;
}

const BASE_DELAY_MS = 1400;

export function Player({ scenario, steps, predictMode }: Props) {
  const last = steps.length - 1;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [revealed, setRevealed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const locked = predictMode && !revealed;
  const isPlaying = playing && !locked && index < last;
  const step = steps[index]!;
  const actual = steps[last]!.console;

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, last)), [last]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const reset = useCallback(() => {
    setIndex(0);
    setPlaying(false);
  }, []);
  const toggle = useCallback(() => setPlaying((p) => !p), []);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(next, BASE_DELAY_MS / speed);
    return () => clearInterval(id);
  }, [isPlaying, speed, next]);

  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      const tag = el.tagName;
      const isRange = tag === 'INPUT' && (el as HTMLInputElement).type === 'range';
      if (tag === 'SELECT' || tag === 'TEXTAREA' || (tag === 'INPUT' && !isRange)) return;
      if (e.key === 'ArrowRight' && !isRange) next();
      else if (e.key === 'ArrowLeft' && !isRange) prev();
      else if (e.key === ' ' && tag !== 'BUTTON' && !isRange) toggle();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, next, prev, toggle]);

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.28, ease: 'easeOut' }}>
      <p className="caption" role="status" aria-live="polite" aria-atomic="true">
        {locked ? 'Make your prediction first, then reveal to start stepping.' : step.caption}
      </p>
      <Controls
        index={index}
        last={last}
        playing={isPlaying}
        speed={speed}
        disabled={locked}
        onPrev={prev}
        onNext={next}
        onReset={reset}
        onToggle={toggle}
        onSeek={setIndex}
        onSpeed={setSpeed}
      />
      <div className="layout">
        <div className="left">
          <CodePanel code={scenario.code} activeLine={locked ? undefined : step.activeLine} />
          {predictMode ? (
            <Predict
              key={attempt}
              seed={scenario.id}
              actual={actual}
              revealed={revealed}
              onReveal={() => setRevealed(true)}
              onRetry={() => {
                setRevealed(false);
                setAttempt((a) => a + 1);
                reset();
              }}
            />
          ) : (
            <section className="panel expected" aria-label="Expected output">
              <h3 className="panel-title">Expected output</h3>
              <p className="expected-line">{actual.join('  ·  ')}</p>
            </section>
          )}
        </div>
        <Machine step={step} />
      </div>
    </MotionConfig>
  );
}
