# js_breakout_redux

# 🧱 JavaScript Brick Breaker (Planck.js Physics)

Arcade-style **Brick Breaker** built with **HTML5 Canvas** and **[Planck.js](https://github.com/shakiba/planck.js)** (Box2D for JavaScript).  
Fast, responsive paddle control with **auto-follow**, **gamepad support**, **touch buttons**, simple **synth beeps** via Web Audio, and a clean, retro UI.

> ⚙️ Tech: Vanilla JS, Canvas 2D, Planck.js (Box2D), Web Audio API. No build step required.

## Play it now: https://pemmyz.github.io/js_breakout_redux/

---

## ✨ Features

- **Real physics** (Planck.js): ball is a dynamic body, paddle is kinematic, bricks are static.
- **Auto-Follow mode** (default): paddle tracks ball with tunable responsiveness.
- **Precise manual control**: mouse, keyboard, gamepad (sticks + D-Pad), and touch.
- **Speed ramp** in auto-mode, manual speed control in all modes.
- **Teleport** ball to paddle for quick restarts and trick shots.
- **Mute/Unmute** with Web Audio oscillators (no assets needed).
- **Countdown** on loss, **score carry-over** on new game.
- **Responsive UX**: on‑canvas messages, button control panel, optional touch arrows.

---

## 🎮 Controls

| Action | Keyboard | Gamepad | Mouse | Touch |
|---|---|---|---|---|
| Move paddle | ← / → | Left Stick or D‑Pad | Move cursor over canvas (manual mode) | Tap & hold ◀ / ▶ |
| Toggle auto-follow | **A** | A / Cross (button 0) | Click canvas (first click disables auto) | First tap on canvas disables auto |
| Teleport ball to paddle | **Space** | **B** / Circle (button 1) | — | — |
| New game (keep score & speed) | **N** | **Start** (button 9) | — | — |
| Increase / Decrease ball speed | ↑ / ↓ | RB / LB (buttons 5 / 4) | — | Buttons: **Increase / Decrease Speed** |
| Toggle touch UI | **T** | — | — | — |
| Mute / Unmute | Button in UI | — | Button in UI | Button in UI |

> Tip: In **manual** mode the paddle uses higher digital velocity and mouse “snap” via `PADDLE_RESPONSIVENESS` for tight control.

---

## 🕹️ How to Play

1. Open `index.html` in any modern browser.  
2. The game starts in **Auto-Follow ON**. Click the canvas or press **A** to take manual control.  
3. Break all bricks to trigger the next round. Score persists; speed can be retained with **N**.  
4. Keep the ball in play—losing a ball triggers a short **3…2…1** countdown and restarts.

---

## 🚀 Quick Start

```bash
# Clone or download your repo, then simply open index.html
# (No Node, bundlers, or servers required.)
```

If you prefer a local server (for strict browser policies):

```bash
# Python 3
python -m http.server 8000
# then open http://localhost:8000
```

---

## 🗂️ Project Structure

```
.
├─ index.html          # Canvas, UI buttons, Planck.js script include
├─ style.css           # Retro dark theme + touch controls
├─ script.js           # Game logic, physics, input, audio
└─ planck.min.js       # Planck.js (Box2D) library
```

---

## 🧩 Key Constants (edit in `script.js`)

```js
// Canvas & scale
const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
const SCALE = 30;

// Bricks
const BRICK_WIDTH = 60, BRICK_HEIGHT = 20;
const BRICK_ROWS = 5, BRICK_COLS = 10;
const BRICK_PADDING = 10, BRICK_OFFSET_TOP = 35, BRICK_OFFSET_LEFT = 35;

// Ball & Paddle speeds
const DEFAULT_BALL_SPEED = 7.0, MAX_BALL_SPEED = 50.0;
const DEFAULT_PADDLE_SPEED = 9;
const PADDLE_SPEED_RATIO = DEFAULT_PADDLE_SPEED / DEFAULT_BALL_SPEED;

// Responsiveness / Input
const PADDLE_RESPONSIVENESS = 30;   // higher = snappier follow
const GAMEPAD_DEADZONE = 0.25;
```

---

## 🧠 Physics & Implementation Notes

- **Bodies**
  - **Walls**: static (top/left/right); bottom is handled via out‑of‑bounds check.
  - **Paddle**: **kinematic** body; its `linearVelocity.x` is driven by input.
  - **Ball**: **dynamic** body with `bullet=true` for precise tunneling prevention; restitution=1.0.
  - **Bricks**: static bodies; removed by scheduling `world.destroyBody` after contact.

- **Collisions**
  - `pre-solve`: paddle deflection logic; disables default contact and sets a custom reflection angle based on hit position.
  - `begin-contact`: brick hit -> mark “destroyed”, queue body removal, add score, play beep.
  - `post-solve`: micro-correction to prevent nearly horizontal/vertical lock; keeps the game lively.

- **Velocity control**
  - `updateBallSpeed()` normalizes the current velocity to maintain direction while changing speed.
  - `ensureNonHorizontal()` injects vertical component if `|vy|/|v|` is too small.

- **Auto-speed ramp**
  - In auto-mode at the start, the ball speed ramps every 2.5s up to `MAX_BALL_SPEED` unless the player changes speed (which cancels the ramp).

- **Audio**
  - Minimal **Web Audio** oscillators for launch, bounces, paddle, and loss. No assets required.
  - `Mute` toggles a simple `isMuted` flag.

---

## 🧪 Browser Support

Modern Chromium, Firefox, and Safari should work. If you see audio blocked, interact once to resume the suspended AudioContext.

---

## 🛠️ Troubleshooting

- **Ball passes through objects at high speeds** → `ballBody` uses `bullet: true` and high restitution; keep `SCALE` sane and step at ~60 FPS.
- **Audio is silent** → click the canvas or press any key to resume `AudioContext` (autoplay policies).
- **Gamepad not detected** → press a face button after connecting; check browser permissions.
- **Canvas not scaling** → `SCREEN_WIDTH/HEIGHT` and `#gameArea` dimensions intentionally match for pixel‑perfect rendering.

---

## 🗺️ Roadmap Ideas

- Power‑ups (multi-ball, widen/narrow paddle, slow/fast ball)
- Brick layouts / levels loader
- Particle trails and screen shake
- High score persistence (LocalStorage)
- Mobile UI polish (haptics, larger buttons)
- Pause menu & settings modal

---

## 🤝 Contributing

PRs welcome. Keep it dependency‑free and readable. Please include a short demo gif when adding gameplay features.

---

## 📜 License

MIT — do what you want, give credit if you ship it. 🎉
