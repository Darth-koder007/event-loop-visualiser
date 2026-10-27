import { useEffect, useMemo, useState } from "react";
import { simulate } from "./engine/simulate";
import { scenarios } from "./scenarios";
import { Player } from "./ui/Player";

type Theme = "light" | "dark";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

const params = new URLSearchParams(location.search);
const embed = params.has("embed");

export function App() {
  const [scenarioId, setScenarioId] = useState(
    () => scenarios.find((s) => s.id === params.get("scenario"))?.id ?? scenarios[0]!.id
  );
  const [timerElapsed, setTimerElapsed] = useState(true);
  const [predictMode, setPredictMode] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);

  const scenario = scenarios.find((s) => s.id === scenarioId)!;
  const steps = useMemo(
    () => simulate(scenario, { timerElapsedAtLoopStart: timerElapsed }),
    [scenario, timerElapsed]
  );

  return (
    <div className={`app ${embed ? "embed" : ""}`}>
      {!embed && (
        <header className="header">
          <div>
            <h1>Node Event Loop Visualizer</h1>
            <p className="sub">
              Step through how Node.js runs your code. Nothing here executes JavaScript; it is a
              simulation.
            </p>
          </div>
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </header>
      )}

      <nav className="toolbar" aria-label="Scenarios">
        <div className="scenarios">
          {scenarios.map((s, i) => (
            <button
              key={s.id}
              aria-pressed={s.id === scenarioId}
              onClick={() => setScenarioId(s.id)}
            >
              {i + 1}. {s.title}
            </button>
          ))}
        </div>
        <p className="summary">{scenario.summary}</p>
        <div className="options">
          {scenario.hasTimerRace && (
            <label>
              <input
                type="checkbox"
                checked={timerElapsed}
                onChange={(e) => setTimerElapsed(e.target.checked)}
              />
              Timer already elapsed when the loop starts
            </label>
          )}
          <label>
            <input
              type="checkbox"
              checked={predictMode}
              onChange={(e) => setPredictMode(e.target.checked)}
            />
            Predict the order first
          </label>
        </div>
      </nav>

      <main>
        <Player
          key={`${scenario.id}-${timerElapsed}-${predictMode}`}
          scenario={scenario}
          steps={steps}
          predictMode={predictMode}
        />
      </main>
    </div>
  );
}
