/* ═══════════════════════════════════════════════════════════
   FIRELINE: 60 Seconds — game.js
   Full vanilla JS game engine
═══════════════════════════════════════════════════════════ */

'use strict';

// ═══════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════
const COLS = 18;
const ROWS = 12;
const TOTAL_TIME = 60;  // seconds

const TILE = {
  WALL:  0,
  FLOOR: 1,
  FIRE:  2,
  EXIT:  3
};


// Fire spread interval schedule (seconds elapsed → ms interval)
const FIRE_SCHEDULE = [
  { at: 0,  interval: 1200 },
  { at: 15, interval: 900  },
  { at: 30, interval: 650  },
  { at: 45, interval: 450  },
  { at: 55, interval: 200  }
];

// Diagonal spread probability
const DIAG_PROB = 0.18;

// ═══════════════════════════════════════════
//  DOM REFS
// ═══════════════════════════════════════════
const canvas        = document.getElementById('game-canvas');
const ctx           = canvas.getContext('2d');
const gameRoot      = document.getElementById('game-root');
const vignette      = document.getElementById('vignette');

const screenStart   = document.getElementById('screen-start');
const screenGame    = document.getElementById('screen-game');
const screenPause   = document.getElementById('screen-pause');
const screenGameover= document.getElementById('screen-gameover');
const screenWin     = document.getElementById('screen-win');

const timerDisplay  = document.getElementById('timer-display');
const scoreValue    = document.getElementById('score-value');
const intensityBar  = document.getElementById('intensity-bar');
const powerupDisplay= document.getElementById('powerup-display');
const hearts        = [
  document.getElementById('heart-1'),
  document.getElementById('heart-2'),
  document.getElementById('heart-3')
];

const btnStart       = document.getElementById('btn-start');
const btnPause       = document.getElementById('btn-pause');
const btnResume      = document.getElementById('btn-resume');
const btnRestartPause= document.getElementById('btn-restart-pause');
const btnRestartGo   = document.getElementById('btn-restart-go');
const btnRestartWin  = document.getElementById('btn-restart-win');
const btnSoundStart  = document.getElementById('btn-sound-start');
const btnSoundGame   = document.getElementById('btn-sound-game');

const goTime         = document.getElementById('go-time');
const goScore        = document.getElementById('go-score');
const goPowerups     = document.getElementById('go-powerups');
const winHealth      = document.getElementById('win-health');
const winScore       = document.getElementById('win-score');
const winPowerups    = document.getElementById('win-powerups');

// ═══════════════════════════════════════════
//  GAME STATE
// ═══════════════════════════════════════════
let state = {
  phase: 'start',  // 'start' | 'playing' | 'paused' | 'gameover' | 'win'
  grid: [],         // ROWS × COLS → TILE type
  fire: [],         // ROWS × COLS → intensity 0–1 (0 = not fire)
  warned: [],       // ROWS × COLS → bool (warning pulse)
  powerups: [],     // [{col,row,type,anim}]
  player: { col: 0, row: 0, px: 0, py: 0, facing: 'right', moving: false, anim: 0, invincible: false, invTimer: 0, shielded: false, shieldTimer: 0 },
  health: 3,
  score: 0,
  timeLeft: TOTAL_TIME,
  elapsed: 0,
  fireInterval: 1200,
  fireTimer: 0,
  powerupTimer: 0,
  powerupsCollected: 0,
  scoreAccum: 0,
  exitCol: 0,
  exitRow: 0,
  exitOpen: false,
  soundOn: true,
  particles: [],  // fire particles
  floatTexts: []
};

let rafId = null;
let lastTimestamp = 0;

// ═══════════════════════════════════════════
//  AUDIO (Web Audio API)
// ═══════════════════════════════════════════
let audioCtx = null;

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playTone(freq, duration, type='sine', gain=0.15, startDelay=0) {
  if (!state.soundOn) return;
  try {
    ensureAudio();
    const osc  = audioCtx.createOscillator();
    const env  = audioCtx.createGain();
    osc.type      = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startDelay);
    env.gain.setValueAtTime(gain, audioCtx.currentTime + startDelay);
    env.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + startDelay + duration);
    osc.connect(env); env.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime + startDelay);
    osc.stop(audioCtx.currentTime + startDelay + duration + 0.01);
  } catch(e) {}
}

function playNoise(duration, gain=0.08) {
  if (!state.soundOn) return;
  try {
    ensureAudio();
    const bufLen = audioCtx.sampleRate * duration;
    const buf    = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);
    const src    = audioCtx.createBufferSource();
    const env    = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 400; filter.Q.value = 0.5;
    src.buffer = buf;
    env.gain.setValueAtTime(gain, audioCtx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    src.connect(filter); filter.connect(env); env.connect(audioCtx.destination);
    src.start(); src.stop(audioCtx.currentTime + duration);
  } catch(e) {}
}

function sfxStep()      { playTone(160, 0.06, 'square', 0.05); }
function sfxDamage()    { playTone(120, 0.3, 'sawtooth', 0.2); playTone(80, 0.3, 'sawtooth', 0.15, 0.05); }
function sfxPickup()    { playTone(520, 0.08, 'sine', 0.18); playTone(780, 0.12, 'sine', 0.15, 0.08); }
function sfxWarn()      { playTone(340, 0.15, 'square', 0.08); }
function sfxWin()       { [523,659,784,1047].forEach((f,i) => playTone(f, 0.25, 'sine', 0.2, i*0.18)); }
function sfxGameover()  { [220,185,147,110].forEach((f,i) => playTone(f, 0.35, 'sawtooth', 0.18, i*0.2)); }
function sfxHeartbeat() { playNoise(0.08, 0.12); }

// ═══════════════════════════════════════════
//  GRID GENERATION
// ═══════════════════════════════════════════
function buildGrid() {
  const grid = [];
  for (let r = 0; r < ROWS; r++) {
    grid[r] = [];
    for (let c = 0; c < COLS; c++) {
      // border walls
      if (r === 0 || r === ROWS-1 || c === 0 || c === COLS-1) {
        grid[r][c] = TILE.WALL;
      } else {
        grid[r][c] = TILE.FLOOR;
      }
    }
  }

  // Interior wall obstacles (pillars + walls)
  const wallPatterns = [
    // Vertical partitions
    {r:2,c:4}, {r:3,c:4}, {r:4,c:4},
    {r:7,c:4}, {r:8,c:4}, {r:9,c:4},
    {r:2,c:13}, {r:3,c:13}, {r:4,c:13},
    {r:7,c:13}, {r:8,c:13}, {r:9,c:13},
    // Horizontal partitions
    {r:5,c:7}, {r:5,c:8}, {r:5,c:9}, {r:5,c:10},
    // Pillars
    {r:2,c:8}, {r:2,c:9},
    {r:9,c:8}, {r:9,c:9},
    // Small blocks
    {r:4,c:15}, {r:4,c:16},
    {r:7,c:15}, {r:7,c:16},
    {r:3,c:2},  {r:4,c:2},
    {r:8,c:2},  {r:9,c:2},
  ];
  wallPatterns.forEach(({r,c}) => { if (r>0&&r<ROWS-1&&c>0&&c<COLS-1) grid[r][c] = TILE.WALL; });

  return grid;
}

function floorCells(grid) {
  const cells = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (grid[r][c] === TILE.FLOOR) cells.push({r,c});
  return cells;
}

function randFloor(grid, excludes=[]) {
  const cells = floorCells(grid).filter(fc => !excludes.some(e=>e.r===fc.r&&e.c===fc.c));
  return cells[Math.floor(Math.random()*cells.length)];
}


// ═══════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════
function initGame() {
  // Build grid
  state.grid    = buildGrid();
  state.fire    = Array.from({length:ROWS},()=>new Array(COLS).fill(0));
  state.warned  = Array.from({length:ROWS},()=>new Array(COLS).fill(false));
  state.powerups = [];
  state.particles = [];
  state.floatTexts = [];

  // Exit tile — top right area
  state.exitCol = COLS - 2;
  state.exitRow = 1;
  state.grid[state.exitRow][state.exitCol] = TILE.EXIT;
  state.exitOpen = false;

  // Player start — bottom left area, away from fire
  let playerCell = { r: ROWS-2, c: 1 };
  // make sure it's a floor cell
  while (state.grid[playerCell.r][playerCell.c] !== TILE.FLOOR &&
         state.grid[playerCell.r][playerCell.c] !== TILE.EXIT) {
    playerCell = randFloor(state.grid);
  }
  state.player = {
    col: playerCell.c, row: playerCell.r,
    px: playerCell.c * getCellSize(), py: playerCell.r * getCellSize(),
    facing: 'right', moving: false, anim: 0,
    invincible: false, invTimer: 0,
    shielded: false, shieldTimer: 0
  };

  // Seed fire — top right, away from player
  const fireSeeds = [
    {r:1, c:2}, {r:1, c:3}, {r:2, c:1}
  ];
  fireSeeds.forEach(({r,c}) => {
    if (state.grid[r][c] === TILE.FLOOR) {
      state.fire[r][c] = 1.0;
    }
  });

  // Game stats
  state.health           = 3;
  state.score            = 0;
  state.timeLeft         = TOTAL_TIME;
  state.elapsed          = 0;
  state.fireInterval     = 1200;
  state.fireTimer        = 0;
  state.powerupTimer     = 0;
  state.powerupsCollected= 0;
  state.scoreAccum       = 0;

  updateHUD();
  sizeCanvas();
  syncPlayerPx();
}

function syncPlayerPx() {
  const cs = getCellSize();
  state.player.px = state.player.col * cs;
  state.player.py = state.player.row * cs;
}

// ═══════════════════════════════════════════
//  CANVAS SIZING
// ═══════════════════════════════════════════
function getCellSize() {
  const wrapper = document.getElementById('canvas-wrapper');
  const maxW = (wrapper?.clientWidth  || window.innerWidth)  - 4;
  const maxH = (wrapper?.clientHeight || window.innerHeight) - 4;
  const byW  = Math.floor(maxW / COLS);
  const byH  = Math.floor(maxH / ROWS);
  return Math.min(Math.max(Math.min(byW, byH), 20), 58);
}

function sizeCanvas() {
  const cs = getCellSize();
  canvas.width  = COLS * cs;
  canvas.height = ROWS * cs;
}

window.addEventListener('resize', () => {
  if (state.phase === 'playing' || state.phase === 'paused') {
    sizeCanvas();
    syncPlayerPx();
  }
});

// ═══════════════════════════════════════════
//  INPUT
// ═══════════════════════════════════════════
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) {
    e.preventDefault();
  }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state.phase === 'playing') pauseGame();
    else if (state.phase === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// D-pad
['dpad-up','dpad-down','dpad-left','dpad-right'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  const dir = id.replace('dpad-','');
  const press = () => { dpadPressed[dir] = true; };
  const release = () => { dpadPressed[dir] = false; };
  el.addEventListener('touchstart', press, {passive:true});
  el.addEventListener('touchend',   release, {passive:true});
  el.addEventListener('mousedown',  press);
  el.addEventListener('mouseup',    release);
  el.addEventListener('mouseleave', release);
});
const dpadPressed = {up:false,down:false,left:false,right:false};

function inputDir() {
  if (keys['ArrowUp']    || keys['KeyW'] || dpadPressed.up)    return {dr:-1,dc:0};
  if (keys['ArrowDown']  || keys['KeyS'] || dpadPressed.down)  return {dr:1, dc:0};
  if (keys['ArrowLeft']  || keys['KeyA'] || dpadPressed.left)  return {dr:0, dc:-1};
  if (keys['ArrowRight'] || keys['KeyD'] || dpadPressed.right) return {dr:0, dc:1};
  return null;
}

// ═══════════════════════════════════════════
//  PLAYER MOVEMENT
// ═══════════════════════════════════════════
let moveCooldown = 0;
const MOVE_COOLDOWN_MS = 140; // ms between steps

function tryMove(dt) {
  moveCooldown -= dt;
  if (moveCooldown > 0 || state.player.moving) return;

  const dir = inputDir();
  if (!dir) return;

  const {dr,dc} = dir;
  const nr = state.player.row + dr;
  const nc = state.player.col + dc;

  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
  if (state.grid[nr][nc] === TILE.WALL) return;

  // Move
  state.player.row = nr;
  state.player.col = nc;
  if (dc > 0) state.player.facing = 'right';
  if (dc < 0) state.player.facing = 'left';
  state.player.moving = true;
  moveCooldown = MOVE_COOLDOWN_MS;
  sfxStep();

  // Check power-up pickup
  for (let i = state.powerups.length-1; i >= 0; i--) {
    const pu = state.powerups[i];
    if (pu.col === nc && pu.row === nr) {
      collectPowerup(pu, i);
    }
  }
}

function updatePlayerAnim(dt) {
  const cs = getCellSize();
  const tx = state.player.col * cs;
  const ty = state.player.row * cs;
  const spd = cs / (MOVE_COOLDOWN_MS * 0.9);

  const dx = tx - state.player.px;
  const dy = ty - state.player.py;

  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
    state.player.px = tx; state.player.py = ty;
    state.player.moving = false;
  } else {
    state.player.px += dx * Math.min(1, spd * dt);
    state.player.py += dy * Math.min(1, spd * dt);
  }

  if (state.player.moving || inputDir()) {
    state.player.anim = (state.player.anim + dt * 0.012) % (Math.PI * 2);
  }
}

// ═══════════════════════════════════════════
//  FIRE SYSTEM
// ═══════════════════════════════════════════
function spreadFire() {
  const newFire  = [];
  const newWarn  = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.fire[r][c] <= 0) continue;

      const neighbors4 = [[-1,0],[1,0],[0,-1],[0,1]];
      const neighbors8 = [[-1,-1],[-1,1],[1,-1],[1,1]];

      // Cardinal spread
      for (const [dr,dc] of neighbors4) {
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
        if (state.grid[nr][nc]===TILE.WALL) continue;
        if (state.fire[nr][nc]>0) continue;
        if (Math.random() < 0.72) {
          newFire.push({r:nr,c:nc});
        } else {
          newWarn.push({r:nr,c:nc});
        }
      }

      // Diagonal spread (lower prob)
      for (const [dr,dc] of neighbors8) {
        const nr=r+dr, nc=c+dc;
        if (nr<0||nr>=ROWS||nc<0||nc>=COLS) continue;
        if (state.grid[nr][nc]===TILE.WALL) continue;
        if (state.fire[nr][nc]>0) continue;
        if (Math.random() < DIAG_PROB) {
          newFire.push({r:nr,c:nc});
        }
      }
    }
  }

  newFire.forEach(({r,c}) => {
    if (state.grid[r][c] !== TILE.WALL) {
      state.fire[r][c] = 0.6 + Math.random() * 0.4;
      state.warned[r][c] = false;
      spawnFireParticles(c, r, 3);
    }
  });
  newWarn.forEach(({r,c}) => {
    if (state.fire[r][c] <= 0 && state.grid[r][c] !== TILE.WALL) {
      state.warned[r][c] = true;
      sfxWarn();
    }
  });
}

function updateFireIntensity(dt) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.fire[r][c] > 0) {
        state.fire[r][c] = Math.min(1.0, state.fire[r][c] + dt * 0.0005);
      }
    }
  }
}

function currentFireInterval() {
  let interval = 1200;
  for (const s of FIRE_SCHEDULE) {
    if (state.elapsed >= s.at) interval = s.interval;
  }
  return interval;
}

// ═══════════════════════════════════════════
//  POWER-UPS
// ═══════════════════════════════════════════
function spawnPowerup() {
  if (state.powerups.length >= 2) return;
  const floorList = floorCells(state.grid).filter(({r,c}) =>
    state.fire[r][c] <= 0 &&
    !(r===state.player.row && c===state.player.col) &&
    !state.powerups.some(p=>p.row===r&&p.col===c)
  );
  if (!floorList.length) return;
  const {r,c} = floorList[Math.floor(Math.random()*floorList.length)];
  const type   = Math.random() < 0.6 ? 'shield' : 'extinguisher';
  state.powerups.push({ row:r, col:c, type, anim:0 });
}

function collectPowerup(pu, idx) {
  state.powerups.splice(idx, 1);
  state.powerupsCollected++;
  state.score += 500;
  sfxPickup();
  addFloatText('+500', pu.col, pu.row, '#27ae60');

  if (pu.type === 'shield') {
    state.player.shielded   = true;
    state.player.shieldTimer = 4000;
    showPowerupHUD('🛡️ SHIELD', 4000);
  } else {
    extinguishArea(pu.col, pu.row, 2);
    showPowerupHUD('🧯 EXTINGUISHED', 1500);
  }
}

function extinguishArea(col, row, radius) {
  for (let r = Math.max(0,row-radius); r <= Math.min(ROWS-1,row+radius); r++) {
    for (let c = Math.max(0,col-radius); c <= Math.min(COLS-1,col+radius); c++) {
      if (Math.abs(r-row)+Math.abs(c-col) <= radius+1) {
        state.fire[r][c]   = 0;
        state.warned[r][c] = false;
      }
    }
  }
}

let puHudTimer = null;
function showPowerupHUD(text, duration) {
  powerupDisplay.textContent = text;
  if (puHudTimer) clearTimeout(puHudTimer);
  puHudTimer = setTimeout(() => { powerupDisplay.textContent = ''; }, duration);
}

// ═══════════════════════════════════════════
//  DAMAGE SYSTEM
// ═══════════════════════════════════════════
function checkFireDamage() {
  const {row, col} = state.player;
  if (state.fire[row][col] <= 0) return;
  if (state.player.invincible || state.player.shielded) return;

  state.health--;
  sfxDamage();
  triggerScreenShake();
  triggerHitFlash();
  updateHearts();

  state.player.invincible = true;
  state.player.invTimer   = 2000; // 2 seconds invincibility

  if (state.health <= 0) {
    endGameover();
  }
}

function updateInvincibility(dt) {
  if (state.player.invincible) {
    state.player.invTimer -= dt;
    if (state.player.invTimer <= 0) state.player.invincible = false;
  }
  if (state.player.shielded) {
    state.player.shieldTimer -= dt;
    if (state.player.shieldTimer <= 0) {
      state.player.shielded = false;
      powerupDisplay.textContent = '';
    }
  }
}

// ═══════════════════════════════════════════
//  PARTICLES
// ═══════════════════════════════════════════
function spawnFireParticles(col, row, count) {
  const cs = getCellSize();
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x: col*cs + cs*0.5 + (Math.random()-0.5)*cs*0.6,
      y: row*cs + cs*0.5 + (Math.random()-0.5)*cs*0.6,
      vx: (Math.random()-0.5)*0.6,
      vy: -Math.random()*1.2 - 0.4,
      life: 0.6 + Math.random()*0.6,
      maxLife: 1.2,
      size: 2 + Math.random()*4,
      col: col, row: row
    });
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length-1; i >= 0; i--) {
    const p = state.particles[i];
    p.life -= dt * 0.001;
    p.x  += p.vx;
    p.y  += p.vy;
    p.vy += 0.01; // gravity
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  // Continuously spawn small particles on fire cells (throttled)
  if (Math.random() < 0.35) {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (state.fire[r][c] > 0 && Math.random() < 0.04) {
          spawnFireParticles(c, r, 1);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════
//  FLOAT TEXTS
// ═══════════════════════════════════════════
function addFloatText(text, col, row, color='#f5c518') {
  const cs = getCellSize();
  state.floatTexts.push({
    text, x: col*cs + cs*0.5, y: row*cs,
    color, life: 1.0, vy: -0.8
  });
}

function updateFloatTexts(dt) {
  for (let i = state.floatTexts.length-1; i >= 0; i--) {
    const ft = state.floatTexts[i];
    ft.life -= dt * 0.001;
    ft.y    += ft.vy;
    if (ft.life <= 0) state.floatTexts.splice(i, 1);
  }
}

// ═══════════════════════════════════════════
//  HUD UPDATE
// ═══════════════════════════════════════════
function updateHUD() {
  updateTimer();
  updateHearts();
  updateScore();
  updateIntensity();
}

function updateTimer() {
  const t    = Math.max(0, state.timeLeft);
  const mins = Math.floor(t / 60);
  const secs = Math.floor(t % 60);
  timerDisplay.textContent = `0${mins}:${secs.toString().padStart(2,'0')}`;
  if (t <= 10) {
    timerDisplay.classList.add('danger');
    vignette.classList.add('danger');
  } else {
    timerDisplay.classList.remove('danger');
    vignette.classList.remove('danger');
  }
}

function updateHearts() {
  hearts.forEach((h, i) => {
    if (i < state.health) {
      h.classList.remove('lost');
    } else {
      h.classList.add('lost');
      h.classList.add('damage-flash');
      setTimeout(() => h.classList.remove('damage-flash'), 400);
    }
  });
}

function updateScore() {
  scoreValue.textContent = state.score.toLocaleString();
}

function updateIntensity() {
  const pct = Math.min(100, (state.elapsed / TOTAL_TIME) * 100);
  intensityBar.style.width = pct + '%';
}

// ═══════════════════════════════════════════
//  EFFECTS
// ═══════════════════════════════════════════
function triggerScreenShake() {
  gameRoot.classList.remove('shake');
  void gameRoot.offsetWidth; // reflow
  gameRoot.classList.add('shake');
  setTimeout(() => gameRoot.classList.remove('shake'), 400);
}

function triggerHitFlash() {
  gameRoot.classList.remove('hit-flash');
  void gameRoot.offsetWidth;
  gameRoot.classList.add('hit-flash');
  setTimeout(() => gameRoot.classList.remove('hit-flash'), 400);
}

let heartbeatInterval = null;
function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (state.phase === 'playing' && state.timeLeft <= 10) sfxHeartbeat();
  }, 600);
}
function stopHeartbeat() {
  if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
}

// Win sparks
function createWinSparks() {
  const container = document.getElementById('win-sparks');
  container.innerHTML = '';
  for (let i = 0; i < 60; i++) {
    const spark = document.createElement('div');
    spark.style.cssText = `
      position:absolute;
      width:${4+Math.random()*8}px; height:${4+Math.random()*8}px;
      background: hsl(${30+Math.random()*40},100%,${55+Math.random()*30}%);
      border-radius: 50%;
      left:${Math.random()*100}%; top:${Math.random()*100}%;
      animation: sparkFloat ${1+Math.random()*2}s ease-out ${Math.random()*1.5}s forwards;
      opacity:0;
    `;
    container.appendChild(spark);
  }
}

// inject keyframe if needed
(function injectSparkKeyframe() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes sparkFloat {
      0%   { transform: translateY(0) scale(1); opacity:1; }
      100% { transform: translateY(-120px) scale(0.2); opacity:0; }
    }
  `;
  document.head.appendChild(style);
})();

// ═══════════════════════════════════════════
//  RENDERING
// ═══════════════════════════════════════════
const warnPhase = { val: 0 };
let warnAnimFrame = 0;

function draw(timestamp) {
  const cs = getCellSize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  warnAnimFrame += 0.1;

  // Draw grid
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * cs, y = r * cs;
      const t = state.grid[r][c];
      const fi = state.fire[r][c];

      // Base tile
      if (t === TILE.WALL) {
        drawWall(x, y, cs);
      } else if (t === TILE.EXIT) {
        drawExit(x, y, cs, timestamp);
      } else {
        drawFloor(x, y, cs, r, c);
      }

      // Warning overlay
      if (state.warned[r][c] && fi <= 0) {
        const alpha = 0.4 + 0.35*Math.sin(warnAnimFrame*2);
        ctx.save();
        ctx.strokeStyle = `rgba(255,80,0,${alpha})`;
        ctx.lineWidth   = 2;
        ctx.strokeRect(x+1, y+1, cs-2, cs-2);
        ctx.fillStyle   = `rgba(255,80,0,${alpha*0.3})`;
        ctx.fillRect(x, y, cs, cs);
        // warning symbol
        ctx.fillStyle = `rgba(255,180,0,${alpha})`;
        ctx.font = `bold ${cs*0.45}px Rajdhani`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', x+cs*0.5, y+cs*0.5);
        ctx.restore();
      }

      // Fire
      if (fi > 0) {
        drawFire(x, y, cs, fi, c, r, timestamp);
      }
    }
  }

  // Power-ups
  state.powerups.forEach(pu => {
    const x = pu.col*cs, y = pu.row*cs;
    pu.anim = (pu.anim || 0) + 0.08;
    const bob = Math.sin(pu.anim)*3;
    ctx.save();
    ctx.shadowColor = pu.type==='shield' ? '#3498db' : '#e8621a';
    ctx.shadowBlur  = 16;
    ctx.font = `${cs*0.55}px serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(pu.type==='shield' ? '🛡️' : '🧯', x+cs*0.5, y+cs*0.5+bob);
    ctx.restore();
  });

  // Particles
  drawParticles();

  // Player
  drawPlayer(cs, timestamp);

  // Float texts
  drawFloatTexts();
}

function drawFloor(x, y, cs, r, c) {
  // Checkerboard subtle
  const dark = ((r+c)%2===0);
  ctx.fillStyle = dark ? '#18181f' : '#1e1e28';
  ctx.fillRect(x, y, cs, cs);
  // subtle grid line
  ctx.strokeStyle = '#252530';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(x, y, cs, cs);
}

function drawWall(x, y, cs) {
  ctx.fillStyle = '#0e0e16';
  ctx.fillRect(x, y, cs, cs);
  // Bevel
  ctx.fillStyle = '#1a1a24';
  ctx.fillRect(x+1, y+1, cs-2, 3);
  ctx.fillRect(x+1, y+1, 3, cs-2);
  ctx.fillStyle = '#08080f';
  ctx.fillRect(x+1, y+cs-4, cs-2, 3);
  ctx.fillRect(x+cs-4, y+1, 3, cs-2);
  ctx.strokeStyle = '#222230';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, cs, cs);
}

function drawExit(x, y, cs, timestamp) {
  const t = timestamp * 0.002;
  const open = state.exitOpen;
  ctx.fillStyle = open ? '#071a0f' : '#0a100a';
  ctx.fillRect(x, y, cs, cs);
  // Door frame
  ctx.strokeStyle = open ? '#27ae60' : '#1a3a1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x+2, y+2, cs-4, cs-4);
  // Glow if open
  if (open) {
    const grd = ctx.createRadialGradient(x+cs*0.5, y+cs*0.5, 0, x+cs*0.5, y+cs*0.5, cs*0.7);
    grd.addColorStop(0, `rgba(39,174,96,${0.4+0.2*Math.sin(t*3)})`);
    grd.addColorStop(1, 'rgba(39,174,96,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, cs, cs);
  }
  ctx.font = `${cs*0.55}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(open ? '🚪' : '🔒', x+cs*0.5, y+cs*0.5);
}

function drawFire(x, y, cs, intensity, col, row, timestamp) {
  const t = timestamp * 0.003 + col*0.5 + row*0.7;

  // Base dark red glow bg
  ctx.fillStyle = `rgba(100,0,0,${intensity*0.9})`;
  ctx.fillRect(x, y, cs, cs);

  // Outer red layer
  ctx.fillStyle = `rgba(180,20,0,${intensity*0.8})`;
  ctx.fillRect(x+1, y+1, cs-2, cs-2);

  // Flame shape using multiple ellipses
  const flameH = cs * (0.7 + 0.2*Math.sin(t*2.3)) * intensity;
  const flameW = cs * 0.55;
  const cx = x + cs*0.5;
  const cy = y + cs*0.85;

  // Outer flame — deep orange
  ctx.save();
  ctx.globalAlpha = intensity * 0.9;
  {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy-flameH*0.3, flameH);
    grad.addColorStop(0, `rgba(255,180,0,1)`);
    grad.addColorStop(0.4, `rgba(220,80,0,0.9)`);
    grad.addColorStop(1, `rgba(180,0,0,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx + Math.sin(t)*cs*0.1, cy - flameH*0.5, flameW*0.5, flameH*0.55, Math.sin(t*0.7)*0.2, 0, Math.PI*2);
    ctx.fill();
  }
  // Inner flame — yellow
  {
    const h2 = flameH * 0.6;
    const grad2 = ctx.createRadialGradient(cx, cy, 0, cx, cy-h2*0.3, h2);
    grad2.addColorStop(0, 'rgba(255,255,180,1)');
    grad2.addColorStop(0.5,'rgba(255,220,0,0.9)');
    grad2.addColorStop(1,  'rgba(255,100,0,0)');
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.sin(t*1.3)*cs*0.06, cy - h2*0.45, flameW*0.3, h2*0.5, Math.sin(t*0.9)*0.15, 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();

  // Outer glow
  ctx.save();
  ctx.globalAlpha = intensity * 0.4;
  const glow = ctx.createRadialGradient(cx, y+cs*0.5, 0, cx, y+cs*0.5, cs*0.85);
  glow.addColorStop(0, 'rgba(255,120,0,0.6)');
  glow.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, cs, cs);
  ctx.restore();
}

function drawParticles() {
  state.particles.forEach(p => {
    const t = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = t * 0.85;
    const hue = 20 + t * 30;
    ctx.fillStyle = `hsl(${hue},100%,${55+t*20}%)`;
    ctx.shadowColor= `hsl(${hue},100%,70%)`;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * t, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

function drawPlayer(cs, timestamp) {
  const p = state.player;
  const cx = p.px + cs*0.5;
  const cy = p.py + cs*0.5;
  const t  = timestamp * 0.004;

  ctx.save();

  // Blink if invincible
  if (p.invincible && Math.floor(timestamp/120)%2===0) {
    ctx.globalAlpha = 0.3;
  }

  // Shield aura
  if (p.shielded) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3*Math.sin(t*4);
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth   = 3;
    ctx.shadowColor = '#3498db';
    ctx.shadowBlur  = 20;
    ctx.beginPath();
    ctx.arc(cx, cy, cs*0.52, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
  }

  // Body shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, p.py+cs*0.88, cs*0.28, cs*0.1, 0, 0, Math.PI*2);
  ctx.fill();

  // Idle bob
  const bobY = p.moving ? Math.sin(p.anim*6)*cs*0.08 : Math.sin(t*1.8)*cs*0.05;

  // Body (torso)
  ctx.fillStyle = p.shielded ? '#2980b9' : '#e74c3c';
  ctx.beginPath();
  ctx.ellipse(cx, cy+bobY, cs*0.22, cs*0.28, 0, 0, Math.PI*2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#f5d0a9';
  ctx.beginPath();
  ctx.arc(cx, cy - cs*0.2 + bobY, cs*0.18, 0, Math.PI*2);
  ctx.fill();

  // Eyes (directional)
  const eyeOff = p.facing==='right' ? cs*0.06 : -cs*0.06;
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(cx + eyeOff, cy - cs*0.22 + bobY, cs*0.04, 0, Math.PI*2);
  ctx.fill();

  // Legs
  const legSwing = p.moving ? Math.sin(p.anim*6)*cs*0.14 : 0;
  ctx.fillStyle = '#2c3e50';
  ctx.beginPath();
  ctx.ellipse(cx - cs*0.08, cy + cs*0.28 + bobY + legSwing, cs*0.08, cs*0.14, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + cs*0.08, cy + cs*0.28 + bobY - legSwing, cs*0.08, cs*0.14, 0, 0, Math.PI*2);
  ctx.fill();

  // Arms
  ctx.fillStyle = '#e74c3c';
  const armSwing = p.moving ? Math.sin(p.anim*6)*cs*0.1 : 0;
  ctx.beginPath();
  ctx.ellipse(cx - cs*0.28, cy + cs*0.02 + bobY + armSwing, cs*0.07, cs*0.14, -0.3, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + cs*0.28, cy + cs*0.02 + bobY - armSwing, cs*0.07, cs*0.14, 0.3, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

function drawFloatTexts() {
  state.floatTexts.forEach(ft => {
    ctx.save();
    ctx.globalAlpha = ft.life;
    ctx.fillStyle   = ft.color;
    ctx.font        = `bold 14px Orbitron, monospace`;
    ctx.textAlign   = 'center';
    ctx.textBaseline= 'middle';
    ctx.shadowColor = ft.color;
    ctx.shadowBlur  = 8;
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  });
}

// ═══════════════════════════════════════════
//  GAME LOOP
// ═══════════════════════════════════════════
function gameLoop(timestamp) {
  if (state.phase !== 'playing') return;

  const dt = Math.min(timestamp - lastTimestamp, 100); // cap at 100ms
  lastTimestamp = timestamp;

  // Timer
  // Timer
state.timeLeft -= dt * 0.001;
state.elapsed  += dt * 0.001;

if (state.timeLeft <= 0) {
  state.timeLeft = 0;
  endGameover();
  return;
}


  // Fire spread
  state.fireTimer += dt;
  const fireInt = currentFireInterval();
  if (state.fireTimer >= fireInt) {
    state.fireTimer = 0;
    spreadFire();
    // Clear warnings on newly ignited cells
    for (let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(state.fire[r][c]>0) state.warned[r][c]=false;
  }

  // Update fire intensity
  updateFireIntensity(dt);

  // Powerup spawn
  state.powerupTimer += dt;
  if (state.powerupTimer > 8000) {
    state.powerupTimer = 0;
    spawnPowerup();
  }

  // Player
  tryMove(dt);
  updatePlayerAnim(dt);
  checkFireDamage();
  updateInvincibility(dt);

  // Score
  state.scoreAccum += dt;
  if (state.scoreAccum >= 1000) {
    state.scoreAccum = 0;
    state.score += Math.floor(100 * (1 + state.elapsed / 20));
    updateScore();
  }

  // Heartbeat in final 10s (start once)
  if (state.timeLeft <= 10 && state.timeLeft > 0 && !heartbeatInterval) {
    startHeartbeat();
  }

  // HUD
  updateTimer();
  updateIntensity();

  // Particles / floatTexts
  updateParticles(dt);
  updateFloatTexts(dt);

  // Draw
  draw(timestamp);

  rafId = requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════
//  SCREEN MANAGEMENT
// ═══════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = '';
  });
  const el = document.getElementById(id);
  if (el) { el.style.display = 'flex'; el.classList.add('active'); }
}

// ═══════════════════════════════════════════
//  GAME TRANSITIONS
// ═══════════════════════════════════════════
function startGame() {
  if (rafId) cancelAnimationFrame(rafId);
  stopHeartbeat();

  state.phase = 'playing';
  initGame();
  showScreen('screen-game');
  vignette.classList.remove('active','danger');
  gameRoot.classList.remove('shake','hit-flash');

  lastTimestamp = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (state.phase !== 'playing') return;
  state.phase = 'paused';
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  stopHeartbeat();
  showScreen('screen-pause');
  // keep game screen visible behind
  document.getElementById('screen-game').style.display = 'flex';
  document.getElementById('screen-pause').style.display = 'flex';
}

function resumeGame() {
  if (state.phase !== 'paused') return;
  state.phase = 'playing';
  document.getElementById('screen-pause').style.display = 'none';
  document.getElementById('screen-pause').classList.remove('active');
  lastTimestamp = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function endGameover() {
  if (state.phase === 'gameover') return;
  state.phase = 'gameover';
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  stopHeartbeat();
  sfxGameover();

  goTime.textContent     = state.elapsed.toFixed(1) + 's';
  goScore.textContent    = state.score.toLocaleString();
  goPowerups.textContent = state.powerupsCollected;

  setTimeout(() => showScreen('screen-gameover'), 400);
}

function endWin() {
  if (state.phase === 'win') return;
  state.phase = 'win';
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  stopHeartbeat();

  // Open exit
  state.exitOpen = true;
  state.score += state.health * 1000;
  state.score += 5000; // survival bonus
  sfxWin();

  winHealth.textContent  = state.health;
  winScore.textContent   = state.score.toLocaleString();
  winPowerups.textContent= state.powerupsCollected;

  createWinSparks();
  setTimeout(() => showScreen('screen-win'), 600);
}

function restartGame() {
  stopHeartbeat();
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  Object.keys(keys).forEach(k => { keys[k] = false; });
  Object.keys(dpadPressed).forEach(k => { dpadPressed[k] = false; });
  vignette.classList.remove('active','danger');
  gameRoot.classList.remove('shake','hit-flash');
  startGame();
}

// ═══════════════════════════════════════════
//  SOUND TOGGLE
// ═══════════════════════════════════════════
function toggleSound() {
  state.soundOn = !state.soundOn;
  const label = state.soundOn ? '🔊 Sound ON' : '🔇 Sound OFF';
  btnSoundStart.textContent = label;
  btnSoundGame.textContent  = state.soundOn ? '🔊' : '🔇';
}

// ═══════════════════════════════════════════
//  START SCREEN PARTICLES
// ═══════════════════════════════════════════
function createStartParticles() {
  const container = document.getElementById('start-particles');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    const size = 3 + Math.random()*6;
    const left = Math.random()*100;
    const dur  = 3 + Math.random()*5;
    const del  = Math.random()*4;
    p.style.cssText = `
      position:absolute;
      width:${size}px; height:${size}px;
      background: hsl(${15+Math.random()*30},100%,${50+Math.random()*30}%);
      border-radius:50%;
      left:${left}%;
      bottom:-10px;
      opacity:0;
      animation: riseUp ${dur}s ease-in ${del}s infinite;
    `;
    container.appendChild(p);
  }

  const style = document.createElement('style');
  style.textContent = `
    @keyframes riseUp {
      0%   { transform: translateY(0) scale(1); opacity:0.8; }
      100% { transform: translateY(-110vh) scale(0.1); opacity:0; }
    }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════
//  EVENT LISTENERS
// ═══════════════════════════════════════════
btnStart.addEventListener('click', () => {
  ensureAudio && ensureAudio();
  startGame();
});
btnPause.addEventListener('click', pauseGame);
btnResume.addEventListener('click', resumeGame);
btnRestartPause.addEventListener('click', restartGame);
btnRestartGo.addEventListener('click', restartGame);
btnRestartWin.addEventListener('click', restartGame);
btnSoundStart.addEventListener('click', toggleSound);
btnSoundGame.addEventListener('click', toggleSound);

// ═══════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════
createStartParticles();
showScreen('screen-start');
