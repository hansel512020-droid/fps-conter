import './ui/hud.css';
import { Game } from './core/Game.js';

const $ = (id) => document.getElementById(id);

const menu = $('menu');
const playBtn = $('play-btn');
const loading = $('loading');
const sens = $('sens');
const sensVal = $('sens-val');
let team = 'T';
let difficulty = 'normal';

for (const b of document.querySelectorAll('[data-team]')) {
  b.addEventListener('click', () => {
    team = b.dataset.team;
    document.querySelectorAll('[data-team]').forEach((x) => x.classList.toggle('active', x === b));
  });
}
for (const b of document.querySelectorAll('[data-diff]')) {
  b.addEventListener('click', () => {
    difficulty = b.dataset.diff;
    document.querySelectorAll('[data-diff]').forEach((x) => x.classList.toggle('active', x === b));
  });
}
sens.addEventListener('input', () => { sensVal.textContent = Number(sens.value).toFixed(2); });

playBtn.disabled = true;
let game = null;
try {
  game = new Game($('game'));
  loading.textContent = 'Listo';
  playBtn.disabled = false;
} catch (err) {
  loading.textContent = 'Error al iniciar: ' + err.message;
  console.error(err);
}

function showMenu() {
  menu.classList.remove('hidden');
  if (game && game.state === 'paused') {
    playBtn.textContent = 'CONTINUAR';
    loading.textContent = 'Partida en pausa · Esc o clic en el juego para volver';
  }
}

playBtn.addEventListener('click', () => {
  if (!game) return;
  menu.classList.add('hidden');
  if (game.state === 'paused') {
    game.settings.sensitivity = Number(sens.value);
    game.resume();
  } else {
    game.start({ team, difficulty, sensitivity: Number(sens.value) });
    playBtn.textContent = 'CONTINUAR';
    for (const b of document.querySelectorAll('[data-team],[data-diff]')) b.disabled = true;
  }
});

game && (game.onMenuRequest = showMenu);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game && game.state === 'playing') {
    // pointer lock release triggers pause via onLockChange
    game.input.releaseLock();
  }
});

window.__game = game;
