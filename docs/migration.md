# Migration: v1 -> v2

What changed when we rewrote Gems from a single `index.html` into a React + Vite + TypeScript app. The v1 file is preserved at [`legacy/index.html`](../legacy/index.html) if you want to diff it yourself.

## TL;DR

- **Same game.** Mechanics, scoring, colors, level curve, animations, controls, all preserved.
- **Same look.** CSS variables, color tokens, and animation timings were copied verbatim.
- **Different runtime.** React 19 + Vite 8 instead of a one-file IIFE.
- **Testable.** 52 unit tests, about 200 ms to run.
- **Type-safe.** Strict TypeScript, `noUncheckedIndexedAccess`.

## File layout

| v1 | v2 |
| --- | --- |
| `index.html` (1500+ lines, IIFE in a `<script>`) | `src/main.tsx` + 16 source files |
| Inline `<style>` in `<head>` | `src/index.css` (globals) + `src/App.css` (component styles) |
| One global `state` object | `GameEngine` class + `GameState` interface |
| Direct DOM manipulation | React with a stable `id` per gem and CSS transitions |
| `localStorage` calls inline | `src/game/storage.ts` wrapper |
| No tests | `src/game/{board,config,engine}.test.ts` |
| No linter or formatter | ESLint 9 flat config + Prettier 3 |

## The big code change: the engine

The v1 file kept everything (board state, animation timing, input, DOM rendering) in a single IIFE closure. The biggest refactor is to split it into:

- **Pure functions** (`src/game/board.ts`): `findMatches`, `applyGravity`, `refillEmpty`, etc. These take a grid in and return a grid (or a set of cells) out. No side effects, no React, no DOM.
- **A `GameEngine` class** (`src/game/engine.ts`): owns the state, the timers, and the chain loop. Exposes a `subscribe(listener)` API and intent methods.

The v1 game was effectively the same shape, but everything was in one closure and you could not reach in. Now the engine is a unit you can construct in a test, feed scenarios to, and assert on.

The interface between the engine and the React layer is just:

```ts
engine.state        // current state
engine.subscribe() // re-render trigger
engine.swap(a, b)  // intent
engine.pause()
engine.restartLevel()
// ...
```

That is the entire surface. Everything else inside the engine is private.

## React-specific changes

### Gems have stable IDs

In v1, each gem had a `gem.el` reference. The DOM element was created once and mutated in place. The same gem's `id` was just a counter used for DOM lookup.

In v2, we keep the stable `id`, but use it as React's `key`. That way React mounts each gem once and reuses the same DOM node across renders, and the CSS transition on `left` and `top` interpolates between the old and new positions.

### Animation timing is owned by the engine

In v1, the `await sleep(ANIM.swap + 20)` calls were scattered through the IIFE. In v2, the engine's `swap()` is an `async` method that orchestrates all the delays internally and `await`s them. The React tree just sees the final state at the end of the chain.

### The `popping` and `spawning` flags

In v1, gems had implicit "states" tracked via the CSS classes applied (`popping`, `selected`, etc.) and the position.

In v2, the engine exposes `state.poppedGems: Set<number>` (ids of gems currently in pop animation) and `state.spawned: SpawnedGem[]` (gems that should render above the board so they animate in). The Board component reads these and adds the right CSS class and positions.

This is the trickiest part of the port. The pattern is:

1. Engine mutates the grid: gem X is now at `toR, c`.
2. Engine adds X to `state.poppedGems` (so it renders with the `popping` class) AND keeps X in the grid.
3. After `ANIM.pop` ms, the engine removes X from the grid AND clears `state.poppedGems`. React unmounts the gem DOM.

For spawning:

1. Engine creates new gem X, places it at `toR, c` in the grid, and adds `{id: X, fromR: -k, toR, c}` to `state.spawned`.
2. React renders X at `fromR` (above the board, invisible because the board has `overflow: hidden`).
3. After `ANIM.fall` ms, the engine clears `state.spawned`. React re-renders X at `toR`. The CSS transition interpolates from `fromR * 12.5%` to `toR * 12.5%`.

## Controls

Identical to v1. The keyboard handler in `useKeyboardInput` is a near-line-for-line port of the v1 `keydown` listener.

## What we explicitly did NOT change

- **Game mechanics.** All scoring, level math, color counts, special behaviors.
- **CSS.** Tokens, classes, animations, layout, all copied verbatim.
- **HTML structure** of the overlays (Start, Pause, LevelComplete, GameOver): same content, just React components now.
- **Storage key.** Still `gems.match3.v1` so existing high scores carry over.

## Why React for a 1500-line game?

The honest answer: the game itself is small enough that a single HTML file is fine. The reason to rewrite was:

1. **Testability.** We can now write 50+ unit tests and run them in 200 ms. In v1, any logic change required manual playthrough testing.
2. **Maintenance.** Adding a feature (a new special) in v1 meant carefully editing a 1500-line IIFE. In v2, it is a new function in `board.ts` + a test + a small UI change.
3. **HMR.** Vite's dev server reloads the page on save in milliseconds. The v1 file required a hard refresh.
4. **Tooling.** ESLint, Prettier, TypeScript, all things the v1 file did not have.

The tradeoff is build complexity (Node + npm + bundler). For a personal toy match-3, it is probably overkill. For something you intend to extend and maintain, it is worth it.

## If you want to compare

```sh
# v1 (no install, no build)
open legacy/index.html

# v2
npm install
npm run dev
```

The v1 file is preserved exactly as it was. Side-by-side, the gameplay should be indistinguishable.

## Addendum: toolchain swap (v2.0 -> v2.0.1)

After the initial v2 release we swapped the lint and format toolchain from **ESLint 10 + Prettier 3** to **Biome 2.5**, in the same commit as the TypeScript 5.9 -> 7.0 bump.

Why both at once:

- `typescript-eslint` 8.65 only accepts `typescript@<6.1.0` as a peer dep. The maintainers closed the TS 7 support request as "not planned" the day TS 7.0.2 shipped.
- `typescript-eslint` relies on the TypeScript programmatic API, which got a major rewrite in TS 7.0 and does not stabilize until 7.1 (expected October 2026).
- Biome is Rust-based and does not use the TypeScript API at all. It parses TS syntax directly. So it works fine with TS 7.
- Side benefit: lint and format in one tool. The whole check runs in about 15 ms (vs about 1.5 s for ESLint + Prettier on the same codebase).

What changed:

- `package.json`: `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-config-prettier`, `eslint-plugin-prettier`, `prettier` all removed. `@biomejs/biome` added. `typescript` bumped from `~5.9.3` to `^7.0.0`.
- `eslint.config.js`, `.prettierrc`, `.prettierignore` deleted.
- `biome.json` created with equivalent rules (plus a few opinionated additions).
- `src/game/board.ts`: one `let type;` annotated to `let type: number;`.
- Scripts unchanged in spirit. `npm run lint` now runs `biome check`, `npm run format` runs `biome format --write`.

What we lost:

- ESLint plugin ecosystem. We were using `react-hooks` (exhaustive deps) and `react-refresh` (only-export-components). Biome's recommended ruleset has a `useExhaustiveDependencies` rule that does the same thing. We did not use `react-refresh`'s rule in a way that mattered.

What we kept:

- `noUncheckedIndexedAccess` in `tsconfig.app.json`: the strict grid access pattern that makes the engine safe.
- The "no `!` non-null assertion" rule is **off** in Biome. We use `!` heavily in `board.ts` for grid access after bounds checks. It is intentional, and Biome's default rule would have us refactor every call site. (The eslint config also did not have `no-non-null-assertion`.)