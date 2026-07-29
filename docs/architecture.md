# Architecture

This document describes how the v2 codebase is organised and the design decisions behind it. Read this first if you're picking the project up.

## High-level shape

```
                ┌────────────────────┐
                │   React components │
                │ (Board, HUD, …)    │
                └──────────┬─────────┘
                           │ useGame() hook
                           ▼
                ┌────────────────────┐
                │   React hooks      │
                │ (useGame,          │
                │  useKeyboardInput) │
                └──────────┬─────────┘
                           │ state + intents
                           ▼
                ┌────────────────────┐
                │   GameEngine       │  ← single source of truth
                │  (state machine)   │
                └──────────┬─────────┘
                           │ calls pure functions
                           ▼
                ┌────────────────────┐
                │  Pure game logic   │
                │  (board.ts,        │
                │   config.ts)       │
                └────────────────────┘
```

The defining rule: **the React tree is a "view" of the engine's state**. The engine owns the state machine, animation timing, and game progression. React just renders the current state and dispatches intent methods.

## Directory layout

```
src/
├── main.tsx                # React entry — createRoot + <App />
├── App.tsx                 # Top-level layout: HUD, Board, overlays
├── index.css               # Globals: CSS variables, body / html
├── App.css                 # Component CSS (board, HUD, overlays, animations)
│
├── game/                   # ── Pure / engine code (no React, no DOM) ──
│   ├── types.ts            # Gem, Position, GameState, MatchInfo, …
│   ├── config.ts           # GRID, colors, animation timings, level math
│   ├── board.ts            # findMatches, applyGravity, refillEmpty, …
│   ├── engine.ts           # GameEngine class — state machine + animation
│   ├── storage.ts          # localStorage wrapper for the best-score
│   ├── board.test.ts       # Vitest tests for board logic
│   ├── config.test.ts      # Vitest tests for level config / palette
│   └── engine.test.ts      # Vitest tests for the engine (fake-timers)
│
├── components/             # ── React view layer ──
│   ├── Board.tsx           # Cell background + gem rendering
│   ├── Gem.tsx             # A single gem (memoized)
│   ├── HUD.tsx             # Level / score / moves / combo + toolbar
│   ├── Overlays.tsx        # Start, Pause, Level-Complete, Game-Over
│   ├── Footer.tsx          # Keyboard hints + version
│   └── icons.tsx           # Inline SVG icons (shuffle, pause, special badges)
│
├── hooks/                  # ── Glue between engine and React ──
│   ├── useGame.ts          # Owns the engine; re-renders on state changes
│   ├── useKeyboardInput.ts # Wires arrows / space / P / R / Esc
│   └── useVisibilityPause.ts # Auto-pause on tab hide
│
└── test/
    └── setup.ts            # Vitest setup: @testing-library/jest-dom matchers
```

## Engine ↔ React contract

The engine exposes a deliberately tiny API:

```ts
class GameEngine {
  state: GameState;        // public, read-only by convention
  best: number;            // mirrored from localStorage

  subscribe(listener: () => void): () => void;

  startLevel(level: number): void;
  restartLevel(): void;
  startNextLevel(): void;
  returnToMenu(): void;

  pause(): void;
  resume(): void;
  togglePause(): void;

  async swap(a: Position, b: Position): Promise<void>;
  async shuffle(): Promise<void>;

  setCursor(p: Position): void;
  selectAt(p: Position): void;
  clearSelection(): void;
  async handleSelectOrSwap(p: Position): Promise<void>;

  onVisibilityChange(hidden: boolean): void;
  dispose(): void;
}
```

The React side:

```ts
function useGame() {
  const engine = useMemo(() => new GameEngine(), []);
  const [state, setState] = useState(engine.state);
  useEffect(() => engine.subscribe(() => setState({ ...engine.state })), [engine]);
  useEffect(() => () => engine.dispose(), [engine]);
  return { engine, state };
}
```

Every time the engine calls `setState`, the `subscribe` callback runs, which copies `engine.state` into React state. React then re-renders the tree.

This means **the engine can run for arbitrarily long (e.g. a chain of 6 cascades) without any React state management**. The React layer just sees the final state.

## Animation strategy

We use **CSS transitions on the `left` / `top` properties** of each gem:

```css
.gem {
  position: absolute;
  transition: left 0.28s var(--ease), top 0.28s var(--ease);
}
.gem.no-transition { transition: none; }
```

- Each gem has a stable `id` (monotonically increasing) so React keeps the same DOM node across re-renders.
- The gem's `style.left` and `style.top` are derived from the grid: `calc(${c} * (100% / 8))`.
- When the engine moves a gem in the grid, the next React render sees the new position; the CSS transition interpolates between the old and new values.

### Falling & spawning

New gems (from `refillEmpty`) spawn "from above the board" and fall in. The engine reports them in `state.spawned[]` with a `fromR` (negative) and `toR` (in the grid). The Board component renders the gem at `fromR` first, then the engine clears `state.spawned` after `ANIM.fall` ms, and the next render places the gem at `toR` — the CSS transition animates the fall.

### Popping

Gems that are about to be cleared are added to `state.poppedGems`. They stay in the grid for `ANIM.pop` ms with a `popping` class (CSS keyframes). After the delay, the engine removes them from the grid AND from `poppedGems` in the same state update — React unmounts the DOM, the animation has already played.

This three-step pattern is what the original v1 game did with direct DOM manipulation; the React version preserves the exact same timing.

## Pure game logic

Everything in `src/game/` is **pure**: no React, no DOM, no globals. Functions take a grid in, return a grid (or set of cells) out. The engine is the only thing that has side effects (timers, state mutation, React subscriptions).

Why bother?
- 100% unit-testable. No jsdom needed for the 60+ tests covering match detection, gravity, refill, bomb triggers, level config, and engine state transitions.
- The engine can be reused in a Node/CLI environment, a worker, or a future React Native port.
- Refactors of the UI never touch the game rules.

## State machine

The engine's `screen` field is the source of truth for "what is the user looking at right now":

| `screen` | Meaning | What the UI shows |
| --- | --- | --- |
| `start` | Title screen | Start overlay + frozen board |
| `playing` | Active game | HUD + interactive board |
| `paused` | Paused mid-game | Pause overlay + frozen board |
| `levelComplete` | Reached the target | Level-complete overlay |
| `gameOver` | Out of moves | Game-over overlay |

Transitions:

```
   start ──[startLevel]──▶ playing
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   [togglePause]         [score≥target]         [moves=0]
        │                     │                     │
        ▼                     ▼                     ▼
     paused            levelComplete           gameOver
        │                     │                     │
   [togglePause]     [startNextLevel]         [restartLevel]
        │                     │                     │
        ▼                     ▼                     ▼
    playing            playing (level+1)       playing
```

The auto-pause-on-tab-hide transitions `playing → paused`. The auto-shuffle-on-no-moves transitions `playing → playing` (a coroutine inside `finishTurn`).

## CSS architecture

- Global tokens in `src/index.css` (CSS variables, font stack, background).
- Component CSS in `src/App.css`. We didn't split per-component CSS because the styles are tightly interrelated (the gem's classes are reused by the board, the overlays share tokens, etc.). For a larger app we'd reach for CSS modules.
- All animations are CSS keyframes / transitions — no JS-driven tweens. This keeps the React renders cheap.

## What's NOT here

- No state management library (Redux, Zustand, etc.). The engine IS the store.
- No routing. There's a single screen.
- No i18n. The strings are in English.
- No persistence beyond the all-time best score. Mid-game save/restore is out of scope.
- No sound. (The original was silent too.)
- No server. The best score lives in `localStorage`.

## Testing philosophy

- **Pure logic** is unit-tested in isolation (`board.test.ts`, `config.test.ts`).
- **Engine state transitions** are tested with `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync()` to fast-forward through the animation delays (`engine.test.ts`).
- **No React component tests** yet. The components are thin and the behavior is well-covered by engine tests. Add `@testing-library/react` tests if/when component logic gets non-trivial.
- Coverage: `npm run test:coverage` (v8 provider).

## Tooling

- **Vite 8** — bundler + dev server.
- **React 19** — UI library. The new JSX transform; no `React` import needed in `.tsx` files.
- **TypeScript 7** — strict mode + `noUncheckedIndexedAccess` for safe grid access.
- **Vitest 4** — test runner, configured in `vite.config.ts` (single config for dev + test).
- **Biome 2.5** — single Rust-based tool that does linting + formatting. ~100x faster than ESLint + Prettier, doesn't depend on the TypeScript programmatic API, so it works seamlessly with TS 7 (which doesn't have a stable API yet — see `plan.md`).

See `plan.md` for the step-by-step build order and `migration.md` for the v1 → v2 changes.
