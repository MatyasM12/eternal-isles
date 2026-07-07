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
  password:  { type: String, required: true },       // bcrypt hash
  // stats
  hp:        { type: Number, default: 100 },
  maxhp:     { type: Number, default: 100 },
  atkLvl:    { type: Number, default: 1 },
  atkXp:     { type: Number, default: 0 },
  defLvl:    { type: Number, default: 1 },
  defXp:     { type: Number, default: 0 },
  craftLvl:  { type: Number, default: 1 },
  craftXp:   { type: Number, default: 0 },
  dragonKilled: { type: Boolean, default: false },
  // flexible blobs — stored as mixed so game can evolve freely
  inventory: { type: mongoose.Schema.Types.Mixed, default: [] },
  equip:     { type: mongoose.Schema.Types.Mixed, default: {} },
  talents:   { type: mongoose.Schema.Types.Mixed, default: {} },
  hotbar:    { type: mongoose.Schema.Types.Mixed, default: [null,null,null,null,null] },
}, { timestamps: true });

const Player = mongoose.model('Player', playerSchema);

// ─── Creature state (server-authoritative) ────────────────────────────────────
// Each creature: { id, name, hp, maxhp, x, z, dead, respawnAt }
// Server owns this; clients receive snapshots.
const creatureState = new Map();   // id -> creature object
let   nextCreatureId = 1;

function initCreatures(creatureDefs) {
  // Called once we receive CREATURE_DEFS from the first connected client.
  // In a full implementation the server would define these itself; for now
  // we accept the definitions from a trusted client message.
  for (const [name, def] of Object.entries(creatureDefs)) {
    const count = def.count || 1;
    for (let i = 0; i < count; i++) {
      const id = nextCreatureId++;
      creatureState.set(id, {
        id, name,
        hp: def.hp, maxhp: def.hp,
        x: 0, z: 0,   // real positions set by spawner; kept server-side for authority
        dead: false,
        respawnAt: null,
      });
    }
  }
  console.log(`[world] ${creatureState.size} creatures initialised`);
}

// ─── Online sessions ──────────────────────────────────────────────────────────
// socketId -> { username, socket }
const onlinePlayers = new Map();

// ─── Express + Socket.io ──────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

// Health check (Railway / Render ping)
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

    // Return save data (everything except the password hash)
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
  // Client sends after successful login: { username }
  socket.on('player:join', ({ username }) => {
    if (!username) return;
    onlinePlayers.set(socket.id, { username, socket });
    console.log(`[join] ${username}`);

    // Tell everyone else a new player arrived
    socket.broadcast.emit('player:joined', { id: socket.id, username });

    // Send this player the list of everyone currently online
    const others = [];
    for (const [sid, p] of onlinePlayers) {
      if (sid !== socket.id) others.push({ id: sid, username: p.username });
    }
    socket.emit('players:online', others);

    // Send current creature snapshot
    socket.emit('creatures:snapshot', Array.from(creatureState.values()));
  });

  // ── player:move ───────────────────────────────────────────────────────────
  // { x, z }  — broadcast position to other clients for rendering ghost avatars
  socket.on('player:move', (data) => {
    const p = onlinePlayers.get(socket.id);
    if (!p) return;
    socket.broadcast.emit('player:moved', { id: socket.id, username: p.username, x: data.x, z: data.z });
  });

  // ── creature:attack ───────────────────────────────────────────────────────
  // Client says it hit a creature: { creatureId, damage }
  // Server applies damage, broadcasts updated HP to all clients.
  socket.on('creature:attack', ({ creatureId, damage }) => {
    const c = creatureState.get(creatureId);
    if (!c || c.dead) return;
    c.hp = Math.max(0, c.hp - Math.abs(damage));
    io.emit('creature:damaged', { id: creatureId, hp: c.hp, maxhp: c.maxhp });
    if (c.hp <= 0) {
      c.dead = true;
      c.respawnAt = Date.now() + 30_000;   // 30-second respawn
      io.emit('creature:died', { id: creatureId });
      console.log(`[world] ${c.name}#${creatureId} killed`);
    }
  });

  // ── creature:init ─────────────────────────────────────────────────────────
  // First client sends the creature definitions so server can build state.
  // Only accepted once (when map is empty).
  socket.on('creature:init', (defs) => {
    if (creatureState.size === 0 && defs && typeof defs === 'object') {
      initCreatures(defs);
      // Push snapshot to all clients
      io.emit('creatures:snapshot', Array.from(creatureState.values()));
    }
  });

  // ── player:save ───────────────────────────────────────────────────────────
  // Client periodically sends its save blob; server persists to MongoDB.
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
    }
  });
});

// ─── Creature respawn loop ────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const c of creatureState.values()) {
    if (c.dead && c.respawnAt && now >= c.respawnAt) {
      c.dead = false;
      c.hp   = c.maxhp;
      c.respawnAt = null;
      io.emit('creature:respawned', { id: c.id, hp: c.hp, maxhp: c.maxhp });
    }
  }
}, 5_000);

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
