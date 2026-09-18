# 🔥 FIRELINE: 60 Seconds

> *"60 seconds. One room. No way out."*

A browser-based 2D survival game built with pure vanilla JavaScript and the HTML5 Canvas API. Navigate a burning room, collect power-ups, and reach the exit before the fire — or the clock — gets you.

---

## 🎮 Gameplay

You are trapped in a room that is rapidly filling with fire. You have **60 seconds** and **3 lives** to find the exit 🚪 and escape.

- Fire spreads dynamically from random seed points and accelerates over time
- Stepping into fire deals damage and triggers brief invincibility
- Reach the exit tile to win — no matter how much time is left
- Run out of health or time and it's game over

### Scoring

| Event | Points |
|---|---|
| Surviving each second | +1 (accumulates) |
| Collecting a power-up | +500 |

---

## ⚙️ Features

- **Procedurally generated maps** — random wall segments, pillars, and corridors every run, guaranteed to be navigable (BFS path check from player → exit)
- **Dynamic fire system** — fire spreads cardinally with a 72% probability and diagonally with 18% probability; intensity increases on a timed schedule
- **Escalating difficulty** — fire spread interval drops from 1200ms → 900ms → 650ms → 450ms → 200ms as time elapses
- **Warning tiles** — tiles about to catch fire pulse briefly before igniting
- **Power-ups** — two types spawn periodically on safe floor tiles:
  - 🛡️ **Shield** — 4 seconds of fire immunity
  - 🧯 **Extinguisher** — clears fire in a 2-tile radius around you
- **Fire particles** — canvas particle system with gravity for visual flair
- **Floating score text** — score gains pop up in-world
- **Screen shake & hit flash** — satisfying damage feedback
- **Web Audio API sound effects** — synthesised in real-time (no audio files required)
- **Fully responsive** — scales to any screen; on-screen D-pad appears for touch/mobile
- **Pause / Resume** — press `P` or `Escape` at any time

---

## 🕹️ Controls

| Input | Action |
|---|---|
| `W` / `↑` | Move up |
| `S` / `↓` | Move down |
| `A` / `←` | Move left |
| `D` / `→` | Move right |
| `P` / `Esc` | Pause / Resume |
| On-screen D-pad | Touch / mobile movement |

---

## 🚀 Running the Game

No build tools or dependencies required — it's entirely static.

1. Clone or download this repository
2. Open `index.html` in any modern browser

```bash
# Quick start with a local server (optional, avoids any CORS quirks)
npx serve .
# or
python -m http.server 8080
```

Then navigate to `http://localhost:8080`.

---

## 📁 Project Structure

```
FireLine/
├── index.html   # All screens (start, game, pause, game-over, win)
├── style.css    # Full design system — dark fire aesthetic, animations, responsive layout
└── game.js      # Entire game engine (map gen, fire, AI, rendering, audio, HUD)
```

### Architecture at a glance

| Module | Location |
|---|---|
| Constants & tile types | `game.js` top section |
| Map generation (BFS + random walls) | `generateRandomGrid()`, `findReachableCells()` |
| Fire spread & intensity | `spreadFire()`, `updateFireIntensity()` |
| Player movement & animation | `tryMove()`, `updatePlayerAnim()` |
| Power-up system | `spawnPowerup()`, `collectPowerup()`, `extinguishArea()` |
| Damage & invincibility | `checkFireDamage()`, `updateInvincibility()` |
| Particle system | `spawnFireParticles()`, `updateParticles()` |
| HUD & timers | `updateHUD()`, `updateTimer()`, `updateHearts()` |
| Audio (Web Audio API) | `playTone()`, `playNoise()`, `sfx*()` helpers |
| Game loop | `gameLoop()` via `requestAnimationFrame` |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Structure | HTML5 |
| Logic / Engine | Vanilla JavaScript (ES6+, strict mode) |
| Rendering | HTML5 Canvas 2D API |
| Styling | Vanilla CSS (custom properties, animations) |
| Audio | Web Audio API (synthesised, no files) |
| Fonts | Google Fonts — Bebas Neue, Orbitron, Rajdhani |

**Zero dependencies. Zero build steps.**

---

## 🎨 Design

The UI follows a **dark emergency fire aesthetic**:

- Deep near-black backgrounds (`#0a0a0f`) with warm ember radial gradients
- Fire palette: crimson `#c0392b` → orange `#e8621a` → yellow `#f5c518`
- Orbitron for HUD displays, Bebas Neue for titles, Rajdhani for UI text
- Glassmorphism overlays for the pause screen
- CSS keyframe animations: screen shake, vignette pulse, timer danger blink, fire flicker, heart flash

---

## 📜 License

This project is open source. Feel free to fork, modify, and build on it.
