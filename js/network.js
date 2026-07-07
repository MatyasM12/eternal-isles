'use strict';

// ─── Config ───────────────────────────────────────────────────────────────────
// Replace with your Railway / Render server URL once deployed.
// During local development set this to 'http://localhost:3000'.
const SERVER_URL = window.ETERNAL_SERVER_URL || 'https://eternal-isles-production.up.railway.app';

// ─── State ────────────────────────────────────────────────────────────────────
let _socket          = null;
let _loggedInAs      = null;   // username string once authenticated
const _otherPlayers  = new Map(); // socketId -> { username, mesh }

// Exposed so game.js can check
function isMultiplayer() { return _socket !== null && _socket.connected; }
function getUsername()   { return _loggedInAs; }

// ─── REST helpers ─────────────────────────────────────────────────────────────
async function _post(path, body) {
  const r = await fetch(SERVER_URL + path, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  return r.json();
}

// ─── Apply a save blob from the server into the running game ─────────────────
function _applySave(s) {
  if (!s) return false;
  if (s.username)    { player.name = s.username; }
  if (s.hp)          { player.hp = s.hp; player.maxhp = s.maxhp; }
  if (s.atkLvl)      { player.atkLvl = s.atkLvl; player.atkXp = s.atkXp; }
  if (s.defLvl)      { player.defLvl = s.defLvl; player.defXp = s.defXp; }
  if (s.craftLvl)    { player.craftLvl = s.craftLvl; player.craftXp = s.craftXp; }
  if (s.equip)       { Object.assign(player.equip, s.equip); }
  if (s.dragonKilled){ player.dragonKilled = s.dragonKilled; }
  if (s.talents)     { Object.assign(player.talents, s.talents); }
  if (s.hotbar)      { for (let i = 0; i < 5 && i < s.hotbar.length; i++) player.hotbar[i] = s.hotbar[i]; }
  if (s.inventory) {
    for (let i = 0; i < Math.min(s.inventory.length, inventory.length); i++) {
      inventory[i] = s.inventory[i]
        ? { item: s.inventory[i].item, count: s.inventory[i].count }
        : null;
    }
  }
  return true;
}

// ─── Connect socket & register event handlers ─────────────────────────────────
function _connectSocket(username) {
  _socket = io(SERVER_URL, { transports: ['websocket'] });

  _socket.on('connect', () => {
    console.log('[net] socket connected');
    _socket.emit('player:join', { username });

    // Send creature definitions so server can build authoritative state
    // (only the first client does real work; server ignores if already inited)
    if (typeof CREATURE_DEFS !== 'undefined') {
      const defs = {};
      for (const [name, def] of Object.entries(CREATURE_DEFS)) {
        defs[name] = { count: def.count, hp: def.hp };
      }
      _socket.emit('creature:init', defs);
    }
  });

  _socket.on('disconnect', () => {
    console.log('[net] disconnected');
    _removeAllOtherPlayers();
  });

  // ── Other players ──────────────────────────────────────────────────────────
  _socket.on('players:online', (list) => {
    for (const p of list) _addOtherPlayer(p.id, p.username);
  });

  _socket.on('player:joined', ({ id, username: uname }) => {
    _addOtherPlayer(id, uname);
    if (typeof log === 'function') log(uname + ' joined the isle.', 'sys');
  });

  _socket.on('player:left', ({ id, username: uname }) => {
    _removeOtherPlayer(id);
    if (typeof log === 'function') log(uname + ' left the isle.', 'sys');
  });

  _socket.on('player:moved', ({ id, username: uname, x, z }) => {
    _moveOtherPlayer(id, uname, x, z);
  });

  // ── Creatures (server-authoritative HP) ───────────────────────────────────
  _socket.on('creatures:snapshot', (list) => {
    _buildCreatureIdMap(list);
    for (const c of list) _applyCreatureState(c);
  });

  _socket.on('creature:damaged', ({ id, hp, maxhp }) => {
    _applyCreatureHp(id, hp, maxhp);
  });

  _socket.on('creature:died', ({ id }) => {
    _killCreatureById(id);
  });

  _socket.on('creature:respawned', ({ id, hp, maxhp }) => {
    _respawnCreatureById(id, hp, maxhp);
  });
}

// ─── Other-player ghost avatars ───────────────────────────────────────────────
function _addOtherPlayer(id, username) {
  if (_otherPlayers.has(id) || typeof scene === 'undefined') return;
  const geo  = new THREE.CylinderGeometry(0.25, 0.25, 1.2, 8);
  const mat  = new THREE.MeshLambertMaterial({ color: 0x88aaff, transparent: true, opacity: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, -100, 0);  // hidden until first move
  scene.add(mesh);

  // Name label above head
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#aaddff';
  ctx.textAlign = 'center';
  ctx.fillText(username, 128, 40);
  const tex   = new THREE.CanvasTexture(canvas);
  const lGeo  = new THREE.PlaneGeometry(1.6, 0.4);
  const lMat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const label = new THREE.Mesh(lGeo, lMat);
  label.position.set(0, 1.2, 0);
  mesh.add(label);

  _otherPlayers.set(id, { username, mesh });
}

function _removeOtherPlayer(id) {
  const entry = _otherPlayers.get(id);
  if (!entry) return;
  if (typeof scene !== 'undefined') scene.remove(entry.mesh);
  _otherPlayers.delete(id);
}

function _removeAllOtherPlayers() {
  for (const id of _otherPlayers.keys()) _removeOtherPlayer(id);
}

function _moveOtherPlayer(id, username, x, z) {
  let entry = _otherPlayers.get(id);
  if (!entry) { _addOtherPlayer(id, username); entry = _otherPlayers.get(id); }
  if (!entry) return;
  const y = (typeof terrainHeight === 'function') ? terrainHeight(x, z) : 0;
  entry.mesh.position.set(x, y + 0.6, z);
}

// ─── Server-authoritative creature sync ───────────────────────────────────────
const _creatureIdMap = new Map();  // serverId -> local creatures[] entry

function _buildCreatureIdMap(snapshot) {
  // Match server creatures to local creatures[] by name in spawn order
  const byName = {};
  for (const c of creatures) {
    const n = c.name || '';
    if (!byName[n]) byName[n] = [];
    byName[n].push(c);
  }
  const usedIdx = {};
  for (const sc of snapshot) {
    const list = byName[sc.name];
    if (!list) continue;
    const idx = usedIdx[sc.name] || 0;
    if (list[idx]) _creatureIdMap.set(sc.id, list[idx]);
    usedIdx[sc.name] = idx + 1;
  }
}

function _applyCreatureState(sc) {
  const lc = _creatureIdMap.get(sc.id);
  if (!lc) return;
  lc.hp = sc.hp;
  if (lc.hpBar) {
    const pct = Math.max(0, lc.hp / lc.maxhp);
    lc.hpBar.scale.x = pct;
    lc.hpBar.position.x = (pct - 1) * 0.5 * (lc.def.barW || 1);
  }
}

function _applyCreatureHp(serverId, hp, maxhp) {
  const lc = _creatureIdMap.get(serverId);
  if (!lc) return;
  lc.hp = hp;
  if (lc.hpBar) {
    const pct = Math.max(0, hp / maxhp);
    lc.hpBar.scale.x = pct;
    lc.hpBar.position.x = (pct - 1) * 0.5 * (lc.def.barW || 1);
  }
}

function _killCreatureById(serverId) {
  const lc = _creatureIdMap.get(serverId);
  if (!lc || lc.dead) return;
  if (typeof killCreature === 'function') killCreature(lc);
}

function _respawnCreatureById(serverId, hp, maxhp) {
  const lc = _creatureIdMap.get(serverId);
  if (!lc) return;
  lc.hp    = hp;
  lc.dead  = false;
  lc.state = 'wander';
  if (lc.group) lc.group.visible = true;
}

// ─── Called by game.js after spawnAllCreatures() ─────────────────────────────
function netOnCreaturesSpawned() {
  if (!isMultiplayer() || !_socket) return;
  _socket.once('creatures:snapshot', (list) => {
    _buildCreatureIdMap(list);
    for (const sc of list) _applyCreatureState(sc);
  });
  _socket.emit('creature:init', null);  // triggers snapshot reply from server
}

// ─── Called by game.js when local player hits a creature ─────────────────────
// Returns true if the hit was forwarded to the server (caller should skip local apply).
function netAttackCreature(localCreature, damage) {
  if (!isMultiplayer() || !_socket) return false;
  for (const [sid, lc] of _creatureIdMap) {
    if (lc === localCreature) {
      _socket.emit('creature:attack', { creatureId: sid, damage });
      return true;
    }
  }
  return false;
}

// ─── Called by saveGame() to also persist to server ──────────────────────────
function netSavePlayer() {
  if (!isMultiplayer() || !_socket) return;
  _socket.emit('player:save', {
    hp: player.hp, maxhp: player.maxhp,
    atkLvl: player.atkLvl, atkXp: player.atkXp,
    defLvl: player.defLvl, defXp: player.defXp,
    craftLvl: player.craftLvl, craftXp: player.craftXp,
    dragonKilled: player.dragonKilled,
    inventory: inventory.map(e => e ? { item: e.item, count: e.count } : null),
    equip: Object.assign({}, player.equip),
    talents: Object.assign({}, player.talents),
    hotbar: player.hotbar.slice(),
  });
}

// ─── Called every animation frame ────────────────────────────────────────────
let _lastMoveSent = 0;
function netTick() {
  if (!isMultiplayer() || !_socket || !player || !player.group) return;
  const now = Date.now();
  if (now - _lastMoveSent < 100) return;  // 10 Hz position updates
  _lastMoveSent = now;
  _socket.emit('player:move', {
    x: player.group.position.x,
    z: player.group.position.z,
  });
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────
function netInitAuthUI() {
  const nameSection = document.querySelector('#intro .mx-auto.mt-6.flex');
  const btnStart    = document.getElementById('btnStart');
  const blurb       = document.getElementById('intro')
    ? document.getElementById('intro').querySelector('.mt-6.text-\\[11px\\]')
    : null;

  if (!nameSection || !btnStart) return;

  const form = document.createElement('div');
  form.id = 'netAuthForm';
  form.className = 'mx-auto mt-6 flex max-w-xs flex-col items-center gap-3 w-full';
  form.innerHTML =
    '<div class="flex w-full gap-2">' +
      '<button id="netTabLogin"    class="flex-1 rounded-lg py-1.5 text-xs font-bold tracking-widest uppercase border border-white/20 bg-amber-400/25 text-amber-100">Login</button>' +
      '<button id="netTabRegister" class="flex-1 rounded-lg py-1.5 text-xs font-bold tracking-widest uppercase border border-white/10 text-zinc-400">Register</button>' +
    '</div>' +
    '<input id="netUsername" maxlength="16" placeholder="Username" autocomplete="username" ' +
      'class="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-center text-lg text-amber-100 outline-none transition focus:border-amber-300/50 focus:bg-black/60" />' +
    '<input id="netPassword" type="password" placeholder="Password" autocomplete="current-password" ' +
      'class="w-full rounded-xl border border-white/15 bg-black/40 px-4 py-2.5 text-center text-lg text-amber-100 outline-none transition focus:border-amber-300/50 focus:bg-black/60" />' +
    '<div id="netAuthError" class="hidden text-xs text-red-400"></div>';

  nameSection.replaceWith(form);
  btnStart.textContent = 'LOGIN & ENTER';
  if (blurb) blurb.textContent = 'Your progress is saved to the server.';

  document.getElementById('netTabLogin').addEventListener('click', () => {
    document.getElementById('netTabLogin').className    = 'flex-1 rounded-lg py-1.5 text-xs font-bold tracking-widest uppercase border border-white/20 bg-amber-400/25 text-amber-100';
    document.getElementById('netTabRegister').className = 'flex-1 rounded-lg py-1.5 text-xs font-bold tracking-widest uppercase border border-white/10 text-zinc-400';
    btnStart.textContent = 'LOGIN & ENTER';
  });

  document.getElementById('netTabRegister').addEventListener('click', () => {
    document.getElementById('netTabRegister').className = 'flex-1 rounded-lg py-1.5 text-xs font-bold tracking-widest uppercase border border-white/20 bg-amber-400/25 text-amber-100';
    document.getElementById('netTabLogin').className    = 'flex-1 rounded-lg py-1.5 text-xs font-bold tracking-widest uppercase border border-white/10 text-zinc-400';
    btnStart.textContent = 'REGISTER & ENTER';
  });

  document.getElementById('netPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnStart.click();
  });

  btnStart.addEventListener('click', _handleAuthClick);
}

function _showAuthError(msg) {
  const el = document.getElementById('netAuthError');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function _handleAuthClick() {
  const btn      = document.getElementById('btnStart');
  const username = (document.getElementById('netUsername') || {}).value || '';
  const password = (document.getElementById('netPassword') || {}).value || '';
  const isReg    = btn.textContent.includes('REGISTER');

  if (!username.trim() || !password.trim()) {
    _showAuthError('Please enter a username and password.');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Connecting…';

  try {
    const res = await _post(isReg ? '/register' : '/login', {
      username: username.trim(),
      password,
    });

    if (!res.ok) {
      _showAuthError(res.error || 'Auth failed');
      btn.disabled    = false;
      btn.textContent = isReg ? 'REGISTER & ENTER' : 'LOGIN & ENTER';
      return;
    }

    _loggedInAs = res.save ? res.save.username : username.trim();
    if (res.save) _applySave(res.save);
    _connectSocket(_loggedInAs);
    beginGame();

  } catch (err) {
    _showAuthError('Cannot reach server — is it running?');
    console.error('[net] auth error', err);
    btn.disabled    = false;
    btn.textContent = isReg ? 'REGISTER & ENTER' : 'LOGIN & ENTER';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', netInitAuthUI);
} else {
  netInitAuthUI();
}
