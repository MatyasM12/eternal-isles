# Eternal Isles — Codebase Map

Quick-reference for finding and editing any system. Line numbers are approximate (game.js shrinks/grows with edits — use the section header comments to re-anchor).

---

## Script load order (`index.html` lines 338–345)

```
three.min.js
GLTFLoader.js
socket.io (CDN)
js/data/items.js      ← ITEMS, RECIPES, EQUIP_SLOTS  (no deps)
js/persistence.js     ← saveGame / loadGame / _applySave
js/creatures.js       ← creature definitions, spawn logic
js/network.js         ← socket setup, netSave*, server event handlers
js/data/talents.js    ← TALENT_PATHS, TALENT_PREREQS, talent helpers  (needs player from game.js — loaded after network.js inits player)
js/game.js            ← everything else
```

---

## `js/data/items.js` (320 lines — no dependencies)

| Lines | Content |
|-------|---------|
| 4–188 | `ITEMS` — all item definitions: `{ icon, type, desc, atk, def, ... }` |
| 189–319 | `RECIPES` — all crafting recipes: `{ out, req, tag, rate, tier, minCraftLvl? }` |
| 320 | `EQUIP_SLOTS` — `['weapon','shield','helm','armor','cuisses','greaves','medallion','ring','ring2','belt']` |

**Edit here for:** adding/changing items, adding/changing recipes, adding equipment slot types, changing `minCraftLvl` gates.

---

## `js/data/talents.js` (505 lines — depends on `player` object from game.js)

| Lines | Content |
|-------|---------|
| 6–413 | `TALENT_PATHS` — 4 paths (fire/lightning/ice/spirit), each with up to 12 talents, ranks 1–8 with `rankDescs`, `spCost`, `cdSec` |
| 414–460 | `TALENT_PREREQS` — `{ talentId: prereqId }` — prerequisite graph |
| 461–480 | `TALENT_PREREQ_RANK` — `{ talentId: minRank }` — rank required in prereq |
| 481–505 | Helper functions: `getTalentDef(id)`, `talentRank(id)`, `hasTalent(id)`, `talentPointsEarned()`, `talentRankUpgradeCost(currentRank)`, `talentTotalCost(rank)`, `talentPointsSpent()`, `talentPointsAvailable()`, `talentPrereqMet(id)` |

**Edit here for:** adding/changing talents, changing prereq chains, changing point costs, adding new talent paths.

---

## `js/persistence.js`

Handles localStorage save/load and applying server save data.

**Edit here for:** adding new persistent player fields to save/load cycle.

---

## `js/creatures.js`

Creature definitions and spawn/respawn logic.

**Edit here for:** creature stats, AI behavior, spell casting frequency (spellCooldown, spellChance), adding new creature types, Eldenmere monster placement.

---

## `js/network.js`

Socket.io client setup and all server↔client message handlers.

**Edit here for:** sending/receiving custom events, `netSave*()` functions, `_applySave()` which populates player state from server login response.

---

## `js/game.js` (~4982 lines after refactor)

Everything that doesn't fit the focused modules above. Sections by line range:

### World constants & helpers (lines 1–23)
`WORLD_SEED = 0x4e7e15ad`, `_rng` (mulberry32 PRNG), `rand()`, `randInt()`, `pick()`, `clamp()`, `lerp()`, `smoothstep()`

### Terrain (lines 24–49)
`ISLES` array (9 islands with x/z/r/name), `WATER_Y`, `SEA`, `OUTER_R`, `islandHeightAt()`, `terrainHeight()`, `nearestIsle()`, `walkable()`, `inWater()`, `tooDeep()`, `canStep()`

### PvP arenas (lines 50–146)
`ARENAS` array, `inArena()`, `buildArenas()` — floating platform combat zones

### Renderer / scene (lines 147–325)
Three.js renderer, scene, camera, fog, lighting. Ground `PlaneGeometry` 960×960 with vertex-color terrain. Water mesh. `placed[]`, `findSpot()`, `findSpotIsle()`, `scatterOnIsles()`. `clickables[]`, `creatures[]`, `registerOtherPlayerClickable()`, `unregisterOtherPlayerClickable()`. `solidBoxes[]`, `isSolidBlocked()`

### World objects (lines 326–1045)
`buildTree()`, `buildMineral()`, `buildFlower()`, fishing spots, signposts, `buildBankChests` IIFE (chest 3D objects + placement on 5 islands), `buildEldenmere` IIFE (city walls, floors, doors, NPCs, guards — all Eldenmere geometry and solid collision boxes), fireflies & flower sparkles

**Edit here for:** adding new world objects, changing Eldenmere layout, adding/moving bank chests, changing island decoration density.

### Inventory & bank state (lines 1047–1078)
`INV_SLOTS = 28`, `inventory[]`, `BANK_SLOTS = 30`, `bank[]`, `invCount()`, `addItem()`, `removeItem()`

**Edit here for:** inventory/bank size, stack logic.

### HUD & tooltip system (lines 1079–1286)
`ui` object (all DOM element refs), `tooltipEl`, `tooltipHtml()`, `showTooltipAt()`, `hideTooltip()`, `attachTooltip()`, equip slot tooltip wiring

### Logging & chat (lines ~1170–1286)
`LOG_COLORS`, `log()`, `switchLogTab()` (window-exposed), `appendChatMessage()` (window-exposed), chat IIFE wire-up

### Inventory UI & drag-and-drop (lines 1287–1424)
`_dragSrc`, `renderInventory()`, `_makeSlotEl()`, `_handleSlotDrop()`, `renderChestModal()`, `openChestModal()`, `closeChestModal()`, `onInventoryClick()`, `eatFood()`

**Edit here for:** inventory rendering, drag-and-drop between inventory/bank, chest modal UI.

### Text sprites & floaters (lines 1425–1472)
`makeTextSprite()`, `floaters[]`, `floatText()`, `updateFloaters()`

### Visual effects (lines 1473–1575)
`effects[]`, click destination ring, `spawnBurst()`, `spawnSwirl()`, `spawnSparks()`, `spawnHealSparks()`, `spawnShieldSparks()`, `updateEffects()`

### Health bars & name labels (lines 1576–1699)
Health bar sprites above creatures and other players. Name label sprites.

### Player object (lines 1700–1768)
`player` initialization — all fields: position, stats (hp/mp/atkLvl/defLvl/craftLvl…), inventory refs, equipment slots (weapon/shield/helm/armor/cuisses/greaves/medallion/ring/ring2/belt), talent state, hotbar, action state.

**Edit here for:** adding new player fields, changing starting stats/levels.

### Skill activation (lines 1769–2035)
`activateSkill(slotIndex)` — reads hotbar, checks cooldowns, costs SP, dispatches active talent effects (fireballs, lightning, ice spells, spirit heals/shields)

### Passive effect helpers (lines 2036–2114)
`playerDodgeChance()`, `playerReflectChance()`, `getStatusResistChance()`, `getEffectiveCritChance()`, passive talent modifiers

### Talent DoT/HoT/cooldown update (lines 2115–2577)
`updateTalentEffects(dt)` — per-frame tick for burn/shock/freeze DoTs, spirit HoT regen, cooldown countdowns, buff/debuff expiry

### Hotbar UI (lines 2578–2603)
`renderHotbar()` — renders 4-slot hotbar with skill icons, cooldown overlays, keybind labels

### Talent tree UI (lines 2604–3324)
`renderTalentTree()`, `openTalentModal()`, `closeTalentModal()`, talent unlock/upgrade click handlers, SP display

**Edit here for:** talent UI layout, upgrade button behavior.

### Progression & XP (lines 3325–3392)
`refreshEquipVisuals()`, `playerAtk()`, `playerDef()`, `refreshStatsUI()`, `gainXp()`, `gainCraftXp()`, level-up logic for atk/def/craft levels

**Edit here for:** XP curves, level-up effects, stat calculation from equipment.

### Combat helpers (lines 3393–3537)
`equipItem()`, `unequip()`, `playerHit()`, `creatureHit()`, PvP damage, player death & respawn, loot drop on creature death

**Edit here for:** damage formulas, death/respawn behavior, loot tables.

### Harvesting (lines 3538–3583)
Harvest tick — progress ring, `finishHarvest()`, resource grant from trees/minerals/flowers/fish

**Edit here for:** harvest speeds, resource yields.

### Input (lines 3584–3755)
Keyboard handlers (WASD/arrow movement, M map, I inventory, C craft, T talent), pointer events (click-to-move, raycasting against clickables/creatures), context menu suppress

**Edit here for:** keybindings, click interaction dispatch.

### Map overlay (lines 3756–3983)
`renderMap()`, `openMap()`, `closeMap()` — canvas-drawn minimap with isle outlines, player dot, other players

### Player update loop (lines 3984–4138)
`updatePlayer(dt)` — movement toward destination, collision with `solidBoxes`, footstep sounds, area transition detection, SP regen, buff aura visual update, fireball projectile update, status sprite update

**Edit here for:** movement speed, collision response, SP regen rate.

### Crafting window (lines 4139–4510)
`renderMix()`, `renderRecipes()`, `doMix()`, `openCraftModal()`, `closeCraftModal()` — 3-slot mix UI, recipe list with tier tabs, success/fail roll using `rate` and `minCraftLvl`

**Edit here for:** crafting UI, success rate formula, crafting level gate enforcement.

### Intro / beginGame (lines 4511–4567)
`beginGame()` — called after login; wires all button callbacks, spawns world objects, starts animation loop

### Main loop (lines 4568–4982)
`animate()` — `requestAnimationFrame` loop: calls `updatePlayer`, `updateTalentEffects`, `updateFloaters`, `updateEffects`, `updateHealthBars`, `updateLabels`, renders scene

---

## `server/index.js`

Node.js + Express + Socket.io server.

| Section | Content |
|---------|---------|
| Player schema | MongoDB/Mongoose schema — includes `bank`, `hotbar`, `talents`, `inventory`, all equip slots including `ring2` and `belt` |
| REST `/login` | Authenticates player, returns save data including `bank` |
| `player:save` | Validates and persists full player state |
| `player:bank_save` | Validates and persists bank array only |
| `player:move` | Authoritative movement broadcast |
| Creature spawning | Server-side creature list broadcast to clients |

---

## Key global constants (defined in data files, used everywhere)

| Constant | File | Description |
|----------|------|-------------|
| `ITEMS` | `js/data/items.js:4` | All item definitions |
| `RECIPES` | `js/data/items.js:189` | All crafting recipes |
| `EQUIP_SLOTS` | `js/data/items.js:320` | Equipment slot names (10 slots) |
| `TALENT_PATHS` | `js/data/talents.js:6` | 4 talent trees × up to 12 talents |
| `TALENT_PREREQS` | `js/data/talents.js:414` | Prerequisite graph |
| `TALENT_PREREQ_RANK` | `js/data/talents.js:461` | Min rank required in prereq |
| `WORLD_SEED` | `js/game.js:1` | `0x4e7e15ad` — seeded PRNG seed |
| `ISLES` | `js/game.js:24` | 9 island definitions (x, z, r, name) |
| `INV_SLOTS` | `js/game.js:1047` | `28` |
| `BANK_SLOTS` | `js/game.js:1051` | `30` |
