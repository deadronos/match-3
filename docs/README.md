# Docs

This folder documents the v2.0 rewrite of **Gems — A Match-3**.

| File | What it covers |
| --- | --- |
| [`architecture.md`](./architecture.md) | How the codebase is organised, the engine ↔ React contract, and the rationale behind the layering. Start here. |
| [`plan.md`](./plan.md) | The step-by-step plan that drove the rewrite, including the later engine helper-module split. |
| [`game-rules.md`](./game-rules.md) | The game rules as implemented: scoring, specials, level progression, and edge cases. |
| [`migration.md`](./migration.md) | What changed from the v1 single-file game to the v2 React + Vite app, and why. |
| [`screenshots/`](./screenshots/) | The v1 screenshots preserved for design reference. |

## Quick links

- Source: [`../src/`](../src/)
- Tests: [`../src/**/*.test.ts`](../src/)
- Original v1 game (kept for reference): [`../legacy/index.html`](../legacy/index.html)
