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

  _socket.on('kicked', ({ reason }) => {
    alert('You have been disconnected: ' + reason);
    _removeAllOtherPlayers();
    location.reload();
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
function _buildOtherPlayerMesh() {
  const g = new THREE.Group();
  const M = THREE.MeshStandardMaterial;
  const add = m => { m.castShadow = true; return m; };

  const cloth   = new M({ color: 0x8b3a3a, flatShading: true, roughness: 0.72, metalness: 0.06 }); // red tint to distinguish
  const steel   = new M({ color: 0xc9cfda, flatShading: true, roughness: 0.28, metalness: 0.9 });
  const steelDk = new M({ color: 0x8a92a1, flatShading: true, roughness: 0.4,  metalness: 0.85 });
  const gold    = new M({ color: 0xe8c266, flatShading: true, roughness: 0.35, metalness: 0.8 });
  const leather = new M({ color: 0x5a3d26, flatShading: true, roughness: 0.85 });
  const capeMat = new M({ color: 0x1e3a8a, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });

  // pelvis
  const pelvis = add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.24, 12), leather));
  pelvis.position.y = 0.66; g.add(pelvis);

  // torso
  const torso = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.29, 0.78, 12), cloth));
  torso.position.y = 1.16; g.add(torso);

  // chest plate
  const plate = add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 12, 0, Math.PI, 0, Math.PI * 0.62), steel));
  plate.scale.set(1, 1.15, 0.75); plate.position.set(0, 1.2, 0.02); plate.rotation.y = Math.PI; g.add(plate);

  // belt
  const belt = add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16), leather));
  belt.rotation.x = Math.PI / 2; belt.position.y = 0.79; g.add(belt);

  // cape
  const cape = add(new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.15, 3, 4), capeMat));
  cape.position.set(0, 1.05, -0.28); cape.rotation.x = 0.14; g.add(cape);

  // gorget
  const gorget = add(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.16, 12), steelDk));
  gorget.position.y = 1.6; g.add(gorget);

  // head
  const headG = new THREE.Group(); headG.position.y = 1.86; g.add(headG);
  headG.add(add(new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 14), steel)));
  const brow = add(new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.1, 16), steelDk));
  brow.position.y = 0.02; headG.add(brow);
  const visorMat = new M({ color: 0x06222c, emissive: 0xff3333, emissiveIntensity: 1.5, roughness: 0.3 }); // red visor for other players
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.075, 0.12), visorMat);
  visor.position.set(0, 0.03, 0.22); headG.add(visor);
  const crestBase = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.3), gold));
  crestBase.position.set(0, 0.28, -0.02); headG.add(crestBase);
  const plume = add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 8), capeMat));
  plume.position.set(0, 0.42, -0.08); plume.rotation.x = -0.5; headG.add(plume);

  // pauldrons
  for (const s of [-1, 1]) {
    const pa = add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), steel));
    pa.scale.set(1.1, 0.8, 1.1); pa.position.set(0.4 * s, 1.5, 0); g.add(pa);
  }

  // arms
  for (const s of [-1, 1]) {
    const armG = new THREE.Group(); armG.position.set(0.4 * s, 1.48, 0);
    const upper = add(new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.4, 8), cloth));
    upper.position.y = -0.24; armG.add(upper);
    const fore = add(new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.07, 0.34, 8), steelDk));
    fore.position.y = -0.56; armG.add(fore);
    const gaunt = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), steel));
    gaunt.position.y = -0.74; armG.add(gaunt);
    g.add(armG);
  }

  // legs
  for (const s of [-1, 1]) {
    const legG = new THREE.Group(); legG.position.set(0.15 * s, 0.66, 0);
    const thigh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.36, 8), steelDk));
    thigh.position.y = -0.2; legG.add(thigh);
    const shin = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.34, 8), steel));
    shin.position.y = -0.52; legG.add(shin);
    const boot = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), leather));
    boot.position.set(0, -0.72, 0.05); legG.add(boot);
    g.add(legG);
  }

  return g;
}

function _addOtherPlayer(id, username) {
  if (_otherPlayers.has(id) || typeof scene === 'undefined') return;
  const mesh = _buildOtherPlayerMesh();
  mesh.position.set(0, -100, 0);  // hidden until first move
  scene.add(mesh);

  // Name label above head
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#ffaaaa';
  ctx.textAlign = 'center';
  ctx.fillText(username, 128, 40);
  const tex   = new THREE.CanvasTexture(canvas);
  const lGeo  = new THREE.PlaneGeometry(1.6, 0.4);
  const lMat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  const label = new THREE.Mesh(lGeo, lMat);
  label.position.set(0, 2.6, 0);
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
  entry.mesh.position.set(x, y, z);
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
