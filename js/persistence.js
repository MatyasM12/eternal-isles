'use strict';

// ------------------------------------------------------------------ save / load
const SAVE_KEY = 'eternalIsles_save';
function saveGame() {
netSavePlayer();
// In multiplayer mode, the server DB is the sole source of truth — skip localStorage
if (typeof isMultiplayer === 'function' && isMultiplayer()) return;
try {
localStorage.setItem(SAVE_KEY, JSON.stringify({
name: player.name,
hp: player.hp, maxhp: player.maxhp,
atkLvl: player.atkLvl, atkXp: player.atkXp,
defLvl: player.defLvl, defXp: player.defXp,
craftLvl: player.craftLvl, craftXp: player.craftXp,
inventory: inventory.map(e => e ? { item: e.item, count: e.count } : null),
equip: Object.assign({}, player.equip),
dragonKilled: player.dragonKilled,
talents: Object.assign({}, player.talents),
hotbar: player.hotbar.slice(),
bank: bank.map(e => e ? { item: e.item, count: e.count } : null),
}));
} catch(e) {}
}
function loadGame() {
try {
const raw = localStorage.getItem(SAVE_KEY);
if (!raw) return false;
const s = JSON.parse(raw);
if (s.name)      { player.name = s.name; }
if (s.hp)        { player.hp = s.hp; player.maxhp = s.maxhp; }
if (s.atkLvl)    { player.atkLvl = s.atkLvl; player.atkXp = s.atkXp; }
if (s.defLvl)    { player.defLvl = s.defLvl; player.defXp = s.defXp; }
if (s.craftLvl)  { player.craftLvl = s.craftLvl; player.craftXp = s.craftXp; }
if (s.equip)     { Object.assign(player.equip, s.equip); }
if (s.dragonKilled) { player.dragonKilled = s.dragonKilled; }
if (s.talents)   { Object.assign(player.talents, s.talents); }
if (s.hotbar)    { for (let i = 0; i < 5 && i < s.hotbar.length; i++) player.hotbar[i] = s.hotbar[i]; }
if (s.inventory) {
for (let i = 0; i < Math.min(s.inventory.length, inventory.length); i++) {
inventory[i] = s.inventory[i] ? { item: s.inventory[i].item, count: s.inventory[i].count } : null;
}
}
if (s.bank) {
for (let i = 0; i < Math.min(s.bank.length, bank.length); i++) {
bank[i] = s.bank[i] ? { item: s.bank[i].item, count: s.bank[i].count } : null;
}
}
return true;
} catch(e) { return false; }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch(e) {} }
