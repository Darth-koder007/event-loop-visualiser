import { useMemo, useState } from 'react';
import { scorePrediction, shuffleSeeded } from '../predict';

interface Props {
  seed: string;
  actual: string[];
  revealed: boolean;
  onReveal: () => void;
  onRetry: () => void;
}

export function Predict({ seed, actual, revealed, onReveal, onRetry }: Props) {
  const options = useMemo(() => shuffleSeeded(actual, seed), [actual, seed]);
  const [picked, setPicked] = useState<number[]>([]); // indices into options
  const guess = picked.map((i) => options[i]!);
  const score = scorePrediction(guess, actual);

  if (revealed) {
    return (
      <section className="panel predict" aria-label="Prediction result">
        <h3 className="panel-title">Your prediction</h3>
        <p className="predict-summary">
          {score.perfect ? '✓ Exactly right.' : `${score.correct} of ${actual.length} in the right place.`} Step through
          to see why.
        </p>
        <ol className="chips">
          {actual.map((expected, i) => (
            <li key={i} className={`chip ${score.marks[i] ? 'ok' : 'bad'}`}>
              <span aria-hidden="true">{score.marks[i] ? '✓' : '✗'} </span>
              <span className="sr-only">{score.marks[i] ? 'correct: ' : 'wrong: '}</span>
              {guess[i] ?? '(missing)'}
              {!score.marks[i] && <span className="chip-note"> → {expected}</span>}
            </li>
          ))}
        </ol>
        <button onClick={onRetry}>Try again</button>
      </section>
    );
  }

  return (
    <section className="panel predict" aria-label="Predict the output">
      <h3 className="panel-title">Predict the output order</h3>
      <p className="predict-help">Click the lines in the order you think Node prints them, then reveal.</p>
      <ul className="chips pool" aria-label="Available lines">
        {options.map((text, i) => (
          <li key={i}>
            <button className="chip" disabled={picked.includes(i)} onClick={() => setPicked((p) => [...p, i])}>
              {text}
            </button>
          </li>
        ))}
      </ul>
      <ol className="chips answer" aria-label="Your order">
        {picked.length === 0 && <li className="empty">nothing picked yet</li>}
        {picked.map((i, pos) => (
          <li key={i}>
            <button
              className="chip picked"
              onClick={() => setPicked((p) => p.filter((x) => x !== i))}
              aria-label={`${pos + 1}: ${options[i]}. Press to remove`}
            >
              {pos + 1}. {options[i]}
            </button>
          </li>
        ))}
      </ol>
      <div className="buttons">
        <button onClick={() => setPicked([])} disabled={picked.length === 0}>
          Clear
        </button>
        <button className="primary" onClick={onReveal}>
          Reveal
        </button>
      </div>
    </section>
  );
}
