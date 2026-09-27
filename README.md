# Stadium Wave Game 🏟️

A browser-based interactive game where players orchestrate the stadium "wave" by coordinating with AI-controlled crowd sectors to achieve synchronized animations and earn combo points.

[![.github/workflows/ci-cd.yml](https://github.com/gogorichie/wave/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/gogorichie/wave/actions/workflows/ci-cd.yml)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues-closed/gogorichie/wave)
![GitHub top language](https://img.shields.io/github/languages/top/gogorichie/wave)
![GitHub Release](https://img.shields.io/github/v/release/gogorichie/wave)

## Screenshots

### Welcome Screen
![Game Welcome Screen](https://github.com/user-attachments/assets/f339b050-8a71-4e7e-a0a4-ba511caa75d6)

### Game in Action
![Game Playing Screen](https://github.com/user-attachments/assets/3fbca810-4e45-4d0c-8d02-9f8cf51420f6)

## Features

### Core Gameplay

- **Customizable Field**: Choose between soccer, football, and baseball fields.
- **Interactive Wave Mechanics**: Click on crowd sectors to initiate and propagate waves around the stadium
- **Special Wave Patterns**: Every wave randomly selects from four unique patterns:
  - **Normal**: Classic clockwise wave
  - **Reverse**: Counter-clockwise wave (1.5x bonus multiplier)
  - **Double**: Two simultaneous waves from opposite sides (2x bonus multiplier)
  - **Accelerating**: Wave starts slow and progressively gets faster (1.3x bonus multiplier)
- **Crowd Simulation**: 16 AI-controlled sectors with individual states (idle, anticipating, standing, seated)
- **Energy & Fatigue System**: Sectors have dynamic energy levels that affect wave readiness
- **Combo System**: Chain successful wave propagations for multiplier bonuses
- **Player Interactions**:
  - Left-click sectors to start waves
  - Right-click to boost sector energy
  - Spacebar to quick-start from sector 0

### Technology Stack

- **Frontend**: HTML5 Canvas for real-time crowd visualization
- **Game Engine**: Plain JavaScript module (`engine.js`) bundled by Vite
- **Rendering**: JavaScript handles smooth 60fps animations
- **Persistence**: LocalStorage for save/load functionality

### Game Architecture

- **Engine Layer** (`engine.js`): State management, wave propagation algorithms, scoring
- **JavaScript Rendering Layer**: Canvas-based crowd visualization with color-coded states
- **UI Layer**: HUD displaying score, combo, and wave statistics

## Installation

### Prerequisites

- Node.js 20+ and npm 10+
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Setup

1. Clone the repository:

```bash
git clone https://github.com/gogorichie/wave.git
cd wave
```

2. Install dependencies:

```bash
npm install
```

3. Start development server:

```bash
npm run dev
```

The game will open in your browser at `http://localhost:3000`

### Engine Architecture

The game runs a single JavaScript engine (`engine.js`) that is bundled into the
production build, so there is no runtime download or fallback path. To confirm
which engine a deployed build is running, check `window.waveDiagnostics.engine`
in the browser console.

## Development

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

### Run Tests

```bash
# Engine unit tests (node:test)
npm test

# E2E tests against the dev server
npm run test:e2e

# Build, then run the E2E suite against the production build (what CI runs)
npm run test:e2e:prod
```

## How to Play

1. **Start the Game**: Click "Let's Go!" to begin
2. **Initiate Waves**: Click on any crowd sector to start a wave
3. **Build Combos**: Keep the wave going by maintaining high energy levels
4. **Boost Energy**: Right-click sectors with low energy to boost them
5. **Score Points**: Complete full stadium waves for bonus points
6. **Save Progress**: Use the save button to preserve your high scores

### Difficulty

Difficulty is applied by the engine (`DIFFICULTY_PRESETS` in `engine.js`):

| Setting | Easy | Medium | Hard |
|---|---|---|---|
| Seconds per sector | 1.2 | 1.0 | 0.8 |
| Crowd energy recovery | ×1.25 | ×1.0 | ×0.8 |
| Mascot distraction every | 45s | 30s | 18s |
| Distraction per mascot visit | 0.2 | 0.3 | 0.4 |
| Boost charges | 5 | 3 | 2 |
| Seconds to recharge one boost | 6 | 8 | 12 |
| Scoreboard Hype cooldown | 30s | 45s | 60s |

Boost charges and the Scoreboard Hype cooldown are shown in the control bar.

### Scoring

- Basic wave participation: 10 points × combo multiplier
- Full stadium completion: 100 points + combo bonus
- Combos increase with consecutive successful sector waves

### Tips

- Watch the energy bars under sector numbers
- Low energy sectors (red/yellow bars) need boosting
- Timing is key - sectors must be in idle or seated state to start
- Green indicates active wave participation
- Yellow shows anticipation state

## Project Structure

```
wave/
├── engine.js            # Game engine: crowd simulation, waves, scoring
├── index.html           # Main HTML structure with canvas
├── main.js              # Rendering, input, and game loop
├── vite.config.js       # Vite bundler configuration
├── package.json         # Node dependencies and scripts
├── tests/
│   ├── unit/
│   │   └── engine.test.js     # Engine unit tests
│   └── e2e/
│       ├── game.spec.js       # Playwright E2E tests
│       └── production.spec.js # Production build smoke tests
└── README.md
```

## Game Design

### Crowd Sectors

Each sector has:

- **State**: idle → anticipating → standing → seated
- **Energy**: 0.0-1.0 (affects readiness)
- **Fatigue**: 0.0-1.0 (increases with activity)
- **Enthusiasm**: 0.6-0.9 (randomized personality trait)
- **Distractions**: External events affecting focus

### Wave Propagation

- Waves can travel clockwise or counter-clockwise (depending on pattern)
- Four different wave patterns add variety and challenge:
  - **Normal**: Traditional clockwise propagation
  - **Reverse**: Goes backwards (counter-clockwise) for a twist
  - **Double**: Two waves race from opposite sides of the stadium
  - **Accelerating**: Starts at normal speed but gets progressively faster
- Sectors must be ready (sufficient energy, low fatigue)
- Failed propagation ends the wave and resets combo
- Successful full circles award completion bonuses with pattern multipliers

## Future Enhancements

Potential additions:

- Multiple stadium venues with varying difficulty
- Weather effects and day/night cycles
- Enhanced mascot events and scoreboard interactions
- Cosmetic unlocks (foam fingers, flags)
- Highlight reel GIF export
- Progressive difficulty campaign mode
- Additional wave patterns (spiral, split, cascade)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
