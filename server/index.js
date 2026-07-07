'use strict';
require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const mongoose   = require('mongoose');
const bcrypt     = require('bcryptjs');
const cors       = require('cors');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT          = process.env.PORT || 3000;
const MONGODB_URI   = process.env.MONGODB_URI;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

// ─── Mongoose models ──────────────────────────────────────────────────────────
const playerSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true, trim: true, maxlength: 16 },
  password:  { type: String, required: true },
  hp:        { type: Number, default: 100 },
  maxhp:     { type: Number, default: 100 },
  atkLvl:    { type: Number, default: 1 },
  atkXp:     { type: Number, default: 0 },
  defLvl:    { type: Number, default: 1 },
  defXp:     { type: Number, default: 0 },
  craftLvl:  { type: Number, default: 1 },
  craftXp:   { type: Number, default: 0 },
  dragonKilled: { type: Boolean, default: false },
  inventory: { type: mongoose.Schema.Types.Mixed, default: [] },
  equip:     { type: mongoose.Schema.Types.Mixed, default: {} },
  talents:   { type: mongoose.Schema.Types.Mixed, default: {} },
  hotbar:    { type: mongoose.Schema.Types.Mixed, default: [null,null,null,null,null] },
}, { timestamps: true });

const Player = mongoose.model('Player', playerSchema);

// ─── Terrain helpers (mirrored from game.js) ─────────────────────────────────
// Server only needs walkability for AI wander target validation.
const ISLES = [
  { x:    0, z:    0,   r: 52,  elongX: 1.0,  elongZ: 1.0,  tier: 0, peakMult: 0.85, hillFreq: 0.08 },
  { x:  148, z:  -18,   r: 44,  elongX: 1.6,  elongZ: 0.7,  tier: 1, peakMult: 1.15, hillFreq: 0.11 },
  { x:  -28, z:  152,   r: 40,  elongX: 0.9,  elongZ: 0.9,  tier: 2, peakMult: 1.80, hillFreq: 0.15 },
  { x: -150, z:  -40,   r: 54,  elongX: 1.1,  elongZ: 0.75, tier: 3, peakMult: 1.30, hillFreq: 0.06 },
  { x:  120, z:  150,   r: 36,  elongX: 0.65, elongZ: 1.4,  tier: 4, peakMult: 0.60, hillFreq: 0.18 },
  { x: -100, z:   70,   r: 38,  elongX: 1.1,  elongZ: 0.9,  tier: 5, peakMult: 0.90, hillFreq: 0.09 },
  { x:    0, z: -165,   r: 28,  elongX: 1.0,  elongZ: 1.0,  tier: 6, peakMult: 2.40, hillFreq: 0.20 },
  { x:    0, z: -235,   r: 120, elongX: 1.3,  elongZ: 1.1,  tier: 7, peakMult: 0.80, hillFreq: 0.04 },
  { x:  220, z:  220,   r: 45,  elongX: 1.0,  elongZ: 1.0,  tier: 8, peakMult: 1.10, hillFreq: 0.13 },
];
const WATER_Y  = -1.15;
const SEA      = WATER_Y - 2.15;
const OUTER_R  = 450;

function smoothstep(x, lo, hi) {
  const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
}
function terrainHeight(x, z) {
  let land = 0;
  for (const isle of ISLES) {
    const dx = x - isle.x, dz = z - isle.z;
    const dxe = dx / isle.elongX, dze = dz / isle.elongZ;
    const d = Math.sqrt(dxe * dxe + dze * dze);
    if (d < isle.r) {
      const t = 1 - d / isle.r;
      const dome = smoothstep(t, 0, 1);
      const pm = isle.peakMult || 1;
      const hf = isle.hillFreq || 0.08;
      let hl = dome * (isle.r * 0.14 + 1.5) * pm;
      hl += (Math.sin(x * hf) * Math.cos(z * hf * 0.87) * 1.5 +
             Math.sin((x + z) * hf * 0.65 + isle.tier) * 0.8) * dome;
      land = Math.max(land, hl);
    }
  }
  let h;
  if (land > 0.02) h = SEA + 1.7 + land;
  else h = SEA + Math.sin(x * 0.04) * 0.25 + Math.cos(z * 0.045) * 0.25;
  const dc = Math.sqrt(x * x + z * z);
  const far = smoothstep(dc, OUTER_R - 16, OUTER_R);
  h = h * (1 - far) - far * 16;
  return h;
}
const walkable = (x, z) => terrainHeight(x, z) > WATER_Y + 0.55;

function randIsleSpot(isle, inset) {
  const margin = inset || 6;
  for (let t = 0; t < 200; t++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * (isle.r - margin);
    const x = isle.x + Math.cos(a) * r;
    const z = isle.z + Math.sin(a) * r;
    if (walkable(x, z)) return { x, z };
  }
  return { x: isle.x, z: isle.z };
}

// ─── Creature state (server-authoritative) ────────────────────────────────────
const creatureState = new Map();   // id -> creature object
let   nextCreatureId = 1;

// Spellcaster profiles — determines spell behaviour in AI loop
const SPELL_PROFILES = {
  'Dragon':         { meleeRange: 4.5, spellRange: [4.5, 99], spellInterval: [3.0, 5.0], color: 0xff2200, dmgMult: 3.0, msg: '🐉 The Dragon breathes fire!' },
  'Cave Worm':      { meleeRange: 3.0, spellRange: [3.0, 99], spellInterval: [2.5, 4.5], color: 0x39d353, dmgMult: 3.0, msg: '🧪 The Cave Worm spits a glob of acid!' },
  'Cave Troll':     { meleeRange: 1.8, spellRange: [3.5, 22], spellInterval: [4.5, 6.5], color: 0x8B6914, dmgMult: 3.0, msg: '🪨 The Cave Troll hurls a boulder!' },
  'Frost Golem':    { meleeRange: 1.8, spellRange: [3.5, 22], spellInterval: [4.0, 6.0], color: 0x7dd3fc, dmgMult: 3.0, msg: '❄️ The Frost Golem launches an ice shard!' },
  'Lava Titan':     { meleeRange: 1.8, spellRange: [3.5, 22], spellInterval: [2.5, 4.0], color: 0xff4400, dmgMult: 3.2, msg: '🌋 The Lava Titan spews a lava ball!' },
  'Shadow Wraith':  { meleeRange: 1.8, spellRange: [3.5, 22], spellInterval: [2.0, 3.5], color: 0x6600cc, dmgMult: 3.2, msg: '🌑 The Shadow Wraith fires a shadow bolt!' },
  'Void Stalker':   { meleeRange: 1.8, spellRange: [3.5, 22], spellInterval: [2.0, 3.5], color: 0x330066, dmgMult: 3.3, msg: '🌀 The Void Stalker launches a void lance!' },
  'Ancient Golem':  { meleeRange: 1.8, spellRange: [3.5, 22], spellInterval: [2.5, 4.0], color: 0x7c6a3b, dmgMult: 3.1, msg: '🗿 The Ancient Golem sends a shockwave!' },
  'Infernal Titan': { meleeRange: 1.8, spellRange: [3.5, 22], spellInterval: [1.8, 3.0], color: 0xff1100, dmgMult: 3.4, msg: '🔥 The Infernal Titan unleashes an inferno burst!' },
  'Void Colossus':  { meleeRange: 1.8, spellRange: [3.5, 22], spellInterval: [1.5, 2.8], color: 0x220044, dmgMult: 3.5, msg: '💀 The Void Colossus fires a void pulse!' },
};
function _randRange(lo, hi) { return lo + Math.random() * (hi - lo); }

function _dist(ax, az, bx, bz) { const d = Math.sqrt((ax-bx)**2+(az-bz)**2); return d; }

function initCreatures(creatureDefs) {
  if (creatureState.size > 0) return; // already inited
  for (const [name, def] of Object.entries(creatureDefs)) {
    const count = def.count || 1;
    const validIsles = ISLES.filter(i => (def.tiers || [0]).includes(i.tier));
    for (let i = 0; i < count; i++) {
      const isle = validIsles[Math.floor(Math.random() * validIsles.length)] || ISLES[0];
      let pos;
      if (def.spawnZone) {
        const sz = def.spawnZone;
        for (let t = 0; t < 200; t++) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * sz.r;
          const x = sz.x + Math.cos(a) * r, z = sz.z + Math.sin(a) * r;
          if (walkable(x, z)) { pos = { x, z }; break; }
        }
        if (!pos) pos = { x: def.spawnZone.x, z: def.spawnZone.z };
      } else {
        const inset = def.spawnInset !== undefined ? def.spawnInset : (def.nearWater ? 2 : 6);
        pos = randIsleSpot(isle, inset);
      }
      const id = nextCreatureId++;
      creatureState.set(id, {
        id, name,
        hp: def.hp, maxhp: def.hp,
        x: pos.x, z: pos.z,
        homeX: pos.x, homeZ: pos.z, homeIsle: isle,
        state: 'wander', targetSocketId: null,
        wTimer: Math.random() * 3 + 1, wTargetX: null, wTargetZ: null,
        attackTimer: Math.random() * 1.6,
        speed: def.speed || 3, aggro: def.aggro || 0, dmg: def.dmg || 5,
        spawnZone: def.spawnZone || null, spawnInset: def.spawnInset,
        nearWater: def.nearWater || false,
        dead: false, respawnAt: null, respawnDelay: 30_000,
      });
    }
  }
  console.log(`[world] ${creatureState.size} creatures initialised`);
}

// ─── Online sessions ──────────────────────────────────────────────────────────
// socketId -> { username, socket, x, z, dead }
const onlinePlayers = new Map();

// ─── Server AI loop ───────────────────────────────────────────────────────────
const AI_HZ    = 10;
const AI_DT    = 1 / AI_HZ;  // seconds per tick
const LEASH    = 15;          // creature resets if target wanders this far from spawn

function _aiTick() {
  if (creatureState.size === 0) return;
  const now = Date.now();
  const posBroadcast = [];

  for (const c of creatureState.values()) {
    // ── Respawn ──────────────────────────────────────────────────────────────
    if (c.dead) {
      if (c.respawnAt && now >= c.respawnAt) {
        c.dead = false;
        c.hp   = c.maxhp;
        c.respawnAt = null;
        c.state = 'wander';
        // respawn near home
        let pos;
        if (c.spawnZone) {
          const sz = c.spawnZone;
          for (let t = 0; t < 100; t++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * sz.r;
            const x = sz.x + Math.cos(a) * r, z = sz.z + Math.sin(a) * r;
            if (walkable(x, z)) { pos = { x, z }; break; }
          }
          if (!pos) pos = { x: sz.x, z: sz.z };
        } else {
          const inset = c.spawnInset !== undefined ? c.spawnInset : (c.nearWater ? 2 : 6);
          pos = randIsleSpot(c.homeIsle, inset);
        }
        c.x = pos.x; c.z = pos.z;
        c.homeX = pos.x; c.homeZ = pos.z;
        io.emit('creature:respawned', { id: c.id, hp: c.hp, maxhp: c.maxhp, x: c.x, z: c.z });
      }
      continue; // still dead
    }

    // ── Wander ───────────────────────────────────────────────────────────────
    if (c.state === 'wander') {
      // check aggro: find nearest player within aggro radius
      if (c.aggro > 0) {
        let nearest = null, nearestDist = c.aggro;
        for (const [sid, p] of onlinePlayers) {
          if (p.dead) continue;
          const d = _dist(c.x, c.z, p.x, p.z);
          if (d < nearestDist) { nearestDist = d; nearest = sid; }
        }
        if (nearest) {
          c.state = 'combat';
          c.targetSocketId = nearest;
          c.attackTimer = 1.6;
        }
      }

      if (c.state === 'wander') {
        c.wTimer -= AI_DT;
        if (c.wTimer <= 0 && c.wTargetX === null) {
          // pick new wander target near home
          for (let t = 0; t < 10; t++) {
            const nx = c.homeX + (Math.random() - 0.5) * 12;
            const nz = c.homeZ + (Math.random() - 0.5) * 12;
            if (walkable(nx, nz)) { c.wTargetX = nx; c.wTargetZ = nz; break; }
          }
          c.wTimer = Math.random() * 3.5 + 2;
        }
        if (c.wTargetX !== null) {
          const dx = c.wTargetX - c.x, dz = c.wTargetZ - c.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 0.3) {
            c.wTargetX = null; c.wTargetZ = null;
          } else {
            const step = Math.min(c.speed * 0.55 * AI_DT, dist);
            const nx = c.x + (dx / dist) * step;
            const nz = c.z + (dz / dist) * step;
            if (walkable(nx, nz)) { c.x = nx; c.z = nz; }
            else { c.wTargetX = null; c.wTargetZ = null; }
          }
        }
      }
    }

    // ── Combat ───────────────────────────────────────────────────────────────
    if (c.state === 'combat') {
      const tgt = onlinePlayers.get(c.targetSocketId);
      // lose target: player disconnected, dead, or leashed too far
      if (!tgt || tgt.dead || _dist(c.x, c.z, c.homeX, c.homeZ) > LEASH) {
        c.state = 'wander';
        c.targetSocketId = null;
        c.wTargetX = null; c.wTargetZ = null;
        c.wTimer = 1;
      } else {
        const dx = tgt.x - c.x, dz = tgt.z - c.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const sp = SPELL_PROFILES[c.name];
        const meleeRange = sp ? sp.meleeRange : 2.2;

        // move toward target (spellcasters stop at spell range)
        const stopRange = sp ? sp.spellRange[0] : meleeRange;
        if (dist > stopRange) {
          const step = Math.min(c.speed * AI_DT, dist - stopRange);
          const nx = c.x + (dx / dist) * step;
          const nz = c.z + (dz / dist) * step;
          if (walkable(nx, nz)) { c.x = nx; c.z = nz; }
        }

        // melee attack
        if (dist <= meleeRange + 1.0) {
          c.attackTimer -= AI_DT;
          if (c.attackTimer <= 0) {
            c.attackTimer = 1.6 + Math.random() * 0.4;
            tgt.socket.emit('creature:hit_player', { creatureId: c.id, damage: c.dmg });
          }
        }

        // spell attack (spellcasters only)
        if (sp && dist >= sp.spellRange[0] && dist <= sp.spellRange[1]) {
          if (c.spellTimer === undefined) c.spellTimer = _randRange(sp.spellInterval[0], sp.spellInterval[1]);
          c.spellTimer -= AI_DT;
          if (c.spellTimer <= 0) {
            c.spellTimer = _randRange(sp.spellInterval[0], sp.spellInterval[1]);
            const dmg = Math.round(c.dmg * sp.dmgMult);
            // broadcast visual to ALL clients
            io.emit('creature:spell', {
              creatureId: c.id,
              targetSocketId: c.targetSocketId,
              targetX: tgt.x, targetZ: tgt.z,
              color: sp.color, msg: sp.msg, dmgMult: sp.dmgMult,
            });
            // deal damage only to the target
            tgt.socket.emit('creature:hit_player', { creatureId: c.id, damage: dmg });
          }
        }
      }
    }

    posBroadcast.push({ id: c.id, x: c.x, z: c.z, state: c.state, hp: c.hp, maxhp: c.maxhp });
  }

  if (posBroadcast.length) io.emit('creature:positions', posBroadcast);
}

// ─── Express + Socket.io ──────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/', (_req, res) => res.send('Eternal Isles server OK'));

// ─── REST: register / login ───────────────────────────────────────────────────
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    if (username.length < 2 || username.length > 16)
      return res.status(400).json({ error: 'Name must be 2–16 characters' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await Player.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (existing) return res.status(409).json({ error: 'Name already taken' });

    const hash   = await bcrypt.hash(password, 10);
    const player = await Player.create({ username, password: hash });
    res.json({ ok: true, username: player.username });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    const player = await Player.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (!player) return res.status(401).json({ error: 'Unknown username' });

    const ok = await bcrypt.compare(password, player.password);
    if (!ok) return res.status(401).json({ error: 'Wrong password' });

    const save = {
      username:    player.username,
      hp:          player.hp,
      maxhp:       player.maxhp,
      atkLvl:      player.atkLvl,  atkXp:  player.atkXp,
      defLvl:      player.defLvl,  defXp:  player.defXp,
      craftLvl:    player.craftLvl, craftXp: player.craftXp,
      dragonKilled: player.dragonKilled,
      inventory:   player.inventory,
      equip:       player.equip,
      talents:     player.talents,
      hotbar:      player.hotbar,
    };
    res.json({ ok: true, save });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Socket.io events ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[socket] connect ${socket.id}`);

  // ── player:join ────────────────────────────────────────────────────────────
  socket.on('player:join', ({ username }) => {
    if (!username) return;

    // Kick any existing session for the same username
    for (const [sid, p] of onlinePlayers) {
      if (p.username.toLowerCase() === username.toLowerCase() && sid !== socket.id) {
        console.log(`[join] kicking old session for ${username}`);
        p.socket.emit('kicked', { reason: 'Logged in from another location.' });
        p.socket.disconnect(true);
        onlinePlayers.delete(sid);
        break;
      }
    }

    onlinePlayers.set(socket.id, { username, socket, x: 0, z: 0, dead: false });
    console.log(`[join] ${username}`);

    socket.broadcast.emit('player:joined', { id: socket.id, username });

    const others = [];
    for (const [sid, p] of onlinePlayers) {
      if (sid !== socket.id) others.push({ id: sid, username: p.username });
    }
    socket.emit('players:online', others);

    // Send current creature snapshot (positions + HP)
    socket.emit('creatures:snapshot', Array.from(creatureState.values()));
  });

  // ── player:move ───────────────────────────────────────────────────────────
  socket.on('player:move', (data) => {
    const p = onlinePlayers.get(socket.id);
    if (!p) return;
    // update server-side player position for creature AI aggro checks
    if (data.x !== undefined) p.x = data.x;
    if (data.z !== undefined) p.z = data.z;
    if (data.dead !== undefined) p.dead = data.dead;
    socket.broadcast.emit('player:moved', {
      id: socket.id, username: p.username,
      x: data.x, z: data.z, moving: !!data.moving,
      hp: data.hp, maxhp: data.maxhp,
    });
  });

  // ── creature:attack ───────────────────────────────────────────────────────
  // Client hit a creature: { creatureId, damage }
  socket.on('creature:attack', ({ creatureId, damage }) => {
    const c = creatureState.get(creatureId);
    if (!c || c.dead) return;
    c.hp = Math.max(0, c.hp - Math.abs(damage));
    // switch target to attacker if currently wandering or targeting someone else
    if (c.state !== 'dead') {
      c.state = 'combat';
      c.targetSocketId = socket.id;
    }
    io.emit('creature:damaged', { id: creatureId, hp: c.hp, maxhp: c.maxhp });
    if (c.hp <= 0) {
      c.dead = true;
      c.respawnAt = Date.now() + c.respawnDelay;
      io.emit('creature:died', { id: creatureId });
      console.log(`[world] ${c.name}#${creatureId} killed by ${onlinePlayers.get(socket.id)?.username}`);
    }
  });

  // ── creature:init ─────────────────────────────────────────────────────────
  // ── player:spell — relay visual to all other clients ─────────────────────
  socket.on('player:spell', (data) => {
    socket.broadcast.emit('player:spell', data);
  });

  socket.on('creature:init', (defs) => {
    if (defs && typeof defs === 'object') {
      initCreatures(defs);
      io.emit('creatures:snapshot', Array.from(creatureState.values()));
    }
  });

  // ── player:save ───────────────────────────────────────────────────────────
  socket.on('player:save', async (data) => {
    const p = onlinePlayers.get(socket.id);
    if (!p) return;
    try {
      await Player.updateOne(
        { username: p.username },
        {
          $set: {
            hp: data.hp, maxhp: data.maxhp,
            atkLvl: data.atkLvl, atkXp: data.atkXp,
            defLvl: data.defLvl, defXp: data.defXp,
            craftLvl: data.craftLvl, craftXp: data.craftXp,
            dragonKilled: data.dragonKilled,
            inventory: data.inventory,
            equip: data.equip,
            talents: data.talents,
            hotbar: data.hotbar,
          },
        }
      );
    } catch (err) {
      console.error('[save]', err);
    }
  });

  // ── disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const p = onlinePlayers.get(socket.id);
    if (p) {
      console.log(`[leave] ${p.username}`);
      io.emit('player:left', { id: socket.id, username: p.username });
      onlinePlayers.delete(socket.id);
      // creatures targeting this player go back to wandering
      for (const c of creatureState.values()) {
        if (c.targetSocketId === socket.id) {
          c.state = 'wander';
          c.targetSocketId = null;
        }
      }
    }
  });
});

// ─── Start AI loop ────────────────────────────────────────────────────────────
setInterval(_aiTick, 1000 / AI_HZ);

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI not set — copy server/.env.example to server/.env and fill it in');
    process.exit(1);
  }
  await mongoose.connect(MONGODB_URI);
  console.log('[db] MongoDB connected');
  server.listen(PORT, () => console.log(`[server] listening on :${PORT}`));
}

start().catch(err => { console.error(err); process.exit(1); });
