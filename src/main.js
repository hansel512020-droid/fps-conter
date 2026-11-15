import './ui/hud.css';
import { Game } from './core/Game.js';

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = 'breachpoint.settings.v1';
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { return {}; }
}
function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

const saved = loadSettings();
const prefs = {
  team: saved.team || 'T',
  difficulty: saved.difficulty || 'normal',
  sensitivity: saved.sensitivity ?? 1,
  quality: saved.quality || 'medium',
  fov: saved.fov ?? 78,
  volume: saved.volume ?? 0.8,
};

const menu = $('menu');
const playBtn = $('play-btn');
const loading = $('loading');

function bindSeg(attr, key) {
  const btns = document.querySelectorAll(`[data-${attr}]`);
  const sync = () => btns.forEach((x) => x.classList.toggle('active', x.dataset[attr] === prefs[key]));
  btns.forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    prefs[key] = b.dataset[attr];
    sync();
    saveSettings(prefs);
    if (key === 'quality' && game) game.applySettings({ quality: prefs.quality });
  }));
  sync();
}
function bindRange(id, key, labelId, fmt) {
  const el = $(id), label = $(labelId);
  el.value = prefs[key];
  label.textContent = fmt(prefs[key]);
  el.addEventListener('input', () => {
    prefs[key] = Number(el.value);
    label.textContent = fmt(prefs[key]);
    saveSettings(prefs);
    if (game && key !== 'sensitivity') game.applySettings({ [key]: prefs[key] });
    if (game && key === 'sensitivity') game.settings.sensitivity = prefs.sensitivity;
  });
}

let game = null;
playBtn.disabled = true;
try {
  game = new Game($('game'));
  game.applySettings({ quality: prefs.quality, fov: prefs.fov, volume: prefs.volume });
  loading.textContent = 'Listo';
  playBtn.disabled = false;
} catch (err) {
  loading.textContent = 'Error al iniciar: ' + err.message;
  console.error(err);
}

bindSeg('team', 'team');
bindSeg('diff', 'difficulty');
bindSeg('quality', 'quality');
bindRange('sens', 'sensitivity', 'sens-val', (v) => Number(v).toFixed(2));
bindRange('fov', 'fov', 'fov-val', (v) => String(Math.round(v)));
bindRange('vol', 'volume', 'vol-val', (v) => String(Math.round(v * 100)));

function showMenu() {
  menu.classList.remove('hidden');
  if (game && game.state === 'paused') {
    playBtn.textContent = 'CONTINUAR';
    loading.textContent = 'Partida en pausa · pulsa CONTINUAR para volver';
  }
}

playBtn.addEventListener('click', () => {
  if (!game) return;
  menu.classList.add('hidden');
  if (game.state === 'paused') {
    game.resume();
  } else {
    game.start({ team: prefs.team, difficulty: prefs.difficulty, sensitivity: prefs.sensitivity });
    playBtn.textContent = 'CONTINUAR';
    for (const b of document.querySelectorAll('[data-team],[data-diff]')) b.disabled = true;
  }
});

if (game) game.onMenuRequest = showMenu;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && game && game.state === 'playing' && !game.buyMenu.open) game.input.releaseLock();
});

window.__game = game;
