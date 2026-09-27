
# Copilot Instructions: Stadium Wave Game

## Architecture & Data Flow
- **Single engine:** Game logic runs in-browser in the JavaScript engine (`engine.js`), bundled by Vite. There is no Python/Pyodide runtime.
- **Rendering/UI:** All user interaction, animation, and rendering is in JS (`main.js`) using HTML5 Canvas. The renderer talks to the engine only through `gameAPI`.
- **Persistence:** Game state and scores are saved to browser `localStorage` (no backend).

## Key Files & Responsibilities
- `engine.js`: Game logic, state machine, scoring, persistence, and the `gameAPI` used by the renderer
- `main.js`: Rendering, input handling, and the game loop
- `index.html`: UI layout, canvas, and controls
- `tests/unit/engine.test.js`: Engine unit tests (`node:test`)
- `tests/e2e/game.spec.js`: Playwright E2E tests for UI and gameplay

## Engine Integration
- `main.js` calls the engine through `gameAPI` (imported from `engine.js`)
- `window.waveDiagnostics` reports the active engine; loading with `?e2e` also exposes `gameAPI` for smoke tests
- Exposed engine API: `init_game`, `update_game`, `start_wave_at`, `boost_sector_energy`, `get_game_state`, `get_events`, `save_game`, `load_game`

## UI/Interaction Patterns
- Canvas-based stadium rendering; sector states visualized by color and animation
- **High-DPI:** Canvas uses `devicePixelRatio` scaling for crisp rendering
- **Performance:** Precompute sector paths, cache gradients, debounce resize handlers
- User actions:
  - Left-click sector: start wave at that sector
  - Right-click sector: boost energy
  - Spacebar: start wave at sector 0
  - Save/Load buttons: persist game state
- HUD and notifications are DOM elements updated by JS

## Developer Workflows
- **Start dev server:** `npm run dev` (Vite, opens at http://localhost:3000)
- **Build production:** `npm run build` (output in `dist/`)
- **Preview build:** `npm run preview`
- **Unit tests:** `npm test` (`node:test` on `tests/unit/`)
- **E2E tests:** `npm run test:e2e` (dev server) or `npm run test:e2e:prod` (production build, what CI runs)

## Project Conventions & Patterns
- **Sector state machine:** idle → anticipating → standing → seated, with energy/fatigue/distraction
- **Wave propagation:** normal, reverse, double, and accelerating patterns with combo/bonus logic
- **No backend/server:** All logic is client-side

## Extending the Game
- Add new mechanics to `engine.js` and expose them through `gameAPI`
- Update `main.js` for new APIs/events
- Add/extend unit tests in `tests/unit/` and Playwright tests in `tests/e2e/`

## References
- See `README.md` for gameplay, architecture, and setup details
- See `engine.js` for the engine API contract
- See `main.js` for integration and rendering logic
