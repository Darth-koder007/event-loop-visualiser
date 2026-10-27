Build a browser-only portfolio project: "Node Event Loop Visualizer", an animated, subtle, polished step-through of how Node.js executes code. No backend. Deploy as a static site (GitHub Pages).

## Stack

Vite + React + TypeScript (strict), CSS variables for theming (light/dark via prefers-color-scheme + manual toggle), Framer Motion (or plain CSS transitions) for animation, Vitest for tests. No UI kit.

## Core architecture (important)

Separate the engine from the UI.

1. `engine/` (pure TS, no React): a deterministic simulator that takes a scenario and returns an array of Step snapshots. Do NOT parse or execute arbitrary JS. Scenarios are written as a small typed op list:
   - log(text)
   - setTimeout(delayMs, body)
   - setImmediate(body)
   - nextTick(body)
   - promiseThen(body) // already-resolved promise
   - await(rest) // async fn suspends; rest becomes a microtask
   - readFile(body) // I/O callback arrives in the poll phase
   - callFn(name, body) // pushes a frame on the call stack
     where body is again a list of ops.
2. Each Step snapshot contains: callStack, heap objects (closures, promises, suspended async frames), nextTickQueue, microtaskQueue, libuv phase (timers, pending, poll, check, close), per-phase callback queues, pending APIs (timers, I/O), console output, a human-readable caption, and `highlight` (which region changed).
3. Engine rules to implement faithfully:
   - Stack must be empty before any queue runs.
   - After the main script and after EVERY callback: drain nextTick queue fully, then microtask queue fully (nextTicks queued by microtasks run after the microtask queue drains, then repeat until both empty).
   - Phases in order: timers -> pending -> poll (I/O) -> check (setImmediate) -> close.
   - Top-level setTimeout(0) vs setImmediate is non-deterministic: expose a toggle "timer already elapsed when loop starts" that decides the order. Inside an I/O callback, setImmediate always runs before setTimeout.
4. `ui/`: renders a Step snapshot only. UI never contains event loop logic.

## UI / UX

- Layout: left = code panel with the current op highlighted; right = visual machine: Call Stack, Heap, libuv/Node APIs, nextTick queue, Microtask queue, a horizontal loop-phase ring/bar showing the current phase, Console output at the bottom.
- Animations: when an op runs, the item visibly moves between regions (e.g. callback card slides from stack into a queue, then back to the stack when it executes). Subtle: 200-350ms, ease-out, no bounce, no glow, no confetti. Calm, flat, lots of whitespace.
- Controls: Next, Prev, Reset, Auto-play with speed slider, keyboard shortcuts (arrow keys, space). Scrubbable timeline slider across all steps.
- Caption bar explaining each step in one sentence ("Stack is empty, so Node drains the nextTick queue first").
- Scenario picker with 6-8 curated scenarios: (1) sync + setTimeout + promise + nextTick + async/await (expected output A E G D C F B), (2) setTimeout vs setImmediate top-level, (3) setTimeout vs setImmediate inside readFile, (4) nextTick starvation of microtasks, (5) promise chain vs nextTick ordering, (6) a blocking loop delaying a timer. Each shows the expected console output and a "predict the order first" mode: user types/drags their predicted order, then reveals the real one.
- Responsive down to 375px width (panels stack), light + dark mode, respects prefers-reduced-motion (no movement animations, instant state changes).
- Accessibility: semantic regions with aria-labels, aria-live="polite" caption announcing each step, full keyboard operation, visible focus rings, WCAG AA contrast, never rely on color alone (use labels/icons).

## Testing and quality

- Vitest unit tests for the engine, one per scenario asserting the exact console output order. Scenario 1 must produce: A E G D C F B. Test the nextTick/microtask drain loop and the in-I/O setImmediate-before-setTimeout rule.
- Typecheck + lint + tests run in a GitHub Actions workflow, which also builds and deploys to GitHub Pages.
- README: what it is, a GIF/screenshot, the architecture (engine vs UI), how to add a scenario, and a "known simplifications" section (single thread, no real I/O, timers simulated, no worker threads).

## Process

1. First, propose the engine types and the scenario format and wait for my approval.
2. Then implement the engine with tests before any UI.
3. Then the UI in small commits.
4. Keep the visual style minimal: neutral palette, one accent color, system font stack, 1px hairline borders, rounded 10-12px corners, no shadows.
