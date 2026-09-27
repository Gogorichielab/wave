# Agent Guide: Stadium Wave Game 🏟️

This document is for OpenAI Codex and similar AI coding agents working on the **Stadium Wave Game** project.

## Essential Guidance for AI Agents

- **Single engine:** Game logic runs in-browser in the JavaScript engine (`engine.js`), bundled by Vite. There is no Python/Pyodide runtime.
- **Rendering/UI:** All user interaction, animation, and rendering is in JS (`main.js`) using HTML5 Canvas. The renderer talks to the engine only through `gameAPI`.
- **Persistence:** Game state and scores are saved to browser `localStorage` (no backend).

### Key Files

- `engine.js`: Game logic, state machine, scoring, persistence, and the `gameAPI` used by the renderer
- `main.js`: Rendering, input handling, and the game loop
- `index.html`: UI layout, canvas, and controls
- `tests/unit/engine.test.js`: Engine unit tests (`node:test`)
- `tests/e2e/game.spec.js`: Playwright E2E tests for UI and gameplay

### Integration

- `main.js` calls the engine through `gameAPI` (imported from `engine.js`)
- `window.waveDiagnostics` reports the active engine; loading with `?e2e` also exposes `gameAPI` for smoke tests
- Exposed engine API: `init_game`, `update_game`, `start_wave_at`, `boost_sector_energy`, `get_game_state`, `get_events`, `save_game`, `load_game`

### Developer Workflows

- **Start dev server:** `npm run dev` (Vite, opens at http://localhost:3000)
- **Build production:** `npm run build` (output in `dist/`)
- **Preview build:** `npm run preview`
- **Unit tests:** `npm test` (`node:test` on `tests/unit/`)
- **E2E tests:** `npm run test:e2e` (dev server) or `npm run test:e2e:prod` (production build, what CI runs)

### Project Conventions

- **Sector state machine:** idle → anticipating → standing → seated, with energy/fatigue/distraction
- **Wave propagation:** normal, reverse, double, and accelerating patterns with combo/bonus logic
- **No backend/server:** All logic is client-side

### Extending the Game

- Add new mechanics to `engine.js` and expose them through `gameAPI`
- Update `main.js` for new APIs/events
- Add/extend unit tests in `tests/unit/` and Playwright tests in `tests/e2e/`

### References

- See `.github/copilot-instructions.md` for the canonical, up-to-date agent instructions
- See `README.md` for gameplay, architecture, and setup details
- See `engine.js` for the engine API contract
- See `main.js` for integration and rendering logic
