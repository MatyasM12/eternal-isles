// Talent tree data, prerequisite chains, and helper functions.
// Depends on: player (game.js loaded first... actually player is declared in game.js
// but these helpers reference player.talents — keep this in mind for load order.
// Loaded before game.js skill code but after player is declared via hoisting.

// Points required in a path to unlock each tier's talents.
const TALENT_TIER_GATES = { T1: 0, T2: 8, T3: 20, T4: 35 };

// Tier of each talent — drives UI row grouping and gate enforcement.
const TALENT_TIERS = {
	// Fire
	fire_active: 1, fire_passive: 1,
	fire_backdraft: 2, fire_wildfire: 2, fire_pyroclasm: 2, fire_crit: 2,
	fire_fireball: 2, fire_cremation: 2,
	fire_inferno: 3, fire_flame_wall: 3, fire_magma_shell: 3, fire_phoenix_mark: 3,
	fire_phoenix_ascendant: 4,

	// Lightning
	lightning_active: 1, lightning_passive: 1,
	lightning_conductor: 2, lightning_aftershock: 2, lightning_crit: 2,
	lightning_static_aura: 2, lightning_overload: 2,
	lightning_strike: 3, lightning_storm: 3, lightning_chain: 3,
	lightning_discharge: 3, lightning_ball: 3,
	lightning_storm_sovereign: 4,

	// Ice
	ice_active: 1, ice_passive: 1,
	ice_shield: 2, ice_brittle: 2, ice_cold_snap: 2, ice_crit: 2,
	ice_shatter: 2, ice_permafrost: 2,
	ice_lance: 3, ice_blizzard: 3, ice_frost_nova: 3, ice_glacial_armor: 3,
	ice_glacial_dominion: 4,

	// Spirit
	spirit_active: 1, spirit_passive: 1,
	spirit_hot: 2, spirit_siphon: 2, spirit_fortitude: 2, spirit_crit: 2,
	spirit_resurrection_mark: 2,
	spirit_healing_surge: 3, spirit_soul_leech: 3, spirit_spirit_walk: 3, spirit_aegis: 3,
	spirit_undying_will: 4,

	// Earth
	earth_stone_fist: 1, earth_thorns: 1,
	earth_entangle: 2, earth_stone_skin: 2, earth_seismic_slam: 2, earth_poison_spores: 2,
	earth_overgrowth: 3, earth_tremor: 3, earth_petrify: 3, earth_natures_wrath: 3,
	earth_earthen_wall: 3, earth_crystal_spikes: 3,
	earth_living_mountain: 4,
};

// Pairs in this object are mutually exclusive — picking one permanently locks the other.
const TALENT_EXCLUSIVE_GROUPS = {
	fire:      ['fire_inferno',     'fire_magma_shell'],
	lightning: ['lightning_storm',  'lightning_discharge'],
	ice:       ['ice_blizzard',     'ice_glacial_armor'],
	spirit:    ['spirit_spirit_walk','spirit_aegis'],
	earth:     ['earth_earthen_wall','earth_crystal_spikes'],
};

const TALENT_PATHS = [
	{
		id: 'fire', name: 'Fire', icon: '🔥', color: '#ff6b35', borderColor: 'border-orange-400/40', bgColor: 'bg-orange-400/10',
		talents: [
			// ──── Tier 1 ─────────────────────────────────────────────────────────
			{ id: 'fire_active', name: 'Flame Strike', type: 'active', icon: '🔥', maxRank: 8,
				cooldowns: [0, 14, 13, 12, 11, 10, 9, 8, 7],
				rankDescs: ['',
					'Next attack +12 fire damage.',
					'Next attack +24 fire damage.',
					'Next attack +42 fire damage.',
					'Next attack +63 fire damage — weapon glows white-hot.',
					'Next attack +90 fire damage — a column of fire erupts.',
					'Next attack +123 fire damage — the ground scorches.',
					'Next attack +162 fire damage — incandescent inferno.',
					'Next attack +210 fire damage — LEGENDARY: the sky itself ignites!'] },
			{ id: 'fire_passive', name: 'Ember Touch', type: 'passive', icon: '✨', maxRank: 8,
				rankDescs: ['',
					'20% chance to Burn (4 dmg/s for 4s).',
					'30% chance to Burn (7 dmg/s for 5s).',
					'40% chance to Burn (11 dmg/s for 5s).',
					'50% chance to Burn (16 dmg/s for 6s).',
					'60% chance to Burn (22 dmg/s for 6s).',
					'70% chance to Burn (30 dmg/s for 7s).',
					'80% chance to Burn (40 dmg/s for 7s).',
					'90% chance to Burn (55 dmg/s for 8s) — LEGENDARY: everything you touch ignites!'] },

			// ──── Tier 2 ─────────────────────────────────────────────────────────
			{ id: 'fire_backdraft', name: 'Backdraft', type: 'passive', icon: '🌪️', maxRank: 5,
				rankDescs: ['',
					'Each burn tick has 10% chance to add 1 extra tick.',
					'Each burn tick has 15% chance to add 1 extra tick.',
					'Each burn tick has 20% chance to add 1 extra tick.',
					'Each burn tick has 25% chance to add 1 extra tick.',
					'Each burn tick has 30% chance to add 1 extra tick — flames feed themselves!'] },
			{ id: 'fire_wildfire', name: 'Wildfire', type: 'passive', icon: '🔥', maxRank: 5,
				rankDescs: ['',
					'Burn spreads to 1 nearby enemy within 5 units on proc (20% chance).',
					'Spread chance 30%.',
					'Spread chance 45%.',
					'Spread chance 60%.',
					'Spread chance 80% — wildfire cannot be contained!'] },
			{ id: 'fire_cremation', name: 'Cremation', type: 'passive', icon: '💀', maxRank: 5,
				rankDescs: ['',
					'Enemies that die while burning explode for 15 fire damage in 4-unit radius.',
					'Explosion deals 25 fire damage.',
					'Explosion deals 35 fire damage.',
					'Explosion deals 50 fire damage.',
					'Explosion deals 70 fire damage — ashes to ashes!'] },
			{ id: 'fire_pyroclasm', name: 'Pyroclasm', type: 'passive', icon: '💥', maxRank: 5,
				rankDescs: ['',
					'Critical burn ticks: 10% chance a burn tick deals double damage.',
					'Crit chance 15%.',
					'Crit chance 20%.',
					'Crit chance 28%.',
					'Crit chance 35% — the inferno rages uncontrolled!'] },
			{ id: 'fire_crit', name: 'Scorching Precision', type: 'passive', icon: '🎯', maxRank: 5,
				rankDescs: ['',
					'+4% critical strike chance for fire attacks and spells.',
					'+7% critical strike chance for fire attacks and spells.',
					'+11% critical strike chance for fire attacks and spells.',
					'+15% critical strike chance for fire attacks and spells.',
					'+20% critical strike chance for fire attacks and spells — LEGENDARY: every blow is lethal!'] },
			{ id: 'fire_fireball', name: 'Fireball', type: 'active', icon: '🔮', maxRank: 5,
				cooldowns: [0, 20, 18, 16, 14, 12],
				rankDescs: ['',
					'Hurl a fireball at a creature for 40 fire damage. Click a creature to aim.',
					'Fireball deals 70 fire damage.',
					'Fireball deals 110 fire damage.',
					'Fireball deals 160 fire damage — scorching projectile.',
					'Fireball deals 220 fire damage — LEGENDARY: a star falls to earth!'] },

			// ──── Tier 3 ─────────────────────────────────────────────────────────
			{ id: 'fire_inferno', name: 'Inferno', type: 'active', icon: '🌋', maxRank: 5,
				cooldowns: [0, 45, 40, 35, 30, 25],
				exclusive: true,
				rankDescs: ['',
					'Channel for 2.5s then erupt — deals 20 fire damage to ALL enemies within 7 units.',
					'Inferno deals 35 fire damage in the blast.',
					'Inferno deals 55 fire damage — the ground cracks.',
					'Inferno deals 80 fire damage — molten earth erupts.',
					'Inferno deals 110 fire damage — LEGENDARY: a volcano tears the world open!'] },
			{ id: 'fire_flame_wall', name: 'Flame Wall', type: 'active', icon: '🔥', maxRank: 5,
				cooldowns: [0, 40, 36, 32, 28, 24],
				rankDescs: ['',
					'Erect a wall of fire at your feet — 8 dmg/s to crossing enemies for 6s.',
					'Flame Wall deals 14 dmg/s for 7s.',
					'Flame Wall deals 20 dmg/s for 8s.',
					'Flame Wall deals 28 dmg/s for 10s.',
					'Flame Wall deals 38 dmg/s for 12s — LEGENDARY: no one passes!'] },
			{ id: 'fire_magma_shell', name: 'Magma Shell', type: 'active', icon: '🛡️', maxRank: 5,
				cooldowns: [0, 38, 34, 30, 26, 22],
				exclusive: true,
				rankDescs: ['',
					'Coat yourself in magma — absorb up to 30 damage. Attackers take 8 fire damage per hit.',
					'Shell absorbs 55 damage. Attackers take 14 fire damage.',
					'Shell absorbs 85 damage. Attackers take 22 fire damage.',
					'Shell absorbs 120 damage. Attackers take 32 fire damage.',
					'Shell absorbs 160 damage. Attackers take 45 fire damage — LEGENDARY: touch me and burn!'] },
			{ id: 'fire_phoenix_mark', name: 'Phoenix Mark', type: 'passive', icon: '🦅', maxRank: 5,
				rankDescs: ['',
					'Once per combat: auto-cast Mend (25 HP) when your HP drops below 20%.',
					'Heal 45 HP at 20% HP threshold.',
					'Heal 70 HP at 25% HP threshold.',
					'Heal 100 HP at 25% HP threshold.',
					'Heal 140 HP at 30% HP threshold — the phoenix rises!'] },

			// ──── Tier 4 — Capstone ───────────────────────────────────────────────
			{ id: 'fire_phoenix_ascendant', name: 'Phoenix Ascendant', type: 'active', icon: '🔱', maxRank: 3,
				cooldowns: [0, 120, 100, 80],
				capstone: true,
				rankDescs: ['',
					'Transform into the Phoenix for 8s — gain immunity to all damage, deal 35 fire dmg/s to all enemies within 8 units, leave a trail of scorching ground. On expiry, explode for 200 fire damage in 10-unit radius.',
					'Duration 10s, trail dmg/s 55, explosion 320 fire damage.',
					'Duration 14s, trail dmg/s 80, explosion 500 fire damage — the eternal flame cannot die!'] },
		]
	},

	{
		id: 'lightning', name: 'Lightning', icon: '⚡', color: '#facc15', borderColor: 'border-yellow-400/40', bgColor: 'bg-yellow-400/10',
		talents: [
			// ──── Tier 1 ─────────────────────────────────────────────────────────
			{ id: 'lightning_active', name: 'Static Charge', type: 'active', icon: '⚡', maxRank: 8,
				cooldowns: [0, 14, 13, 12, 11, 10, 9, 8, 7],
				rankDescs: ['',
					'Next attack +10 lightning damage.',
					'Next attack +20 lightning damage.',
					'Next attack +34 lightning damage.',
					'Next attack +52 lightning damage — thunder booms.',
					'Next attack +74 lightning damage — lightning arc leaps.',
					'Next attack +100 lightning damage — storm answers your call.',
					'Next attack +132 lightning damage — sky-shattering bolt.',
					'Next attack +170 lightning damage — LEGENDARY: a storm god strikes through you!'] },
			{ id: 'lightning_passive', name: 'Shock', type: 'passive', icon: '💫', maxRank: 8,
				rankDescs: ['',
					'1% chance on hit: +6 bonus dmg, stun 1 cycle.',
					'2% chance on hit: +10 bonus dmg, stun 1 cycle.',
					'3% chance on hit: +16 bonus dmg, stun 1 cycle.',
					'4% chance on hit: +24 bonus dmg, stun 2 cycles.',
					'5% chance on hit: +34 bonus dmg, stun 2 cycles.',
					'6% chance on hit: +46 bonus dmg, stun 2 cycles.',
					'7% chance on hit: +62 bonus dmg, stun 3 cycles.',
					'9% chance on hit: +80 bonus dmg, stun 3 cycles — LEGENDARY: a divine bolt of judgment!'] },

			// ──── Tier 2 ─────────────────────────────────────────────────────────
			{ id: 'lightning_conductor', name: 'Conductor', type: 'passive', icon: '⚡', maxRank: 5,
				rankDescs: ['',
					'Shocked enemies take 10% increased damage from all sources.',
					'Shocked enemies take 17% increased damage.',
					'Shocked enemies take 24% increased damage.',
					'Shocked enemies take 30% increased damage.',
					'Shocked enemies take 35% increased damage — the charge amplifies everything!'] },
			{ id: 'lightning_aftershock', name: 'Aftershock', type: 'passive', icon: '💥', maxRank: 5,
				rankDescs: ['',
					'When a stun expires, deal 10 lightning damage to the creature.',
					'Aftershock deals 20 lightning damage.',
					'Aftershock deals 35 lightning damage.',
					'Aftershock deals 50 lightning damage.',
					'Aftershock deals 70 lightning damage — thunder clap finale!'] },
			{ id: 'lightning_static_aura', name: 'Static Aura', type: 'active', icon: '🌩️', maxRank: 5,
				cooldowns: [0, 30, 27, 24, 21, 18],
				rankDescs: ['',
					'Activate a 10s aura dealing 5 lightning dmg/s to enemies within 6 units.',
					'Aura deals 9 dmg/s.',
					'Aura deals 13 dmg/s.',
					'Aura deals 17 dmg/s.',
					'Aura deals 22 dmg/s — crackling storm encircles you!'] },
			{ id: 'lightning_overload', name: 'Overload', type: 'passive', icon: '🌩️', maxRank: 5,
				rankDescs: ['',
					'Shocked enemies that die burst-stun nearby enemies within 4 units for 1 cycle.',
					'Burst-stun radius 5 units.',
					'Burst-stun radius 6 units, stuns 2 cycles.',
					'Stun 2 cycles, radius 7 units.',
					'Stun 3 cycles, radius 8 units — chain overloads cascade!'] },
			{ id: 'lightning_crit', name: 'Galvanized Strike', type: 'passive', icon: '🎯', maxRank: 5,
				rankDescs: ['',
					'+4% critical strike chance for lightning attacks and spells.',
					'+7% critical strike chance for lightning attacks and spells.',
					'+11% critical strike chance for lightning attacks and spells.',
					'+15% critical strike chance for lightning attacks and spells.',
					'+20% critical strike chance for lightning attacks and spells — LEGENDARY: thunder without mercy!'] },

			// ──── Tier 3 ─────────────────────────────────────────────────────────
			{ id: 'lightning_strike', name: 'Lightning Strike', type: 'active', icon: '🗲', maxRank: 5,
				cooldowns: [0, 22, 20, 18, 16, 14],
				rankDescs: ['',
					'Hurl a bolt at a creature — strikes 5 times over 8s for 10 lightning damage each. Click a creature to aim.',
					'Each strike deals 17 lightning damage.',
					'Each strike deals 27 lightning damage.',
					'Each strike deals 40 lightning damage.',
					'Each strike deals 55 lightning damage — LEGENDARY: divine judgment strikes without mercy!'] },
			{ id: 'lightning_storm', name: 'Lightning Storm', type: 'active', icon: '🌪️', maxRank: 5,
				cooldowns: [0, 50, 44, 38, 32, 26],
				exclusive: true,
				rankDescs: ['',
					'Channel 2.5s — a storm strikes ALL enemies within 7 units 4 times over 6s for 7 lightning damage each.',
					'Each strike deals 12 lightning damage.',
					'Each strike deals 18 lightning damage.',
					'Each strike deals 27 lightning damage.',
					'Each strike deals 37 lightning damage — LEGENDARY: the sky is your weapon!'] },
			{ id: 'lightning_chain', name: 'Chain Lightning', type: 'active', icon: '⚡', maxRank: 5,
				cooldowns: [0, 18, 16, 14, 12, 10],
				rankDescs: ['',
					'Strike a target for 18 lightning damage — arcs to 2 nearby enemies for 9 each.',
					'Primary 30 dmg, arcs deal 15 each.',
					'Primary 45 dmg, arcs deal 23 each — arcs to 3 targets.',
					'Primary 65 dmg, arcs deal 33 each.',
					'Primary 90 dmg, arcs deal 48 each — LEGENDARY: chain never stops!'] },
			{ id: 'lightning_discharge', name: 'Discharge', type: 'active', icon: '💥', maxRank: 5,
				cooldowns: [0, 22, 20, 18, 15, 12],
				exclusive: true,
				rankDescs: ['',
					'Consume all shocks/stuns — deal 20 lightning damage per consumed effect.',
					'25 damage per effect.',
					'32 damage per effect.',
					'42 damage per effect.',
					'55 damage per effect — LEGENDARY: release all the charge at once!'] },
			{ id: 'lightning_ball', name: 'Ball Lightning', type: 'active', icon: '🔵', maxRank: 5,
				cooldowns: [0, 28, 25, 22, 18, 15],
				rankDescs: ['',
					'Summon a slow orb that pulses 8 lightning damage/s to enemies within 3 units for 6s.',
					'Orb pulses 14 dmg/s for 7s.',
					'Orb pulses 20 dmg/s for 8s.',
					'Orb pulses 28 dmg/s for 9s.',
					'Orb pulses 38 dmg/s for 10s — LEGENDARY: a storm contained in a sphere!'] },

			// ──── Tier 4 — Capstone ───────────────────────────────────────────────
			{ id: 'lightning_storm_sovereign', name: 'Storm Sovereign', type: 'active', icon: '⚜️', maxRank: 3,
				cooldowns: [0, 120, 100, 80],
				capstone: true,
				rankDescs: ['',
					'Become the storm for 8s — every 0.8s call down a lightning bolt on the nearest enemy for 60 dmg, all stuns last 2× longer, Chain Lightning gains 2 extra bounces.',
					'Duration 10s, bolt dmg 90, stun multiplier 2.5×.',
					'Duration 14s, bolt dmg 130 — LEGENDARY: you ARE the storm!'] },
		]
	},

	{
		id: 'ice', name: 'Ice', icon: '❄️', color: '#7dd3fc', borderColor: 'border-sky-400/40', bgColor: 'bg-sky-400/10',
		talents: [
			// ──── Tier 1 ─────────────────────────────────────────────────────────
			{ id: 'ice_active', name: 'Frost Edge', type: 'active', icon: '❄️', maxRank: 8,
				cooldowns: [0, 14, 13, 12, 11, 10, 9, 8, 7],
				rankDescs: ['',
					'Next attack +10 ice damage.',
					'Next attack +20 ice damage.',
					'Next attack +34 ice damage.',
					'Next attack +52 ice damage — weapon radiates cold.',
					'Next attack +74 ice damage — frost shards explode.',
					'Next attack +100 ice damage — glacial devastation.',
					'Next attack +132 ice damage — absolute zero strike.',
					'Next attack +170 ice damage — LEGENDARY: an ice age in a single blow!'] },
			{ id: 'ice_passive', name: 'Chill', type: 'passive', icon: '🌨️', maxRank: 8,
				rankDescs: ['',
					'1% chance on hit: Freeze for 1 turn.',
					'2% chance on hit: Freeze for 1 turn.',
					'3% chance on hit: Freeze for 2 turns.',
					'4% chance on hit: Freeze for 2 turns.',
					'5% chance on hit: Freeze for 2 turns.',
					'6% chance on hit: Freeze for 3 turns.',
					'7% chance on hit: Freeze for 3 turns.',
					'9% chance on hit: Freeze for 4 turns — LEGENDARY: cold seeps into their very soul!'] },

			// ──── Tier 2 ─────────────────────────────────────────────────────────
			{ id: 'ice_shield', name: 'Frost Ward', type: 'active', icon: '🧊', maxRank: 8,
				cooldowns: [0, 30, 28, 25, 22, 20, 17, 14, 11],
				rankDescs: ['',
					'+6 armor for 8s.',
					'+10 armor for 10s.',
					'+15 armor for 12s.',
					'+22 armor for 14s.',
					'+30 armor for 16s.',
					'+40 armor for 18s.',
					'+52 armor for 20s.',
					'+70 armor for 25s — LEGENDARY: impenetrable glacial shell!'] },
			{ id: 'ice_brittle', name: 'Brittle', type: 'passive', icon: '🧊', maxRank: 5,
				rankDescs: ['',
					'Frozen enemies take 15% increased physical damage.',
					'Frozen enemies take 25% increased physical damage.',
					'Frozen enemies take 35% increased physical damage.',
					'Frozen enemies take 42% increased physical damage.',
					'Frozen enemies take 50% increased physical damage — shattered by the cold!'] },
			{ id: 'ice_cold_snap', name: 'Cold Snap', type: 'passive', icon: '🌨️', maxRank: 5,
				rankDescs: ['',
					'Every 3rd attack automatically Chills the target (slows for 2s).',
					'Every 3rd attack Chills and deals +8 bonus ice damage.',
					'Every 3rd attack Chills and deals +15 bonus ice damage.',
					'Chill becomes a Freeze for 1 turn. +20 bonus ice damage.',
					'Freeze 2 turns. +28 bonus ice damage — Cold Snap cannot be resisted!'] },
			{ id: 'ice_shatter', name: 'Shatter', type: 'active', icon: '💎', maxRank: 5,
				cooldowns: [0, 25, 22, 19, 16, 14],
				rankDescs: ['',
					'Shatter all frozen enemies for 30 damage each, ending the freeze.',
					'Shatter deals 60 damage.',
					'Shatter deals 95 damage.',
					'Shatter deals 130 damage.',
					'Shatter deals 170 damage — LEGENDARY: enemies burst like glass!'] },
			{ id: 'ice_permafrost', name: 'Permafrost', type: 'passive', icon: '💎', maxRank: 5,
				rankDescs: ['',
					'Frozen enemies that die leave an ice patch (5-unit radius) for 8s — slows enemies that step on it.',
					'Patch radius 6 units, lasts 10s.',
					'Ice patch also deals 5 dmg/s to enemies standing on it.',
					'Patch deals 9 dmg/s, radius 7 units.',
					'Patch deals 14 dmg/s, lasts 15s — the ground never thaws!'] },
			{ id: 'ice_crit', name: 'Frozen Precision', type: 'passive', icon: '🎯', maxRank: 5,
				rankDescs: ['',
					'+4% critical strike chance for ice attacks and spells.',
					'+7% critical strike chance for ice attacks and spells.',
					'+11% critical strike chance for ice attacks and spells.',
					'+15% critical strike chance for ice attacks and spells.',
					'+20% critical strike chance for ice attacks and spells — LEGENDARY: ice pierces any defence!'] },

			// ──── Tier 3 ─────────────────────────────────────────────────────────
			{ id: 'ice_lance', name: 'Ice Lance', type: 'active', icon: '🧊', maxRank: 5,
				cooldowns: [0, 18, 16, 14, 12, 10],
				rankDescs: ['',
					'Hurl an ice lance at a creature for 25 ice damage, freezing it for 3 turns. Click a creature to aim.',
					'Ice Lance deals 44 ice damage.',
					'Ice Lance deals 70 ice damage.',
					'Ice Lance deals 100 ice damage.',
					'Ice Lance deals 140 ice damage — LEGENDARY: absolute zero on impact!'] },
			{ id: 'ice_blizzard', name: 'Blizzard', type: 'active', icon: '🌨️', maxRank: 5,
				cooldowns: [0, 48, 42, 36, 30, 24],
				exclusive: true,
				rankDescs: ['',
					'Channel 2.5s — blizzard erupts, dealing 15 ice damage to ALL enemies within 7 units and freezing them for 2 turns.',
					'Blizzard deals 26 ice damage.',
					'Blizzard deals 40 ice damage.',
					'Blizzard deals 58 ice damage.',
					'Blizzard deals 80 ice damage — LEGENDARY: an ice age descends!'] },
			{ id: 'ice_frost_nova', name: 'Frost Nova', type: 'active', icon: '❄️', maxRank: 5,
				cooldowns: [0, 22, 20, 18, 15, 12],
				rankDescs: ['',
					'Instantly freeze all enemies within 5 units for 2 turns (no channel).',
					'Freeze radius 6 units, 2 turns.',
					'Freeze radius 7 units, 3 turns.',
					'Freeze radius 8 units, 3 turns.',
					'Freeze radius 9 units, 4 turns — LEGENDARY: everything stops!'] },
			{ id: 'ice_glacial_armor', name: 'Glacial Armor', type: 'active', icon: '🧊', maxRank: 5,
				cooldowns: [0, 35, 32, 28, 24, 20],
				exclusive: true,
				rankDescs: ['',
					'Encase yourself in ice — absorb up to 40 damage. On expiry, explode for 20 ice damage in 5 units.',
					'Absorb 70 damage. Explosion 35 ice damage.',
					'Absorb 105 damage. Explosion 55 ice damage.',
					'Absorb 145 damage. Explosion 78 ice damage.',
					'Absorb 190 damage. Explosion 105 ice damage — LEGENDARY: a glacier detonates!'] },

			// ──── Tier 4 — Capstone ───────────────────────────────────────────────
			{ id: 'ice_glacial_dominion', name: 'Glacial Dominion', type: 'active', icon: '👑', maxRank: 3,
				cooldowns: [0, 120, 100, 80],
				capstone: true,
				rankDescs: ['',
					'Unleash an ice storm for 10s — ALL enemies freeze for 3 turns every 3s, gain +50 armor, Ice Lance cooldown resets on each kill.',
					'Duration 12s, freeze every 2s, +75 armor.',
					'Duration 16s — LEGENDARY: absolute zero reigns!'] },
		]
	},

	{
		id: 'spirit', name: 'Spirit', icon: '💚', color: '#86efac', borderColor: 'border-green-400/40', bgColor: 'bg-green-400/10',
		talents: [
			// ──── Tier 1 ─────────────────────────────────────────────────────────
			{ id: 'spirit_active', name: 'Mend', type: 'active', icon: '💚', maxRank: 8,
				cooldowns: [0, 18, 16, 15, 13, 12, 10, 9, 8],
				rankDescs: ['',
					'Instantly heal 25 HP.',
					'Instantly heal 45 HP.',
					'Instantly heal 70 HP.',
					'Instantly heal 100 HP.',
					'Instantly heal 140 HP — a burst of radiant light.',
					'Instantly heal 190 HP — spirit floods your body.',
					'Instantly heal 250 HP — divine restoration.',
					'Instantly heal 325 HP — LEGENDARY: mortality itself retreats!'] },
			{ id: 'spirit_passive', name: 'Vital Flow', type: 'passive', icon: '🌿', maxRank: 8,
				rankDescs: ['',
					'Out-of-combat regen: +1 HP/tick every 0.8s.',
					'Regen: +2 HP/tick every 0.7s.',
					'Regen: +3 HP/tick every 0.6s.',
					'Regen: +4 HP/tick every 0.5s.',
					'Regen: +5 HP/tick every 0.45s.',
					'Regen: +7 HP/tick every 0.4s.',
					'Regen: +9 HP/tick every 0.35s.',
					'Regen: +12 HP/tick every 0.25s — LEGENDARY: wounds close themselves!'] },

			// ──── Tier 2 ─────────────────────────────────────────────────────────
			{ id: 'spirit_hot', name: 'Renewal', type: 'active', icon: '✨', maxRank: 8,
				cooldowns: [0, 28, 26, 23, 20, 18, 15, 12, 10],
				rankDescs: ['',
					'Healing aura — 20 HP over 10s.',
					'Healing aura — 40 HP over 12s.',
					'Healing aura — 65 HP over 14s.',
					'Healing aura — 100 HP over 16s.',
					'Healing aura — 145 HP over 18s.',
					'Healing aura — 200 HP over 20s.',
					'Healing aura — 270 HP over 22s.',
					'Healing aura — 360 HP over 25s — LEGENDARY: the isle itself heals you!'] },
			{ id: 'spirit_siphon', name: 'Siphon', type: 'passive', icon: '🩸', maxRank: 5,
				rankDescs: ['',
					'20% chance on attack to leech 3 HP.',
					'30% chance to leech 7 HP.',
					'40% chance to leech 12 HP.',
					'50% chance to leech 16 HP.',
					'65% chance to leech 22 HP — vital essence flows into you!'] },
			{ id: 'spirit_fortitude', name: 'Fortitude', type: 'passive', icon: '🛡️', maxRank: 5,
				rankDescs: ['',
					'+10 max HP. Incoming damage reduced by 2%.',
					'+18 max HP. Damage reduced by 4%.',
					'+25 max HP. Damage reduced by 5%.',
					'+32 max HP. Damage reduced by 6%.',
					'+40 max HP. Damage reduced by 8% — unbreakable resolve!'] },
			{ id: 'spirit_resurrection_mark', name: 'Resurrection Mark', type: 'passive', icon: '✨', maxRank: 5,
				rankDescs: ['',
					'Once per combat: when HP drops below 15%, auto-cast Mend (30 HP) instantly.',
					'Auto-Mend heals 55 HP at 15% HP threshold.',
					'Auto-Mend heals 85 HP at 20% HP threshold.',
					'Auto-Mend heals 120 HP at 20% HP threshold.',
					'Heal 160 HP at 25% HP threshold — LEGENDARY: death cannot claim you!'] },
			{ id: 'spirit_crit', name: 'Divine Touch', type: 'passive', icon: '🎯', maxRank: 5,
				rankDescs: ['',
					'+4% critical strike chance for spirit spells and heals.',
					'+7% critical strike chance for spirit spells and heals.',
					'+11% critical strike chance for spirit spells and heals.',
					'+15% critical strike chance for spirit spells and heals.',
					'+20% critical strike chance for spirit spells and heals — LEGENDARY: every touch is divine!'] },

			// ──── Tier 3 ─────────────────────────────────────────────────────────
			{ id: 'spirit_healing_surge', name: 'Healing Surge', type: 'active', icon: '💫', maxRank: 5,
				cooldowns: [0, 36, 32, 28, 24, 20],
				rankDescs: ['',
					'Surge of life — heals you 3 times over 4s: 15 HP per pulse.',
					'Each pulse heals 28 HP.',
					'Each pulse heals 45 HP.',
					'Each pulse heals 65 HP.',
					'Each pulse heals 90 HP — LEGENDARY: spirit floods your very soul!'] },
			{ id: 'spirit_soul_leech', name: 'Soul Leech', type: 'active', icon: '🌀', maxRank: 5,
				cooldowns: [0, 28, 25, 22, 18, 15],
				rankDescs: ['',
					'Tether a creature for 5s — drain 8 HP/s from it, healing yourself.',
					'Drain 14 HP/s for 6s.',
					'Drain 20 HP/s for 7s.',
					'Drain 28 HP/s for 8s.',
					'Drain 38 HP/s for 10s — LEGENDARY: life flows endlessly into you!'] },
			{ id: 'spirit_spirit_walk', name: 'Spirit Walk', type: 'active', icon: '👻', maxRank: 5,
				cooldowns: [0, 45, 40, 35, 30, 24],
				exclusive: true,
				rankDescs: ['',
					'Become ethereal for 2s — untargetable, immune to damage. Cannot attack.',
					'Spirit Walk lasts 2.5s.',
					'Lasts 3s. Movement speed +30% while active.',
					'Lasts 3.5s. Speed +40%.',
					'Lasts 4s — LEGENDARY: become one with the spirit realm!'] },
			{ id: 'spirit_aegis', name: 'Aegis', type: 'active', icon: '🔮', maxRank: 5,
				cooldowns: [0, 40, 36, 32, 28, 22],
				exclusive: true,
				rankDescs: ['',
					'Conjure a spirit shield that absorbs up to 50 damage for 10s.',
					'Shield absorbs 90 damage for 10s.',
					'Shield absorbs 135 damage for 12s.',
					'Shield absorbs 185 damage for 12s.',
					'Shield absorbs 240 damage for 15s — LEGENDARY: the spirit protects absolutely!'] },

			// ──── Tier 4 — Capstone ───────────────────────────────────────────────
			{ id: 'spirit_undying_will', name: 'Undying Will', type: 'active', icon: '🌟', maxRank: 3,
				cooldowns: [0, 120, 100, 80],
				capstone: true,
				rankDescs: ['',
					'Channel the spirit of life for 10s — all heals are 2× effective, gain 15 HP/s, immune to instant death, Spirit Walk and Aegis cooldowns reset.',
					'Duration 12s, heals 2.5×, HP/s 22.',
					'Duration 16s — LEGENDARY: life itself bends to your will!'] },
		]
	},

	{
		id: 'earth', name: 'Earth', icon: '🪨', color: '#a3734c', borderColor: 'border-amber-700/40', bgColor: 'bg-amber-700/10',
		talents: [
			// ──── Tier 1 ─────────────────────────────────────────────────────────
			{ id: 'earth_stone_fist', name: 'Stone Fist', type: 'active', icon: '👊', maxRank: 8,
				cooldowns: [0, 12, 11, 10, 9, 8, 7, 6, 5],
				rankDescs: ['',
					'Your next attack deals +14 earth damage and knocks back the target 1 unit.',
					'Next attack +28 earth damage, knockback 1.5 units.',
					'Next attack +46 earth damage, knockback 2 units.',
					'Next attack +68 earth damage, knockback 2.5 units — the ground quakes.',
					'Next attack +96 earth damage, knockback 3 units — stone splits their armor.',
					'Next attack +130 earth damage, knockback 3 units, 15% stun 1 cycle.',
					'Next attack +170 earth damage, 25% stun 1 cycle — rock crushes all.',
					'Next attack +220 earth damage, 35% stun 2 cycles — LEGENDARY: one blow ends worlds!'] },
			{ id: 'earth_thorns', name: 'Thorns', type: 'passive', icon: '🌿', maxRank: 8,
				rankDescs: ['',
					'Reflect 5% of melee damage taken back to the attacker.',
					'Reflect 9% damage.',
					'Reflect 13% damage.',
					'Reflect 18% damage — thorns draw blood.',
					'Reflect 24% damage — bristling with spines.',
					'Reflect 30% damage — attackers hesitate.',
					'Reflect 38% damage — touching you is fatal.',
					'Reflect 48% damage — LEGENDARY: you are a living weapon!'] },

			// ──── Tier 2 ─────────────────────────────────────────────────────────
			{ id: 'earth_entangle', name: 'Entangle', type: 'active', icon: '🌱', maxRank: 5,
				cooldowns: [0, 20, 18, 15, 12, 10],
				rankDescs: ['',
					'Roots a target enemy in place for 3s. Click a creature to aim.',
					'Root lasts 4s. Rooted enemy takes 10% increased damage.',
					'Root lasts 5s. +15% increased damage taken.',
					'Root lasts 6s. +20% increased damage taken.',
					'Root lasts 8s. +25% increased damage — LEGENDARY: vines from the deep!'] },
			{ id: 'earth_stone_skin', name: 'Stone Skin', type: 'passive', icon: '🪨', maxRank: 5,
				rankDescs: ['',
					'+8 armor permanently.',
					'+15 armor permanently.',
					'+22 armor permanently.',
					'+30 armor permanently.',
					'+40 armor permanently — impenetrable hide!'] },
			{ id: 'earth_seismic_slam', name: 'Seismic Slam', type: 'active', icon: '💥', maxRank: 5,
				cooldowns: [0, 28, 25, 22, 18, 15],
				rankDescs: ['',
					'Slam the ground — deals 22 earth damage to all enemies within 5 units and stuns them for 1 cycle.',
					'35 earth damage, stun 1 cycle, radius 6 units.',
					'52 earth damage, stun 2 cycles, radius 6 units.',
					'72 earth damage, stun 2 cycles, radius 7 units.',
					'95 earth damage, stun 3 cycles, radius 8 units — LEGENDARY: the earth splits!'] },
			{ id: 'earth_poison_spores', name: 'Poison Spores', type: 'passive', icon: '☠️', maxRank: 5,
				rankDescs: ['',
					'10% chance on hit to apply Poison: 4 dmg/s for 5s.',
					'20% chance. 7 dmg/s for 6s.',
					'30% chance. 11 dmg/s for 6s.',
					'40% chance. 16 dmg/s for 7s.',
					'50% chance. 22 dmg/s for 8s — toxic earth claims all!'] },

			// ──── Tier 3 ─────────────────────────────────────────────────────────
			{ id: 'earth_overgrowth', name: 'Overgrowth', type: 'passive', icon: '🌳', maxRank: 5,
				rankDescs: ['',
					'While standing still: regenerate 4 HP/s.',
					'Regen 7 HP/s while still.',
					'Regen 11 HP/s while still. Entangle also roots for +2s.',
					'Regen 15 HP/s while still.',
					'Regen 20 HP/s while still — the earth feeds you!'] },
			{ id: 'earth_tremor', name: 'Tremor', type: 'passive', icon: '🌋', maxRank: 5,
				rankDescs: ['',
					'Each Seismic Slam has 20% chance to generate a shockwave 2s later dealing 18 earth dmg in 6 units.',
					'30% chance. 30 earth dmg.',
					'40% chance. 45 earth dmg.',
					'50% chance. 62 earth dmg.',
					'65% chance. 80 earth dmg — aftershocks never stop!'] },
			{ id: 'earth_petrify', name: 'Petrify', type: 'active', icon: '🗿', maxRank: 5,
				cooldowns: [0, 35, 30, 26, 22, 18],
				rankDescs: ['',
					'Instantly turn target to stone for 4s — completely immobilized, takes 20% more damage. Click a creature to aim.',
					'Petrify for 5s. +28% damage taken.',
					'Petrify for 6s. +36% damage taken.',
					'Petrify for 8s. +44% damage taken.',
					'Petrify for 10s. +55% damage — LEGENDARY: they become part of the earth!'] },
			{ id: 'earth_natures_wrath', name: "Nature's Wrath", type: 'passive', icon: '⚡', maxRank: 5,
				rankDescs: ['',
					'Rooted or petrified enemies take 15% increased damage from all your attacks.',
					'Rooted/petrified enemies take 22% increased damage.',
					'28% increased damage.',
					'35% increased damage.',
					'45% increased damage — the earth punishes the restrained!'] },
			{ id: 'earth_earthen_wall', name: 'Earthen Wall', type: 'active', icon: '🏔️', maxRank: 5,
				cooldowns: [0, 45, 40, 35, 30, 25],
				exclusive: true,
				rankDescs: ['',
					'Raise a wall of stone between you and the nearest enemy for 6s — blocks line of sight, deflects projectiles.',
					'Wall lasts 8s and deals 15 dmg to enemies that touch it.',
					'Wall lasts 10s. 25 dmg on contact. You regen 8 HP/s behind it.',
					'Wall lasts 12s. 35 dmg on contact. Regen 12 HP/s.',
					'Wall lasts 15s. 50 dmg on contact — LEGENDARY: an unbreachable fortress!'] },
			{ id: 'earth_crystal_spikes', name: 'Crystal Spikes', type: 'active', icon: '💎', maxRank: 5,
				cooldowns: [0, 22, 19, 16, 13, 10],
				exclusive: true,
				rankDescs: ['',
					'Erupt 3 crystal spikes from the ground at target — each deals 28 earth damage. Click a creature to aim.',
					'4 spikes, 44 dmg each.',
					'5 spikes, 62 dmg each — spikes pierce armor.',
					'6 spikes, 82 dmg each, 20% chance to briefly stun.',
					'7 spikes, 105 dmg each, 35% stun — LEGENDARY: crystal forest erupts!'] },

			// ──── Tier 4 — Capstone ───────────────────────────────────────────────
			{ id: 'earth_living_mountain', name: 'Living Mountain', type: 'active', icon: '🏔️', maxRank: 3,
				cooldowns: [0, 120, 100, 80],
				capstone: true,
				rankDescs: ['',
					'Transform into a living mountain for 10s — gain 150 armor, Thorns reflect 100% of damage, Seismic Slam and Crystal Spikes have no cooldown, roots all enemies within 8 units.',
					'Duration 12s, armor +220, Poison Spores procs on every attack, root radius 10 units.',
					'Duration 15s — LEGENDARY: you are the mountain, the mountain is you!'] },
		]
	},
];

// Prerequisite chain: talent N requires rank >= TALENT_PREREQ_RANK[N] in TALENT_PREREQS[N].
const TALENT_PREREQS = {
	// ── Fire ──
	fire_passive:            'fire_active',
	fire_backdraft:          'fire_passive',
	fire_wildfire:           'fire_backdraft',
	fire_cremation:          'fire_passive',
	fire_pyroclasm:          'fire_backdraft',
	fire_crit:               'fire_passive',
	fire_fireball:           'fire_cremation',
	fire_inferno:            'fire_fireball',
	fire_flame_wall:         'fire_fireball',
	fire_magma_shell:        'fire_fireball',
	fire_phoenix_mark:       'fire_fireball',
	fire_phoenix_ascendant:  'fire_inferno',      // capstone via offense line

	// ── Lightning ──
	lightning_passive:       'lightning_active',
	lightning_conductor:     'lightning_passive',
	lightning_aftershock:    'lightning_conductor',
	lightning_static_aura:   'lightning_conductor',
	lightning_overload:      'lightning_conductor',
	lightning_crit:          'lightning_passive',
	lightning_strike:        'lightning_aftershock',
	lightning_storm:         'lightning_strike',
	lightning_chain:         'lightning_strike',
	lightning_discharge:     'lightning_chain',
	lightning_ball:          'lightning_static_aura',
	lightning_storm_sovereign: 'lightning_storm', // capstone via storm line

	// ── Ice ──
	ice_passive:             'ice_active',
	ice_shield:              'ice_passive',
	ice_brittle:             'ice_shield',
	ice_cold_snap:           'ice_passive',
	ice_shatter:             'ice_brittle',
	ice_permafrost:          'ice_brittle',
	ice_crit:                'ice_passive',
	ice_lance:               'ice_shatter',
	ice_blizzard:            'ice_lance',
	ice_frost_nova:          'ice_lance',
	ice_glacial_armor:       'ice_frost_nova',
	ice_glacial_dominion:    'ice_blizzard',      // capstone via blizzard line

	// ── Spirit ──
	spirit_passive:          'spirit_active',
	spirit_hot:              'spirit_passive',
	spirit_siphon:           'spirit_hot',
	spirit_fortitude:        'spirit_passive',
	spirit_resurrection_mark:'spirit_hot',
	spirit_crit:             'spirit_passive',
	spirit_healing_surge:    'spirit_siphon',
	spirit_soul_leech:       'spirit_healing_surge',
	spirit_spirit_walk:      'spirit_soul_leech',
	spirit_aegis:            'spirit_fortitude',
	spirit_undying_will:     'spirit_spirit_walk', // capstone via leech line (alt: aegis)

	// ── Earth ──
	earth_thorns:            'earth_stone_fist',
	earth_entangle:          'earth_stone_fist',
	earth_stone_skin:        'earth_thorns',
	earth_seismic_slam:      'earth_stone_fist',
	earth_poison_spores:     'earth_thorns',
	earth_overgrowth:        'earth_entangle',
	earth_tremor:            'earth_seismic_slam',
	earth_petrify:           'earth_entangle',
	earth_natures_wrath:     'earth_petrify',
	earth_earthen_wall:      'earth_stone_skin',
	earth_crystal_spikes:    'earth_seismic_slam',
	earth_living_mountain:   'earth_tremor',      // capstone via seismic line
};

// Minimum rank required in the prerequisite talent before this talent unlocks.
const TALENT_PREREQ_RANK = {
	// fire
	fire_backdraft: 2, fire_wildfire: 2, fire_cremation: 2, fire_pyroclasm: 2,
	fire_fireball: 3, fire_inferno: 3, fire_flame_wall: 3, fire_magma_shell: 3, fire_phoenix_mark: 3,
	fire_phoenix_ascendant: 3,

	// lightning
	lightning_conductor: 2, lightning_aftershock: 2, lightning_static_aura: 2, lightning_overload: 2,
	lightning_strike: 3, lightning_storm: 3, lightning_chain: 3,
	lightning_discharge: 3, lightning_ball: 3,
	lightning_storm_sovereign: 3,

	// ice
	ice_shield: 2, ice_brittle: 2, ice_shatter: 2, ice_permafrost: 2, ice_cold_snap: 2,
	ice_lance: 3, ice_blizzard: 3, ice_frost_nova: 3, ice_glacial_armor: 3,
	ice_glacial_dominion: 3,

	// spirit
	spirit_hot: 2, spirit_siphon: 2, spirit_fortitude: 2, spirit_resurrection_mark: 2,
	spirit_healing_surge: 3, spirit_soul_leech: 3, spirit_spirit_walk: 3, spirit_aegis: 3,
	spirit_undying_will: 3,

	// earth
	earth_thorns: 2, earth_entangle: 2, earth_stone_skin: 2, earth_seismic_slam: 2, earth_poison_spores: 2,
	earth_overgrowth: 3, earth_tremor: 3, earth_petrify: 3, earth_natures_wrath: 3,
	earth_earthen_wall: 3, earth_crystal_spikes: 3,
	earth_living_mountain: 3,
};

// ─── Helper functions ───────────────────────────────────────────────────────

function getTalentDef(id) {
	for (const path of TALENT_PATHS) for (const t of path.talents) if (t.id === id) return t;
	return null;
}

function talentRank(id) { return player.talents[id] || 0; }
function hasTalent(id) { return talentRank(id) > 0; }

function talentPointsEarned() { return (player.atkLvl - 1) + (player.defLvl - 1); }
function talentRankUpgradeCost(currentRank) { return Math.min(currentRank + 1, 5); }
function talentTotalCost(rank) {
	let n = 0;
	for (let r = 1; r <= rank; r++) n += Math.min(r, 5);
	return n;
}
function talentPointsSpent() {
	let n = 0;
	for (const v of Object.values(player.talents)) n += talentTotalCost(v || 0);
	return n;
}
function talentPointsAvailable() { return Math.max(0, talentPointsEarned() - talentPointsSpent()); }

// Points spent in a specific path (used for tier gate checks).
function talentPathPointsSpent(pathId) {
	const path = TALENT_PATHS.find(p => p.id === pathId);
	if (!path) return 0;
	let n = 0;
	for (const t of path.talents) n += talentTotalCost(talentRank(t.id));
	return n;
}

// Returns which path a talent belongs to (or null).
function talentPathFor(id) {
	for (const path of TALENT_PATHS) {
		if (path.talents.some(t => t.id === id)) return path.id;
	}
	return null;
}

// True if the tier gate for this talent's tier is satisfied.
function talentTierGateMet(id) {
	const tier = TALENT_TIERS[id];
	if (!tier || tier <= 1) return true;
	const pathId = talentPathFor(id);
	if (!pathId) return true;
	const spent = talentPathPointsSpent(pathId);
	const required = tier === 2 ? TALENT_TIER_GATES.T2 :
	                 tier === 3 ? TALENT_TIER_GATES.T3 :
	                 tier === 4 ? TALENT_TIER_GATES.T4 : 0;
	return spent >= required;
}

// True if the mutual-exclusion rule allows this talent to be taken.
function talentExclusionAllowed(id) {
	for (const [pathId, pair] of Object.entries(TALENT_EXCLUSIVE_GROUPS)) {
		if (!pair.includes(id)) continue;
		const other = pair.find(t => t !== id);
		if (other && talentRank(other) > 0) return false;
	}
	return true;
}

function talentPrereqMet(id) {
	const prereq = TALENT_PREREQS[id];
	if (!prereq) return true;
	const required = TALENT_PREREQ_RANK[id] || 1;
	return talentRank(prereq) >= required;
}

// Full unlock check — prereq + tier gate + exclusion.
function talentCanUnlock(id) {
	return talentPrereqMet(id) && talentTierGateMet(id) && talentExclusionAllowed(id);
}
