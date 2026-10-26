interface Props {
  index: number;
  last: number;
  playing: boolean;
  speed: number;
  disabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  onToggle: () => void;
  onSeek: (i: number) => void;
  onSpeed: (s: number) => void;
}

export function Controls(p: Props) {
  return (
    <div className="controls" role="group" aria-label="Playback controls">
      <div className="buttons">
        <button onClick={p.onReset} disabled={p.disabled || p.index === 0}>
          Reset
        </button>
        <button onClick={p.onPrev} disabled={p.disabled || p.index === 0} aria-keyshortcuts="ArrowLeft">
          ← Prev
        </button>
        <button className="primary" onClick={p.onToggle} disabled={p.disabled || p.index >= p.last} aria-keyshortcuts="Space">
          {p.playing ? 'Pause' : 'Play'}
        </button>
        <button onClick={p.onNext} disabled={p.disabled || p.index >= p.last} aria-keyshortcuts="ArrowRight">
          Next →
        </button>
      </div>
      <label className="slider timeline">
        <span>
          Step {p.index + 1} / {p.last + 1}
        </span>
        <input
          type="range"
          min={0}
          max={p.last}
          value={p.index}
          disabled={p.disabled}
          onChange={(e) => p.onSeek(Number(e.target.value))}
          aria-label="Timeline"
          aria-valuetext={`Step ${p.index + 1} of ${p.last + 1}`}
        />
      </label>
      <label className="slider speed">
        <span>Speed {p.speed}×</span>
        <input
          type="range"
          min={0.5}
          max={4}
          step={0.5}
          value={p.speed}
          onChange={(e) => p.onSpeed(Number(e.target.value))}
          aria-label="Auto-play speed"
        />
      </label>
    </div>
  );
}
