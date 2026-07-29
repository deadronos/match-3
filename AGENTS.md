# AGENTS.md

> Project memory for AI agents and new contributors. Read this first, then the
> docs it points to. Don't re-derive anything in here from the code — the docs
> are authoritative and stay in sync with the code.

## What this is

**Gems — A Match-3.** A browser-based match-3 game. The current source (`src/`) is the v2 rewrite; the original single-file game is preserved at `legacy/index.html` for reference only — don't touch it.

## Read these first

The full project design lives in [`docs/`](./docs/). **Start with [`docs/README.md`](./docs/README.md)**, then read in this order:

1. [`docs/architecture.md`](./docs/architecture.md) — the system design: engine ↔ React contract, layering, animation strategy, state machine. **This is the most important doc** for understanding the codebase.
2. [`docs/plan.md`](./docs/plan.md) — the build order, the deliberate version-pin decisions (TS 7 + Biome), and what's intentionally NOT in this project.
3. [`docs/game-rules.md`](./docs/game-rules.md) — the gameplay spec: scoring, specials, level math, edge cases. If you're touching game logic, this is the source of truth.
4. [`docs/migration.md`](./docs/migration.md) — v1 → v2 changes plus the v2.0.1 toolchain swap (ESLint+Prettier → Biome, TS 5.9 → 7).

If you're picking up a bug report, the engine state machine diagram in `architecture.md` (the "State machine" section) is usually the fastest path to the answer.

## Tooling

| | Version | Notes |
| --- | --- | --- |
| Node | ≥ 20.19 | Vite 8 minimum |
| TypeScript | 7.0 | The `typescript-eslint` 8 line doesn't support TS 7 yet — that's why we use **Biome** for lint+format. Don't try to add `typescript-eslint`; it won't install alongside TS 7. |
| Vite | 8.1 | |
| Vitest | 4.1 | Configured in `vite.config.ts` (same file as Vite) |
| React | 19.2 | Uses the new JSX transform — no `import React` in `.tsx` files |
| Biome | 2.5 | Single config at `biome.json`. Lint + format in one tool. ~13 ms for the whole repo. |

## Commands

```sh
npm install
npm run dev          # Vite dev server on :5173
npm run build        # tsc -b && vite build → dist/
npm run preview      # serve dist/

npm run typecheck    # tsc -b --noEmit
npm run lint         # biome check
npm run lint:fix     # biome check --write
npm run format       # biome format --write
npm run format:check # biome format

npm run test         # vitest run (52 tests, ~430 ms)
npm run test:watch
npm run test:coverage
```

## Project layout

```
src/
├── game/                 # PURE logic + stateful engine. No React, no DOM.
│   ├── types.ts          #   Gem, Position, GameState, MatchInfo, ScorePop, …
│   ├── config.ts         #   GRID, colors per level, animation timings, scoring
│   ├── board.ts          #   findMatches, applyGravity, refillEmpty, wouldMatch, …
│   ├── engine.ts         #   GameEngine class — owns state, timers, animation
│   ├── storage.ts        #   localStorage wrapper for the best score
│   └── *.test.ts         #   52 Vitest tests, all in this directory
│
├── components/           # React view. Thin.
│   ├── Board.tsx         #   cell backgrounds + gems + score pop
│   ├── Gem.tsx           #   single gem (memoized)
│   ├── HUD.tsx           #   level / score / moves / combo + toolbar
│   ├── Overlays.tsx      #   Start, Pause, Level-Complete, Game-Over
│   ├── Footer.tsx        #   keyboard hints + version
│   └── icons.tsx         #   inline SVG icons
│
├── hooks/                # React glue
│   ├── useGame.ts        #   owns the engine + re-render trigger
│   ├── useKeyboardInput.ts
│   └── useVisibilityPause.ts
│
├── App.tsx               # top-level layout
├── main.tsx              # createRoot + <StrictMode>
├── index.css             # globals (CSS vars, body)
├── App.css               # component styles
└── test/setup.ts         # vitest setup
```

## Conventions / gotchas

- **The engine is the single source of truth.** React just renders `engine.state` and dispatches intent methods (`engine.swap(a, b)`, `engine.pause()`, etc.). Do NOT mirror state into `useState` for things the engine tracks. If a piece of UI needs to know about engine state, read it from `engine.state` in the `useGame` hook.

- **Animation timing is owned by the engine.** CSS transitions on `left`/`top` interpolate between renders. The engine holds `state.poppedGems: Set<number>` and `state.spawned: SpawnedGem[]` to drive pop and fall animations. See `architecture.md` for the three-step pattern.

- **Grid access uses `!` extensively.** `tsconfig.app.json` enables `noUncheckedIndexedAccess`, so `grid[r][c]` is `Cell | undefined`. We use `grid[r]![c]!` after explicit bounds checks. Biome's `noNonNullAssertion` rule is **off** in `biome.json` for this reason. Don't refactor it away without understanding why.

- **TypeScript 7.0 + Biome, not ESLint.** `typescript-eslint` 8.x's peer range tops out at `<6.1.0`. If a future task asks you to add ESLint, push back — Biome is doing the same job and works with TS 7. If you really need an ESLint rule, run ESLint alongside Biome for that subset.

- **Tests for the engine use `vi.useFakeTimers()`.** The engine's animations are real `setTimeout` calls. `engine.test.ts` shows the pattern: `vi.advanceTimersByTimeAsync(SETTLE_MS)` to fast-forward through a full chain. Don't replace the fake timers with `await sleep(N)` — the engine's `sleep` calls won't be mocked and the tests will time out.

- **The `STORAGE_KEY` is `gems.match3.v1`.** Changing it invalidates existing players' high scores. Don't bump it without a migration.

- **`prefers-reduced-motion`** is not handled. If you add it, do it in `App.css` (a single media query that disables `transition` and `animation`).

## Things you should NOT do

- Don't add Redux / Zustand / Context. The engine *is* the store.
- Don't split the game logic across multiple files. The split is `board.ts` (pure) and `engine.ts` (stateful). Keep it that way.
- Don't add `react-refresh/only-export-components` or other ESLint rules — we're on Biome.
- Don't bump `tsconfig` strictness flags without checking the test suite. The engine relies on `noUncheckedIndexedAccess` to surface missing bounds checks.
- Don't change the storage key. Don't add a server. The high score is `localStorage` only.

## When you're done

- Run `npm run typecheck && npm run lint && npm run test && npm run build` and confirm all four pass.
- If you change game behavior, update `docs/game-rules.md`.
- If you change architecture (new layer, new hook, new contract), update `docs/architecture.md`.
- If you change the build plan or add/remove tooling, update `docs/plan.md`.
- The docs are part of the deliverable, not optional commentary.
