# Plan

The rewrite was done in a single pass. This document records the plan we followed, the rationale for each step, and the things we deliberately did not do.

## Goals

1. **Preserve gameplay 1:1** with v1 (no balance changes, no new features).
2. **Make the code testable** by separating pure game logic from DOM and render concerns.
3. **Use current, widely-supported tooling**: React 19, Vite 8, TypeScript 5.9, Vitest 4, ESLint 9, Prettier 3.
4. **Document the rewrite** so the next maintainer can pick it up.
5. **Stay out of the v1 file**. The original `index.html` is preserved at `legacy/index.html` for reference.

## Build order

### 1. Scaffolding

- We wrote `package.json` by hand rather than `npm create vite` because:
  - We wanted the dev, build, test, preview, lint, and format scripts in one place.
  - We needed to pin `typescript` to `~5.9.3` for `typescript-eslint` 8 compatibility (more below).
  - We wanted to add the test setup entry up front.
- We created `tsconfig.json` (references-only), `tsconfig.app.json`, and `tsconfig.node.json`. This is the standard Vite split.
- We set `strict: true` + `noUncheckedIndexedAccess: true` from the start. This is what makes the engine safe under non-null assertions on grid cells.

### 2. Tooling

The project was originally scaffolded with ESLint + Prettier and TS 5.9. We later swapped both to **Biome 2.5** and **TypeScript 7.0** in one pass. See "Decisions worth flagging" below for why.

- **Vite 8** as the bundler, with `@vitejs/plugin-react` 6.
- **Vitest 4** in the same config as Vite (`vite.config.ts`) with `environment: 'jsdom'`. jsdom is only used because we want `@testing-library/jest-dom` to be available later. Pure logic tests do not need it.
- **Biome 2.5** for lint and format. Single Rust tool, single config file (`biome.json`). About 100x faster than ESLint + Prettier. Configured with the recommended preset plus a few opinionated tweaks (no console in production code, `useImportType`, `useExhaustiveDependencies` as a warning).

### 3. Game logic

- `src/game/types.ts`: pure type definitions. `Position`, `Gem`, `Cell`, `GameState`, `MatchGroup`, `MatchInfo`, `Score`, `Screen`, `ScorePop`, `SpawnedGem`. Everything `readonly` where it does not need to mutate.
- `src/game/config.ts`: constants and level math. Single source of truth for `GRID`, color palette per level, animation timings, scoring numbers. This is the easiest file to tweak if you want to balance the game.
- `src/game/board.ts`: pure functions. `findMatches`, `applyGravity`, `refillEmpty`, `wouldMatch`, `findAnyValidMove`, `detectBombTrigger`, `resolveClears`, plus tiny geometry helpers (`inBounds`, `samePos`, `isAdjacent`, `dirBetween`).
- `src/game/storage.ts`: localStorage read and write. Returns 0 and no-ops on the server.
- `src/game/engine.ts`: the `GameEngine` class. The orchestrator. It owns the state machine, timers, subscriptions, and turn lifecycle.
- `src/game/state.ts`, `animation.ts`, `hints.ts`, `turns.ts`, `progression.ts`, and `bombs.ts`: focused helpers that keep the engine readable without changing gameplay rules.

The split between pure board helpers and the engine orchestrator is the key refactor. It makes the engine easier to reason about while preserving the same gameplay rules.

### 4. React layer

- `src/hooks/useGame.ts`: owns the engine, re-renders on state changes.
- `src/hooks/useKeyboardInput.ts`: wires `keydown` to engine intents.
- `src/hooks/useVisibilityPause.ts`: auto-pause on `visibilitychange`.
- `src/components/Board.tsx`: renders cell backgrounds + gems + the floating score pop.
- `src/components/Gem.tsx`: a single gem. `React.memo`'d to avoid re-rendering 64 gems when the score changes.
- `src/components/HUD.tsx`: 4 stat tiles + toolbar.
- `src/components/Overlays.tsx`: Start, Pause, LevelComplete, GameOver. All share the same shell.
- `src/components/Footer.tsx` + `src/components/icons.tsx`: small.

### 5. Tests

- `src/game/board.test.ts`: 30+ tests covering every pure function, including tricky cases (T-intersections, double-bomb detection, gravity on partial columns, `refillEmpty` preserving existing gems, `wouldMatch` idempotence).
- `src/game/config.test.ts`: color palette per level, level config math (target, moves, floor).
- `src/game/engine.test.ts`: engine state machine with `vi.useFakeTimers()`. Tests the `startLevel` -> `swap` -> cascade -> `levelComplete` path and the game-over path.

We considered adding `@testing-library/react` component tests, but the components are very thin and the engine tests already cover the behavior. Skipped for now. Can be added later.

### 6. Docs

- `docs/architecture.md`: system design, layering, animation strategy.
- `docs/plan.md`: this file.
- `docs/game-rules.md`: gameplay reference (scoring, specials, levels).
- `docs/migration.md`: v1 to v2 diff and rationale.
- `docs/screenshots/`: v1 screenshots, preserved for design reference.

## Decisions worth flagging

### TypeScript 7.0: used as-is

The user asked for "latest packages where possible". TS 7.0 ships with a Go-rewritten compiler and stable syntax, but the programmatic API used by tooling is still in flux (stabilizes in 7.1). We pair TS 7 with **Biome** for linting and formatting because Biome does not depend on that API. It is a Rust-based parser and linter that reads TypeScript syntax directly. ESLint and `typescript-eslint` are still pinned to `<6.1.0` and would either refuse to install alongside TS 7 or crash at runtime. Biome sidesteps the whole problem.

### Vite 8, Vitest 4: yes, both are out and stable

Both released GA in 2026 and support each other. No compatibility issues encountered.

### CSS, not CSS-in-JS

The original v1 game was CSS. We ported it as-is rather than rewrite with Tailwind or styled-components. There is no benefit for a single-screen app with shared tokens. A future refactor toward CSS Modules or Vanilla Extract is straightforward.

### React 19

React 19 is stable. We use the new JSX transform (no `import React`) and `createRoot` from `react-dom/client`. No `use()`, no server components, no actions. This is a client-only game.

### Biome 2.5 instead of ESLint + Prettier

Originally the project used ESLint 10 (flat config) + `typescript-eslint` 8 + Prettier 3. We swapped to **Biome 2.5** when we bumped to TypeScript 7, because:

- `typescript-eslint` 8.65 only accepts `typescript@<6.1.0`. The maintainers closed the TS 7 support request as "not planned" on GA day.
- Biome does not touch the TypeScript programmatic API. It parses TS syntax directly in Rust.
- Lint and format in one tool. The whole check runs in about 15 ms.
- We lose the ESLint plugin ecosystem (`eslint-plugin-react-hooks`, `react-refresh`, etc.), but Biome's recommended ruleset covers the equivalent of `react-hooks/exhaustive-deps` and most style and suspicious rules we care about.

If we ever need a plugin-only ESLint rule, we can run ESLint alongside Biome for just that subset. Today, we do not.

### `useMemo` for the engine, not a context

`useGame` is called once in `App.tsx`. The engine is a single instance per app, so we just `useMemo(() => new GameEngine(), [])`. No context, no provider. If we ever want to share the engine across routed pages, we can lift it to a context. YAGNI for now.

### `setState` is the only mutation primitive in the engine

Every state change in `engine.ts` goes through `setState((s) => ...)`. The `setState` is a 3-liner: apply the updater, replace `this.state`, notify subscribers. This makes state transitions easy to reason about and easy to log and middleware-wrap later.

## What we did not do (and why)

- **No state management library.** The engine is the store.
- **No React Context.** `useGame` is enough.
- **No routing.** Single screen.
- **No SSR and no RSC.** Client-only game.
- **No Storybook.** The component surface is small. An interactive playground is the app itself.
- **No i18n.** English only.
- **No sound.** v1 was silent.
- **No analytics, no telemetry, no network.** Everything local.
- **No mid-game save.** Best score only, via `localStorage`.
- **No new gameplay features.** Strict 1:1 with v1.

## What we would do next (if asked)

- Component tests with `@testing-library/react` for the Board, HUD, and Overlays.
- A small E2E test that drives the engine through a full level and asserts score and moves.
- An `act()`-based test for `useGame` that asserts the engine state actually reaches React.
- CSS Modules per component if the file grows past about 1000 lines.
- A `tsconfig` with `noUncheckedIndexedAccess` and a `GridCell` type alias that the engine uses everywhere instead of `Cell | null`.