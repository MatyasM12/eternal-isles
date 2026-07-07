'use strict';

// ─── Config ───────────────────────────────────────────────────────────────────
// Replace with your Railway / Render server URL once deployed.
// During local development set this to 'http://localhost:3000'.
const SERVER_URL = window.ETERNAL_SERVER_URL || 'https://eternal-isles-production.up.railway.app';

// ─── State ────────────────────────────────────────────────────────────────────
let _socket                = null;
let _loggedInAs            = null;   // username string once authenticated
const _otherPlayers        = new Map(); // socketId -> { username, mesh, animT, moving, lastPos, lastAnimTime, hpPct }

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

    // Send creature definitions so server can build authoritative AI state
    // (only the first client does real work; server ignores if already inited)
    if (typeof CREATURE_DEFS !== 'undefined') {
      const defs = {};
      for (const [name, def] of Object.entries(CREATURE_DEFS)) {
        defs[name] = {
          count: def.count, hp: def.hp,
          speed: def.speed, aggro: def.aggro, dmg: def.dmg,
          tiers: def.tiers, spawnZone: def.spawnZone,
          spawnInset: def.spawnInset, nearWater: def.nearWater,
        };
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

  // ── Creature hit on this player (server-authoritative damage) ────────────
  _socket.on('creature:hit_player', ({ creatureId, damage }) => {
    const lc = _creatureIdMap.get(creatureId);
    if (typeof creatureHit === 'function' && lc) {
      creatureHit(lc);
    }
  });

  _socket.on('creature:spell', function(data) {
    var lc = _creatureIdMap.get(data.creatureId);
    if (!lc) return;
    var tgtPos = { x: data.targetX, z: data.targetZ };
    var dmg = Math.round((lc.def ? lc.def.dmg || 10 : 10) * data.dmgMult);
    if (lc.name === 'Dragon' && typeof spawnDragonFireball === 'function') {
      spawnDragonFireball(lc, dmg, tgtPos);
    } else if (typeof spawnCreatureProjectile === 'function') {
      spawnCreatureProjectile(lc, dmg, data.color, data.msg, tgtPos);
    }
    if (data.targetSocketId === _socket.id && typeof log === 'function') {
      log(data.msg, 'combat');
    }
  });

  _socket.on('creature:positions', (list) => {
    for (const entry of list) {
      const lc = _creatureIdMap.get(entry.id);
      if (!lc) continue;
      lc.netPos   = { x: entry.x, z: entry.z };
      lc.netState = entry.state;
    }
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

  _socket.on('player:moved', ({ id, username: uname, x, z, moving, hp, maxhp }) => {
    _moveOtherPlayer(id, uname, x, z, moving);
    if (hp !== undefined && maxhp !== undefined) _updateOtherPlayerHp(id, hp, maxhp);
  });

  // ── Creatures (server-authoritative) ─────────────────────────────────────
  _socket.on('creatures:snapshot', (list) => {
    _buildCreatureIdMap(list);
    for (const sc of list) {
      _applyCreatureState(sc);
      // Teleport local creature to server position on first sync
      const lc = _creatureIdMap.get(sc.id);
      if (lc && lc.group && sc.x !== undefined) {
        lc.group.position.x = sc.x;
        lc.group.position.z = sc.z;
      }
    }
  });

  _socket.on('creature:damaged', ({ id, hp, maxhp }) => {
    _applyCreatureHp(id, hp, maxhp);
  });

  _socket.on('creature:died', ({ id }) => {
    _killCreatureById(id);
  });

  _socket.on('creature:respawned', ({ id, hp, maxhp, x, z }) => {
    _respawnCreatureById(id, hp, maxhp, x, z);
  });

  // Other player casts a spell — show the visual only (no damage)
  _socket.on('player:spell', function(data) {
    var fromX = data.fromX || 0;
    var fromZ = data.fromZ || 0;
    var color = data.color || 0xffffff;

    // Caster-position effects: rings, sparks, pillars
    if (data.effectType === 'casterAura') {
      var pos = new THREE.Vector3(fromX, (typeof terrainHeight === 'function' ? terrainHeight(fromX, fromZ) : 0), fromZ);
      var headP = pos.clone().add(new THREE.Vector3(0, 2, 0));
      if (data.ring && typeof spawnGroundRing === 'function') {
        spawnGroundRing(pos.clone(), data.radius || 3, color, 0.7);
      }
      if (data.spark && typeof spawnSparkBurst === 'function') {
        spawnSparkBurst(headP, color, 18, 1.8, 3.0);
      }
      if (data.pillar && typeof spawnPillar === 'function') {
        spawnPillar(pos.clone(), color, 0.6);
      }
      return;
    }

    // Multi-creature hit: spark burst on each target
    if (data.effectType === 'creatureHit') {
      var ids = data.creatureIds || [];
      for (var i = 0; i < ids.length; i++) {
        var lch = _creatureIdMap.get(ids[i]);
        if (lch && lch.group && typeof spawnSparkBurst === 'function') {
          spawnSparkBurst(lch.group.position.clone().add(new THREE.Vector3(0, 1, 0)), color, 14, 1.2, 2.5);
        }
      }
      return;
    }

    // Projectile spells: fly from caster position to creature
    var lc = _creatureIdMap.get(data.creatureId);
    if (!lc || !lc.group) return;
    var origin = new THREE.Vector3(fromX, (typeof terrainHeight === 'function' ? terrainHeight(fromX, fromZ) : 0) + 2.0, fromZ);
    var endPos = lc.group.position.clone().add(new THREE.Vector3(0, 1, 0));
    var mat = new THREE.MeshBasicMaterial({ color: color });
    var geo = data.type === 'iceLance'
      ? new THREE.CylinderGeometry(0.06, 0.18, 0.9, 6)
      : new THREE.SphereGeometry(0.20, 8, 8);
    var mesh = new THREE.Mesh(geo, mat);
    var light = new THREE.PointLight(color, 1.8, 5);
    mesh.add(light);
    mesh.position.copy(origin);
    scene.add(mesh);
    if (typeof creatureProjectiles !== 'undefined') {
      creatureProjectiles.push({ mesh: mesh, startPos: origin, endPos: endPos, t: 0, damage: 0 });
    }
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

  // arms — keep refs for animation
  const arms = [];
  for (const s of [-1, 1]) {
    const armG = new THREE.Group(); armG.position.set(0.4 * s, 1.48, 0);
    const upper = add(new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.4, 8), cloth));
    upper.position.y = -0.24; armG.add(upper);
    const fore = add(new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.07, 0.34, 8), steelDk));
    fore.position.y = -0.56; armG.add(fore);
    const gaunt = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), steel));
    gaunt.position.y = -0.74; armG.add(gaunt);
    g.add(armG);
    arms.push(armG);
  }

  // legs — keep refs for animation
  const legs = [];
  for (const s of [-1, 1]) {
    const legG = new THREE.Group(); legG.position.set(0.15 * s, 0.66, 0);
    const thigh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.36, 8), steelDk));
    thigh.position.y = -0.2; legG.add(thigh);
    const shin = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.34, 8), steel));
    shin.position.y = -0.52; legG.add(shin);
    const boot = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), leather));
    boot.position.set(0, -0.72, 0.05); legG.add(boot);
    g.add(legG);
    legs.push(legG);
  }

  // attach named refs so animation can reach them
  g.userData.armL = arms[0]; g.userData.armR = arms[1];
  g.userData.legL = legs[0]; g.userData.legR = legs[1];

  // world-space HP bar sprite
  const hpCv = document.createElement('canvas');
  hpCv.width = 196; hpCv.height = 30;
  const hpCtx = hpCv.getContext('2d');
  const hpTex = new THREE.CanvasTexture(hpCv);
  const hpSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: hpTex, transparent: true, depthTest: false, depthWrite: false }));
  hpSprite.renderOrder = 30;
  hpSprite.scale.set(1.55, 1.55 * 0.153, 1);
  hpSprite.position.set(0, 2.3, 0);
  hpSprite.visible = true;
  g.add(hpSprite);
  g.userData.hpBar = { sprite: hpSprite, cv: hpCv, ctx: hpCtx, tex: hpTex };

  return g;
}

function _addOtherPlayer(id, username) {
  if (_otherPlayers.has(id) || typeof scene === 'undefined') return;
  const mesh = _buildOtherPlayerMesh();
  mesh.position.set(0, -100, 0);  // hidden until first move
  scene.add(mesh);

  // Name label — billboard sprite so it's always readable from any camera angle
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 384, 96);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 46px "Palatino Linotype", Palatino, Georgia, serif';
  ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(username, 192, 48);
  ctx.fillStyle = '#ffaaaa';
  ctx.fillText(username, 192, 48);
  const tex  = new THREE.CanvasTexture(canvas);
  const smat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const label = new THREE.Sprite(smat);
  label.renderOrder = 31;
  const w = Math.min(5.1, Math.max(2.1, username.length * 0.285 + 0.75));
  label.scale.set(w, w * 0.25, 1);
  label.position.set(0, 2.6, 0);
  mesh.add(label);

  _otherPlayers.set(id, { username, mesh, animT: 0, moving: false, lastPos: null, lastAnimTime: performance.now() });
  // Draw initial HP bar at full health so number is visible immediately
  _updateOtherPlayerHp(id, 100, 100);
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

function _moveOtherPlayer(id, username, x, z, moving) {
  let entry = _otherPlayers.get(id);
  if (!entry) { _addOtherPlayer(id, username); entry = _otherPlayers.get(id); }
  if (!entry) return;
  const y = (typeof terrainHeight === 'function') ? terrainHeight(x, z) : 0;

  // detect movement from position delta if server didn't send moving flag
  const prev = entry.lastPos;
  const dx = prev ? x - prev.x : 0;
  const dz = prev ? z - prev.z : 0;
  entry.moving = (moving !== undefined) ? moving : (dx * dx + dz * dz > 0.0001);
  entry.lastPos = { x, z };

  entry.mesh.position.set(x, y, z);

  // face direction of travel
  if (entry.moving && (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001)) {
    entry.mesh.rotation.y = Math.atan2(dx, dz);
  }

  // drive limb animation
  const now = performance.now();
  const dt = Math.min((now - entry.lastAnimTime) / 1000, 0.1);
  entry.lastAnimTime = now;
  entry.animT += dt * (entry.moving ? 10 : 2.4);
  const swing = entry.moving ? Math.sin(entry.animT) * 0.55 : Math.sin(entry.animT) * 0.05;
  const ud = entry.mesh.userData;
  if (ud.armL) ud.armL.rotation.x = swing;
  if (ud.armR) ud.armR.rotation.x = -swing;
  if (ud.legL) ud.legL.rotation.x = -swing;
  if (ud.legR) ud.legR.rotation.x = swing;
}

function _drawOtherPlayerHpBar(hpBar, pct, hp, maxhp) {
  const cx = hpBar.ctx, W = hpBar.cv.width, H = hpBar.cv.height;
  cx.clearRect(0, 0, W, H);
  const r = H * 0.5;
  cx.fillStyle = 'rgba(8,11,15,0.92)';
  _rrect(cx, 1, 1, W - 2, H - 2, r); cx.fill();
  const col = pct > 0.5 ? ['#4ade80', '#22c55e'] : pct > 0.25 ? ['#facc15', '#eab308'] : ['#f87171', '#ef4444'];
  const fw = Math.max(0, (W - 8) * pct);
  if (fw > 0.5) {
    const grad = cx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, col[0]); grad.addColorStop(1, col[1]);
    cx.fillStyle = grad;
    _rrect(cx, 4, 4, fw, H - 8, (H - 8) * 0.5); cx.fill();
  }
  cx.lineWidth = 2; cx.strokeStyle = 'rgba(255,255,255,0.25)';
  _rrect(cx, 1, 1, W - 2, H - 2, r); cx.stroke();
  if (hp !== undefined && maxhp !== undefined) {
    cx.font = 'bold 15px sans-serif';
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.strokeStyle = 'rgba(0,0,0,0.7)'; cx.lineWidth = 3;
    const txt = Math.ceil(hp) + '/' + maxhp;
    cx.strokeText(txt, W / 2, H / 2);
    cx.fillStyle = 'rgba(255,255,255,0.95)';
    cx.fillText(txt, W / 2, H / 2);
  }
  hpBar.tex.needsUpdate = true;
}

function _rrect(cx, x, y, w, h, r) {
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.arcTo(x + w, y, x + w, y + h, r);
  cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r);
  cx.arcTo(x, y, x + w, y, r);
  cx.closePath();
}

function _updateOtherPlayerHp(id, hp, maxhp) {
  const entry = _otherPlayers.get(id);
  if (!entry) return;
  const pct = Math.max(0, Math.min(1, hp / maxhp));
  const hpBar = entry.mesh.userData.hpBar;
  if (!hpBar) return;
  hpBar.sprite.visible = true;
  _drawOtherPlayerHpBar(hpBar, pct, hp, maxhp);
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
  _creatureIdMap.clear();
  const usedIdx = {};
  for (const sc of snapshot) {
    const list = byName[sc.name];
    if (!list) continue;
    const idx = usedIdx[sc.name] || 0;
    if (list[idx]) {
      _creatureIdMap.set(sc.id, list[idx]);
    }
    usedIdx[sc.name] = idx + 1;
  }
}

function _applyCreatureState(sc) {
  const lc = _creatureIdMap.get(sc.id);
  if (!lc) return;
  lc.hp = sc.hp;
  if (lc.bar && typeof setBar === 'function') {
    setBar(lc.bar, Math.max(0, lc.hp / lc.maxhp), lc.hp, lc.maxhp);
  }
}

function _applyCreatureHp(serverId, hp, maxhp) {
  const lc = _creatureIdMap.get(serverId);
  if (!lc) return;
  lc.hp = hp;
  if (maxhp) lc.maxhp = maxhp;
  if (lc.bar && typeof setBar === 'function') {
    setBar(lc.bar, Math.max(0, hp / maxhp), hp, maxhp);
  }
}

function _killCreatureById(serverId) {
  const lc = _creatureIdMap.get(serverId);
  if (!lc || lc.state === 'dead') return;
  // Kill visually — the attacker already got loot/XP locally via killCreature()
  lc.state = 'dead';
  lc.dead  = true;
  lc.respawn = 9999;
  lc.netState = null;
  lc.netPos   = null;
}

function _respawnCreatureById(serverId, hp, maxhp, x, z) {
  const lc = _creatureIdMap.get(serverId);
  if (!lc) return;
  lc.hp    = hp;
  lc.dead  = false;
  lc.state = 'wander';
  lc.netState = null;
  lc.netPos   = null;
  if (lc.group) {
    lc.group.visible = true;
    lc.group.scale.y = 1;
    if (x !== undefined) { lc.group.position.x = x; lc.group.position.z = z; }
  }
  if (lc.bar && typeof setBar === 'function') setBar(lc.bar, 1, lc.hp, lc.maxhp);
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

// ─── Broadcast a player-cast spell so other clients show the visual ──────────
function netCastSpell(type, targetCreature, color, dmg) {
  if (!isMultiplayer() || !_socket) return;
  var creatureId = null;
  for (var entry of _creatureIdMap) {
    if (entry[1] === targetCreature) { creatureId = entry[0]; break; }
  }
  if (creatureId === null) return;
  _socket.emit('player:spell', {
    effectType: 'projectile',
    type: type, creatureId: creatureId,
    color: color, dmg: dmg,
    fromX: player.group.position.x, fromZ: player.group.position.z,
  });
}

// Broadcast a caster-position AoE/buff effect (ring, sparks, pillar)
function netCastEffect(color, opts) {
  if (!isMultiplayer() || !_socket) return;
  var o = opts || {};
  _socket.emit('player:spell', {
    effectType: 'casterAura',
    color: color,
    ring: !!o.ring, spark: !!o.spark, pillar: !!o.pillar,
    radius: o.radius || 3,
    fromX: player.group.position.x, fromZ: player.group.position.z,
  });
}

// Broadcast spark hits on a list of local creature objects
function netCastCreatureHit(creatureList, color) {
  if (!isMultiplayer() || !_socket || !creatureList || !creatureList.length) return;
  var ids = [];
  for (var i = 0; i < creatureList.length; i++) {
    for (var entry of _creatureIdMap) {
      if (entry[1] === creatureList[i]) { ids.push(entry[0]); break; }
    }
  }
  if (!ids.length) return;
  _socket.emit('player:spell', {
    effectType: 'creatureHit',
    creatureIds: ids, color: color,
    fromX: player.group.position.x, fromZ: player.group.position.z,
  });
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

  // 10 Hz player position + hp
  if (now - _lastMoveSent >= 100) {
    _lastMoveSent = now;
    _socket.emit('player:move', {
      x: player.group.position.x,
      z: player.group.position.z,
      moving: !!player.moving,
      hp: player.hp,
      maxhp: player.maxhp,
    });
  }
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
