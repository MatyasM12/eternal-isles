/* ============================================================================
   ETERNAL ISLES — a fan-made browser tribute to Eternal Lands
   Single-file game engine built on Three.js r128 (vendored locally).
   Isometric point-and-click, harvesting, combat, EL-style manufacture window.
   ==========================================================================*/
(function () {
	'use strict';

	// ------------------------------------------------------------------ helpers
	const rand = (a, b) => a + Math.random() * (b - a);
	const randInt = (a, b) => Math.floor(rand(a, b + 1));
	const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
	const clamp = THREE.MathUtils.clamp;
	const lerp = THREE.MathUtils.lerp;
	const smoothstep = THREE.MathUtils.smoothstep;

	// ------------------------------------------------------------------ terrain (archipelago)
	// Several islands sit in a shallow, swimmable lagoon. Beyond the whole cluster
	// the sea floor plunges into deep ocean you cannot cross. Higher-tier isles are
	// home to progressively deadlier creatures and richer resources.
	const ISLES = [
		// Isla Prima — wide, gently rolling starter island, basically round
		{ name: 'Isla Prima',      x:    0, z:    0,   r: 52, tier: 0, biome: 'temperate', peakMult: 0.85, elongX: 1.0,  elongZ: 1.0,  hillFreq: 0.08 },
		// Verdant Reach — elongated east-west crescent, lush and hilly
		{ name: 'Verdant Reach',   x:  148, z:  -18,   r: 44, tier: 1, biome: 'temperate', peakMult: 1.15, elongX: 1.6,  elongZ: 0.7,  hillFreq: 0.11 },
		// Emberfell — compact, very tall spire volcano, craggy
		{ name: 'Emberfell',       x:  -28, z:  152,   r: 40, tier: 2, biome: 'volcanic',  peakMult: 1.80, elongX: 0.9,  elongZ: 0.9,  hillFreq: 0.15 },
		// Frostspire — large plateau, mostly flat with a sharp central peak
		{ name: 'Frostspire',      x: -150, z:  -40,   r: 54, tier: 3, biome: 'frost',     peakMult: 1.30, elongX: 1.1,  elongZ: 0.75, hillFreq: 0.06 },
		// The Sunken Fang — thin crescent, very low-lying, lots of water inlets
		{ name: 'The Sunken Fang', x:  120, z:  150,   r: 36, tier: 4, biome: 'volcanic',  peakMult: 0.60, elongX: 0.65, elongZ: 1.4,  hillFreq: 0.18 },
		// Ashwood Isle — veteran training grounds, southwest of Isla Prima, gentle rolling hills
		{ name: 'Ashwood Isle',    x: -100, z:   70,   r: 38, tier: 5, biome: 'temperate', peakMult: 0.90, elongX: 1.1,  elongZ: 0.9,  hillFreq: 0.09 },
		// Dragon's Lair — tiny, brutally steep peak, barely any flat land
		{ name: "Dragon's Lair",   x:    0, z: -165,   r: 28, tier: 6, biome: 'volcanic',  peakMult: 2.40, elongX: 1.0,  elongZ: 1.0,  hillFreq: 0.20 },
		// Eldenmere — vast arcane island, home to ancient beasts and a walled city
		{ name: 'Eldenmere',       x:    0, z: -235,   r: 120, tier: 7, biome: 'arcane',    peakMult: 0.80, elongX: 1.3,  elongZ: 1.1,  hillFreq: 0.04 },
	];
	const ISLAND_R = 52; // legacy alias (fireflies etc. use it)
	const WATER_Y = -1.15;
	const SEA = WATER_Y - 2.15; // shallow lagoon floor (swimmable everywhere between isles)
	// cluster bounding circle (centered at origin-ish) → deep ocean past OUTER_R
	// Must cover the full extent of all islands — Eldenmere's NW corner reaches ~400 units from origin
	const OUTER_R = 450;
	function islandHeightAt(x, z) {
		let land = 0, near = null, nearD = 1e9;
		for (const isle of ISLES) {
			const dx = x - isle.x, dz = z - isle.z;
			// apply per-island elongation so each isle has a distinct footprint
			const ex = isle.elongX || 1, ez = isle.elongZ || 1;
			const dxe = dx / ex, dze = dz / ez;
			const d = Math.sqrt(dxe * dxe + dze * dze);
			const dRaw = Math.sqrt(dx * dx + dz * dz);
			if (dRaw < nearD) { nearD = dRaw; near = isle; }
			if (d < isle.r) {
				const t = 1 - d / isle.r;
				const dome = smoothstep(t, 0, 1);
				const pm = isle.peakMult || 1.0;
				const hf = isle.hillFreq || 0.08;
				let hl = dome * (isle.r * 0.14 + 1.5) * pm;
				hl += (Math.sin(x * hf) * Math.cos(z * hf * 0.87) * 1.5 +
					Math.sin((x + z) * hf * 0.65 + isle.tier) * 0.8) * dome;
				land = Math.max(land, hl);
			}
		}
		return { land, near, nearD };
	}
	function terrainHeight(x, z) {
		const { land } = islandHeightAt(x, z);
		let h;
		if (land > 0.02) h = SEA + 1.7 + land;                       // island rises out of the lagoon
		else h = SEA + Math.sin(x * 0.04) * 0.25 + Math.cos(z * 0.045) * 0.25; // gentle shallow floor
		// deep ocean beyond the whole archipelago (blocks wandering off the map)
		const dc = Math.sqrt(x * x + z * z);
		const far = smoothstep(dc, OUTER_R - 16, OUTER_R);
		h = h * (1 - far) - far * 16;
		return h;
	}
	function nearestIsle(x, z) { return islandHeightAt(x, z).near; }
	// "land" for harvest/attack placement and standing
	const walkable = (x, z) => terrainHeight(x, z) > WATER_Y + 0.55;
	// shallow enough to wade/swim in, but not the bottomless deep ocean
	const inWater = (x, z) => terrainHeight(x, z) <= WATER_Y + 0.45;
	const tooDeep = (x, z) => terrainHeight(x, z) < WATER_Y - 5.5; // block the open sea
	const canStep = (x, z) => !tooDeep(x, z); // walk on land OR swim in the shallows


	// ------------------------------------------------------------------ renderer / scene
	const app = document.getElementById('app');
	const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.outputEncoding = THREE.sRGBEncoding;
	app.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x7fa8c4);
	scene.fog = new THREE.Fog(0x7fa8c4, 70, 230);

	const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 600);
	let camZoom = 1.0; // mouse-wheel zoom
	const CAM_OFFSET = new THREE.Vector3(13, 19, 13); // classic EL-style high isometric angle
	const camTarget = new THREE.Vector3();

	window.addEventListener('resize', () => {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize(window.innerWidth, window.innerHeight);
	});

	// ------------------------------------------------------------------ lighting
	// Warm sun + soft bluish ambient fill — the classic "looks expensive" combo.
	const SUN_OFFSET = new THREE.Vector3(34, 52, 22);
	const sun = new THREE.DirectionalLight(0xffdfb0, 0.78);
	sun.position.copy(SUN_OFFSET);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.camera.left = -60;
	sun.shadow.camera.right = 60;
	sun.shadow.camera.top = 60;
	sun.shadow.camera.bottom = -60;
	sun.shadow.camera.near = 10;
	sun.shadow.camera.far = 140;
	sun.shadow.bias = -0.0006;
	scene.add(sun);
	const sunTarget = new THREE.Object3D(); scene.add(sunTarget); sun.target = sunTarget;
	scene.add(new THREE.AmbientLight(0x8fa7ff, 0.28));
	scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x50713f, 0.14));

	// ------------------------------------------------------------------ ground
	const groundGeo = new THREE.PlaneGeometry(960, 960, 320, 320);
	groundGeo.rotateX(-Math.PI / 2);
	{
		const pos = groundGeo.attributes.position;
		const colors = new Float32Array(pos.count * 3);
		const cSand = new THREE.Color(0xdcc793);
		const cShallow = new THREE.Color(0x59a9c0);
		const cDeep = new THREE.Color(0x2f5f80);
		const BIOME = {
			temperate: { grass: 0x5ea64a, hi: 0x8fca6c, rock: 0x7d7466 },
			volcanic:  { grass: 0x6b4a3a, hi: 0x9a6b4a, rock: 0x3a2b28 },
			frost:     { grass: 0xaebfc9, hi: 0xe8f0f6, rock: 0x8593a0 },
			arcane:    { grass: 0x5a4a7a, hi: 0x9070c0, rock: 0x4a3a60 },
		};
		const tmp = new THREE.Color(), gA = new THREE.Color(), gB = new THREE.Color(), rk = new THREE.Color();
		for (let i = 0; i < pos.count; i++) {
			const x = pos.getX(i), z = pos.getZ(i);
			const h = terrainHeight(x, z);
			pos.setY(i, h);
			if (h < WATER_Y - 1.4) tmp.copy(cDeep);
			else if (h < WATER_Y + 0.1) tmp.copy(cShallow);
			else if (h < WATER_Y + 0.95) tmp.copy(cSand);
			else {
				const isle = nearestIsle(x, z);
				const b = BIOME[(isle && isle.biome) || 'temperate'];
				gA.setHex(b.grass); gB.setHex(b.hi); rk.setHex(b.rock);
				tmp.copy(gA).lerp(gB, clamp((h + 0.8) / 3.6, 0, 1));
				if (h > 5.0) tmp.lerp(rk, clamp((h - 5.0) / 3, 0, 0.7)); // rocky/snowy highlands
				tmp.offsetHSL(rand(-0.015, 0.015), rand(-0.04, 0.04), rand(-0.03, 0.03));
			}
			colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
		}
		groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		groundGeo.computeVertexNormals();
	}
	const ground = new THREE.Mesh(
		groundGeo,
		new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 })
	);
	ground.receiveShadow = true;
	scene.add(ground);

	// ------------------------------------------------------------------ water
	const waterGeo = new THREE.PlaneGeometry(900, 900, 48, 48);
	waterGeo.rotateX(-Math.PI / 2);
	const waterBase = waterGeo.attributes.position.array.slice();
	const water = new THREE.Mesh(
		waterGeo,
		new THREE.MeshStandardMaterial({
			color: 0x3d8fb8, transparent: true, opacity: 0.82,
			roughness: 0.35, metalness: 0.15, flatShading: true,
		})
	);
	water.position.y = WATER_Y;
	scene.add(water);

	// ------------------------------------------------------------------ scatter placement
	const placed = [];
	function findSpot(minH, maxH, minSep, maxR, minCenter) {
		for (let t = 0; t < 120; t++) {
			const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * maxR;
			const x = Math.cos(a) * r, z = Math.sin(a) * r;
			const h = terrainHeight(x, z);
			if (h < minH || h > maxH) continue;
			if (Math.sqrt(x * x + z * z) < minCenter) continue;
			let ok = true;
			for (const p of placed) {
				const dx = p.x - x, dz = p.z - z;
				if (dx * dx + dz * dz < minSep * minSep) { ok = false; break; }
			}
			if (!ok) continue;
			placed.push({ x, z });
			return new THREE.Vector3(x, h, z);
		}
		return null;
	}

	const clickables = []; // groups with userData.interact
	const creatures = [];

	// axis-aligned solid boxes that block movement (used for Eldenmere town walls)
	// each entry: { x1, z1, x2, z2 } in world coords (min/max)
	const solidBoxes = [];
	function isSolidBlocked(x, z) {
		for (const b of solidBoxes) { if (x >= b.x1 && x <= b.x2 && z >= b.z1 && z <= b.z2) return true; }
		return false;
	}

	// find a free spot on a specific isle
	function findSpotIsle(isle, minSep, inset) {
		for (let t = 0; t < 140; t++) {
			const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * (isle.r - (inset || 4));
			const x = isle.x + Math.cos(a) * r, z = isle.z + Math.sin(a) * r;
			if (!walkable(x, z)) continue;
			let ok = true;
			for (const p of placed) { const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz < minSep * minSep) { ok = false; break; } }
			if (!ok) continue;
			placed.push({ x, z });
			return new THREE.Vector3(x, terrainHeight(x, z), z);
		}
		return null;
	}
	function scatterOnIsles(perIsle, minSep, inset, fn, tierMin, tierMax) {
		for (const isle of ISLES) {
			if (tierMin != null && isle.tier < tierMin) continue;
			if (tierMax != null && isle.tier > tierMax) continue;
			const n = typeof perIsle === 'function' ? perIsle(isle) : perIsle;
			for (let i = 0; i < n; i++) { const p = findSpotIsle(isle, minSep, inset); if (p) fn(p, isle); }
		}
	}

	// ------------------------------------------------------------------ trees
	const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4a2f, flatShading: true, roughness: 0.9 });
	const leafMats = [0x2f7f3b, 0x3f9142, 0x57a84f].map(
		(c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85 })
	);
	const trunkGeo = new THREE.CylinderGeometry(0.16, 0.27, 1.5, 7);
	const leafGeos = [new THREE.OctahedronGeometry(1.15, 0), new THREE.OctahedronGeometry(0.88, 0), new THREE.OctahedronGeometry(0.6, 0)];

	function buildTree(p) {
		const g = new THREE.Group();
		const trunk = new THREE.Mesh(trunkGeo, trunkMat);
		trunk.position.y = 0.75; trunk.castShadow = true;
		g.add(trunk);
		const ys = [1.9, 2.7, 3.35];
		for (let i = 0; i < 3; i++) {
			const leaf = new THREE.Mesh(leafGeos[i], leafMats[(i + randInt(0, 2)) % 3]);
			leaf.position.y = ys[i];
			leaf.rotation.y = rand(0, Math.PI);
			leaf.castShadow = true;
			g.add(leaf);
		}
		g.position.copy(p);
		g.rotation.y = rand(0, Math.PI * 2);
		const s = rand(0.8, 1.25);
		g.scale.set(s, s * rand(0.9, 1.15), s);
		g.userData.interact = {
			kind: 'harvest',
			node: { item: 'Wood Log', duration: 2.8, range: 2.7, verb: 'chopping', group: g },
		};
		scene.add(g);
		clickables.push(g);
	}
	scatterOnIsles((isle) => Math.round(isle.r * 0.55), 3.5, 3, buildTree);

	// ------------------------------------------------------------------ mineral nodes
	const rockMat = new THREE.MeshStandardMaterial({ color: 0x565b63, flatShading: true, roughness: 0.9 });
	const rockGeo = new THREE.DodecahedronGeometry(0.75, 0);
	const speckGeo = new THREE.DodecahedronGeometry(0.13, 0);
	const MINERALS = {
		'Iron Ore':     { color: 0xa25f38, emissive: 0x000000, dur: 3.4, rock: 0x565b63 },
		'Coal':         { color: 0x2b2b2f, emissive: 0x000000, dur: 3.0, rock: 0x3a3a40 },
		'Silver Ore':   { color: 0xcdd6e0, emissive: 0x223040, dur: 4.2, rock: 0x5a6068 },
		'Sulphur':      { color: 0xe9d84a, emissive: 0x6a5a08, dur: 3.2, rock: 0x6b5a2a },
		'Quartz Ore':   { color: 0xf0e6ff, emissive: 0x3a1a80, dur: 4.0, rock: 0x9070b0 },
		'Gold Ore':     { color: 0xffd700, emissive: 0x604000, dur: 4.8, rock: 0x7a6020 },
		'Titanium Ore':   { color: 0xb8d4e8, emissive: 0x1a3a60, dur: 5.5, rock: 0x3a4a5a },
		// Eldenmere tier-6 ores
		'Aether Crystal': { color: 0x00ffee, emissive: 0x00aacc, dur: 6.5, rock: 0x1a4040 },
		'Voidstone':      { color: 0x2a0030, emissive: 0xaa00ff, dur: 6.0, rock: 0x180020 },
		'Starstone':      { color: 0xf0f4ff, emissive: 0x8090ff, dur: 7.0, rock: 0x5060a0 },
	};
	const mineralMats = {};
	for (const k in MINERALS) mineralMats[k] = new THREE.MeshStandardMaterial({ color: MINERALS[k].color, emissive: MINERALS[k].emissive, emissiveIntensity: 0.5, flatShading: true, roughness: 0.6, metalness: 0.4 });
	function buildMineral(p, item) {
		const def = MINERALS[item];
		const g = new THREE.Group();
		const rock = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: def.rock, flatShading: true, roughness: 0.9 }));
		rock.castShadow = true;
		rock.scale.set(rand(0.8, 1.6), rand(0.7, 1.3), rand(0.8, 1.6));
		rock.rotation.set(rand(0, 1), rand(0, Math.PI), rand(0, 1));
		g.add(rock);
		for (let i = 0; i < 5; i++) {
			const s = new THREE.Mesh(speckGeo, mineralMats[item]);
			const a = rand(0, Math.PI * 2);
			s.position.set(Math.cos(a) * 0.6, rand(0.15, 0.75), Math.sin(a) * 0.6);
			s.scale.setScalar(rand(0.7, 1.3));
			g.add(s);
		}
		g.position.copy(p); g.position.y += 0.25;
		g.userData.interact = { kind: 'harvest', node: { item, duration: def.dur, range: 2.5, verb: 'mining', group: g } };
		scene.add(g);
		clickables.push(g);
	}
	// Progressive ore tiers — 2-3 nodes per island so each ore feels rare and exploration rewarding.
	// Tier 0 (Isla Prima): iron only — no coal, no smelting yet, just raw gathering.
	scatterOnIsles(3, 5.0, 4, (p) => buildMineral(p, 'Iron Ore'), 0, 0);
	// Tier 1 (Verdant Reach): iron + coal → can now smelt iron bars and steel.
	scatterOnIsles(3, 5.0, 4, (p) => buildMineral(p, 'Iron Ore'), 1, 1);
	scatterOnIsles(2, 5.0, 4, (p) => buildMineral(p, 'Coal'), 1, 1);
	scatterOnIsles(2, 5.0, 4, (p) => buildMineral(p, 'Sulphur'), 1, 1);
	// Tier 2 (Emberfell): iron + coal + silver + quartz — jewelry and silver gear unlocked.
	scatterOnIsles(2, 5.0, 4, (p) => buildMineral(p, 'Iron Ore'), 2, 2);
	scatterOnIsles(2, 5.0, 4, (p) => buildMineral(p, 'Coal'), 2, 2);
	scatterOnIsles(2, 5.5, 4, (p) => buildMineral(p, 'Silver Ore'), 2, 2);
	scatterOnIsles(2, 5.5, 4, (p) => buildMineral(p, 'Quartz Ore'), 2, 2);
	// Tier 3 (Frostspire): silver + quartz + gold — gold jewelry and best pre-dragon gear.
	scatterOnIsles(2, 5.5, 4, (p) => buildMineral(p, 'Silver Ore'), 3, 3);
	scatterOnIsles(2, 5.5, 4, (p) => buildMineral(p, 'Quartz Ore'), 3, 3);
	scatterOnIsles(2, 6.0, 4, (p) => buildMineral(p, 'Gold Ore'), 3, 3);
	// Tier 4 (Sunken Fang): gold + titanium — endgame material progression.
	scatterOnIsles(2, 6.0, 4, (p) => buildMineral(p, 'Gold Ore'), 4, 4);
	scatterOnIsles(2, 6.0, 4, (p) => buildMineral(p, 'Titanium Ore'), 4, 4);
	// Tier 5 (Ashwood Isle): titanium ore
	scatterOnIsles(3, 6.0, 4, (p) => buildMineral(p, 'Titanium Ore'), 5, 5);
	// Tier 6 (Dragon's Lair): titanium — volcanic deposits near the dragon
	scatterOnIsles(3, 6.0, 4, (p) => buildMineral(p, 'Titanium Ore'), 6, 6);
	// Sulphur also appears on volcanic tier 2+ for fire essences
	scatterOnIsles(2, 5.0, 4, (p) => buildMineral(p, 'Sulphur'), 2, 3);
	// Tier 7 (Eldenmere): arcane crystals and void ore — endgame materials
	scatterOnIsles(4, 6.5, 5, (p) => buildMineral(p, 'Aether Crystal'), 7, 7);
	scatterOnIsles(3, 6.5, 5, (p) => buildMineral(p, 'Voidstone'), 7, 7);
	scatterOnIsles(3, 7.0, 5, (p) => buildMineral(p, 'Starstone'), 7, 7);

	// ------------------------------------------------------------------ flowers
	const flowerAnchors = []; // for the sparkle particle system
	const FLOWER_DEFS = [
		{ item: 'Red Rose',          color: 0xff3355, emissive: 0xd0143a, geo: new THREE.IcosahedronGeometry(0.22, 0) },
		{ item: 'Blue Star Flower',  color: 0x4d8dff, emissive: 0x2a5fe0, geo: new THREE.OctahedronGeometry(0.26, 0) },
		{ item: 'Chrysanthemum',     color: 0xffc933, emissive: 0xd08f10, geo: new THREE.DodecahedronGeometry(0.22, 0) },
		{ item: 'Lilac',             color: 0xb57ede, emissive: 0x7d3fb0, geo: new THREE.IcosahedronGeometry(0.21, 0) },
		// Eldenmere tier-6 flowers
		{ item: 'Moonbloom',         color: 0xd0f0ff, emissive: 0x4ac8ff, geo: new THREE.IcosahedronGeometry(0.24, 1) },
		{ item: 'Voidpetal',         color: 0x3a0050, emissive: 0x8800cc, geo: new THREE.OctahedronGeometry(0.27, 0) },
		{ item: 'Sunfire Lily',      color: 0xff8c00, emissive: 0xdd4400, geo: new THREE.DodecahedronGeometry(0.24, 0) },
		{ item: 'Starbloom',         color: 0xe8eeff, emissive: 0x6080ff, geo: new THREE.IcosahedronGeometry(0.22, 0) },
	];
	const stemMat = new THREE.MeshStandardMaterial({ color: 0x2d7a2a, flatShading: true, roughness: 0.85 });
	const stemGeo = new THREE.CylinderGeometry(0.038, 0.052, 0.72, 5);
	const leafGeo = new THREE.ConeGeometry(0.13, 0.34, 4);
	const bushBaseGeo = new THREE.SphereGeometry(0.52, 8, 5);

	function buildFlower(def, p) {
		const g = new THREE.Group();
		const bloomMat = new THREE.MeshStandardMaterial({
			color: def.color, emissive: def.emissive, emissiveIntensity: 1.0, flatShading: true, roughness: 0.45,
		});
		// low leafy bush mound as a base
		const base = new THREE.Mesh(bushBaseGeo, stemMat);
		base.scale.set(1.05, 0.48, 1.05); base.position.y = 0.14; g.add(base);
		const n = randInt(5, 8);
		for (let i = 0; i < n; i++) {
			const ox = rand(-0.52, 0.52), oz = rand(-0.52, 0.52);
			const stem = new THREE.Mesh(stemGeo, stemMat);
			stem.position.set(ox, 0.38, oz);
			stem.rotation.z = rand(-0.22, 0.22);
			stem.rotation.x = rand(-0.1, 0.1);
			g.add(stem);
			const bloom = new THREE.Mesh(def.geo, bloomMat);
			bloom.scale.setScalar(rand(0.78, 1.25));
			bloom.position.set(ox, 0.82 + rand(-0.1, 0.15), oz);
			bloom.rotation.y = rand(0, Math.PI * 2);
			bloom.castShadow = true;
			g.add(bloom);
			// leaves scattered around stems
			const lf = new THREE.Mesh(leafGeo, stemMat);
			lf.position.set(ox + rand(-0.14, 0.14), 0.32, oz + rand(-0.14, 0.14));
			lf.rotation.z = rand(-1.4, -0.7);
			lf.rotation.y = rand(0, Math.PI * 2);
			g.add(lf);
		}
		g.position.copy(p);
		g.userData.interact = {
			kind: 'harvest',
			node: { item: def.item, duration: 2.0, range: 2.4, verb: 'harvesting', group: g },
		};
		scene.add(g);
		clickables.push(g);
		flowerAnchors.push({ x: p.x, y: p.y, z: p.z, color: def.color });
	}
	// base flowers on tiers 0-5
	for (const def of FLOWER_DEFS.slice(0, 4))
		scatterOnIsles(2, 4.0, 5, (p) => buildFlower(def, p));
	// tier-7 arcane flowers — Eldenmere only
	for (const def of FLOWER_DEFS.slice(4))
		scatterOnIsles(4, 4.5, 5, (p) => buildFlower(def, p), 7, 7);

	// ------------------------------------------------------------------ fishing spots
	const fishingSpots = [];
	function findWaterSpotIsle(isle, minSep) {
		const ex = isle.elongX || 1, ez = isle.elongZ || 1;
		for (let t = 0; t < 800; t++) {
			// sample in a ring tightly around the shore: 88–105% of island radius
			const a = rand(0, Math.PI * 2), r = isle.r * (0.88 + rand(0, 0.17));
			const x = isle.x + Math.cos(a) * r * ex, z = isle.z + Math.sin(a) * r * ez;
			const h = terrainHeight(x, z);
			if (h > WATER_Y + 0.3 || h < WATER_Y - 4.5) continue; // shallow water only
			let shore = false;
			for (let k = 0; k < 12; k++) {
				const aa = (k / 12) * Math.PI * 2;
				if (walkable(x + Math.cos(aa) * 3.5, z + Math.sin(aa) * 3.5)) { shore = true; break; }
			}
			if (!shore) continue;
			let ok = true;
			for (const p of fishingSpots) { const dx = p.x - x, dz = p.z - z; if (dx * dx + dz * dz < minSep * minSep) { ok = false; break; } }
			if (!ok) continue;
			return { x, z };
		}
		return null;
	}
	function buildFishingSpot(x, z) {
		const g = new THREE.Group();
		const ringMat = new THREE.MeshBasicMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
		for (let i = 0; i < 2; i++) {
			const rg = new THREE.Mesh(new THREE.RingGeometry(0.3 + i * 0.25, 0.42 + i * 0.25, 28), ringMat.clone());
			rg.rotation.x = -Math.PI / 2; rg.position.y = WATER_Y + 0.05; g.add(rg);
		}
		const bob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6),
			new THREE.MeshStandardMaterial({ color: 0xff5a4d, emissive: 0x882018, emissiveIntensity: 0.5, flatShading: true }));
		bob.position.y = WATER_Y + 0.12; g.add(bob);
		g.position.set(x, 0, z);
		g.userData.interact = { kind: 'harvest', node: { item: 'Raw Fish', duration: 3.6, range: 3.2, verb: 'fishing', group: g, water: true } };
		g.userData._rings = g.children.filter((c) => c.geometry && c.geometry.type === 'RingGeometry');
		g.userData._bob = bob;
		scene.add(g);
		clickables.push(g);
		fishingSpots.push({ x, z, group: g });
	}
	for (const isle of ISLES) {
		let placed = 0;
		for (let i = 0; i < 4; i++) { const p = findWaterSpotIsle(isle, 6); if (p) { buildFishingSpot(p.x, p.z); placed++; } }
		console.log('[fishing]', isle.name, placed, 'spots placed');
	}

	// ------------------------------------------------------------------ signpost: "ISLA PRIMA"
	function buildSignpost(isle) {
		const g = new THREE.Group();
		const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 6), trunkMat);
		post.position.y = 0.8; post.castShadow = true; g.add(post);
		const board = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 0.09), trunkMat);
		board.position.y = 1.45; board.castShadow = true; g.add(board);
		const cv = document.createElement('canvas'); cv.width = 512; cv.height = 160;
		const cx = cv.getContext('2d');
		cx.fillStyle = '#5a3d26'; cx.fillRect(0, 0, 512, 160);
		cx.strokeStyle = '#c9a76a'; cx.lineWidth = 10; cx.strokeRect(10, 10, 492, 140);
		cx.fillStyle = '#f4dfae'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
		cx.font = 'bold 58px Georgia, serif';
		cx.fillText(isle.name.toUpperCase(), 256, 66);
		cx.font = 'bold 30px Georgia, serif'; cx.fillStyle = '#d9b98a';
		cx.fillText(isle.tier === 0 ? 'a peaceful shore' : 'danger · tier ' + isle.tier, 256, 116);
		const tex = new THREE.CanvasTexture(cv);
		const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
		face.position.set(0, 1.45, 0.051); g.add(face);
		// plant it just in from the isle centre
		let px = isle.x + 3, pz = isle.z + 3;
		for (let t = 0; t < 40 && !walkable(px, pz); t++) { px = isle.x + rand(-isle.r * 0.4, isle.r * 0.4); pz = isle.z + rand(-isle.r * 0.4, isle.r * 0.4); }
		g.position.set(px, terrainHeight(px, pz), pz);
		g.rotation.y = rand(0, Math.PI * 2);
		scene.add(g);
	}
	for (const isle of ISLES) buildSignpost(isle);

	// ------------------------------------------------------------------ Eldenmere: great arcane city
	(function buildEldenmere() {
		const EX = 0, EZ = -235; // Eldenmere island center

		// --- materials ---
		const stoneMat    = new THREE.MeshStandardMaterial({ color: 0x7a7468, flatShading: true, roughness: 0.85 });
		const darkStoneMat= new THREE.MeshStandardMaterial({ color: 0x4a4040, flatShading: true, roughness: 0.9, metalness: 0.15 });
		const thatchMat   = new THREE.MeshStandardMaterial({ color: 0xc89a40, flatShading: true, roughness: 0.95 });
		const castleMat   = new THREE.MeshStandardMaterial({ color: 0x5a5050, flatShading: true, roughness: 0.9, metalness: 0.1 });
		const woodMat     = new THREE.MeshStandardMaterial({ color: 0x5a3a18, flatShading: true, roughness: 0.9 });
		const awningMat   = new THREE.MeshStandardMaterial({ color: 0x8a2020, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
		const awningBlue  = new THREE.MeshStandardMaterial({ color: 0x1a3a80, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
		const gateMat     = new THREE.MeshStandardMaterial({ color: 0x3a2810, flatShading: true, roughness: 0.85 });
		const npcMat      = new THREE.MeshStandardMaterial({ color: 0xf5c880, flatShading: true });
		const npcCloak    = new THREE.MeshStandardMaterial({ color: 0x1a2288, flatShading: true });
		const npcRobe     = new THREE.MeshStandardMaterial({ color: 0x882222, flatShading: true });
		const npcGreen    = new THREE.MeshStandardMaterial({ color: 0x224422, flatShading: true });
		const arcaneGlow  = new THREE.MeshStandardMaterial({ color: 0x6600cc, emissive: 0x6600cc, emissiveIntensity: 2.0, flatShading: true });
		const goldMat     = new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 0.7, roughness: 0.3 });
		const marbleMat   = new THREE.MeshStandardMaterial({ color: 0xddd8d0, flatShading: true, roughness: 0.5 });
		const copperMat   = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.6, roughness: 0.4 });

		function placeAt(g, x, z, yOff) {
			const y = terrainHeight(x, z) + (yOff || 0);
			g.position.set(x, y, z);
			scene.add(g);
		}

		// ---------------------------------------------------------------- house builder (no collision walls)
		function buildHouse(cx, cz, w, d, color, roofColor) {
			const g = new THREE.Group();
			const hm = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
			const rm = roofColor ? new THREE.MeshStandardMaterial({ color: roofColor, flatShading: true, roughness: 0.9 }) : thatchMat;
			const walls = new THREE.Mesh(new THREE.BoxGeometry(w, 2.8, d), hm);
			walls.position.y = 1.4; walls.castShadow = true; walls.receiveShadow = true; g.add(walls);
			// chimney
			const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), stoneMat);
			chimney.position.set(w * 0.3, 2.8 + 0.6, d * 0.2); g.add(chimney);
			// roof
			const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.0, 4), rm);
			roof.position.y = 2.8 + 1.0; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
			placeAt(g, EX + cx, EZ + cz, 0);
		}

		// ---------------------------------------------------------------- large manor builder
		function buildManor(cx, cz, w, d, h, color) {
			const g = new THREE.Group();
			const hm = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 });
			const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hm);
			body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
			// crenellations on top
			for (let i = -Math.floor(w / 2); i <= Math.floor(w / 2); i += 2) {
				const mer = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), hm);
				mer.position.set(i, h + 0.45, d / 2); g.add(mer);
				const merb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), hm);
				merb.position.set(i, h + 0.45, -d / 2); g.add(merb);
			}
			placeAt(g, EX + cx, EZ + cz, 0);
		}

		// ---------------------------------------------------------------- arcane pillar
		function buildPillar(cx, cz, h, glowColor) {
			const g = new THREE.Group();
			const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, h, 8), darkStoneMat);
			shaft.position.y = h / 2; shaft.castShadow = true; g.add(shaft);
			const cap = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 1.8 }));
			cap.position.y = h + 0.35; g.add(cap);
			const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.4, 1.1), stoneMat);
			base.position.y = 0.2; g.add(base);
			placeAt(g, EX + cx, EZ + cz, 0);
		}

		// ---------------------------------------------------------------- fountain
		function buildFountain(cx, cz) {
			const g = new THREE.Group();
			const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 0.6, 12), marbleMat);
			basin.position.y = 0.3; basin.receiveShadow = true; g.add(basin);
			const innerPool = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x2255aa, roughness: 0.1, metalness: 0.3 }));
			innerPool.position.y = 0.55; g.add(innerPool);
			const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.2, 8), marbleMat);
			column.position.y = 1.4; column.castShadow = true; g.add(column);
			const topBowl = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.8, 0.4, 10), marbleMat);
			topBowl.position.y = 2.7; g.add(topBowl);
			// arcane water glow at top
			const glow = new THREE.Mesh(new THREE.SphereGeometry(0.25, 7, 5), new THREE.MeshStandardMaterial({ color: 0x44ccff, emissive: 0x44ccff, emissiveIntensity: 2.5 }));
			glow.position.y = 3.1; g.add(glow);
			placeAt(g, EX + cx, EZ + cz, 0);
		}

		// ---------------------------------------------------------------- market stall
		function buildStall(cx, cz, angle, color) {
			const g = new THREE.Group();
			const mat = color ? new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, side: THREE.DoubleSide }) : awningMat;
			const frame = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 2.6), woodMat);
			frame.position.y = 2.0; g.add(frame);
			const awning = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.0), mat);
			awning.position.y = 2.1; awning.rotation.x = -0.3; g.add(awning);
			for (const px of [-1.8, 1.8]) {
				const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.1, 5), woodMat);
				post.position.set(px, 1.05, 0.9); g.add(post);
			}
			// counter
			const counter = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.12, 0.8), woodMat);
			counter.position.set(0, 1.1, 0.9); g.add(counter);
			g.rotation.y = angle;
			placeAt(g, EX + cx, EZ + cz, 0);
		}

		// ---------------------------------------------------------------- NPC builder
		function buildNPC(cx, cz, cloakMat, name) {
			const g = new THREE.Group();
			const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.95, 0.5), cloakMat);
			torso.position.y = 0.85; torso.castShadow = true; g.add(torso);
			const head = new THREE.Mesh(new THREE.SphereGeometry(0.30, 8, 6), npcMat);
			head.position.y = 1.7; head.castShadow = true; g.add(head);
			for (const s of [-1, 1]) {
				const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.8, 5), cloakMat);
				arm.position.set(s * 0.43, 0.88, 0); arm.rotation.z = s * 0.35; g.add(arm);
			}
			const legs = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.45), cloakMat);
			legs.position.y = 0.3; g.add(legs);
			g.userData.interact = { kind: 'npc', npc: name };
			clickables.push(g);
			placeAt(g, EX + cx, EZ + cz, 0);
		}

		// ================================================================ DISTRICT: CENTRAL PLAZA
		// Central fountain with arcane pillars around it
		buildFountain(0, 5);
		// 8 pillars in a ring around the fountain
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * Math.PI * 2;
			const colors = [0x8800ff, 0x0088ff, 0xff4400, 0x00cc88];
			buildPillar(Math.cos(a) * 7, 5 + Math.sin(a) * 7, 4.5, colors[i % 4]);
		}

		// ================================================================ DISTRICT: CASTLE QUARTER (north)
		(function buildCastle() {
			const CCX = 0, CCZ = -22;
			const cg = new THREE.Group();
			// great keep
			const keep = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 12), castleMat);
			keep.position.y = 5; keep.castShadow = true; keep.receiveShadow = true; cg.add(keep);
			// battlements along all four edges
			for (let i = -6; i <= 6; i += 2) {
				for (const z of [-6.2, 6.2]) {
					const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 1.0), castleMat);
					m.position.set(i, 10.7, z); cg.add(m);
				}
			}
			for (let i = -5; i <= 5; i += 2) {
				for (const x of [-7.2, 7.2]) {
					const m = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 1.0), castleMat);
					m.position.set(x, 10.7, i); cg.add(m);
				}
			}
			// four great towers at corners
			for (const [tx, tz] of [[-8, -7], [8, -7], [-8, 7], [8, 7]]) {
				const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.8, 13, 10), castleMat);
				tower.position.set(tx, 6.5, tz); tower.castShadow = true; cg.add(tower);
				const turret = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3.5, 10), darkStoneMat);
				turret.position.set(tx, 13.75, tz); cg.add(turret);
				// glowing orb at turret tip
				const orb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 7, 5), arcaneGlow);
				orb.position.set(tx, 15.5, tz); cg.add(orb);
			}
			// gatehouse arch (south face)
			const gateL = new THREE.Mesh(new THREE.BoxGeometry(2.5, 6, 2.5), castleMat);
			gateL.position.set(-3.5, 3, 6.4); cg.add(gateL);
			const gateR = new THREE.Mesh(new THREE.BoxGeometry(2.5, 6, 2.5), castleMat);
			gateR.position.set(3.5, 3, 6.4); cg.add(gateR);
			const lintel = new THREE.Mesh(new THREE.BoxGeometry(9, 1.0, 1.5), castleMat);
			lintel.position.set(0, 6.2, 6.4); cg.add(lintel);
			// inner courtyard floor
			const yard = new THREE.Mesh(new THREE.BoxGeometry(13, 0.15, 11), stoneMat);
			yard.position.y = 0.08; yard.receiveShadow = true; cg.add(yard);
			placeAt(cg, EX + CCX, EZ + CCZ, 0);
		})();

		// ================================================================ DISTRICT: ARCANE QUARTER (east)
		// Arcane tower (tall spire) — kept within x+20 to stay on land
		(function buildArcaneSpire() {
			const g = new THREE.Group();
			const base = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.2, 4.0, 10), darkStoneMat);
			base.position.y = 2; base.castShadow = true; g.add(base);
			const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.0, 14, 10), darkStoneMat);
			tower.position.y = 11; tower.castShadow = true; g.add(tower);
			const spire = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), castleMat);
			spire.position.y = 20.5; g.add(spire);
			for (const ry of [6, 12, 17]) {
				const ring = new THREE.Mesh(new THREE.TorusGeometry(2.5, 0.18, 6, 18), arcaneGlow);
				ring.position.y = ry; ring.rotation.x = Math.PI / 2; g.add(ring);
			}
			const apex = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshStandardMaterial({ color: 0xcc44ff, emissive: 0xcc44ff, emissiveIntensity: 3.0 }));
			apex.position.y = 23.5; g.add(apex);
			placeAt(g, EX + 18, EZ - 5, 0);
		})();
		// Arcane library
		buildManor(16, 8, 10, 8, 5, 0x3a3050);
		// Arcane study houses — pulled inward
		buildHouse(14, 18, 6, 5, 0x3a3060, 0x1a1040);
		buildHouse(22, 18, 6, 5, 0x3a3060, 0x1a1040);
		buildHouse(22, 8, 6, 5, 0x3a3060, 0x1a1040);
		// Arcane pillars along the eastern approach
		for (let i = 0; i < 4; i++) {
			buildPillar(10 + i * 3, -12 + i * 4, 5.5, 0xcc44ff);
		}
		// Arcane obelisks — kept within x+25
		for (const [ox, oz] of [[18, -15], [24, -8], [25, -18]]) {
			const g = new THREE.Group();
			const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8, 1.2), darkStoneMat);
			shaft.position.y = 4; shaft.castShadow = true; g.add(shaft);
			const tip = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 4), new THREE.MeshStandardMaterial({ color: 0x8800ff, emissive: 0x8800ff, emissiveIntensity: 1.5 }));
			tip.position.y = 9; g.add(tip);
			for (const ry of [2, 4, 6]) {
				const rune = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), arcaneGlow);
				rune.position.set(0, ry, 0); g.add(rune);
			}
			placeAt(g, EX + ox, EZ + oz, 0);
		}

		// ================================================================ DISTRICT: MARKET SQUARE (south-east of plaza)
		// Compact market — 9 stalls in 3×3 grid, all within z+10 to z+28
		const stallColors = [0x8a2020, 0x1a3a80, 0x205020, 0x7a5010];
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 3; col++) {
				buildStall(-10 + col * 9, 10 + row * 7, 0, stallColors[col % 4]);
			}
		}
		// Market square small fountain
		buildFountain(2, 22);
		// Market pillars at corners — contained within ±16, z+8 to z+28
		for (const [mx, mz] of [[-14, 8], [14, 8], [-14, 28], [14, 28]]) {
			buildPillar(mx, mz, 3.5, 0xffaa00);
		}

		// ================================================================ DISTRICT: RESIDENTIAL WEST
		// Rows of townhouses — pulled inward, max x=-30
		const westHouseColors = [0x9c7548, 0xa07850, 0xb08060, 0x957040, 0xa58060, 0x88604a, 0x7a5840];
		for (let row = 0; row < 3; row++) {
			for (let col = 0; col < 2; col++) {
				const ci = (row * 2 + col) % westHouseColors.length;
				buildHouse(-18 - col * 8, -8 + row * 11, 5.5, 4.5, westHouseColors[ci]);
			}
		}
		// West manor buildings — kept within x=-28
		buildManor(-22, 18, 9, 8, 5, 0x8a7060);
		buildManor(-16, -18, 11, 9, 6, 0x9a8070);

		// ================================================================ DISTRICT: SMITHY QUARTER (southeast of plaza)
		(function buildSmithy() {
			const g = new THREE.Group();
			const body = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 7), stoneMat);
			body.position.y = 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
			const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3.5, 1.5), darkStoneMat);
			chimney.position.set(2.5, 5.75, 1.5); chimney.castShadow = true; g.add(chimney);
			const forge = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 5), new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 2.5 }));
			forge.position.set(2.5, 7.6, 1.5); g.add(forge);
			const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x303030, metalness: 0.8, roughness: 0.3 }));
			anvil.position.set(-3.0, 0.3, 0.5); g.add(anvil);
			placeAt(g, EX + 12, EZ + 16, 0);
		})();
		// Smithy worker houses — compact row, max z+26
		for (let i = 0; i < 3; i++) {
			buildHouse(8 + i * 8, 26, 5, 4, 0x806050);
		}

		// ================================================================ DISTRICT: TEMPLE QUARTER (northwest)
		(function buildTemple() {
			const g = new THREE.Group();
			// temple steps
			for (let s = 0; s < 4; s++) {
				const step = new THREE.Mesh(new THREE.BoxGeometry(12 - s, 0.35, 10 - s), marbleMat);
				step.position.set(0, s * 0.35, 0); step.receiveShadow = true; g.add(step);
			}
			// temple body
			const body = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 8), marbleMat);
			body.position.y = 1.4 + 3; body.castShadow = true; body.receiveShadow = true; g.add(body);
			// pediment (triangular gable)
			const ped = new THREE.Mesh(new THREE.CylinderGeometry(0, 6, 3, 4), marbleMat);
			ped.position.y = 7.9; ped.rotation.y = Math.PI / 4; ped.castShadow = true; g.add(ped);
			// columns around the front
			for (let i = -4; i <= 4; i += 2) {
				const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 5.5, 8), marbleMat);
				col.position.set(i, 3.15, 4.8); col.castShadow = true; g.add(col);
			}
			// altar flame
			const altar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), marbleMat);
			altar.position.y = 1.4; g.add(altar);
			const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 7), new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xffaa00, emissiveIntensity: 3.0 }));
			flame.position.y = 2.4; g.add(flame);
			placeAt(g, EX - 18, EZ - 16, 0);
		})();
		// Temple quarter houses — max x=-28, z within -14 to +4
		for (let i = 0; i < 4; i++) {
			buildHouse(-20 - (i % 2) * 8, -14 + Math.floor(i / 2) * 12, 5, 4.5, 0xc8c0b0, 0x8a6030);
		}

		// ================================================================ DISTRICT: TAVERN (south of plaza)
		(function buildTavern() {
			const g = new THREE.Group();
			const body = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 9), new THREE.MeshStandardMaterial({ color: 0x7a4820, flatShading: true, roughness: 0.85 }));
			body.position.y = 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
			// upper half-timber floor
			const upper = new THREE.Mesh(new THREE.BoxGeometry(13, 2.5, 9.5), new THREE.MeshStandardMaterial({ color: 0x9a6030, flatShading: true, roughness: 0.85 }));
			upper.position.y = 5.25; upper.castShadow = true; g.add(upper);
			// thatched roof
			const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.2, 10.5), thatchMat);
			roof.position.y = 6.6; g.add(roof);
			const roofPeak = new THREE.Mesh(new THREE.CylinderGeometry(0, 7.5, 3, 4), thatchMat);
			roofPeak.position.y = 8.1; roofPeak.rotation.y = Math.PI / 4; roofPeak.castShadow = true; g.add(roofPeak);
			// sign post
			const sign = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.1), woodMat);
			sign.position.set(0, 3.5, 4.85); g.add(sign);
			// lanterns flanking door
			for (const sx of [-1, 1]) {
				const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffcc44, emissiveIntensity: 2.0 }));
				lantern.position.set(sx * 2.2, 2.6, 4.6); g.add(lantern);
			}
			placeAt(g, EX - 2, EZ + 14, 0);
		})();

		// ================================================================ DISTRICT: HARBOR (south of plaza, compact)
		(function buildHarbor() {
			// dock planks — moved to z+28 to z+36 range, safely on land
			for (let i = 0; i < 4; i++) {
				const plank = new THREE.Mesh(new THREE.BoxGeometry(3, 0.25, 8), woodMat);
				plank.position.y = 0.12; plank.receiveShadow = true;
				placeAt(plank, EX - 7 + i * 3, EZ + 32, 0);
			}
			// dock posts
			for (const [px, pz] of [[-8, 30], [-8, 36], [4, 30], [4, 36]]) {
				const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 2.5, 6), woodMat);
				post.position.y = 1.25;
				placeAt(post, EX + px, EZ + pz, 0);
			}
			// harbor warehouse — z+38, well inside island
			const wh = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 7), new THREE.MeshStandardMaterial({ color: 0x6a5030, flatShading: true }));
			wh.position.y = 2.0; wh.castShadow = true;
			placeAt(wh, EX - 2, EZ + 38, 0);
		})();

		// ================================================================ NPCs distributed around town
		buildNPC(1, 10, npcCloak, 'herald');        // herald near plaza
		buildNPC(-2, -6, npcRobe, 'arcane_scholar'); // arcane quarter scholar
		buildNPC(8, 18, npcGreen, 'merchant');      // market merchant
		buildNPC(-16, -16, npcMat, 'priest');       // temple priest
		buildNPC(10, 20, woodMat, 'blacksmith');    // smithy blacksmith

		// ================================================================ Scattered decorative elements
		// Benches around the plaza
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2;
			const g = new THREE.Group();
			const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.22, 0.55), woodMat);
			bench.position.y = 0.55;
			g.add(bench);
			for (const bx of [-0.7, 0.7]) {
				const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.5), woodMat);
				leg.position.set(bx, 0.28, 0); g.add(leg);
			}
			g.rotation.y = a;
			placeAt(g, EX + Math.cos(a) * 11, EZ + 5 + Math.sin(a) * 11, 0);
		}
		// Barrels near the tavern
		for (let i = 0; i < 4; i++) {
			const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.42, 0.9, 8), woodMat);
			barrel.position.y = 0.45;
			placeAt(barrel, EX - 6 + i * 1.2, EZ + 13, 0);
		}
		// Crates in the market
		for (let i = 0; i < 5; i++) {
			const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), woodMat);
			crate.position.y = 0.45; crate.castShadow = true;
			placeAt(crate, EX - 12 + i * 4, EZ + 14, 0);
		}
		// Lamp posts along main road
		for (let i = -3; i <= 3; i++) {
			const g = new THREE.Group();
			const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6), darkStoneMat);
			pole.position.y = 2.25; g.add(pole);
			const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), new THREE.MeshStandardMaterial({ color: 0xffe080, emissive: 0xffe080, emissiveIntensity: 2.5 }));
			lamp.position.y = 4.7; g.add(lamp);
			placeAt(g, EX + 8, EZ + i * 8, 0); // east road
			const g2 = new THREE.Group();
			const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.5, 6), darkStoneMat);
			pole2.position.y = 2.25; g2.add(pole2);
			const lamp2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 7, 5), new THREE.MeshStandardMaterial({ color: 0xffe080, emissive: 0xffe080, emissiveIntensity: 2.5 }));
			lamp2.position.y = 4.7; g2.add(lamp2);
			placeAt(g2, EX - 8, EZ + i * 8, 0); // west road
		}

	})(); // end buildEldenmere

	// ------------------------------------------------------------------ fireflies / dust motes
	const FIREFLY_N = 120;
	const ffGeo = new THREE.BufferGeometry();
	const ffPos = new Float32Array(FIREFLY_N * 3);
	const ffBase = new Float32Array(FIREFLY_N * 3);
	const ffPhase = new Float32Array(FIREFLY_N);
	for (let i = 0; i < FIREFLY_N; i++) {
		const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * (ISLAND_R - 4);
		const x = Math.cos(a) * r, z = Math.sin(a) * r;
		const y = Math.max(terrainHeight(x, z), WATER_Y) + rand(0.8, 3.2);
		ffBase[i * 3] = x; ffBase[i * 3 + 1] = y; ffBase[i * 3 + 2] = z;
		ffPhase[i] = rand(0, Math.PI * 2);
	}
	ffPos.set(ffBase);
	ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
	function glowTexture(inner, outer) {
		const cv = document.createElement('canvas'); cv.width = cv.height = 64;
		const cx = cv.getContext('2d');
		const gr = cx.createRadialGradient(32, 32, 2, 32, 32, 30);
		gr.addColorStop(0, inner); gr.addColorStop(0.4, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
		cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
		return new THREE.CanvasTexture(cv);
	}
	const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({
		size: 0.5, map: glowTexture('rgba(255,255,210,1)', 'rgba(180,255,120,0.55)'),
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
	}));
	scene.add(fireflies);

	// sparkles drifting around each flower cluster
	const SPARK_PER = 3;
	const sparkN = flowerAnchors.length * SPARK_PER;
	const spGeo = new THREE.BufferGeometry();
	const spPos = new Float32Array(sparkN * 3);
	const spAnchor = new Float32Array(sparkN * 3);
	const spPhase = new Float32Array(sparkN);
	flowerAnchors.forEach((a, fi) => {
		for (let k = 0; k < SPARK_PER; k++) {
			const i = fi * SPARK_PER + k;
			spAnchor[i * 3] = a.x; spAnchor[i * 3 + 1] = a.y; spAnchor[i * 3 + 2] = a.z;
			spPhase[i] = rand(0, Math.PI * 2);
		}
	});
	spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
	const sparkles = new THREE.Points(spGeo, new THREE.PointsMaterial({
		size: 0.28, map: glowTexture('rgba(255,255,255,1)', 'rgba(160,220,255,0.6)'),
		transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
	}));
	scene.add(sparkles);

	// ------------------------------------------------------------------ items & recipes
	const ITEMS = {
		// ---- gathered materials ----
		'Red Rose':         { icon: '🌹', type: 'material', desc: 'A fragrant crimson bloom.' },
		'Blue Star Flower': { icon: '🔹', type: 'material', desc: 'A glowing azure wildflower.' },
		'Chrysanthemum':    { icon: '🌼', type: 'material', desc: 'A cheerful golden bloom.' },
		'Lilac':            { icon: '🌷', type: 'material', desc: 'A purple bloom used in essences.' },
		'Wood Log':         { icon: '🪵', type: 'material', desc: 'Sturdy timber, chopped from a tree.' },
		'Iron Ore':         { icon: '🪨', type: 'material', desc: 'Raw ore — smelt it into iron bars.' },
		'Coal':             { icon: '⚫', type: 'material', desc: 'Fuel for forging steel.' },
		'Silver Ore':       { icon: '⚪', type: 'material', desc: 'Pale ore — smelt into silver bars.' },
		'Sulphur':          { icon: '🟡', type: 'material', desc: 'Brimstone, key to fire essence.' },
		'Rabbit Fur':       { icon: '🐇', type: 'material', desc: 'Soft white pelt.' },
		'Raw Meat':         { icon: '🍖', type: 'food', heal: 6,   desc: 'Click to eat · restores 6 HP.' },
		'Cooked Meat':      { icon: '🥩', type: 'food', heal: 22,  desc: 'Click to eat · restores 22 HP.' },
		'Minor Health Potion': { icon: '🧪', type: 'food', heal: 40,  desc: 'Click to drink · restores 40 HP.' },
		'Health Potion':    { icon: '⚗️', type: 'food', heal: 80,  desc: 'Click to drink · restores 80 HP.' },
		'Greater Health Potion': { icon: '💊', type: 'food', heal: 150, desc: 'Click to drink · restores 150 HP.' },
		'Bones':            { icon: '🦴', type: 'material', desc: 'Useful for weapons and armor.' },
		'Beaver Fur':       { icon: '🦫', type: 'material', desc: 'Dense, water-resistant fur.' },
		'Deer Fur':         { icon: '🟤', type: 'material', desc: 'Warm tawny hide — tan it into leather.' },
		'Deer Antlers':     { icon: '🦌', type: 'material', desc: 'Branching antlers.' },
		'Wolf Fur':         { icon: '🐺', type: 'material', desc: 'Coarse grey pelt.' },
		'Boar Tusk':        { icon: '🦷', type: 'material', desc: 'A sharp curved tusk.' },
		'Fox Pelt':         { icon: '🦊', type: 'material', desc: 'Fine russet fur.' },
		'Bear Pelt':        { icon: '🐻', type: 'material', desc: 'Thick, heavy hide.' },
		'Bear Claw':        { icon: '🐾', type: 'material', desc: 'A wicked curved claw.' },
		'Raw Fish':         { icon: '🐟', type: 'food', heal: 8, desc: 'Click to eat · restores 8 HP.' },
		'Fish Scales':      { icon: '🐠', type: 'material', desc: 'Iridescent overlapping scales.' },
		'Dire Pelt':        { icon: '🐕', type: 'material', desc: 'The rugged hide of a direwolf.' },
		'Spider Silk':      { icon: '🕸️', type: 'material', desc: 'Impossibly strong spider silk.' },
		'Venom Gland':      { icon: '🧪', type: 'material', desc: 'Dripping with potent venom.' },
		'Troll Hide':       { icon: '🟢', type: 'material', desc: 'Rubbery, near-impervious hide.' },
		'Wyvern Scale':     { icon: '🐲', type: 'material', desc: 'A gleaming, fireproof scale.' },
		'Golem Core':       { icon: '💠', type: 'material', desc: 'A humming heart of living stone.' },
		'Dragon Scale':     { icon: '🔴', type: 'material', desc: 'An enormous scale, harder than steel.' },
		'Dragon Fang':      { icon: '🦷', type: 'material', desc: 'A razor-sharp tooth from the great wyrm.' },
		'Dragon Heart':     { icon: '❤️‍🔥', type: 'material', desc: 'Still warm — thrums with primal power.' },
		'Dragon Bone':      { icon: '🦴', type: 'material', desc: 'Dense bone that glows faintly red.' },
		'Quartz Ore':       { icon: '💜', type: 'material', desc: 'A violet crystal ore.' },
		'Gold Ore':         { icon: '🌕', type: 'material', desc: 'Rich golden ore — smelt into gold bars.' },
		'Titanium Ore':     { icon: '🔷', type: 'material', desc: 'Heavy blue-grey ore from the deepest islands.' },
		// ---- crafted reagents (intermediate) ----
		'Fire Essence':     { icon: '🔥', type: 'reagent', desc: 'Bottled flame — smelts ores into bars.' },
		'Tanned Leather':   { icon: '🟫', type: 'reagent', desc: 'Cured hide, ready for armor.' },
		'Iron Bar':         { icon: '🔩', type: 'reagent', desc: 'Refined iron for smithing.' },
		'Steel Bar':        { icon: '⚙️', type: 'reagent', desc: 'Tough steel for master gear.' },
		'Silver Bar':       { icon: '🥈', type: 'reagent', desc: 'Bright silver for fine weapons.' },
		'Quartz Crystal':   { icon: '🔮', type: 'reagent', desc: 'A purified quartz gem, thrumming with magic.' },
		'Gold Bar':         { icon: '🟡', type: 'reagent', desc: 'A gleaming gold ingot for fine jewelry.' },
		'Titanium Bar':     { icon: '🔩', type: 'reagent', desc: 'A dense titanium ingot — lighter and stronger than steel.' },
		// ---- weapons ----
		'Wooden Staff':     { icon: '🪄', type: 'weapon', atk: 2,  desc: 'A simple focus staff.' },
		'Bone Dagger':      { icon: '🔪', type: 'weapon', atk: 3,  desc: 'A jagged bone blade.' },
		"Hunter's Bow":     { icon: '🏹', type: 'weapon', atk: 5,  desc: 'A supple hunting bow.' },
		'Iron Sword':       { icon: '⚔️', type: 'weapon', atk: 6,  desc: 'A dependable iron blade.' },
		'Boar Spear':       { icon: '🔱', type: 'weapon', atk: 7,  desc: 'Tusk-tipped hunting spear.' },
		'War Hammer':       { icon: '🔨', type: 'weapon', atk: 9,  desc: 'A crushing two-hand maul.' },
		'Silver Rapier':    { icon: '🗡️', type: 'weapon', atk: 10, desc: 'A swift, gleaming silver blade.' },
		'Steel Greatsword': { icon: '⚔️', type: 'weapon', atk: 12, desc: 'A mighty forged greatsword.' },
		'Venom Dagger':     { icon: '🔪', type: 'weapon', atk: 13, desc: 'A blade slick with venom.' },
		'Troll Club':       { icon: '🏏', type: 'weapon', atk: 15, desc: 'A brutal, hide-wrapped club.' },
		'Wyvern Glaive':    { icon: '🔱', type: 'weapon', atk: 17, desc: 'A glaive edged in wyvern scale.' },
		'Golemforged Blade':{ icon: '⚔️', type: 'weapon', atk: 21, desc: 'A blade humming with earth-magic.' },
		'Titanium Sword':   { icon: '🗡️', type: 'weapon', atk: 22, desc: 'A razor-thin blade of pure titanium — incredibly light.' },
		'Dragonbone Sword': { icon: '🗡️', type: 'weapon', atk: 35, desc: 'A massive blade forged from a dragon\'s own bones.' },
		// ---- shields (new slot) ----
		'Wooden Shield':    { icon: '🛡️', type: 'shield', def: 2,  desc: 'A round plank shield.' },
		'Iron Shield':      { icon: '🛡️', type: 'shield', def: 4,  desc: 'A banded iron shield.' },
		'Steel Shield':     { icon: '🛡️', type: 'shield', def: 6,  desc: 'A heavy steel kite shield.' },
		'Troll Shield':     { icon: '🛡️', type: 'shield', def: 9,  desc: 'A vast shield of troll hide.' },
		'Titanium Shield':  { icon: '🛡️', type: 'shield', def: 12, desc: 'A lightweight but incredibly tough titanium buckler.' },
		'Dragon Scale Shield': { icon: '🛡️', type: 'shield', def: 18, desc: 'A buckler of dragon-scale, nearly impenetrable.' },
		// ---- helms ----
		'Flower Crown':     { icon: '👑', type: 'helm',   def: 1,  desc: 'A pretty woven circlet.' },
		'Antler Helm':      { icon: '🪖', type: 'helm',   def: 2,  desc: 'A helm crowned with antlers.' },
		'Iron Helm':        { icon: '⛑️', type: 'helm',   def: 3,  desc: 'A solid iron helmet.' },
		'Wolf Skull Helm':  { icon: '💀', type: 'helm',   def: 4,  desc: 'A fearsome fanged helm.' },
		'Steel Helm':       { icon: '⛑️', type: 'helm',   def: 6,  desc: 'A visored steel great-helm.' },
		'Wyvern Helm':      { icon: '🐲', type: 'helm',   def: 8,  desc: 'A horned helm of wyvern scale.' },
		'Titanium Helm':    { icon: '⛑️', type: 'helm',   def: 12, desc: 'A sleek titanium helmet with excellent coverage.' },
		'Dragon Skull Helm':{ icon: '💀', type: 'helm',   def: 16, desc: 'The skull of a slain dragon, worn as a helm.' },
		// ---- body armor ----
		'Fur Cloak':        { icon: '🧥', type: 'armor',  def: 2,  desc: 'A warm layered cloak.' },
		'Leather Armor':    { icon: '🦺', type: 'armor',  def: 4,  desc: 'Hardened leather cuirass.' },
		'Scale Mail':       { icon: '🐠', type: 'armor',  def: 6,  desc: 'Overlapping scale armor.' },
		'Iron Plate':       { icon: '🛡️', type: 'armor',  def: 8,  desc: 'Heavy plated cuirass.' },
		'Steel Cuirass':    { icon: '🛡️', type: 'armor',  def: 11, desc: 'A master-forged steel cuirass.' },
		'Wyvern Hauberk':   { icon: '🐲', type: 'armor',  def: 14, desc: 'Scale hauberk, light and strong.' },
		'Golem Plate':      { icon: '💠', type: 'armor',  def: 18, desc: 'Armor of living golem-stone.' },
		'Titanium Plate':   { icon: '🔷', type: 'armor',  def: 22, desc: 'Razor-thin but incredibly tough titanium plate.' },
		'Dragon Scale Hauberk': { icon: '🔴', type: 'armor',  def: 30, desc: 'Full hauberk of overlapping dragon scales.' },
		// ---- cuisses (thigh armor, new slot) ----
		'Leather Cuisses':  { icon: '👖', type: 'cuisses', def: 2, desc: 'Padded leather thigh guards.' },
		'Iron Cuisses':     { icon: '👖', type: 'cuisses', def: 4, desc: 'Iron-plated cuisses.' },
		'Steel Cuisses':    { icon: '👖', type: 'cuisses', def: 7, desc: 'Steel cuisses for the thighs.' },
		'Titanium Cuisses': { icon: '👖', type: 'cuisses', def: 10, desc: 'Titanium thigh plates — barely any weight.' },
		'Dragon Bone Cuisses': { icon: '👖', type: 'cuisses', def: 14, desc: 'Cuisses reinforced with dragonbone.' },
		// ---- greaves (shin armor, new slot) ----
		'Leather Greaves':  { icon: '🥾', type: 'greaves', def: 2, desc: 'Leather shin wraps.' },
		'Iron Greaves':     { icon: '🥾', type: 'greaves', def: 3, desc: 'Iron greaves for the shins.' },
		'Steel Greaves':    { icon: '🥾', type: 'greaves', def: 6, desc: 'Steel greaves, near-impenetrable.' },
		'Titanium Greaves':  { icon: '🥾', type: 'greaves', def: 9, desc: 'Titanium shin guards, light as feathers.' },
		'Dragon Bone Greaves': { icon: '🥾', type: 'greaves', def: 12, desc: 'Greaves carved from dragonbone.' },
		// ---- medallions ----
		'Silver Medallion': { icon: '🏅', type: 'medallion', def: 3, atk: 1, desc: 'A silver disc on a chain. +3 DEF, +1 ATK.' },
		'Quartz Medallion': { icon: '🔮', type: 'medallion', def: 5, atk: 2, desc: 'A glowing quartz pendant. +5 DEF, +2 ATK.' },
		'Gold Medallion':   { icon: '🥇', type: 'medallion', def: 8, atk: 3, desc: 'A heavy golden medallion. +8 DEF, +3 ATK.' },
		'Dragon Heart Medallion': { icon: '❤️‍🔥', type: 'medallion', def: 15, atk: 8, desc: 'A still-burning dragon heart, worn as a talisman. +15 DEF, +8 ATK.' },
		// ---- rings ----
		'Iron Ring':        { icon: '💍', type: 'ring', atk: 1, desc: 'A plain iron band. +1 ATK.' },
		'Silver Ring':      { icon: '💍', type: 'ring', atk: 2, def: 1, desc: 'A fine silver ring. +2 ATK, +1 DEF.' },
		'Quartz Ring':      { icon: '💍', type: 'ring', atk: 3, def: 2, desc: 'A ring set with a quartz gem. +3 ATK, +2 DEF.' },
		'Gold Ring':        { icon: '💍', type: 'ring', atk: 4, def: 3, desc: 'A heavy gold ring. +4 ATK, +3 DEF.' },
		'Dragon Fang Ring': { icon: '💍', type: 'ring', atk: 10, def: 5, desc: 'A ring carved from a dragon fang. +10 ATK, +5 DEF.' },
		// ---- Eldenmere tier-6 gathered materials ----
		'Moonbloom':        { icon: '🌙', type: 'material', desc: 'A luminous flower that glows like the moon.' },
		'Voidpetal':        { icon: '🌑', type: 'material', desc: 'A dark blossom from beyond the veil.' },
		'Sunfire Lily':     { icon: '🔆', type: 'material', desc: 'A blazing lily that burns cold to the touch.' },
		'Starbloom':        { icon: '⭐', type: 'material', desc: 'A silver flower that hums with celestial energy.' },
		'Aether Crystal':   { icon: '💎', type: 'material', desc: 'A crackling cyan crystal suffused with pure aether.' },
		'Voidstone':        { icon: '🌑', type: 'material', desc: 'A fragment of solid void — drinks in light.' },
		'Starstone':        { icon: '✨', type: 'material', desc: 'A glittering stone forged inside a dying star.' },
		// ---- Eldenmere tier-6 creature drops ----
		'Shadow Essence':   { icon: '🌫️', type: 'material', desc: 'The remnant of a shadow wraith — cold and insubstantial.' },
		'Void Fang':        { icon: '🦷', type: 'material', desc: 'A crystalline tooth from a void stalker.' },
		'Ancient Core':     { icon: '🔵', type: 'material', desc: 'The beating heart of an ancient golem.' },
		'Ether Shard':      { icon: '🔹', type: 'material', desc: 'A razor sliver of solidified ether.' },
		// ---- Eldenmere tier-6 crafted reagents ----
		'Aether Bar':       { icon: '🔷', type: 'reagent', desc: 'A bar of smelted aether crystal — pulsing with energy.' },
		'Void Ingot':       { icon: '⬛', type: 'reagent', desc: 'Compressed voidstone, darker than night.' },
		'Star Alloy':       { icon: '🌟', type: 'reagent', desc: 'A glowing alloy of starstone and aether.' },
		// ---- Eldenmere tier-6 weapons ----
		'Aether Blade':     { icon: '⚔️', type: 'weapon', atk: 45, desc: 'A crackling blade of pure aether energy. +45 ATK.' },
		'Void Scythe':      { icon: '🗡️', type: 'weapon', atk: 52, desc: 'A scythe that cleaves through reality itself. +52 ATK.' },
		'Starforged Warblade': { icon: '⚔️', type: 'weapon', atk: 60, desc: 'A blade hammered from the heart of a star. +60 ATK.' },
		// ---- Eldenmere tier-6 shields ----
		'Aether Ward':      { icon: '🛡️', type: 'shield', def: 25, desc: 'A shield of crystallized aether. +25 DEF.' },
		'Void Bulwark':     { icon: '🛡️', type: 'shield', def: 32, desc: 'A buckler of solid void, immune to force. +32 DEF.' },
		// ---- Eldenmere tier-6 helms ----
		'Aether Crown':     { icon: '👑', type: 'helm', def: 22, desc: 'A crown of living aether. +22 DEF.' },
		'Void Helm':        { icon: '💀', type: 'helm', def: 28, desc: 'A helm that phases between worlds. +28 DEF.' },
		// ---- Eldenmere tier-6 body armor ----
		'Aether Vestment':  { icon: '🧥', type: 'armor', def: 38, desc: 'Robes woven from pure aetheric energy. +38 DEF.' },
		'Void Plate':       { icon: '🛡️', type: 'armor', def: 50, desc: 'Armor of compressed void that absorbs all force. +50 DEF.' },
		// ---- Eldenmere tier-6 cuisses ----
		'Aether Cuisses':   { icon: '👖', type: 'cuisses', def: 18, desc: 'Aether-infused thigh guards. +18 DEF.' },
		// ---- Eldenmere tier-6 greaves ----
		'Aether Greaves':   { icon: '🥾', type: 'greaves', def: 16, desc: 'Aether-reinforced shin guards. +16 DEF.' },
		// ---- Eldenmere tier-6 medallions & rings ----
		'Starstone Medallion': { icon: '🏅', type: 'medallion', def: 25, atk: 15, desc: 'A medallion of starstone. +25 DEF, +15 ATK.' },
		'Void Ring':        { icon: '💍', type: 'ring', atk: 18, def: 10, desc: 'A ring of void crystal. +18 ATK, +10 DEF.' },
		// ---- Flower-brewed elixirs (consumables) ----
		'Moonbloom Draught':    { icon: '🌙', type: 'food', heal: 60,                                         desc: 'Click to drink · restores 60 HP.' },
		'Sunfire Tonic':        { icon: '🔆', type: 'food', heal: 0,   atkBuff: 8,  buffDur: 60,              desc: 'Click to drink · grants +8 ATK for 60 seconds.' },
		'Void Elixir':          { icon: '🌑', type: 'food', heal: 0,   defBuff: 10, buffDur: 60,              desc: 'Click to drink · grants +10 DEF for 60 seconds.' },
		'Starbloom Brew':       { icon: '⭐', type: 'food', heal: 45,  atkBuff: 5,  buffDur: 45,              desc: 'Click to drink · restores 45 HP and grants +5 ATK for 45 seconds.' },
		'Moonbloom Salve':      { icon: '🌛', type: 'food', heal: 0,   hotHeal: 120, hotDur: 30,              desc: 'Click to drink · restores 120 HP over 30 seconds.' },
		'Solar Draught':        { icon: '☀️', type: 'food', heal: 0,   atkBuff: 15, buffDur: 45,              desc: 'Click to drink · grants +15 ATK for 45 seconds.' },
		'Void Shroud':          { icon: '🌒', type: 'food', heal: 0,   defBuff: 18, dmgReduce: 0.10, buffDur: 45, desc: 'Click to drink · grants +18 DEF and reduces damage taken by 10% for 45 seconds.' },
		'Celestial Brew':       { icon: '🌠', type: 'food', heal: 80,  atkBuff: 10, defBuff: 8, buffDur: 45, desc: 'Click to drink · restores 80 HP and grants +10 ATK +8 DEF for 45 seconds.' },
		// ---- Enriched crafting reagent ----
		'Enriched Fire Essence': { icon: '🔥', type: 'reagent', desc: 'A Fire Essence suffused with rare energy. Required for legendary crafting.' },
		// ---- Drops from Eldenmere legendary creatures (used only in Legendary Forge) ----
		'Infernal Ember':  { icon: '🔴', type: 'reagent', desc: 'A smoldering ember torn from an Infernal Titan. Required for legendary forging.' },
		'Void Relic':      { icon: '🟣', type: 'reagent', desc: 'A crystallised void shard from a Void Colossus. Required for legendary forging.' },
		// ---- Legendary Arcane Forge items (crafted with Enriched Fire Essence) ----
		'Emberforged Blade':      { icon: '⚔️', type: 'weapon', atk: 75, desc: 'A legendary blade tempered with Enriched Fire Essence. +75 ATK.' },
		'Phoenixweave Vestment':  { icon: '🧥', type: 'armor', def: 65, desc: 'Legendary robes woven through molten essence. +65 DEF.' },
		'Embercrown':             { icon: '👑', type: 'helm', def: 40, atk: 10, desc: 'A helm glowing with enriched fire. +40 DEF, +10 ATK.' },
		'Infernoplate':           { icon: '🛡️', type: 'armor', def: 80, desc: 'Legendary armor radiating infernal heat. +80 DEF.' },
		'Volcanic Warblade':      { icon: '⚔️', type: 'weapon', atk: 90, desc: 'A blade erupting with volcanic power. +90 ATK.' },
		'Emberveil Ring':         { icon: '💍', type: 'ring', atk: 25, def: 15, desc: 'A ring shimmering with enriched fire. +25 ATK, +15 DEF.' },
	};
	// rate = base success chance (raised by your Manufacture skill).  tier groups the book.
	const RECIPES = [
		// --- reagents (the crafting chain) ---
		{ out: 'Fire Essence',   req: { 'Sulphur': 2, 'Red Rose': 1, 'Lilac': 1 },       tag: 'reagent', rate: 0.85, tier: 'Reagents' },
		{ out: 'Tanned Leather', req: { 'Deer Fur': 2 },                                  tag: 'reagent', rate: 0.90, tier: 'Reagents' },
		{ out: 'Iron Bar',       req: { 'Iron Ore': 2, 'Coal': 1, 'Fire Essence': 1 },     tag: 'reagent', rate: 0.85, tier: 'Reagents' },
		{ out: 'Silver Bar',     req: { 'Silver Ore': 2, 'Fire Essence': 1 },             tag: 'reagent', rate: 0.80, tier: 'Reagents' },
		{ out: 'Steel Bar',      req: { 'Iron Bar': 2, 'Coal': 1, 'Fire Essence': 1 },    tag: 'reagent', rate: 0.72, tier: 'Reagents' },
		{ out: 'Quartz Crystal', req: { 'Quartz Ore': 2, 'Fire Essence': 1 },             tag: 'reagent', rate: 0.78, tier: 'Reagents' },
		{ out: 'Gold Bar',       req: { 'Gold Ore': 2, 'Fire Essence': 1 },               tag: 'reagent', rate: 0.75, tier: 'Reagents' },
		// --- consumables ---
		{ out: 'Cooked Meat',          req: { 'Raw Meat': 1, 'Fire Essence': 1 },                              tag: '+22 HP',  rate: 0.95, tier: 'Consumables' },
		{ out: 'Minor Health Potion',  req: { 'Red Rose': 2, 'Blue Star Flower': 1 },                          tag: '+40 HP',  rate: 0.85, tier: 'Consumables' },
		{ out: 'Health Potion',        req: { 'Red Rose': 3, 'Chrysanthemum': 2, 'Fire Essence': 1 },          tag: '+80 HP',  rate: 0.70, tier: 'Consumables' },
		{ out: 'Greater Health Potion',req: { 'Dragon Scale': 1, 'Gold Bar': 1, 'Fire Essence': 2 },           tag: '+150 HP', rate: 0.55, tier: 'Consumables' },
		// --- weapons ---
		{ out: 'Wooden Staff',     req: { 'Wood Log': 2, 'Blue Star Flower': 1 },         tag: '+2 ATK',  rate: 0.92, tier: 'Weapons' },
		{ out: 'Bone Dagger',      req: { 'Bones': 2, 'Wood Log': 1 },                    tag: '+3 ATK',  rate: 0.88, tier: 'Weapons' },
		{ out: "Hunter's Bow",     req: { 'Wood Log': 2, 'Deer Antlers': 1, 'Spider Silk': 1 }, tag: '+5 ATK', rate: 0.72, tier: 'Weapons' },
		{ out: 'Iron Sword',       req: { 'Iron Bar': 2, 'Wood Log': 1 },                 tag: '+6 ATK',  rate: 0.78, tier: 'Weapons' },
		{ out: 'Boar Spear',       req: { 'Iron Bar': 1, 'Boar Tusk': 2, 'Wood Log': 1 }, tag: '+7 ATK',  rate: 0.70, tier: 'Weapons' },
		{ out: 'War Hammer',       req: { 'Iron Bar': 3, 'Wood Log': 1 },                 tag: '+9 ATK',  rate: 0.62, tier: 'Weapons' },
		{ out: 'Silver Rapier',    req: { 'Silver Bar': 2, 'Iron Bar': 1 },               tag: '+10 ATK', rate: 0.58, tier: 'Weapons' },
		{ out: 'Steel Greatsword', req: { 'Steel Bar': 3, 'Tanned Leather': 1 },          tag: '+12 ATK', rate: 0.52, tier: 'Weapons' },
		{ out: 'Venom Dagger',     req: { 'Steel Bar': 1, 'Venom Gland': 2 },             tag: '+13 ATK', rate: 0.48, tier: 'Weapons' },
		{ out: 'Troll Club',       req: { 'Steel Bar': 2, 'Troll Hide': 1, 'Wood Log': 2 }, tag: '+15 ATK', rate: 0.42, tier: 'Weapons' },
		{ out: 'Wyvern Glaive',    req: { 'Steel Bar': 2, 'Wyvern Scale': 2 },            tag: '+17 ATK', rate: 0.38, tier: 'Weapons' },
		{ out: 'Golemforged Blade',req: { 'Steel Bar': 2, 'Silver Bar': 1, 'Golem Core': 1 }, tag: '+21 ATK', rate: 0.32, tier: 'Weapons' },
		// --- shields ---
		{ out: 'Wooden Shield',    req: { 'Wood Log': 3 },                                tag: '+2 DEF',  rate: 0.90, tier: 'Shields' },
		{ out: 'Iron Shield',      req: { 'Iron Bar': 3 },                                tag: '+4 DEF',  rate: 0.66, tier: 'Shields' },
		{ out: 'Steel Shield',     req: { 'Steel Bar': 3, 'Silver Bar': 1 },              tag: '+6 DEF',  rate: 0.50, tier: 'Shields' },
		{ out: 'Troll Shield',     req: { 'Steel Bar': 2, 'Troll Hide': 2 },              tag: '+9 DEF',  rate: 0.38, tier: 'Shields' },
		// --- helms ---
		{ out: 'Flower Crown',     req: { 'Red Rose': 1, 'Blue Star Flower': 1, 'Chrysanthemum': 1 }, tag: '+1 DEF', rate: 0.95, tier: 'Helms' },
		{ out: 'Antler Helm',      req: { 'Deer Antlers': 1, 'Beaver Fur': 1 },           tag: '+2 DEF',  rate: 0.80, tier: 'Helms' },
		{ out: 'Iron Helm',        req: { 'Iron Bar': 2, 'Tanned Leather': 1 },           tag: '+3 DEF',  rate: 0.70, tier: 'Helms' },
		{ out: 'Wolf Skull Helm',  req: { 'Wolf Fur': 2, 'Bones': 1, 'Bear Claw': 1 },    tag: '+4 DEF',  rate: 0.55, tier: 'Helms' },
		{ out: 'Steel Helm',       req: { 'Steel Bar': 2, 'Tanned Leather': 1 },          tag: '+6 DEF',  rate: 0.48, tier: 'Helms' },
		{ out: 'Wyvern Helm',      req: { 'Steel Bar': 1, 'Wyvern Scale': 2 },            tag: '+8 DEF',  rate: 0.40, tier: 'Helms' },
		// --- body armor ---
		{ out: 'Fur Cloak',        req: { 'Rabbit Fur': 2, 'Fox Pelt': 1 },               tag: '+2 DEF',  rate: 0.90, tier: 'Body Armor' },
		{ out: 'Leather Armor',    req: { 'Tanned Leather': 2, 'Bones': 1 },              tag: '+4 DEF',  rate: 0.78, tier: 'Body Armor' },
		{ out: 'Scale Mail',       req: { 'Fish Scales': 4, 'Iron Bar': 1 },              tag: '+6 DEF',  rate: 0.62, tier: 'Body Armor' },
		{ out: 'Iron Plate',       req: { 'Iron Bar': 5, 'Tanned Leather': 2 },           tag: '+8 DEF',  rate: 0.48, tier: 'Body Armor' },
		{ out: 'Steel Cuirass',    req: { 'Steel Bar': 4, 'Tanned Leather': 2 },          tag: '+11 DEF', rate: 0.40, tier: 'Body Armor' },
		{ out: 'Wyvern Hauberk',   req: { 'Steel Bar': 2, 'Wyvern Scale': 3 },            tag: '+14 DEF', rate: 0.34, tier: 'Body Armor' },
		{ out: 'Golem Plate',      req: { 'Steel Bar': 3, 'Golem Core': 2 },              tag: '+18 DEF', rate: 0.28, tier: 'Body Armor' },
		// --- cuisses ---
		{ out: 'Leather Cuisses',  req: { 'Tanned Leather': 2 },                          tag: '+2 DEF',  rate: 0.82, tier: 'Cuisses' },
		{ out: 'Iron Cuisses',     req: { 'Iron Bar': 3, 'Tanned Leather': 1 },           tag: '+4 DEF',  rate: 0.62, tier: 'Cuisses' },
		{ out: 'Steel Cuisses',    req: { 'Steel Bar': 2, 'Tanned Leather': 2 },          tag: '+7 DEF',  rate: 0.44, tier: 'Cuisses' },
		// --- greaves ---
		{ out: 'Leather Greaves',  req: { 'Tanned Leather': 1, 'Bones': 1 },              tag: '+2 DEF',  rate: 0.82, tier: 'Greaves' },
		{ out: 'Iron Greaves',     req: { 'Iron Bar': 2 },                                tag: '+3 DEF',  rate: 0.62, tier: 'Greaves' },
		{ out: 'Steel Greaves',    req: { 'Steel Bar': 2, 'Coal': 1 },                    tag: '+6 DEF',  rate: 0.44, tier: 'Greaves' },
		// --- medallions ---
		{ out: 'Silver Medallion', req: { 'Silver Bar': 2, 'Fish Scales': 2 },                      tag: '+3 DEF +1 ATK', rate: 0.72, tier: 'Medallions' },
		{ out: 'Quartz Medallion', req: { 'Quartz Crystal': 2, 'Silver Bar': 1 },                   tag: '+5 DEF +2 ATK', rate: 0.60, tier: 'Medallions' },
		{ out: 'Gold Medallion',   req: { 'Gold Bar': 2, 'Quartz Crystal': 1 },                     tag: '+8 DEF +3 ATK', rate: 0.48, tier: 'Medallions' },
		// --- rings ---
		{ out: 'Iron Ring',        req: { 'Iron Bar': 1, 'Coal': 1 },                               tag: '+1 ATK',        rate: 0.85, tier: 'Rings' },
		{ out: 'Silver Ring',      req: { 'Silver Bar': 1, 'Iron Bar': 1 },                         tag: '+2 ATK +1 DEF', rate: 0.72, tier: 'Rings' },
		{ out: 'Quartz Ring',      req: { 'Quartz Crystal': 1, 'Silver Bar': 1 },                   tag: '+3 ATK +2 DEF', rate: 0.60, tier: 'Rings' },
		{ out: 'Gold Ring',        req: { 'Gold Bar': 1, 'Quartz Crystal': 1 },                     tag: '+4 ATK +3 DEF', rate: 0.50, tier: 'Rings' },
		// --- titanium-tier (tier 4-5) ---
		{ out: 'Titanium Bar',          req: { 'Titanium Ore': 2, 'Coal': 1, 'Fire Essence': 1 },            tag: 'reagent',     rate: 0.75, tier: 'Titanium Forge' },
		{ out: 'Titanium Sword',        req: { 'Titanium Bar': 2, 'Steel Bar': 1 },                          tag: '+22 ATK',     rate: 0.45, tier: 'Titanium Forge' },
		{ out: 'Titanium Shield',       req: { 'Titanium Bar': 3 },                                          tag: '+12 DEF',     rate: 0.45, tier: 'Titanium Forge' },
		{ out: 'Titanium Helm',         req: { 'Titanium Bar': 2, 'Tanned Leather': 1 },                     tag: '+12 DEF',     rate: 0.42, tier: 'Titanium Forge' },
		{ out: 'Titanium Plate',        req: { 'Titanium Bar': 5, 'Tanned Leather': 2 },                     tag: '+22 DEF',     rate: 0.38, tier: 'Titanium Forge' },
		{ out: 'Titanium Cuisses',      req: { 'Titanium Bar': 3, 'Tanned Leather': 1 },                     tag: '+10 DEF',     rate: 0.42, tier: 'Titanium Forge' },
		{ out: 'Titanium Greaves',      req: { 'Titanium Bar': 2 },                                          tag: '+9 DEF',      rate: 0.45, tier: 'Titanium Forge' },
		// --- dragon-tier (tier 5) ---
		{ out: 'Dragonbone Sword',      req: { 'Dragon Bone': 3, 'Dragon Fang': 2, 'Steel Bar': 2 },           tag: '+35 ATK', rate: 0.18, tier: 'Dragon Forge' },
		{ out: 'Dragon Scale Shield',   req: { 'Dragon Scale': 4, 'Steel Bar': 2 },                            tag: '+18 DEF', rate: 0.18, tier: 'Dragon Forge' },
		{ out: 'Dragon Skull Helm',     req: { 'Dragon Bone': 2, 'Dragon Scale': 2 },                          tag: '+16 DEF', rate: 0.18, tier: 'Dragon Forge' },
		{ out: 'Dragon Scale Hauberk',  req: { 'Dragon Scale': 6, 'Dragon Heart': 1, 'Steel Bar': 2 },         tag: '+30 DEF', rate: 0.15, tier: 'Dragon Forge' },
		{ out: 'Dragon Bone Cuisses',   req: { 'Dragon Bone': 3, 'Dragon Scale': 1 },                          tag: '+14 DEF', rate: 0.18, tier: 'Dragon Forge' },
		{ out: 'Dragon Bone Greaves',   req: { 'Dragon Bone': 2, 'Dragon Fang': 1 },                           tag: '+12 DEF', rate: 0.18, tier: 'Dragon Forge' },
		{ out: 'Dragon Heart Medallion', req: { 'Dragon Heart': 1, 'Gold Bar': 2, 'Dragon Fang': 1 },         tag: '+15 DEF +8 ATK', rate: 0.15, tier: 'Dragon Forge' },
		{ out: 'Dragon Fang Ring',       req: { 'Dragon Fang': 2, 'Gold Bar': 1 },                            tag: '+10 ATK +5 DEF', rate: 0.18, tier: 'Dragon Forge' },
		// ---- Arcane Forge (tier 6) — intermediate reagents ----
		{ out: 'Aether Bar',            req: { 'Aether Crystal': 3 },                                        tag: 'Reagent',        rate: 0.70, tier: 'Arcane Forge' },
		{ out: 'Void Ingot',            req: { 'Voidstone': 3 },                                             tag: 'Reagent',        rate: 0.70, tier: 'Arcane Forge' },
		{ out: 'Star Alloy',            req: { 'Starstone': 2, 'Aether Crystal': 1 },                        tag: 'Reagent',        rate: 0.60, tier: 'Arcane Forge' },
		// ---- Arcane Forge — weapons ----
		{ out: 'Aether Blade',          req: { 'Aether Bar': 4, 'Void Ingot': 1 },                           tag: '+45 ATK',        rate: 0.25, tier: 'Arcane Forge' },
		{ out: 'Void Scythe',           req: { 'Void Ingot': 4, 'Aether Bar': 2, 'Shadow Essence': 2 },      tag: '+52 ATK',        rate: 0.20, tier: 'Arcane Forge' },
		{ out: 'Starforged Warblade',   req: { 'Star Alloy': 4, 'Void Fang': 2, 'Aether Bar': 2 },           tag: '+60 ATK',        rate: 0.15, tier: 'Arcane Forge' },
		// ---- Arcane Forge — shields ----
		{ out: 'Aether Ward',           req: { 'Aether Bar': 3, 'Starstone': 1 },                            tag: '+25 DEF',        rate: 0.28, tier: 'Arcane Forge' },
		{ out: 'Void Bulwark',          req: { 'Void Ingot': 4, 'Ancient Core': 1 },                         tag: '+32 DEF',        rate: 0.22, tier: 'Arcane Forge' },
		// ---- Arcane Forge — helms ----
		{ out: 'Aether Crown',          req: { 'Aether Bar': 2, 'Star Alloy': 1 },                           tag: '+22 DEF',        rate: 0.30, tier: 'Arcane Forge' },
		{ out: 'Void Helm',             req: { 'Void Ingot': 2, 'Shadow Essence': 1, 'Aether Bar': 1 },      tag: '+28 DEF',        rate: 0.25, tier: 'Arcane Forge' },
		// ---- Arcane Forge — body armor ----
		{ out: 'Aether Vestment',       req: { 'Aether Bar': 5, 'Star Alloy': 2 },                           tag: '+38 DEF',        rate: 0.22, tier: 'Arcane Forge' },
		{ out: 'Void Plate',            req: { 'Void Ingot': 6, 'Ancient Core': 2, 'Aether Bar': 2 },        tag: '+50 DEF',        rate: 0.18, tier: 'Arcane Forge' },
		// ---- Arcane Forge — cuisses & greaves ----
		{ out: 'Aether Cuisses',        req: { 'Aether Bar': 3, 'Void Ingot': 1 },                           tag: '+18 DEF',        rate: 0.28, tier: 'Arcane Forge' },
		{ out: 'Aether Greaves',        req: { 'Aether Bar': 2, 'Void Ingot': 1 },                           tag: '+16 DEF',        rate: 0.30, tier: 'Arcane Forge' },
		// ---- Arcane Forge — medallions & rings ----
		{ out: 'Starstone Medallion',   req: { 'Star Alloy': 2, 'Ancient Core': 1, 'Aether Bar': 1 },        tag: '+25 DEF +15 ATK', rate: 0.20, tier: 'Arcane Forge' },
		{ out: 'Void Ring',             req: { 'Void Fang': 2, 'Void Ingot': 1 },                            tag: '+18 ATK +10 DEF', rate: 0.22, tier: 'Arcane Forge' },
		// ---- Botanica (flower-based consumables) ----
		{ out: 'Moonbloom Draught',  req: { 'Moonbloom': 2, 'Blue Star Flower': 1 },                             tag: '+60 HP',                 rate: 0.90, tier: 'Botanica' },
		{ out: 'Sunfire Tonic',      req: { 'Sunfire Lily': 2, 'Fire Essence': 1 },                              tag: '+8 ATK 60s',             rate: 0.85, tier: 'Botanica' },
		{ out: 'Void Elixir',        req: { 'Voidpetal': 2, 'Coal': 1 },                                         tag: '+10 DEF 60s',            rate: 0.85, tier: 'Botanica' },
		{ out: 'Starbloom Brew',     req: { 'Starbloom': 2, 'Chrysanthemum': 1 },                                tag: '+45 HP +5 ATK',          rate: 0.85, tier: 'Botanica' },
		{ out: 'Moonbloom Salve',    req: { 'Moonbloom': 3, 'Voidpetal': 1, 'Blue Star Flower': 2 },             tag: '+120 HP regen 30s',      rate: 0.75, tier: 'Botanica' },
		{ out: 'Solar Draught',      req: { 'Sunfire Lily': 3, 'Starbloom': 1, 'Gold Bar': 1 },                  tag: '+15 ATK 45s',            rate: 0.70, tier: 'Botanica' },
		{ out: 'Void Shroud',        req: { 'Voidpetal': 3, 'Moonbloom': 1, 'Tanned Leather': 2 },              tag: '+18 DEF -10% dmg 45s',   rate: 0.65, tier: 'Botanica' },
		{ out: 'Celestial Brew',     req: { 'Starbloom': 3, 'Moonbloom': 2, 'Sunfire Lily': 1, 'Voidpetal': 1 }, tag: '+80 HP +10 ATK +8 DEF', rate: 0.55, tier: 'Botanica' },
		// ---- Legendary Forge (requires Enriched Fire Essence) ----
		{ out: 'Emberforged Blade',     req: { 'Enriched Fire Essence': 2, 'Infernal Ember': 4 },             tag: '+75 ATK',          rate: 0.12, tier: 'Legendary Forge' },
		{ out: 'Volcanic Warblade',     req: { 'Enriched Fire Essence': 3, 'Infernal Ember': 5, 'Void Relic': 2 }, tag: '+90 ATK',       rate: 0.08, tier: 'Legendary Forge' },
		{ out: 'Phoenixweave Vestment', req: { 'Enriched Fire Essence': 2, 'Void Relic': 3, 'Infernal Ember': 2 }, tag: '+65 DEF',       rate: 0.12, tier: 'Legendary Forge' },
		{ out: 'Infernoplate',          req: { 'Enriched Fire Essence': 3, 'Void Relic': 5 },                   tag: '+80 DEF',          rate: 0.08, tier: 'Legendary Forge' },
		{ out: 'Embercrown',            req: { 'Enriched Fire Essence': 2, 'Infernal Ember': 2, 'Void Relic': 2 }, tag: '+40 DEF +10 ATK', rate: 0.14, tier: 'Legendary Forge' },
		{ out: 'Emberveil Ring',        req: { 'Enriched Fire Essence': 1, 'Infernal Ember': 2 },               tag: '+25 ATK +15 DEF',  rate: 0.18, tier: 'Legendary Forge' },
	];
	const EQUIP_SLOTS = ['weapon', 'shield', 'helm', 'armor', 'cuisses', 'greaves', 'medallion', 'ring'];

	// ------------------------------------------------------------------ inventory
	const INV_SLOTS = 28;
	const inventory = new Array(INV_SLOTS).fill(null); // {item, count}
	function invCount(item) {
		return inventory.reduce((s, e) => s + (e && e.item === item ? e.count : 0), 0);
	}
	function addItem(item, n = 1) {
		for (const e of inventory) if (e && e.item === item) { e.count += n; renderInventory(); saveGame(); return true; }
		const idx = inventory.findIndex((e) => !e);
		if (idx === -1) return false;
		inventory[idx] = { item, count: n };
		renderInventory(); saveGame();
		return true;
	}
	function removeItem(item, n = 1) {
		for (let i = 0; i < inventory.length; i++) {
			const e = inventory[i];
			if (e && e.item === item) {
				const take = Math.min(e.count, n);
				e.count -= take; n -= take;
				if (e.count <= 0) inventory[i] = null;
				if (n <= 0) { renderInventory(); saveGame(); return true; }
			}
		}
		renderInventory(); saveGame();
		return n <= 0;
	}

	// ------------------------------------------------------------------ HUD refs
	const $ = (id) => document.getElementById(id);
	const ui = {
		hud: $('hud'), hpBar: $('hpBar'), hpText: $('hpText'), atk: $('atkVal'), def: $('defVal'),
		atkLvl: $('atkLvl'), defLvl: $('defLvl'), atkXpBar: $('atkXpBar'), defXpBar: $('defXpBar'),
		mfgVal: $('mfgVal'), mfgXpBar: $('mfgXpBar'), mfgHudXpText: $('mfgHudXpText'),
		mfgVal2: $('mfgVal2'), mfgXpBar2: $('mfgXpBar2'), mfgXpText: $('mfgXpText'), mfgBonus: $('mfgBonus'),
		nameTag: $('nameTag'),
		invGrid: $('invGrid'), invCount: $('invCount'), log: $('logBox'),
		progressWrap: $('progressWrap'), progressRing: $('progressRing'),
		progressLabel: $('progressLabel'), progressIcon: $('progressIcon'),
		craftModal: $('craftModal'), recipeList: $('recipeList'), mixSlots: $('mixSlots'),
		mixHint: $('mixHint'), helpModal: $('helpModal'),
		eq: { weapon: $('eqWeapon'), shield: $('eqShield'), helm: $('eqHelm'), armor: $('eqArmor'), cuisses: $('eqCuisses'), greaves: $('eqGreaves'), medallion: $('eqMedallion'), ring: $('eqRing') },
	};

	// ------------------------------------------------------------------ instant tooltip
	const tooltipEl = document.createElement('div');
	tooltipEl.className = 'pointer-events-none fixed z-50 hidden max-w-[220px] rounded-lg border border-white/15 bg-black/85 px-3 py-2 text-xs shadow-2xl backdrop-blur-md';
	document.body.appendChild(tooltipEl);
	function tooltipHtml(item, action) {
		const info = ITEMS[item]; if (!info) return item;
		let stat = '';
		if (info.atk) stat = '<span class="text-rose-300">+' + info.atk + ' Attack</span>';
		else if (info.def) stat = '<span class="text-sky-300">+' + info.def + ' Defense</span>';
		else if (info.heal) stat = '<span class="text-emerald-300">Restores ' + info.heal + ' HP</span>';
		const kind = info.type === 'material' ? 'Material' : info.type[0].toUpperCase() + info.type.slice(1);
		return '<div class="flex items-center gap-1.5 font-semibold text-amber-200">' + info.icon + ' ' + item + '</div>' +
			'<div class="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-400">' + kind + (stat ? ' · ' + stat : '') + '</div>' +
			(info.desc ? '<div class="mt-1 text-[11px] text-zinc-300">' + info.desc + '</div>' : '') +
			(action ? '<div class="mt-1 text-[10px] text-cyan-300">' + action.replace(/^ — /, '') + '</div>' : '');
	}
	function showTooltipAt(x, y, html) {
		tooltipEl.innerHTML = html;
		tooltipEl.classList.remove('hidden');
		const r = tooltipEl.getBoundingClientRect();
		let left = x + 14, top = y + 14;
		if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
		if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
		tooltipEl.style.left = Math.max(8, left) + 'px';
		tooltipEl.style.top = Math.max(8, top) + 'px';
	}
	function hideTooltip() { tooltipEl.classList.add('hidden'); }
	function attachTooltip(el, item, action) {
		el.addEventListener('mouseenter', (e) => showTooltipAt(e.clientX, e.clientY, tooltipHtml(item, action)));
		el.addEventListener('mousemove', (e) => { if (!tooltipEl.classList.contains('hidden')) showTooltipAt(e.clientX, e.clientY, tooltipHtml(item, action)); });
		el.addEventListener('mouseleave', hideTooltip);
	}
	// equip slots keep a live tooltip that reads whatever is currently worn
	EQUIP_SLOTS.forEach((slot) => {
		const btn = ui.eq[slot];
		if (!btn) return;
		btn.addEventListener('mouseenter', (e) => { if (btn._ttItem) showTooltipAt(e.clientX, e.clientY, tooltipHtml(btn._ttItem, ' — click to unequip')); });
		btn.addEventListener('mousemove', (e) => { if (btn._ttItem && !tooltipEl.classList.contains('hidden')) showTooltipAt(e.clientX, e.clientY, tooltipHtml(btn._ttItem, ' — click to unequip')); });
		btn.addEventListener('mouseleave', hideTooltip);
	});

	const LOG_COLORS = {
		sys: 'text-sky-300', harvest: 'text-emerald-300', loot: 'text-amber-300',
		dmgOut: 'text-rose-300', dmgIn: 'text-orange-300', craft: 'text-fuchsia-300', warn: 'text-red-400',
	};
	function log(msg, kind = 'sys') {
		const div = document.createElement('div');
		div.className = LOG_COLORS[kind] || 'text-zinc-300';
		div.textContent = msg;
		ui.log.appendChild(div);
		while (ui.log.children.length > 70) ui.log.removeChild(ui.log.firstChild);
		ui.log.scrollTop = ui.log.scrollHeight;
	}

	function renderInventory() {
		ui.invGrid.innerHTML = '';
		let used = 0;
		inventory.forEach((e, i) => {
			const cell = document.createElement('button');
			cell.className =
				'relative flex h-12 w-full items-center justify-center rounded-lg border text-xl transition ' +
				(e
					? 'border-white/15 bg-white/10 hover:border-cyan-300/50 hover:bg-white/20 cursor-pointer'
					: 'border-white/5 bg-white/[0.03]');
			if (e) {
				used++;
				const info = ITEMS[e.item];
				cell.innerHTML =
					'<span>' + info.icon + '</span>' +
					'<span class="absolute bottom-0 right-1 text-[10px] font-bold text-zinc-200 drop-shadow">' + e.count + '</span>';
				const action = info.type === 'material' ? '' :
					info.type === 'food' ? ' — click to eat' : ' — click to equip';
				attachTooltip(cell, e.item, action);
				cell.addEventListener('click', () => onInventoryClick(i));
				cell.addEventListener('contextmenu', (ev) => {
					ev.preventDefault();
					const entry = inventory[i];
					if (!entry) return;
					inventory[i] = null;
					log('Discarded ' + entry.item + (entry.count > 1 ? ' ×' + entry.count : '') + '.', 'sys');
					renderInventory();
				});
			}
			ui.invGrid.appendChild(cell);
		});
		ui.invCount.textContent = used + ' / ' + INV_SLOTS;
		if (!ui.craftModal.classList.contains('hidden')) renderRecipes();
	}

	function onInventoryClick(slot) {
		const e = inventory[slot];
		if (!e) return;
		const info = ITEMS[e.item];
		if (!ui.craftModal.classList.contains('hidden')) { moveToMix(e.item); return; }
		if (EQUIP_SLOTS.includes(info.type)) equipItem(e.item);
		else if (info.type === 'food') eatFood(e.item);
	}
	function eatFood(name) {
		const info = ITEMS[name];
		const hasHeal = info.heal && info.heal > 0;
		const hasBuff = info.atkBuff || info.defBuff || info.hotHeal;
		if (hasHeal && !hasBuff && player.hp >= player.maxhp) { log('You are already at full health.', 'sys'); return; }
		const cooldown = 5;
		if (elapsed - player.lastEat < cooldown) {
			const remaining = Math.ceil(cooldown - (elapsed - player.lastEat));
			log('You must wait ' + remaining + ' more second' + (remaining !== 1 ? 's' : '') + ' before consuming again.', 'sys');
			return;
		}
		if (!removeItem(name, 1)) return;
		player.lastEat = elapsed;
		if (hasHeal) {
			player.hp = Math.min(player.maxhp, player.hp + info.heal);
			setBar(player.bar, player.hp / player.maxhp); refreshHpUI();
			floatText('+' + info.heal + ' HP', headPos(), '#4ade80', 0.9);
		}
		if (info.hotHeal) {
			player.consumableHotTotal = (player.consumableHotTotal || 0) + info.hotHeal;
			player.consumableHotTimer = info.hotDur || 30;
			floatText('💚 Regen', headPos(), '#86efac', 0.9);
		}
		if (info.atkBuff) {
			player.consumableAtk = info.atkBuff;
			player.consumableAtkTimer = info.buffDur || 60;
			refreshStatsUI();
			floatText('+' + info.atkBuff + ' ATK', headPos(), '#fbbf24', 0.9);
		}
		if (info.defBuff) {
			player.consumableDef = info.defBuff;
			player.consumableDefTimer = info.buffDur || 60;
			refreshStatsUI();
			floatText('+' + info.defBuff + ' DEF', headPos(), '#38bdf8', 0.9);
		}
		if (info.dmgReduce) {
			player.consumableDmgReduce = info.dmgReduce;
			player.consumableDmgReduceTimer = info.buffDur || 60;
		}
		const msgs = [];
		if (hasHeal) msgs.push('recover ' + info.heal + ' HP');
		if (info.hotHeal) msgs.push('+' + info.hotHeal + ' HP over ' + (info.hotDur || 30) + 's');
		if (info.atkBuff) msgs.push('+' + info.atkBuff + ' ATK for ' + (info.buffDur || 60) + 's');
		if (info.defBuff) msgs.push('+' + info.defBuff + ' DEF for ' + (info.buffDur || 60) + 's');
		log('You consume the ' + name + (msgs.length ? ' · ' + msgs.join(', ') : '') + '.', 'harvest');
		hideTooltip();
	}

	// ------------------------------------------------------------------ text sprites / effects
	function makeTextSprite(text, color, size) {
		const cv = document.createElement('canvas');
		cv.width = 256; cv.height = 96;
		const cx = cv.getContext('2d');
		cx.font = 'bold 46px system-ui, sans-serif';
		cx.textAlign = 'center'; cx.textBaseline = 'middle';
		cx.lineWidth = 8; cx.strokeStyle = 'rgba(0,0,0,0.75)';
		cx.strokeText(text, 128, 48);
		cx.fillStyle = color;
		cx.fillText(text, 128, 48);
		const tex = new THREE.CanvasTexture(cv);
		const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
		const sp = new THREE.Sprite(mat);
		sp.scale.set(2.4 * (size || 1), 0.9 * (size || 1), 1);
		return sp;
	}
	const floaters = [];
	function floatText(text, worldPos, color, size) {
		const sp = makeTextSprite(text, color, size);
		sp.position.copy(worldPos);
		scene.add(sp);
		floaters.push({ sp, life: 1.1, vy: 1.4 });
	}
	function updateFloaters(dt) {
		for (let i = floaters.length - 1; i >= 0; i--) {
			const f = floaters[i];
			f.life -= dt;
			f.sp.position.y += f.vy * dt;
			f.sp.material.opacity = clamp(f.life / 0.5, 0, 1);
			if (f.life <= 0) {
				scene.remove(f.sp);
				f.sp.material.map.dispose(); f.sp.material.dispose();
				floaters.splice(i, 1);
			}
		}
	}

	// destination click ring
	const ring = new THREE.Mesh(
		new THREE.RingGeometry(0.28, 0.42, 40),
		new THREE.MeshBasicMaterial({ color: 0x7fe0ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
	);
	ring.rotation.x = -Math.PI / 2;
	scene.add(ring);
	let ringT = 1;
	function showRing(p) { ring.position.set(p.x, p.y + 0.06, p.z); ringT = 0; }

	// ------------------------------------------------------------------ effects (bursts, swirls, sparks)
	const effects = [];
	const softTex = glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.5)');
	function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }

	function spawnGroundRing(pos, color, r0, r1, life, y) {
		const m = new THREE.Mesh(
			new THREE.RingGeometry(r0 * 0.86, r0, 48),
			new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
		);
		m.rotation.x = -Math.PI / 2;
		m.position.set(pos.x, pos.y + (y || 0.08), pos.z);
		scene.add(m);
		effects.push({ type: 'ring', m, t: 0, life, r0, r1 });
	}
	function spawnPillar(pos, color, life) {
		const m = new THREE.Mesh(
			new THREE.CylinderGeometry(0.55, 0.75, 4.2, 20, 1, true),
			new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, map: softTex })
		);
		m.position.set(pos.x, pos.y + 2.1, pos.z);
		m.scale.set(0.3, 0.4, 0.3);
		scene.add(m);
		effects.push({ type: 'pillar', m, t: 0, life });
	}
	function spawnSparkBurst(pos, color, n, speed, rise) {
		const geo = new THREE.BufferGeometry();
		const pa = new Float32Array(n * 3);
		const vel = [];
		for (let i = 0; i < n; i++) {
			pa[i * 3] = pos.x; pa[i * 3 + 1] = pos.y + 0.6; pa[i * 3 + 2] = pos.z;
			const a = rand(0, Math.PI * 2), s = speed * rand(0.4, 1);
			vel.push(new THREE.Vector3(Math.cos(a) * s, rise * rand(0.7, 1.3), Math.sin(a) * s));
		}
		geo.setAttribute('position', new THREE.BufferAttribute(pa, 3));
		const pts = new THREE.Points(geo, new THREE.PointsMaterial({
			color, size: 0.4, map: softTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
		}));
		scene.add(pts);
		effects.push({ type: 'sparks', m: pts, vel, t: 0, life: 1.1 });
	}
	function spawnLevelUpEffect(color) {
		const p = player.group.position;
		spawnGroundRing(p, color, 0.5, 3.6, 0.95, 0.1);
		spawnGroundRing(p, color, 0.5, 2.4, 0.7, 0.12);
		spawnPillar(p, color, 1.0);
		spawnSparkBurst(p, color, 30, 3.0, 4.2);
	}
	// orbiting swirl that clings to the player while crafting
	function spawnCraftSwirl(color, life) {
		const grp = new THREE.Group();
		const bits = [];
		for (let i = 0; i < 14; i++) {
			const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color, map: softTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
			const s = rand(0.16, 0.3); sp.scale.set(s, s, 1);
			grp.add(sp);
			bits.push({ sp, ang: rand(0, Math.PI * 2), rad: rand(0.6, 1.0), yb: rand(0.2, 1.9), spd: rand(2, 4) * (Math.random() < 0.5 ? 1 : -1) });
		}
		scene.add(grp);
		effects.push({ type: 'swirl', grp, bits, t: 0, life });
	}
	function updateEffects(dt) {
		for (let i = effects.length - 1; i >= 0; i--) {
			const e = effects[i];
			e.t += dt;
			const k = e.t / e.life;
			if (e.type === 'ring') {
				const r = lerp(e.r0, e.r1, 1 - Math.pow(1 - k, 2));
				e.m.geometry.dispose();
				e.m.geometry = new THREE.RingGeometry(r * 0.9, r, 48);
				e.m.material.opacity = 0.9 * (1 - k);
			} else if (e.type === 'pillar') {
				e.m.scale.set(lerp(0.3, 1.1, k), lerp(0.4, 1.2, k), lerp(0.3, 1.1, k));
				e.m.material.opacity = 0.55 * (1 - k);
				e.m.rotation.y += dt * 2;
			} else if (e.type === 'sparks') {
				const pos = e.m.geometry.attributes.position;
				for (let j = 0; j < e.vel.length; j++) {
					e.vel[j].y -= 6 * dt;
					pos.setX(j, pos.getX(j) + e.vel[j].x * dt);
					pos.setY(j, pos.getY(j) + e.vel[j].y * dt);
					pos.setZ(j, pos.getZ(j) + e.vel[j].z * dt);
				}
				pos.needsUpdate = true;
				e.m.material.opacity = 1 - k;
			} else if (e.type === 'swirl') {
				const p = player.group.position;
				e.grp.position.copy(p);
				const fade = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
				for (const b of e.bits) {
					b.ang += b.spd * dt;
					b.sp.position.set(Math.cos(b.ang) * b.rad, b.yb, Math.sin(b.ang) * b.rad);
					b.sp.material.opacity = fade;
				}
			}
			if (e.t >= e.life) {
				if (e.type === 'swirl') { e.grp.traverse((o) => { if (o.material) o.material.dispose(); }); scene.remove(e.grp); }
				else { if (e.m.geometry) e.m.geometry.dispose(); e.m.material.dispose(); scene.remove(e.m); }
				effects.splice(i, 1);
			}
		}
	}

	// ------------------------------------------------------------------ health bars
	// A single canvas-textured billboard sprite per entity, tracked in WORLD space
	// (never parented to the entity) so it can't rotate, split, scale or drift —
	// it simply hovers a fixed height above whatever it belongs to.
	const healthBars = [];
	function drawBar(bar) {
		const cx = bar.ctx, W = bar.cv.width, H = bar.cv.height, pct = bar.pct;
		cx.clearRect(0, 0, W, H);
		const r = H * 0.5;
		// shell
		cx.fillStyle = 'rgba(8,11,15,0.92)';
		roundRect(cx, 1, 1, W - 2, H - 2, r); cx.fill();
		// fill
		const col = pct > 0.5 ? ['#4ade80', '#22c55e'] : pct > 0.25 ? ['#facc15', '#eab308'] : ['#f87171', '#ef4444'];
		const fw = Math.max(0, (W - 8) * pct);
		if (fw > 0.5) {
			const grad = cx.createLinearGradient(0, 0, 0, H);
			grad.addColorStop(0, col[0]); grad.addColorStop(1, col[1]);
			cx.fillStyle = grad;
			roundRect(cx, 4, 4, fw, H - 8, (H - 8) * 0.5); cx.fill();
		}
		// border
		cx.lineWidth = 2; cx.strokeStyle = 'rgba(255,255,255,0.25)';
		roundRect(cx, 1, 1, W - 2, H - 2, r); cx.stroke();
		bar.tex.needsUpdate = true;
	}
	function roundRect(cx, x, y, w, h, r) {
		r = Math.min(r, w / 2, h / 2);
		cx.beginPath();
		cx.moveTo(x + r, y);
		cx.arcTo(x + w, y, x + w, y + h, r);
		cx.arcTo(x + w, y + h, x, y + h, r);
		cx.arcTo(x, y + h, x, y, r);
		cx.arcTo(x, y, x + w, y, r);
		cx.closePath();
	}
	function makeHealthBar(entity, width, yOff, alwaysShow) {
		const cv = document.createElement('canvas'); cv.width = 140; cv.height = 22;
		const tex = new THREE.CanvasTexture(cv);
		const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
		sp.scale.set(width, width * 0.157, 1);
		sp.renderOrder = 30;
		scene.add(sp);
		const bar = { sprite: sp, cv, tex, ctx: cv.getContext('2d'), entity, yOff, width, pct: 1, always: !!alwaysShow, show: alwaysShow ? 1 : 0, timer: 0 };
		drawBar(bar);
		healthBars.push(bar);
		return bar;
	}
	function setBar(bar, pct) {
		bar.pct = clamp(pct, 0, 1);
		if (!bar.always) bar.timer = 4.5; // reveal creature bars for a few seconds after a hit
		drawBar(bar);
	}
	const _bv = new THREE.Vector3();
	function updateHealthBars(dt) {
		for (const bar of healthBars) {
			const e = bar.entity;
			const visible = e.visible && (bar.always || bar.timer > 0);
			if (!bar.always) bar.timer = Math.max(0, bar.timer - dt);
			// smooth fade
			bar.show = lerp(bar.show, visible ? 1 : 0, Math.min(1, dt * 10));
			if (bar.show < 0.02) { bar.sprite.visible = false; continue; }
			bar.sprite.visible = true;
			bar.sprite.material.opacity = bar.show;
			_bv.copy(e.position); _bv.y += bar.yOff;
			bar.sprite.position.copy(_bv);
		}
	}

	// ------------------------------------------------------------------ name labels
	const labels = [];
	function makeLabel(entity, text, yOff, color, sub) {
		const cv = document.createElement('canvas'); cv.width = 384; cv.height = 96;
		const tex = new THREE.CanvasTexture(cv);
		const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
		sp.renderOrder = 31;
		scene.add(sp);
		const lbl = { sprite: sp, cv, tex, ctx: cv.getContext('2d'), entity, yOff, color: color || '#ffffff', sub: sub || null };
		drawLabel(lbl, text);
		labels.push(lbl);
		return lbl;
	}
	function drawLabel(lbl, text) {
		const cx = lbl.ctx, W = lbl.cv.width, H = lbl.cv.height;
		cx.clearRect(0, 0, W, H);
		cx.textAlign = 'center'; cx.textBaseline = 'middle';
		const y = lbl.sub ? 36 : 48;
		cx.font = 'bold 46px "Palatino Linotype", Palatino, Georgia, serif';
		cx.lineWidth = 9; cx.strokeStyle = 'rgba(0,0,0,0.85)';
		cx.strokeText(text, W / 2, y);
		cx.fillStyle = lbl.color; cx.fillText(text, W / 2, y);
		if (lbl.sub) {
			cx.font = 'bold 27px system-ui, sans-serif';
			cx.lineWidth = 7; cx.strokeStyle = 'rgba(0,0,0,0.8)';
			cx.strokeText(lbl.sub, W / 2, 74);
			cx.fillStyle = 'rgba(255,255,255,0.72)'; cx.fillText(lbl.sub, W / 2, 74);
		}
		// scale sprite to keep text crisp & proportionate (~50% larger than before)
		const w = Math.min(5.1, Math.max(2.1, text.length * 0.285 + 0.75));
		lbl.sprite.scale.set(w, w * 0.25, 1);
		lbl.tex.needsUpdate = true;
	}
	function updateLabels() {
		for (const lbl of labels) {
			const e = lbl.entity;
			if (!e.visible) { lbl.sprite.visible = false; continue; }
			lbl.sprite.visible = true;
			_bv.copy(e.position); _bv.y += lbl.yOff;
			lbl.sprite.position.copy(_bv);
		}
	}

	// ------------------------------------------------------------------ player
	const player = {
		group: new THREE.Group(),
		hp: 50, maxhp: 50, baseAtk: 3, baseDef: 0, fortitudeMaxhpApplied: 0,
		speed: 4.4,
		name: 'Adventurer',
		equip: { weapon: null, shield: null, helm: null, armor: null, cuisses: null, greaves: null, medallion: null, ring: null },
		moveTarget: null,       // Vector3
		action: null,           // {type:'attack'|'harvest'|'fish', ...}
		harvesting: null,       // {node, t}
		attackTimer: 0, regenTimer: 0, lastHurt: -99, lastEat: -99,
		animT: 0, moving: false, dead: false, swimming: false,
		// progression
		atkLvl: 1, atkXp: 0, defLvl: 1, defXp: 0, craftLvl: 1, craftXp: 0,
		dragonKilled: false,
		parts: {},
		label: null,
		// talent system
		talents: {},        // { talentId: rank }  rank 1–3
		hotbar: [null, null, null, null, null],
		skillCooldowns: {},
		burnTargets: [],    // [{creature, dmgPerTick, ticks, timer}]
		lightningStuns: [], // [{creature, timer}]
		iceFreeze: [],      // [{creature, turnsLeft}]
		hotTimer: 0,
		hotHealTotal: 0,
		frostWardTimer: 0,  // seconds remaining on Frost Ward armor buff
		frostWardBonus: 0,  // armor bonus while frost ward is active
		staticAuraTimer: 0,
		staticAuraDmg: 0,
		fireballMode: false,
		fireballs: [],           // active fireball projectiles { mesh, target, startPos, endPos, t, damage }
		iceLanceMode: false,
		iceLances: [],           // active ice lance projectiles
		lightningStrikeMode: false,
		lightningStrikes: [],    // active multi-hit sequences { creature, hitsLeft, interval, timer, damage }
		infernoCast: null,       // { timer, duration, dmg, rank } while channeling
		blizzardCast: null,      // { timer, duration, dmg, rank } while channeling
		lightningStormCast: null, // { timer, duration, dmgPerHit, rank, hitsLeft, hitTimer } while channeling + ticking
		healingSurge: null,      // { hitsLeft, healPerPulse, timer } for in-progress surges
		// new skills
		magmaShellTimer: 0, magmaShellAbsorb: 0, magmaShellReturnDmg: 0,
		flameWallTimer: 0, flameWallDps: 0,
		phoenixMarkUsed: false,
		glacialArmorTimer: 0, glacialArmorAbsorb: 0, glacialArmorExplosionDmg: 0,
		coldSnapCount: 0,        // counts attacks for Cold Snap proc
		permafrostPatches: [],   // { mesh, timer, radius, dps }
		ballLightningObj: null,  // { mesh, timer, dps, radius }
		soulLeechCast: null,     // { creature, timer, duration, dps }
		spiritWalkTimer: 0,
		resurrectionMarkUsed: false,
		aegisTimer: 0, aegisAbsorb: 0,
		overloadDeadStunned: [], // for Overload passive cascades
	};
	// XP curve + level helpers ---------------------------------------------------
	function xpForLevel(l) { return Math.floor(40 * Math.pow(1.28, l - 1)); }
	function combatLevel() { return (player.atkLvl + player.defLvl) / 2; }
	function playerBaseAtk() { return 2 + player.atkLvl; }   // lvl 1 → 3
	function playerBaseDef() { return player.defLvl - 1; }   // lvl 1 → 0

	// ------------------------------------------------------------------ talent definitions
	// Each talent has up to 3 ranks. player.talents[id] = rank (0 = not learned).
	// Ranks are described in rankDescs[]; cost is always 1 point per rank.
	const TALENT_PATHS = [
		{
			id: 'fire', name: 'Fire', icon: '🔥', color: '#ff6b35', borderColor: 'border-orange-400/40', bgColor: 'bg-orange-400/10',
			talents: [
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
				{ id: 'fire_fireball', name: 'Fireball', type: 'active', icon: '🔮', maxRank: 5,
					cooldowns: [0, 20, 18, 16, 14, 12],
					rankDescs: ['',
						'Hurl a fireball at a creature for 40 fire damage. Click a creature to aim.',
						'Fireball deals 70 fire damage.',
						'Fireball deals 110 fire damage.',
						'Fireball deals 160 fire damage — scorching projectile.',
						'Fireball deals 220 fire damage — LEGENDARY: a star falls to earth!'] },
				{ id: 'fire_inferno', name: 'Inferno', type: 'active', icon: '🌋', maxRank: 5,
					cooldowns: [0, 45, 40, 35, 30, 25],
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
					rankDescs: ['',
						'Coat yourself in magma — absorb up to 30 damage. Attackers take 8 fire damage per hit.',
						'Shell absorbs 55 damage. Attackers take 14 fire damage.',
						'Shell absorbs 85 damage. Attackers take 22 fire damage.',
						'Shell absorbs 120 damage. Attackers take 32 fire damage.',
						'Shell absorbs 160 damage. Attackers take 45 fire damage — LEGENDARY: touch me and burn!'] },
				{ id: 'fire_pyroclasm', name: 'Pyroclasm', type: 'passive', icon: '💥', maxRank: 5,
					rankDescs: ['',
						'Critical burn ticks: 10% chance a burn tick deals double damage.',
						'Crit chance 15%.',
						'Crit chance 20%.',
						'Crit chance 28%.',
						'Crit chance 35% — the inferno rages uncontrolled!'] },
				{ id: 'fire_phoenix_mark', name: 'Phoenix Mark', type: 'passive', icon: '🦅', maxRank: 5,
					rankDescs: ['',
						'Once per combat: auto-cast Mend (25 HP) when your HP drops below 20%.',
						'Heal 45 HP at 20% HP threshold.',
						'Heal 70 HP at 25% HP threshold.',
						'Heal 100 HP at 25% HP threshold.',
						'Heal 140 HP at 30% HP threshold — the phoenix rises!'] },
			]
		},
		{
			id: 'lightning', name: 'Lightning', icon: '⚡', color: '#facc15', borderColor: 'border-yellow-400/40', bgColor: 'bg-yellow-400/10',
			talents: [
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
					rankDescs: ['',
						'Consume all shocks/stuns — deal 20 lightning damage per consumed effect.',
						'25 damage per effect.',
						'32 damage per effect.',
						'42 damage per effect.',
						'55 damage per effect — LEGENDARY: release all the charge at once!'] },
				{ id: 'lightning_overload', name: 'Overload', type: 'passive', icon: '🌩️', maxRank: 5,
					rankDescs: ['',
						'Shocked enemies that die burst-stun nearby enemies within 4 units for 1 cycle.',
						'Burst-stun radius 5 units.',
						'Burst-stun radius 6 units, stuns 2 cycles.',
						'Stun 2 cycles, radius 7 units.',
						'Stun 3 cycles, radius 8 units — chain overloads cascade!'] },
				{ id: 'lightning_ball', name: 'Ball Lightning', type: 'active', icon: '🔵', maxRank: 5,
					cooldowns: [0, 28, 25, 22, 18, 15],
					rankDescs: ['',
						'Summon a slow orb that pulses 8 lightning damage/s to enemies within 3 units for 6s.',
						'Orb pulses 14 dmg/s for 7s.',
						'Orb pulses 20 dmg/s for 8s.',
						'Orb pulses 28 dmg/s for 9s.',
						'Orb pulses 38 dmg/s for 10s — LEGENDARY: a storm contained in a sphere!'] },
			]
		},
		{
			id: 'ice', name: 'Ice', icon: '❄️', color: '#7dd3fc', borderColor: 'border-sky-400/40', bgColor: 'bg-sky-400/10',
			talents: [
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
				{ id: 'ice_shatter', name: 'Shatter', type: 'active', icon: '💎', maxRank: 5,
					cooldowns: [0, 25, 22, 19, 16, 14],
					rankDescs: ['',
						'Shatter all frozen enemies for 30 damage each, ending the freeze.',
						'Shatter deals 60 damage.',
						'Shatter deals 95 damage.',
						'Shatter deals 130 damage.',
						'Shatter deals 170 damage — LEGENDARY: enemies burst like glass!'] },
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
					rankDescs: ['',
						'Encase yourself in ice — absorb up to 40 damage. On expiry, explode for 20 ice damage in 5 units.',
						'Absorb 70 damage. Explosion 35 ice damage.',
						'Absorb 105 damage. Explosion 55 ice damage.',
						'Absorb 145 damage. Explosion 78 ice damage.',
						'Absorb 190 damage. Explosion 105 ice damage — LEGENDARY: a glacier detonates!'] },
				{ id: 'ice_cold_snap', name: 'Cold Snap', type: 'passive', icon: '🌨️', maxRank: 5,
					rankDescs: ['',
						'Every 3rd attack automatically Chills the target (slows for 2s).',
						'Every 3rd attack Chills and deals +8 bonus ice damage.',
						'Every 3rd attack Chills and deals +15 bonus ice damage.',
						'Chill becomes a Freeze for 1 turn. +20 bonus ice damage.',
						'Freeze 2 turns. +28 bonus ice damage — Cold Snap cannot be resisted!'] },
				{ id: 'ice_permafrost', name: 'Permafrost', type: 'passive', icon: '💎', maxRank: 5,
					rankDescs: ['',
						'Frozen enemies that die leave an ice patch (5-unit radius) for 8s — slows enemies that step on it.',
						'Patch radius 6 units, lasts 10s.',
						'Ice patch also deals 5 dmg/s to enemies standing on it.',
						'Patch deals 9 dmg/s, radius 7 units.',
						'Patch deals 14 dmg/s, lasts 15s — the ground never thaws!'] },
			]
		},
		{
			id: 'spirit', name: 'Spirit', icon: '💚', color: '#86efac', borderColor: 'border-green-400/40', bgColor: 'bg-green-400/10',
			talents: [
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
					rankDescs: ['',
						'Become ethereal for 2s — untargetable, immune to damage. Cannot attack.',
						'Spirit Walk lasts 2.5s.',
						'Lasts 3s. Movement speed +30% while active.',
						'Lasts 3.5s. Speed +40%.',
						'Lasts 4s — LEGENDARY: become one with the spirit realm!'] },
				{ id: 'spirit_resurrection_mark', name: 'Resurrection Mark', type: 'passive', icon: '✨', maxRank: 5,
					rankDescs: ['',
						'Once per combat: when HP drops below 15%, auto-cast Mend (30 HP) instantly.',
						'Auto-Mend heals 55 HP at 15% HP threshold.',
						'Auto-Mend heals 85 HP at 20% HP threshold.',
						'Auto-Mend heals 120 HP at 20% HP threshold.',
						'Heal 160 HP at 25% HP threshold — LEGENDARY: death cannot claim you!'] },
				{ id: 'spirit_aegis', name: 'Aegis', type: 'active', icon: '🔮', maxRank: 5,
					cooldowns: [0, 40, 36, 32, 28, 22],
					rankDescs: ['',
						'Conjure a spirit shield that absorbs up to 50 damage for 10s.',
						'Shield absorbs 90 damage for 10s.',
						'Shield absorbs 135 damage for 12s.',
						'Shield absorbs 185 damage for 12s.',
						'Shield absorbs 240 damage for 15s — LEGENDARY: the spirit protects absolutely!'] },
			]
		},
	];

	// prerequisite chain: talent N requires rank >= 1 in the talent listed here
	const TALENT_PREREQS = {
		fire_passive:            'fire_active',
		fire_backdraft:          'fire_passive',
		fire_wildfire:           'fire_backdraft',
		fire_cremation:          'fire_wildfire',
		fire_fireball:           'fire_cremation',
		fire_inferno:            'fire_fireball',
		lightning_passive:       'lightning_active',
		lightning_conductor:     'lightning_passive',
		lightning_aftershock:    'lightning_conductor',
		lightning_static_aura:   'lightning_aftershock',
		lightning_strike:        'lightning_static_aura',
		lightning_storm:         'lightning_strike',
		ice_passive:             'ice_active',
		ice_shield:              'ice_passive',
		ice_brittle:             'ice_shield',
		ice_shatter:             'ice_brittle',
		ice_lance:               'ice_shatter',
		ice_blizzard:            'ice_lance',
		ice_frost_nova:          'ice_blizzard',
		ice_glacial_armor:       'ice_frost_nova',
		ice_cold_snap:           'ice_blizzard',
		ice_permafrost:          'ice_brittle',
		lightning_chain:         'lightning_storm',
		lightning_discharge:     'lightning_chain',
		lightning_overload:      'lightning_conductor',
		lightning_ball:          'lightning_storm',
		fire_flame_wall:         'fire_inferno',
		fire_magma_shell:        'fire_flame_wall',
		fire_pyroclasm:          'fire_cremation',
		fire_phoenix_mark:       'fire_fireball',
		spirit_passive:          'spirit_active',
		spirit_hot:              'spirit_passive',
		spirit_siphon:           'spirit_hot',
		spirit_fortitude:        'spirit_siphon',
		spirit_healing_surge:    'spirit_fortitude',
		spirit_soul_leech:       'spirit_healing_surge',
		spirit_spirit_walk:      'spirit_soul_leech',
		spirit_resurrection_mark:'spirit_hot',
		spirit_aegis:            'spirit_fortitude',
	};

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
	function talentPrereqMet(id) {
		const prereq = TALENT_PREREQS[id];
		if (!prereq) return true;
		return talentRank(prereq) >= 1;
	}

	// ------------------------------------------------------------------ skill activation
	function activateSkill(slotIndex) {
		const id = player.hotbar[slotIndex];
		if (!id) { log('No skill in slot ' + (slotIndex + 1) + '.', 'sys'); return; }
		const rank = talentRank(id);
		if (!rank) { log('You have not learned that skill.', 'warn'); return; }
		const def = getTalentDef(id);
		if (!def || def.type !== 'active') { log('That is a passive skill — it is always active.', 'sys'); return; }
		const cd = player.skillCooldowns[id] || 0;
		if (cd > 0) { log(def.name + ' is on cooldown (' + Math.ceil(cd) + 's remaining).', 'warn'); return; }

		player.skillCooldowns[id] = def.cooldowns[rank];

		if (id === 'fire_active') {
			const bonus = Math.ceil(playerAtk() * [0, 1.0, 1.5, 2.0, 2.6, 3.2, 4.0, 5.0, 6.2][rank]);
			player.nextAttackFireBonus = bonus;
			spawnSparkBurst(headPos(), 0xff4400, 18, 2.2, 3.5);
			spawnPillar(player.group.position.clone(), 0xff6600, 0.5);
			floatText('🔥 +' + bonus + ' Fire!', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#fb923c', 1.0);
			log('🔥 ' + def.name + ' (Rank ' + rank + '): Your weapon blazes! Next attack +' + bonus + ' fire.', 'craft');
		} else if (id === 'lightning_active') {
			const bonus = Math.ceil(playerAtk() * [0, 0.9, 1.4, 1.9, 2.5, 3.1, 3.8, 4.7, 5.8][rank]);
			player.nextAttackLightningBonus = bonus;
			spawnSparkBurst(headPos(), 0xfacc15, 18, 2.2, 3.5);
			spawnPillar(player.group.position.clone(), 0xfde047, 0.5);
			floatText('⚡ +' + bonus + ' Lightning!', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#facc15', 1.0);
			log('⚡ ' + def.name + ' (Rank ' + rank + '): Your weapon crackles! Next attack +' + bonus + ' lightning.', 'craft');
		} else if (id === 'ice_active') {
			const bonus = Math.ceil(playerAtk() * [0, 0.9, 1.4, 1.9, 2.5, 3.1, 3.8, 4.7, 5.8][rank]);
			player.nextAttackIceBonus = bonus;
			spawnSparkBurst(headPos(), 0x7dd3fc, 18, 2.2, 3.5);
			spawnPillar(player.group.position.clone(), 0xbae6fd, 0.5);
			floatText('❄️ +' + bonus + ' Ice!', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#7dd3fc', 1.0);
			log('❄️ ' + def.name + ' (Rank ' + rank + '): Your weapon frosts over! Next attack +' + bonus + ' ice.', 'craft');
		} else if (id === 'ice_shield') {
			const bonus = Math.ceil(playerDef() * [0, 0.5, 0.8, 1.1, 1.5, 2.0, 2.6, 3.3, 4.2][rank] + 3);
			const dur   = [0, 8, 10, 12, 14, 16, 18, 20, 25][rank];
			player.frostWardTimer = dur;
			player.frostWardBonus = bonus;
			spawnGroundRing(player.group.position.clone(), 0x7dd3fc, 0.3, 2.4, 0.9, 0.08);
			spawnSparkBurst(headPos(), 0xbae6fd, 16, 1.6, 2.8);
			floatText('🧊 +' + bonus + ' Armor', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#7dd3fc', 1.0);
			refreshStatsUI();
			log('🧊 Frost Ward (Rank ' + rank + '): Ice encases you — +' + bonus + ' armor for ' + dur + ' seconds.', 'craft');
		} else if (id === 'spirit_active') {
			const heal = Math.ceil(player.maxhp * [0, 0.12, 0.20, 0.28, 0.38, 0.50, 0.65, 0.82, 1.0][rank]);
			player.hp = Math.min(player.maxhp, player.hp + heal);
			setBar(player.bar, player.hp / player.maxhp); refreshHpUI();
			floatText('+' + heal + ' HP', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#86efac', 1.0);
			log('💚 Mend (Rank ' + rank + '): You recover ' + heal + ' HP.', 'craft');
		} else if (id === 'spirit_hot') {
			const hp  = Math.ceil(player.maxhp * [0, 0.10, 0.17, 0.25, 0.35, 0.48, 0.63, 0.80, 1.0][rank]);
			const dur = [0, 10, 12, 14, 16, 18, 20, 22, 25][rank];
			player.hotTimer = dur;
			player.hotHealTotal = hp;
			spawnSparkBurst(headPos(), 0x86efac, 16, 1.6, 3.0);
			floatText('💚 Renewal +' + hp + 'hp', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#86efac', 1.0);
			log('✨ Renewal (Rank ' + rank + '): A healing aura — ' + hp + ' HP over ' + dur + 's.', 'craft');
		} else if (id === 'fire_fireball') {
			player.fireballMode = true;
			log('🔮 Fireball ready — click a creature to launch!', 'craft');
		} else if (id === 'ice_lance') {
			player.iceLanceMode = true;
			log('🧊 Ice Lance ready — click a creature to launch!', 'craft');
		} else if (id === 'lightning_strike') {
			player.lightningStrikeMode = true;
			log('🗲 Lightning Strike ready — click a creature to target!', 'craft');
		} else if (id === 'fire_inferno') {
			const dmg = Math.ceil(playerAtk() * [0, 0.40, 0.75, 1.20, 1.80, 2.60][rank]);
			player.infernoCast = { timer: 0, duration: 2.5, dmg, rank };
			log('🌋 Inferno — channeling… stand your ground!', 'craft');
		} else if (id === 'ice_blizzard') {
			const dmg = Math.ceil(playerAtk() * [0, 0.30, 0.55, 0.85, 1.25, 1.75][rank]);
			player.blizzardCast = { timer: 0, duration: 2.5, dmg, rank };
			log('🌨️ Blizzard — channeling… the air turns arctic!', 'craft');
		} else if (id === 'lightning_storm') {
			const dmgPerHit = Math.ceil(playerAtk() * [0, 0.14, 0.24, 0.37, 0.55, 0.78][rank]);
			player.lightningStormCast = { timer: 0, duration: 2.5, dmgPerHit, rank, hitsLeft: 4, hitTimer: 0 };
			log('🌪️ Lightning Storm — channeling… the sky blackens!', 'craft');
		} else if (id === 'spirit_healing_surge') {
			const heal = Math.ceil(player.maxhp * [0, 0.07, 0.12, 0.18, 0.26, 0.35][rank]);
			player.healingSurge = { hitsLeft: 3, healPerPulse: heal, timer: 0 };
			floatText('💫 Surge!', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#86efac', 1.0);
			log('💫 Healing Surge (Rank ' + rank + '): 3 pulses of ' + heal + ' HP over 4s.', 'craft');
		} else if (id === 'lightning_static_aura') {
			const dmg = Math.ceil(playerAtk() * [0, 0.15, 0.22, 0.30, 0.38, 0.48][rank]);
			player.staticAuraTimer = 10;
			player.staticAuraDmg = dmg;
			floatText('🌩️ Aura +' + dmg + '/s', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#facc15', 1.0);
			log('🌩️ Static Aura (Rank ' + rank + '): ' + dmg + ' lightning/s to all nearby for 10s.', 'craft');
		} else if (id === 'ice_shatter') {
			const dmg = Math.ceil(playerAtk() * [0, 0.55, 0.95, 1.45, 2.05, 2.80][rank]);
			let shattered = 0;
			for (let i = player.iceFreeze.length - 1; i >= 0; i--) {
				const f = player.iceFreeze[i];
				if (f.creature.state !== 'dead') {
					creatureTakeDamage(f.creature, dmg);
					floatText('💎 ' + dmg, f.creature.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#7dd3fc', 1.1);
					shattered++;
				}
				player.iceFreeze.splice(i, 1);
			}
			if (shattered === 0) log('❄️ No frozen enemies to shatter.', 'warn');
			else log('💎 Shatter (Rank ' + rank + '): Shattered ' + shattered + ' frozen enemy/ies for ' + dmg + ' damage!', 'craft');
		} else if (id === 'ice_frost_nova') {
			const radius = [0, 5, 6, 7, 8, 9][rank];
			const freeze = [0, 2, 2, 3, 3, 4][rank];
			let frozen = 0;
			for (const c of creatures) {
				if (c.state === 'dead') continue;
				if (c.group.position.distanceTo(player.group.position) <= radius) {
					if (!player.iceFreeze.some(f => f.creature === c))
						player.iceFreeze.push({ creature: c, turnsLeft: freeze });
					frozen++;
				}
			}
			spawnGroundRing(player.group.position.clone(), radius, 0x7dd3fc, 0.7);
			floatText('❄️ Nova!', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#7dd3fc', 1.1);
			log('❄️ Frost Nova (Rank ' + rank + '): Froze ' + frozen + ' enemies for ' + freeze + ' turns!', 'craft');
		} else if (id === 'ice_glacial_armor') {
			const absorbs = [0, 40, 70, 105, 145, 190][rank];
			const explDmg = [0, 20, 35, 55, 78, 105][rank];
			player.glacialArmorTimer = 12;
			player.glacialArmorAbsorb = absorbs;
			player.glacialArmorExplosionDmg = explDmg;
			spawnGroundRing(player.group.position.clone(), 0x7dd3fc, 0.3, 2.2, 0.8, 0.08);
			spawnSparkBurst(headPos(), 0xbae6fd, 22, 1.8, 2.8);
			floatText('🧊 Glacial +' + absorbs, headPos().add(new THREE.Vector3(0, 0.5, 0)), '#bae6fd', 1.0);
			log('🧊 Glacial Armor (Rank ' + rank + '): Absorbs ' + absorbs + ' damage. Shatters for ' + explDmg + '.', 'craft');
		} else if (id === 'fire_flame_wall') {
			const dps = [0, 8, 14, 20, 28, 38][rank];
			const dur = [0, 6, 7, 8, 10, 12][rank];
			player.flameWallTimer = dur;
			player.flameWallDps = dps;
			spawnGroundRing(player.group.position.clone(), 4, 0xff4400, 0.8);
			floatText('🔥 Wall!', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#fb923c', 1.0);
			log('🔥 Flame Wall (Rank ' + rank + '): ' + dps + ' dmg/s for ' + dur + 's to enemies at your feet.', 'craft');
		} else if (id === 'fire_magma_shell') {
			const absorbs = [0, 30, 55, 85, 120, 160][rank];
			const retDmg = [0, 8, 14, 22, 32, 45][rank];
			player.magmaShellTimer = 15;
			player.magmaShellAbsorb = absorbs;
			player.magmaShellReturnDmg = retDmg;
			spawnGroundRing(player.group.position.clone(), 0xff6600, 0.3, 2.2, 0.8, 0.08);
			spawnSparkBurst(headPos(), 0xff4400, 22, 1.8, 2.8);
			spawnPillar(player.group.position.clone(), 0xff4400, 0.6);
			floatText('🛡️ Shell +' + absorbs, headPos().add(new THREE.Vector3(0, 0.5, 0)), '#f97316', 1.0);
			log('🛡️ Magma Shell (Rank ' + rank + '): Absorbs ' + absorbs + ' damage, returns ' + retDmg + ' fire to attackers.', 'craft');
		} else if (id === 'lightning_chain') {
			const primaryDmg = [0, 18, 30, 45, 65, 90][rank];
			const arcDmg = [0, 9, 15, 23, 33, 48][rank];
			const arcCount = rank >= 3 ? 3 : 2;
			const nearby = [...creatures].filter(c => c.state !== 'dead').sort((a, b) =>
				a.group.position.distanceTo(player.group.position) - b.group.position.distanceTo(player.group.position));
			if (nearby.length === 0) { log('⚡ No targets.', 'warn'); return; }
			const primary = nearby[0];
			creatureTakeDamage(primary, primaryDmg);
			floatText('⚡ ' + primaryDmg, primary.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#facc15', 1.1);
			spawnSparkBurst(primary.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xfacc15);
			const arcs = nearby.slice(1, arcCount + 1);
			for (const arc of arcs) {
				creatureTakeDamage(arc, arcDmg);
				floatText('⚡ ' + arcDmg, arc.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#fde047', 1.0);
			}
			log('⚡ Chain Lightning (Rank ' + rank + '): ' + primaryDmg + ' primary, ' + arcDmg + ' to ' + arcs.length + ' arc targets.', 'craft');
		} else if (id === 'lightning_discharge') {
			const dmgPerEffect = [0, 20, 25, 32, 42, 55][rank];
			let total = 0;
			for (const c of creatures) {
				if (c.state === 'dead') continue;
				let effects = 0;
				const stunIdx = player.lightningStuns.findIndex(s => s.creature === c);
				if (stunIdx >= 0) { effects++; player.lightningStuns.splice(stunIdx, 1); }
				if (effects > 0) {
					const d = effects * dmgPerEffect;
					total += d;
					creatureTakeDamage(c, d);
					floatText('💥 ' + d, c.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#facc15', 1.1);
					spawnSparkBurst(c.group.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xfacc15);
				}
			}
			if (total === 0) log('💥 No shocked/stunned targets to discharge.', 'warn');
			else log('💥 Discharge (Rank ' + rank + '): Released ' + total + ' total lightning damage!', 'craft');
		} else if (id === 'lightning_ball') {
			const dps = [0, 8, 14, 20, 28, 38][rank];
			const dur = [0, 6, 7, 8, 9, 10][rank];
			const radius = 3;
			if (player.ballLightningObj) { scene.remove(player.ballLightningObj.mesh); player.ballLightningObj = null; }
			const ballGeo = new THREE.SphereGeometry(0.35, 10, 10);
			const ballMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true });
			const ballMesh = new THREE.Mesh(ballGeo, ballMat);
			ballMesh.position.copy(player.group.position).add(new THREE.Vector3(0, 1.5, 0));
			scene.add(ballMesh);
			player.ballLightningObj = { mesh: ballMesh, timer: dur, dps, radius };
			floatText('🔵 Ball!', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#38bdf8', 1.0);
			log('🔵 Ball Lightning (Rank ' + rank + '): ' + dps + ' dmg/s to nearby enemies for ' + dur + 's.', 'craft');
		} else if (id === 'spirit_soul_leech') {
			const nearby = [...creatures].filter(c => c.state !== 'dead').sort((a, b) =>
				a.group.position.distanceTo(player.group.position) - b.group.position.distanceTo(player.group.position));
			if (nearby.length === 0) { log('🌀 No targets.', 'warn'); return; }
			const dps = [0, 8, 14, 20, 28, 38][rank];
			const dur = [0, 5, 6, 7, 8, 10][rank];
			player.soulLeechCast = { creature: nearby[0], timer: 0, duration: dur, dps };
			floatText('🌀 Leeching!', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#c084fc', 1.0);
			log('🌀 Soul Leech (Rank ' + rank + '): Draining ' + dps + ' HP/s from ' + nearby[0].def.name + ' for ' + dur + 's.', 'craft');
		} else if (id === 'spirit_spirit_walk') {
			const dur = [0, 2, 2.5, 3, 3.5, 4][rank];
			player.spiritWalkTimer = dur;
			spawnSparkBurst(headPos(), 0xe9d5ff, 20, 1.4, 3.5);
			spawnPillar(player.group.position.clone(), 0xc4b5fd, 0.5);
			floatText('👻 Ethereal!', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#e9d5ff', 1.1);
			log('👻 Spirit Walk (Rank ' + rank + '): Untargetable for ' + dur + 's.', 'craft');
		} else if (id === 'spirit_aegis') {
			const absorbs = [0, 50, 90, 135, 185, 240][rank];
			const dur = rank >= 3 ? 12 : 10;
			player.aegisTimer = dur;
			player.aegisAbsorb = absorbs;
			spawnGroundRing(player.group.position.clone(), 0xa78bfa, 0.3, 2.4, 0.9, 0.08);
			spawnSparkBurst(headPos(), 0xc4b5fd, 22, 1.8, 3.0);
			spawnPillar(player.group.position.clone(), 0x8b5cf6, 0.6);
			floatText('🔮 Aegis +' + absorbs, headPos().add(new THREE.Vector3(0, 0.5, 0)), '#a78bfa', 1.0);
			log('🔮 Aegis (Rank ' + rank + '): Spirit shield absorbs ' + absorbs + ' damage for ' + dur + 's.', 'craft');
		}
		refreshHotbarUI();
	}

	// ------------------------------------------------------------------ passive effect helpers
	function applyPassiveOnHit(c) {
		// Fire passive: burn
		const fRank = talentRank('fire_passive');
		const burnChance = [0, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90][fRank] || 0;
		const burnDmg    = Math.max(1, Math.ceil(playerAtk() * ([0, 0.15, 0.22, 0.30, 0.38, 0.46, 0.55, 0.65, 0.76][fRank] || 0)));
		const burnTicks  = [0, 4, 5, 5, 6, 6, 7, 7, 8][fRank] || 4;
		if (burnChance > 0 && Math.random() < burnChance) {
			const existing = player.burnTargets.find(b => b.creature === c);
			if (existing) { existing.ticks = burnTicks; existing.dmgPerTick = burnDmg; }
			else player.burnTargets.push({ creature: c, dmgPerTick: burnDmg, ticks: burnTicks, timer: 1 });
			log('🔥 Burn! The ' + c.name + ' ignites for ' + burnDmg + ' per second.', 'dmgOut');
		}

		// Lightning passive: shock
		const lRank = talentRank('lightning_passive');
		const shockChance   = [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.09][lRank] || 0;
		const shockBonusDmg = Math.ceil(playerAtk() * ([0, 0.3, 0.45, 0.62, 0.82, 1.05, 1.30, 1.60, 1.95][lRank] || 0));
		const stunCycles    = [0, 1, 1, 1, 2, 2, 2, 3, 3][lRank] || 0;
		if (shockChance > 0 && Math.random() < shockChance) {
			creatureTakeDamage(c, shockBonusDmg);
			floatText('⚡ ' + shockBonusDmg, headPos().add(new THREE.Vector3(0.4, 0.3, 0)), '#facc15', 0.9);
			const existingStun = player.lightningStuns.find(s => s.creature === c);
			if (existingStun) { existingStun.timer = stunCycles * 1.6; }
			else { player.lightningStuns.push({ creature: c, timer: stunCycles * 1.6 }); c.attackTimer = stunCycles * 1.6; }
			log('⚡ Shocked! The ' + c.name + ' is stunned for ' + stunCycles + ' cycle(s).', 'dmgOut');
		}

		// Ice passive: freeze
		const iRank = talentRank('ice_passive');
		const freezeChance = [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.09][iRank] || 0;
		const freezeTurns  = [0, 1, 1, 2, 2, 2, 3, 3, 4][iRank] || 0;
		if (freezeChance > 0 && Math.random() < freezeChance) {
			const existingFreeze = player.iceFreeze.find(f => f.creature === c);
			if (existingFreeze) { existingFreeze.turnsLeft = freezeTurns; }
			else { player.iceFreeze.push({ creature: c, turnsLeft: freezeTurns }); c.attackTimer = freezeTurns * 1.6; }
			log('❄️ Frozen! The ' + c.name + ' cannot attack for ' + freezeTurns + ' turns.', 'dmgOut');
		}

		// Brittle: frozen enemies take more physical damage (tracked via flag on creature)
		// (damage amplification is applied in creatureTakeDamage when brittle is active)

		// Siphon: leech HP on hit
		const siphonRank = talentRank('spirit_siphon');
		if (siphonRank > 0) {
			const siphonChance = [0, 0.20, 0.30, 0.40, 0.50, 0.65][siphonRank];
			const siphonHeal   = Math.max(1, Math.ceil(playerAtk() * ([0, 0.12, 0.20, 0.28, 0.36, 0.46][siphonRank])));
			if (Math.random() < siphonChance) {
				player.hp = Math.min(player.maxhp, player.hp + siphonHeal);
				setBar(player.bar, player.hp / player.maxhp); refreshHpUI();
				floatText('+' + siphonHeal + ' siphon', headPos().add(new THREE.Vector3(0.3, 0.3, 0)), '#86efac', 0.75);
			}
		}
		// Cold Snap: every 3rd attack chills/freezes
		const csRank = talentRank('ice_cold_snap');
		if (csRank > 0) {
			player.coldSnapCount = (player.coldSnapCount || 0) + 1;
			if (player.coldSnapCount >= 3) {
				player.coldSnapCount = 0;
				const bonusDmg = [0, 0, 8, 15, 20, 28][csRank];
				const freezeTurns = csRank >= 4 ? (csRank >= 5 ? 2 : 1) : 0;
				if (bonusDmg > 0) {
					creatureTakeDamage(c, bonusDmg);
					floatText('❄️ Snap +' + bonusDmg, c.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '#7dd3fc', 0.9);
				}
				if (freezeTurns > 0) {
					const ef = player.iceFreeze.find(f => f.creature === c);
					if (ef) ef.turnsLeft = Math.max(ef.turnsLeft, freezeTurns);
					else player.iceFreeze.push({ creature: c, turnsLeft: freezeTurns });
					floatText('❄️ Frozen!', c.group.position.clone().add(new THREE.Vector3(0, 2.5, 0)), '#bae6fd', 0.9);
				} else {
					floatText('❄️ Chill!', c.group.position.clone().add(new THREE.Vector3(0, 2.5, 0)), '#7dd3fc', 0.8);
				}
			}
		}
		// Pyroclasm: critical burn ticks (handled in burn loop, but flag for burn application)
		// (burn applied from fire_passive; Pyroclasm's crit is handled in updateTalentEffects burn loop)
	}

	// ------------------------------------------------------------------ update talent DoT/HoT/cooldowns
	function updateTalentEffects(dt) {
		// burn DoT
		for (let i = player.burnTargets.length - 1; i >= 0; i--) {
			const b = player.burnTargets[i];
			if (b.creature.state === 'dead') { player.burnTargets.splice(i, 1); continue; }
			b.timer -= dt;
			if (b.timer <= 0) {
				b.timer = 1;
				b.ticks--;
				const wasBurning = b.creature.state !== 'dead';
				let tickDmg = b.dmgPerTick;
				// Pyroclasm: chance for burn crit
				const pyroRank = talentRank('fire_pyroclasm');
				if (pyroRank > 0) {
					const pyroCrit = [0, 0.10, 0.15, 0.20, 0.28, 0.35][pyroRank];
					if (Math.random() < pyroCrit) { tickDmg *= 2; }
				}
				creatureTakeDamage(b.creature, tickDmg);
				floatText('🔥 ' + tickDmg, b.creature.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '#fb923c', 0.8);
				// Backdraft: chance to add extra tick
				const bdRank = talentRank('fire_backdraft');
				if (bdRank > 0) {
					const bdChance = [0, 0.10, 0.15, 0.20, 0.25, 0.30][bdRank];
					if (Math.random() < bdChance) b.ticks++;
				}
				// Wildfire: spread burn to nearby enemy
				const wfRank = talentRank('fire_wildfire');
				if (wfRank > 0) {
					const wfChance = [0, 0.20, 0.30, 0.45, 0.60, 0.80][wfRank];
					if (Math.random() < wfChance) {
						const origin = b.creature.group.position;
						const nearby = creatures.find(cc => cc !== b.creature && cc.state !== 'dead'
							&& !player.burnTargets.find(bx => bx.creature === cc)
							&& cc.group.position.distanceTo(origin) < 5);
						if (nearby) {
							player.burnTargets.push({ creature: nearby, dmgPerTick: b.dmgPerTick, ticks: Math.max(1, b.ticks - 1), timer: 1 });
							floatText('🔥 spread!', nearby.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#fb923c', 0.8);
						}
					}
				}
				// Cremation: dying-while-burning explosion
				if (wasBurning && b.creature.state === 'dead') {
					const cremRank = talentRank('fire_cremation');
					if (cremRank > 0) {
						const cremDmg = Math.ceil(playerAtk() * [0, 0.25, 0.45, 0.70, 1.00, 1.40][cremRank]);
						const origin = b.creature.group.position;
						creatures.forEach(cc => {
							if (cc.state !== 'dead' && cc.group.position.distanceTo(origin) < 4) {
								creatureTakeDamage(cc, cremDmg);
								floatText('💀 ' + cremDmg, cc.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#ff6b35', 1.0);
							}
						});
						log('💀 Cremation explosion for ' + cremDmg + ' fire damage!', 'dmgOut');
					}
				}
				if (b.ticks <= 0) player.burnTargets.splice(i, 1);
			}
		}
		// lightning stuns + aftershock
		for (let i = player.lightningStuns.length - 1; i >= 0; i--) {
			const s = player.lightningStuns[i];
			s.timer -= dt;
			if (s.timer <= 0 || s.creature.state === 'dead') {
				// Aftershock: burst damage when stun expires
				const asRank = talentRank('lightning_aftershock');
				if (asRank > 0 && s.creature.state !== 'dead') {
					const asDmg = Math.ceil(playerAtk() * ([0, 0.22, 0.40, 0.62, 0.88, 1.20][asRank]));
					creatureTakeDamage(s.creature, asDmg);
					floatText('⚡ ' + asDmg, s.creature.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#facc15', 1.0);
				}
				player.lightningStuns.splice(i, 1);
			}
		}
		// static aura tick
		if (player.staticAuraTimer > 0) {
			player.staticAuraTimer -= dt;
			if (player.staticAuraTimer <= 0) {
				player.staticAuraTimer = 0;
				log('🌩️ Static Aura faded.', 'sys');
			} else {
				const playerPos = player.group ? player.group.position : new THREE.Vector3();
				creatures.forEach(c => {
					if (c.state !== 'dead' && c.group.position.distanceTo(playerPos) < 6) {
						const tickDmg = (player.staticAuraDmg || 0) * dt;
						creatureTakeDamage(c, tickDmg);
					}
				});
			}
		}
		// inferno channel
		if (player.infernoCast) {
			const ic = player.infernoCast;
			ic.timer += dt;
			const frac = ic.timer / ic.duration;
			// during cast: spinning charge rings + growing glow around player
			const pp = player.group.position.clone();
			if (Math.floor(ic.timer / 0.18) > Math.floor((ic.timer - dt) / 0.18)) {
				spawnGroundRing(pp, 0xff3300, 0.3, 1.4 + frac * 3.5, 0.4, 0.06);
			}
			if (frac >= 1) {
				// DETONATE
				const aoeRadius = 7;
				const dmg = ic.dmg;
				// big blast rings expanding outward
				spawnGroundRing(pp, 0xff2200, 0.4, aoeRadius * 1.1, 0.9, 0.06);
				spawnGroundRing(pp, 0xff6600, 0.2, aoeRadius * 0.7, 0.7, 0.1);
				spawnGroundRing(pp, 0xffaa00, 0.1, aoeRadius * 0.4, 0.55, 0.14);
				spawnPillar(pp, 0xff3300, 1.2);
				spawnSparkBurst(pp, 0xff4400, 40, 5.5, 5.0);
				spawnSparkBurst(pp, 0xffaa00, 25, 3.5, 3.5);
				floatText('🌋 INFERNO!', pp.clone().add(new THREE.Vector3(0, 3.5, 0)), '#ff4400', 1.6);
				let hits = 0;
				creatures.forEach(c => {
					if (c.state !== 'dead' && c.group.position.distanceTo(pp) <= aoeRadius) {
						creatureTakeDamage(c, dmg);
						floatText('🔥 ' + dmg, c.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '#ff6b35', 1.1);
						spawnSparkBurst(c.group.position.clone(), 0xff4400, 14, 2.5, 3.0);
						applyPassiveOnHit(c);
						hits++;
					}
				});
				log('🌋 Inferno (Rank ' + ic.rank + '): ' + dmg + ' fire damage to ' + hits + ' enemies!', 'dmgOut');
				player.infernoCast = null;
			}
		}
		// blizzard channel
		if (player.blizzardCast) {
			const bc = player.blizzardCast;
			bc.timer += dt;
			const frac = bc.timer / bc.duration;
			const pp = player.group.position.clone();
			if (Math.floor(bc.timer / 0.18) > Math.floor((bc.timer - dt) / 0.18)) {
				spawnGroundRing(pp, 0x7dd3fc, 0.3, 1.4 + frac * 3.5, 0.4, 0.06);
			}
			if (frac >= 1) {
				const aoeRadius = 7;
				const dmg = bc.dmg;
				spawnGroundRing(pp, 0xaaddff, 0.4, aoeRadius * 1.1, 0.9, 0.06);
				spawnGroundRing(pp, 0xcceeff, 0.2, aoeRadius * 0.7, 0.7, 0.1);
				spawnGroundRing(pp, 0xffffff, 0.1, aoeRadius * 0.4, 0.55, 0.14);
				spawnPillar(pp, 0x7dd3fc, 1.0);
				spawnSparkBurst(pp, 0xaaddff, 40, 5.5, 5.0);
				spawnSparkBurst(pp, 0xffffff, 25, 3.5, 3.5);
				floatText('🌨️ BLIZZARD!', pp.clone().add(new THREE.Vector3(0, 3.5, 0)), '#7dd3fc', 1.6);
				let hits = 0;
				creatures.forEach(c => {
					if (c.state !== 'dead' && c.group.position.distanceTo(pp) <= aoeRadius) {
						creatureTakeDamage(c, dmg);
						floatText('❄️ ' + dmg, c.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '#7dd3fc', 1.1);
						spawnSparkBurst(c.group.position.clone(), 0xaaddff, 14, 2.5, 3.0);
						// freeze for 2 turns
						const existingFreeze = player.iceFreeze.find(f => f.creature === c);
						if (existingFreeze) { existingFreeze.turnsLeft = Math.max(existingFreeze.turnsLeft, 2); }
						else { player.iceFreeze.push({ creature: c, turnsLeft: 2 }); }
						hits++;
					}
				});
				log('🌨️ Blizzard (Rank ' + bc.rank + '): ' + dmg + ' ice damage + froze ' + hits + ' enemies!', 'dmgOut');
				player.blizzardCast = null;
			}
		}
		// lightning storm channel + ticking
		if (player.lightningStormCast) {
			const ls = player.lightningStormCast;
			ls.timer += dt;
			const frac = ls.timer / ls.duration;
			const pp = player.group.position.clone();
			// during channel: arcing yellow rings
			if (ls.hitsLeft === 4 && ls.timer <= ls.duration) {
				if (Math.floor(ls.timer / 0.18) > Math.floor((ls.timer - dt) / 0.18)) {
					spawnGroundRing(pp, 0xfacc15, 0.3, 1.4 + frac * 3.5, 0.4, 0.06);
				}
			}
			if (frac >= 1 && ls.hitsLeft > 0) {
				// first hit fires on channel completion; subsequent hits every 2s
				ls.hitTimer -= dt;
				if (ls.timer >= ls.duration && ls.hitTimer <= 0) {
					ls.hitTimer = 2.0;
					const aoeRadius = 7;
					spawnGroundRing(pp, 0xfacc15, 0.3, aoeRadius * 0.9, 0.5, 0.08);
					spawnSparkBurst(pp, 0xfacc15, 20, 4.0, 3.5);
					floatText('🌪️ Storm ' + (5 - ls.hitsLeft) + '/4!', pp.clone().add(new THREE.Vector3(0, 3.5, 0)), '#facc15', 1.0);
					creatures.forEach(c => {
						if (c.state !== 'dead' && c.group.position.distanceTo(pp) <= aoeRadius) {
							creatureTakeDamage(c, ls.dmgPerHit);
							floatText('⚡ ' + ls.dmgPerHit, c.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '#facc15', 1.0);
							spawnSparkBurst(c.group.position.clone(), 0xfacc15, 10, 2.0, 2.5);
							applyPassiveOnHit(c);
						}
					});
					log('🌪️ Storm strikes! (' + ls.dmgPerHit + ' lightning to all nearby)', 'dmgOut');
					ls.hitsLeft--;
					if (ls.hitsLeft <= 0) player.lightningStormCast = null;
				}
			}
		}
		// lightning strike multi-hit sequences
		for (let i = player.lightningStrikes.length - 1; i >= 0; i--) {
			const ls = player.lightningStrikes[i];
			if (ls.creature.state === 'dead' || ls.hitsLeft <= 0) { player.lightningStrikes.splice(i, 1); continue; }
			ls.timer -= dt;
			if (ls.timer <= 0) {
				ls.timer = ls.interval;
				creatureTakeDamage(ls.creature, ls.damage);
				floatText('⚡ ' + ls.damage, ls.creature.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '#facc15', 1.0);
				spawnSparkBurst(ls.creature.group.position.clone(), 0xfacc15, 12, 2.0, 2.5);
				spawnPillar(ls.creature.group.position.clone(), 0xfacc15, 0.6);
				applyPassiveOnHit(ls.creature);
				ls.hitsLeft--;
				if (ls.hitsLeft <= 0) {
					log('🗲 Lightning Strike: final bolt hits ' + ls.creature.name + '!', 'dmgOut');
					player.lightningStrikes.splice(i, 1);
				} else {
					log('🗲 Lightning Strike: bolt hits ' + ls.creature.name + ' for ' + ls.damage + ' (' + ls.hitsLeft + ' remaining)!', 'dmgOut');
				}
			}
		}
		// healing surge pulses
		if (player.healingSurge) {
			const hs = player.healingSurge;
			hs.timer -= dt;
			if (hs.timer <= 0) {
				hs.timer = 2.0;
				const heal = hs.healPerPulse;
				player.hp = Math.min(player.maxhp, player.hp + heal);
				setBar(player.bar, player.hp / player.maxhp); refreshHpUI();
				floatText('+' + heal + ' 💫', headPos().add(new THREE.Vector3(0, 0.6, 0)), '#86efac', 1.0);
				log('💫 Healing Surge pulse: +' + heal + ' HP.', 'craft');
				hs.hitsLeft--;
				if (hs.hitsLeft <= 0) player.healingSurge = null;
			}
		}
		// ice freeze cleanup + Permafrost patch on frozen death
		for (let i = player.iceFreeze.length - 1; i >= 0; i--) {
			const f = player.iceFreeze[i];
			if (f.creature.state === 'dead' || f.turnsLeft <= 0) {
				// Permafrost: leave ice patch when frozen enemy dies
				if (f.creature.state === 'dead') {
					const pfRank = talentRank('ice_permafrost');
					if (pfRank > 0) {
						const pfRadius = [0, 5, 6, 6, 7, 7][pfRank];
						const pfDur = [0, 8, 10, 10, 12, 15][pfRank];
						const pfDps = [0, 0, 0, 5, 9, 14][pfRank];
						const patchGeo = new THREE.CylinderGeometry(pfRadius, pfRadius, 0.05, 16);
						const patchMat = new THREE.MeshBasicMaterial({ color: 0xbae6fd, transparent: true, opacity: 0.35 });
						const patchMesh = new THREE.Mesh(patchGeo, patchMat);
						patchMesh.position.copy(f.creature.group.position);
						scene.add(patchMesh);
						player.permafrostPatches.push({ mesh: patchMesh, timer: pfDur, radius: pfRadius, dps: pfDps });
					}
				}
				player.iceFreeze.splice(i, 1);
			}
		}
		// frost ward timer
		if (player.frostWardTimer > 0) {
			player.frostWardTimer -= dt;
			if (player.frostWardTimer <= 0) {
				player.frostWardTimer = 0;
				player.frostWardBonus = 0;
				refreshStatsUI();
				log('🧊 Frost Ward faded.', 'sys');
			}
		}
		// HoT (talent)
		if (player.hotTimer > 0) {
			const totalHp  = player.hotHealTotal || 15;
			const totalDur = player.hotTimer + dt;
			player.hotTimer -= dt;
			const healRate = dt * (totalHp / (totalDur));
			player.hp = Math.min(player.maxhp, player.hp + healRate);
			setBar(player.bar, player.hp / player.maxhp); refreshHpUI();
			if (player.hotTimer <= 0) player.hotTimer = 0;
		}
		// Consumable HoT (Moonbloom Salve, Starbloom Brew, etc.)
		if (player.consumableHotTimer > 0) {
			const totalHp = player.consumableHotTotal || 0;
			const totalDur = player.consumableHotTimer + dt;
			player.consumableHotTimer -= dt;
			const rate = dt * (totalHp / totalDur);
			player.hp = Math.min(player.maxhp, player.hp + rate);
			setBar(player.bar, player.hp / player.maxhp); refreshHpUI();
			if (player.consumableHotTimer <= 0) { player.consumableHotTimer = 0; player.consumableHotTotal = 0; }
		}
		// Consumable ATK buff
		if (player.consumableAtkTimer > 0) {
			player.consumableAtkTimer -= dt;
			if (player.consumableAtkTimer <= 0) { player.consumableAtkTimer = 0; player.consumableAtk = 0; refreshStatsUI(); log('⚔️ ATK buff faded.', 'sys'); }
		}
		// Consumable DEF buff
		if (player.consumableDefTimer > 0) {
			player.consumableDefTimer -= dt;
			if (player.consumableDefTimer <= 0) { player.consumableDefTimer = 0; player.consumableDef = 0; refreshStatsUI(); log('🛡️ DEF buff faded.', 'sys'); }
		}
		// Consumable damage reduction
		if (player.consumableDmgReduceTimer > 0) {
			player.consumableDmgReduceTimer -= dt;
			if (player.consumableDmgReduceTimer <= 0) { player.consumableDmgReduceTimer = 0; player.consumableDmgReduce = 0; log('🌑 Void Shroud faded.', 'sys'); }
		}
		// Fortitude: keep maxhp in sync with rank
		const fortRank2 = talentRank('spirit_fortitude');
		const fortBonus = [0, 10, 18, 25, 32, 40][fortRank2];
		const delta = fortBonus - player.fortitudeMaxhpApplied;
		if (delta !== 0) {
			player.maxhp += delta;
			player.hp = Math.min(player.hp + Math.max(0, delta), player.maxhp);
			player.fortitudeMaxhpApplied = fortBonus;
			refreshHpUI();
		}
		// Magma Shell tick-down
		if (player.magmaShellTimer > 0) {
			player.magmaShellTimer -= dt;
			if (player.magmaShellTimer <= 0) {
				player.magmaShellTimer = 0; player.magmaShellAbsorb = 0;
				log('🛡️ Magma Shell expired.', 'sys');
			}
		}
		// Flame Wall tick
		if (player.flameWallTimer > 0) {
			player.flameWallTimer -= dt;
			if (player.flameWallTimer <= 0) {
				player.flameWallTimer = 0;
				log('🔥 Flame Wall expired.', 'sys');
			} else {
				const pp = player.group ? player.group.position : new THREE.Vector3();
				creatures.forEach(c => {
					if (c.state !== 'dead' && c.group.position.distanceTo(pp) < 4) {
						const wallDmg = player.flameWallDps * dt;
						creatureTakeDamage(c, wallDmg, true);
					}
				});
			}
		}
		// Glacial Armor tick-down
		if (player.glacialArmorTimer > 0) {
			player.glacialArmorTimer -= dt;
			if (player.glacialArmorTimer <= 0) {
				player.glacialArmorTimer = 0;
				// explode on expiry
				const expDmg = player.glacialArmorExplosionDmg;
				const pp = player.group ? player.group.position : new THREE.Vector3();
				spawnGroundRing(pp, 0x7dd3fc, 0.5, 5, 0.7, 0.08);
				creatures.forEach(c => {
					if (c.state !== 'dead' && c.group.position.distanceTo(pp) < 5) {
						creatureTakeDamage(c, expDmg);
						floatText('🧊 ' + expDmg, c.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#bae6fd', 1.1);
					}
				});
				log('🧊 Glacial Armor shattered for ' + expDmg + ' ice damage!', 'dmgOut');
				player.glacialArmorAbsorb = 0; player.glacialArmorExplosionDmg = 0;
			}
		}
		// Ball Lightning tick
		if (player.ballLightningObj) {
			const bl = player.ballLightningObj;
			bl.timer -= dt;
			if (bl.timer <= 0) {
				scene.remove(bl.mesh);
				player.ballLightningObj = null;
				log('🔵 Ball Lightning dissipated.', 'sys');
			} else {
				// float slowly upward
				bl.mesh.position.y = (player.group ? player.group.position.y : 0) + 1.5 + Math.sin(bl.timer * 2) * 0.3;
				creatures.forEach(c => {
					if (c.state !== 'dead' && c.group.position.distanceTo(bl.mesh.position) < bl.radius) {
						creatureTakeDamage(c, bl.dps * dt, true);
					}
				});
			}
		}
		// Soul Leech tick
		if (player.soulLeechCast) {
			const sl = player.soulLeechCast;
			sl.timer += dt;
			if (sl.creature.state === 'dead' || sl.timer >= sl.duration) {
				player.soulLeechCast = null;
				log('🌀 Soul Leech ended.', 'sys');
			} else {
				const drain = sl.dps * dt;
				creatureTakeDamage(sl.creature, drain, true);
				player.hp = Math.min(player.maxhp, player.hp + drain);
				setBar(player.bar, player.hp / player.maxhp); refreshHpUI();
			}
		}
		// Spirit Walk tick-down
		if (player.spiritWalkTimer > 0) {
			player.spiritWalkTimer -= dt;
			if (player.spiritWalkTimer <= 0) {
				player.spiritWalkTimer = 0;
				log('👻 Spirit Walk ended.', 'sys');
			}
		}
		// Aegis tick-down
		if (player.aegisTimer > 0) {
			player.aegisTimer -= dt;
			if (player.aegisTimer <= 0) {
				player.aegisTimer = 0; player.aegisAbsorb = 0;
				log('🔮 Aegis faded.', 'sys');
			}
		}
		// Permafrost patches tick
		for (let i = player.permafrostPatches.length - 1; i >= 0; i--) {
			const patch = player.permafrostPatches[i];
			patch.timer -= dt;
			if (patch.timer <= 0) {
				scene.remove(patch.mesh);
				player.permafrostPatches.splice(i, 1);
			} else if (patch.dps > 0) {
				creatures.forEach(c => {
					if (c.state !== 'dead' && c.group.position.distanceTo(patch.mesh.position) < patch.radius) {
						creatureTakeDamage(c, patch.dps * dt, true);
					}
				});
			}
		}
		// Flush accumulated DoT float text (throttled to ~0.6s intervals)
		creatures.forEach(c => { if (c.state !== 'dead') flushDotFloatText(c, dt); });
		// Phoenix Mark: auto-heal when low HP
		if (!player.phoenixMarkUsed) {
			const pmRank = talentRank('fire_phoenix_mark');
			if (pmRank > 0) {
				const threshold = [0, 0.20, 0.20, 0.25, 0.25, 0.30][pmRank];
				const heal = [0, 25, 45, 70, 100, 140][pmRank];
				if (player.hp / player.maxhp <= threshold) {
					player.hp = Math.min(player.maxhp, player.hp + heal);
					player.phoenixMarkUsed = true;
					setBar(player.bar, player.hp / player.maxhp); refreshHpUI();
					floatText('🦅 +' + heal + ' Phoenix!', headPos().add(new THREE.Vector3(0, 0.8, 0)), '#fbbf24', 1.3);
					log('🦅 Phoenix Mark triggered: healed ' + heal + ' HP!', 'craft');
				}
			}
		}
		// Resurrection Mark: auto-Mend when very low HP
		if (!player.resurrectionMarkUsed) {
			const rmRank = talentRank('spirit_resurrection_mark');
			if (rmRank > 0) {
				const threshold = [0, 0.15, 0.15, 0.20, 0.20, 0.25][rmRank];
				const heal = [0, 30, 55, 85, 120, 160][rmRank];
				if (player.hp / player.maxhp <= threshold) {
					player.hp = Math.min(player.maxhp, player.hp + heal);
					player.resurrectionMarkUsed = true;
					setBar(player.bar, player.hp / player.maxhp); refreshHpUI();
					floatText('✨ +' + heal + ' Risen!', headPos().add(new THREE.Vector3(0, 0.8, 0)), '#e9d5ff', 1.3);
					log('✨ Resurrection Mark triggered: healed ' + heal + ' HP!', 'craft');
				}
			}
		}
		// cooldowns
		for (const id of Object.keys(player.skillCooldowns)) {
			player.skillCooldowns[id] -= dt;
			if (player.skillCooldowns[id] <= 0) delete player.skillCooldowns[id];
		}
		refreshHotbarUI();
	}

	// ------------------------------------------------------------------ hotbar UI
	function refreshHotbarUI() {
		const container = document.getElementById('hotbarSlots');
		if (!container) return;
		container.innerHTML = '';
		for (let i = 0; i < 5; i++) {
			const id = player.hotbar[i];
			const def = id ? getTalentDef(id) : null;
			const rank = id ? talentRank(id) : 0;
			const cd = id ? (player.skillCooldowns[id] || 0) : 0;
			const btn = document.createElement('div');
			const active = def && rank > 0;
			btn.className = 'relative flex flex-col items-center justify-center w-14 h-14 rounded-xl border cursor-pointer transition select-none ' +
				(active ? 'border-purple-400/50 bg-purple-400/15 hover:bg-purple-400/25' : 'border-white/10 bg-white/5 opacity-60');
			btn.title = def ? def.name + ' (Rank ' + rank + ')' + (def.type === 'active' ? ' — press ' + (i + 1) : ' (passive)') : 'Empty slot';
			const frostActive = id === 'ice_shield' && player.frostWardTimer > 0;
			btn.innerHTML =
				'<div class="text-xl">' + (def ? def.icon : '▫️') + '</div>' +
				'<div class="text-[9px] font-bold text-zinc-400">[' + (i + 1) + ']' + (rank > 0 ? ' R' + rank : '') + '</div>' +
				(frostActive ? '<div class="absolute inset-0 flex items-center justify-center rounded-xl bg-sky-400/30 text-[10px] font-bold text-sky-200">' + Math.ceil(player.frostWardTimer) + 's</div>' :
					cd > 0 ? '<div class="absolute inset-0 flex items-center justify-center rounded-xl bg-black/60 text-[11px] font-bold text-white">' + Math.ceil(cd) + 's</div>' : '');
			btn.addEventListener('click', () => activateSkill(i));
			container.appendChild(btn);
		}
	}

	// ------------------------------------------------------------------ talent tree UI
	function openTalentTree() {
		const modal = document.getElementById('talentModal');
		if (!modal) return;
		modal.classList.remove('hidden');
		modal.classList.add('flex');
		renderTalentTree();
	}
	function closeTalentTree() {
		const modal = document.getElementById('talentModal');
		if (!modal) return;
		modal.classList.add('hidden');
		modal.classList.remove('flex');
	}
	// Tracks which path tab is open in the talent tree UI
	let _activePathTab = 'fire';
	let _openRecipeTiers = null; // Set of tier names the user has opened; null = uninitialized

	// Node layout: [x%, y%] within the constellation canvas (0-100 range)
	const TALENT_NODE_LAYOUT = {
		// Fire path — main chain goes left→right, branches drop down
		fire_active:       [8,  30],
		fire_passive:      [20, 30],
		fire_backdraft:    [32, 30],
		fire_wildfire:     [44, 30],
		fire_cremation:    [56, 30],
		fire_fireball:     [68, 30],
		fire_inferno:      [80, 30],
		fire_flame_wall:   [80, 55],
		fire_magma_shell:  [80, 78],
		fire_pyroclasm:    [56, 55],
		fire_phoenix_mark: [68, 55],

		// Lightning path
		lightning_active:      [8,  30],
		lightning_passive:     [20, 30],
		lightning_conductor:   [32, 30],
		lightning_aftershock:  [44, 30],
		lightning_static_aura: [56, 30],
		lightning_strike:      [68, 30],
		lightning_storm:       [80, 30],
		lightning_chain:       [80, 55],
		lightning_discharge:   [80, 78],
		lightning_overload:    [32, 55],
		lightning_ball:        [80, 8],

		// Ice path
		ice_active:       [8,  30],
		ice_passive:      [20, 30],
		ice_shield:       [32, 30],
		ice_brittle:      [44, 30],
		ice_shatter:      [56, 30],
		ice_lance:        [68, 30],
		ice_blizzard:     [80, 30],
		ice_frost_nova:   [80, 55],
		ice_glacial_armor:[80, 78],
		ice_cold_snap:    [80, 8],
		ice_permafrost:   [44, 55],

		// Spirit path
		spirit_active:           [8,  35],
		spirit_passive:          [20, 35],
		spirit_hot:              [32, 35],
		spirit_siphon:           [44, 35],
		spirit_fortitude:        [56, 35],
		spirit_healing_surge:    [68, 35],
		spirit_soul_leech:       [80, 35],
		spirit_spirit_walk:      [80, 60],
		spirit_resurrection_mark:[32, 62],
		spirit_aegis:            [56, 62],
	};

	function renderTalentTree() {
		const ptDisplay = document.getElementById('talentPointsDisplay');
		if (ptDisplay) ptDisplay.textContent = talentPointsAvailable();
		const pathsEl = document.getElementById('talentPaths');
		if (!pathsEl) return;
		// Rescue tooltip before clearing so it isn't garbage-collected
		const tooltip = document.getElementById('talentTooltip');
		if (tooltip && tooltip.parentNode) tooltip.parentNode.removeChild(tooltip);
		pathsEl.innerHTML = '';
		pathsEl.style.cssText = 'display:flex;flex-direction:column;gap:0;padding:0;overflow:hidden;height:100%';

		// ── Path tab bar ─────────────────────────────────────────────────
		const tabBar = document.createElement('div');
		tabBar.style.cssText = 'display:flex;flex-shrink:0;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(0,0,0,0.25)';
		pathsEl.appendChild(tabBar);

		// ── Body: constellation canvas + tooltip sidebar ──────────────
		const body = document.createElement('div');
		body.style.cssText = 'display:flex;flex:1;overflow:hidden';
		pathsEl.appendChild(body);

		// ── Constellation area ────────────────────────────────────────
		const canvas = document.createElement('div');
		canvas.style.cssText = 'position:relative;flex:1;overflow:hidden;background:radial-gradient(ellipse at 50% 50%,rgba(30,20,60,0.95) 0%,rgba(5,5,15,0.98) 100%)';
		body.appendChild(canvas);

		// ── Tooltip sidebar ───────────────────────────────────────────
		const sidebar = document.createElement('div');
		sidebar.style.cssText = 'width:200px;flex-shrink:0;padding:14px 12px;border-left:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.4);font-size:11px;color:#d1d5db;overflow-y:auto';
		sidebar.innerHTML = '<div style="color:#4b5563;font-size:11px">Hover a node</div>';
		body.appendChild(sidebar);

		// ── Star-field dots ───────────────────────────────────────────
		const starSvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
		starSvg.setAttribute('width','100%'); starSvg.setAttribute('height','100%');
		starSvg.style.cssText = 'position:absolute;inset:0;pointer-events:none';
		for (let s = 0; s < 70; s++) {
			const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
			c.setAttribute('cx', (Math.random()*100)+'%'); c.setAttribute('cy', (Math.random()*100)+'%');
			c.setAttribute('r', (Math.random()*1.2+0.3).toFixed(1));
			c.setAttribute('fill','rgba(255,255,255,'+(Math.random()*0.25+0.05).toFixed(2)+')');
			starSvg.appendChild(c);
		}
		canvas.appendChild(starSvg);

		// ── SVG overlay for connector lines ───────────────────────────
		const lineSvg = document.createElementNS('http://www.w3.org/2000/svg','svg');
		lineSvg.setAttribute('width','100%'); lineSvg.setAttribute('height','100%');
		lineSvg.style.cssText = 'position:absolute;inset:0;pointer-events:none';
		canvas.appendChild(lineSvg);

		function showTalentTooltip(talent, path) {
			const rank = talentRank(talent.id);
			const maxed = rank >= talent.maxRank;
			const prereqMet = talentPrereqMet(talent.id);
			const cost = talentRankUpgradeCost(rank);
			const prereqId = TALENT_PREREQS[talent.id];
			const prereqTalent = prereqId ? path.talents.find(t => t.id === prereqId) || { name: prereqId.replace(/_/g,' ') } : null;

			let html = '<div style="font-size:24px;text-align:center;margin-bottom:6px">' + talent.icon + '</div>';
			html += '<div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:2px">' + talent.name + '</div>';
			html += '<div style="font-size:10px;margin-bottom:8px;color:' + (talent.type === 'active' ? '#fdba74' : '#93c5fd') + '">' + (talent.type === 'active' ? '⚡ Active Skill' : '🔰 Passive') + ' &nbsp;·&nbsp; Rank ' + rank + ' / ' + talent.maxRank + '</div>';
			if (rank > 0) {
				html += '<div style="font-size:10px;color:#9ca3af;font-style:italic;margin-bottom:6px;line-height:1.4">' + talent.rankDescs[rank] + '</div>';
				if (talent.type === 'active') html += '<div style="font-size:10px;color:#6b7280;margin-bottom:6px">⏱ ' + talent.cooldowns[rank] + 's cooldown</div>';
				html += '<div style="border-top:1px solid rgba(255,255,255,0.07);margin:6px 0"></div>';
			}
			if (maxed) {
				html += '<div style="font-size:11px;color:#fbbf24;font-weight:700;text-align:center">★ Maxed</div>';
			} else {
				const nr = rank + 1;
				html += '<div style="font-size:10px;color:#c4b5fd;line-height:1.4;margin-bottom:4px"><b>Rank ' + nr + ':</b> ' + talent.rankDescs[nr] + '</div>';
				if (talent.type === 'active' && nr <= talent.maxRank) html += '<div style="font-size:10px;color:#6b7280;margin-bottom:6px">⏱ ' + talent.cooldowns[nr] + 's</div>';
				if (!prereqMet) {
					html += '<div style="font-size:10px;color:#ef4444;margin-top:6px">🔒 Requires: ' + (prereqTalent ? prereqTalent.name : prereqId) + '</div>';
				} else {
					const avail = talentPointsAvailable();
					if (avail >= cost) {
						html += '<div style="font-size:11px;color:#a78bfa;font-weight:700;margin-top:8px;text-align:center">▲ Click to upgrade<br><span style="font-size:10px;font-weight:400">(' + cost + ' pt' + (cost > 1 ? 's' : '') + ')</span></div>';
					} else {
						html += '<div style="font-size:11px;color:#ef4444;margin-top:6px;text-align:center">Need ' + cost + ' pts<br><span style="font-size:10px">(have ' + avail + ')</span></div>';
					}
				}
			}
			// hotbar assignment for known active skills
			if (rank > 0 && talent.type === 'active') {
				html += '<div style="border-top:1px solid rgba(255,255,255,0.07);margin:8px 0 4px;font-size:10px;color:#6b7280">Hotbar slots</div>';
				html += '<div id="ttHotbarSlots" style="display:flex;gap:4px;flex-wrap:wrap">';
				for (let si = 0; si < 5; si++) {
					const assigned = player.hotbar[si] === talent.id;
					html += '<div data-slot="' + si + '" data-tid="' + talent.id + '" style="width:24px;height:24px;border-radius:4px;border:1px solid ' +
						(assigned ? path.color : 'rgba(255,255,255,0.15)') +
						';background:' + (assigned ? 'rgba(139,92,246,0.3)' : 'rgba(0,0,0,0.3)') +
						';color:' + (assigned ? '#e9d5ff' : '#6b7280') + ';display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer">' + (si+1) + '</div>';
				}
				html += '</div>';
			}
			sidebar.innerHTML = html;
			// wire hotbar slot clicks
			sidebar.querySelectorAll('[data-slot]').forEach(btn => {
				btn.addEventListener('click', () => {
					const si = parseInt(btn.dataset.slot);
					const tid = btn.dataset.tid;
					player.hotbar[si] = player.hotbar[si] === tid ? null : tid;
					saveGame(); renderTalentTree(); refreshHotbarUI();
				});
			});
		}

		function renderConstellation(path) {
			// clear canvas nodes (keep SVGs)
			canvas.querySelectorAll('.tt-node').forEach(n => n.remove());
			lineSvg.innerHTML = '';

			const NODE_SIZE = 46;
			const HALF = NODE_SIZE / 2;

			// draw prereq connector lines first (behind nodes)
			for (const talent of path.talents) {
				const prereqId = TALENT_PREREQS[talent.id];
				if (!prereqId) continue;
				const fromPos = TALENT_NODE_LAYOUT[prereqId];
				const toPos   = TALENT_NODE_LAYOUT[talent.id];
				if (!fromPos || !toPos) continue;
				const prereqRank = talentRank(prereqId);
				const line = document.createElementNS('http://www.w3.org/2000/svg','line');
				line.setAttribute('x1', fromPos[0] + '%'); line.setAttribute('y1', fromPos[1] + '%');
				line.setAttribute('x2', toPos[0] + '%');   line.setAttribute('y2', toPos[1] + '%');
				line.setAttribute('stroke', prereqRank > 0 ? path.color : 'rgba(255,255,255,0.10)');
				line.setAttribute('stroke-width', '2');
				line.setAttribute('stroke-linecap','round');
				if (prereqRank === 0) line.setAttribute('stroke-dasharray','4 4');
				lineSvg.appendChild(line);
			}

			// draw nodes
			for (const talent of path.talents) {
				const pos = TALENT_NODE_LAYOUT[talent.id];
				if (!pos) continue;
				const rank = talentRank(talent.id);
				const maxed = rank >= talent.maxRank;
				const prereqMet = talentPrereqMet(talent.id);
				const upgradeCost = talentRankUpgradeCost(rank);
				const canUpgrade = !maxed && prereqMet && talentPointsAvailable() >= upgradeCost;

				let borderColor, bgColor, glowColor = 'transparent';
				if (maxed) {
					borderColor = '#fbbf24'; bgColor = 'rgba(251,191,36,0.22)'; glowColor = '#fbbf24';
				} else if (rank > 0) {
					borderColor = path.color; bgColor = 'rgba(0,0,0,0.5)'; glowColor = path.color;
				} else if (prereqMet) {
					borderColor = path.color; bgColor = 'rgba(0,0,0,0.3)';
					if (canUpgrade) glowColor = path.color;
				} else {
					borderColor = 'rgba(255,255,255,0.10)'; bgColor = 'rgba(0,0,0,0.15)';
				}

				const isPassive = talent.type === 'passive';
				const node = document.createElement('div');
				node.className = 'tt-node';
				node.style.cssText =
					'position:absolute;' +
					'left:calc(' + pos[0] + '% - ' + HALF + 'px);' +
					'top:calc(' + pos[1] + '% - ' + HALF + 'px);' +
					'width:' + NODE_SIZE + 'px;height:' + NODE_SIZE + 'px;' +
					'border:2px solid ' + borderColor + ';' +
					'background:' + bgColor + ';' +
					'border-radius:' + (isPassive ? '50%' : '10px') + ';' +
					'display:flex;align-items:center;justify-content:center;' +
					'font-size:20px;' +
					'cursor:' + (prereqMet && !maxed ? 'pointer' : 'default') + ';' +
					'opacity:' + (prereqMet || rank > 0 ? '1' : '0.35') + ';' +
					'transition:box-shadow 0.15s,transform 0.1s;' +
					'user-select:none;' +
					(glowColor !== 'transparent' && canUpgrade ? 'box-shadow:0 0 10px 2px ' + glowColor + '44,0 0 3px ' + glowColor + ';' : '') +
					(rank > 0 && !maxed ? 'box-shadow:0 0 6px ' + glowColor + '66;' : '') +
					(maxed ? 'box-shadow:0 0 14px 3px #fbbf2466,0 0 4px #fbbf24;' : '');
				node.textContent = talent.icon;

				// rank badge
				if (rank > 0) {
					const badge = document.createElement('div');
					badge.style.cssText = 'position:absolute;bottom:-2px;right:-2px;font-size:8px;font-weight:700;' +
						'background:#0f0a1e;color:' + (maxed ? '#fbbf24' : path.color) + ';' +
						'border-radius:4px;padding:0 3px;line-height:13px;min-width:13px;text-align:center;' +
						'border:1px solid ' + (maxed ? '#fbbf24' : borderColor);
					badge.textContent = rank + '/' + talent.maxRank;
					node.appendChild(badge);
				}

				// locked overlay indicator
				if (!prereqMet) {
					const lock = document.createElement('div');
					lock.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;border-radius:inherit;background:rgba(0,0,0,0.45)';
					lock.textContent = '🔒';
					node.appendChild(lock);
				}

				node.addEventListener('mouseenter', () => {
					if (prereqMet || rank > 0) node.style.transform = 'scale(1.12)';
					showTalentTooltip(talent, path);
				});
				node.addEventListener('mouseleave', () => { node.style.transform = ''; });

				if (prereqMet && !maxed) {
					node.addEventListener('click', () => {
						if (talentPointsAvailable() < upgradeCost) {
							log('✗ Not enough talent points.', 'warn'); return;
						}
						player.talents[talent.id] = (player.talents[talent.id] || 0) + 1;
						const newRank = player.talents[talent.id];
						log('✨ ' + talent.name + ' → Rank ' + newRank + '! (' + talentPointsAvailable() + ' pts left)', 'craft');
						if (talent.type === 'active' && newRank === 1) {
							const emptySlot = player.hotbar.findIndex(s => s === null);
							if (emptySlot !== -1) {
								player.hotbar[emptySlot] = talent.id;
								log('→ Hotbar slot ' + (emptySlot + 1) + '.', 'sys');
							}
						}
						saveGame();
						renderTalentTree();
						refreshHotbarUI();
					});
				}

				canvas.appendChild(node);
			}
		}

		// ── Build tabs + render first / active path ───────────────────
		for (const path of TALENT_PATHS) {
			const tab = document.createElement('div');
			const isActive = path.id === _activePathTab;
			tab.style.cssText = 'flex:1;padding:9px 4px;text-align:center;font-size:11px;font-weight:700;letter-spacing:0.08em;cursor:pointer;' +
				'border-bottom:2px solid ' + (isActive ? path.color : 'transparent') + ';' +
				'color:' + (isActive ? path.color : '#6b7280') + ';' +
				'background:' + (isActive ? 'rgba(255,255,255,0.04)' : 'transparent') + ';' +
				'transition:color 0.15s,border-color 0.15s';
			tab.textContent = path.icon + ' ' + path.name;
			tab.addEventListener('click', () => {
				_activePathTab = path.id;
				renderTalentTree();
			});
			tabBar.appendChild(tab);
		}

		const activePath = TALENT_PATHS.find(p => p.id === _activePathTab) || TALENT_PATHS[0];
		renderConstellation(activePath);
	}

	(function buildPlayer() {
		const g = player.group;
		// palette --------------------------------------------------------------
		const cloth   = new THREE.MeshStandardMaterial({ color: 0x2f4b8f, flatShading: true, roughness: 0.72, metalness: 0.06 }); // royal-blue gambeson (recolored by armor)
		const steel   = new THREE.MeshStandardMaterial({ color: 0xc9cfda, flatShading: true, roughness: 0.28, metalness: 0.9 });
		const steelDk = new THREE.MeshStandardMaterial({ color: 0x8a92a1, flatShading: true, roughness: 0.4,  metalness: 0.85 });
		const gold    = new THREE.MeshStandardMaterial({ color: 0xe8c266, flatShading: true, roughness: 0.35, metalness: 0.8 });
		const leather = new THREE.MeshStandardMaterial({ color: 0x5a3d26, flatShading: true, roughness: 0.85 });
		const visorMat= new THREE.MeshStandardMaterial({ color: 0x06222c, emissive: 0x36e2ff, emissiveIntensity: 2.0, roughness: 0.3 });
		const add = (m, cast) => { if (cast !== false) m.castShadow = true; return m; };

		// pelvis ---------------------------------------------------------------
		g.add(add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.24, 12), leather)).translateY(0.66));

		// cuirass / torso (tapered) -------------------------------------------
		const torso = add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.29, 0.78, 12), cloth));
		torso.position.y = 1.16; g.add(torso);
		// steel chest plate over the front
		const plate = add(new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 12, 0, Math.PI, 0, Math.PI * 0.62), steel));
		plate.scale.set(1, 1.15, 0.75); plate.position.set(0, 1.2, 0.02); plate.rotation.y = Math.PI; g.add(plate);
		player.parts.plate = plate;
		// gold trim ridge
		const ridge = add(new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.022, 6, 20), gold), false);
		ridge.rotation.x = Math.PI / 2; ridge.position.y = 1.02; g.add(ridge);

		// heroic cape (base look; hidden when a Fur Cloak is worn) --------------
		const capeMat = new THREE.MeshStandardMaterial({ color: 0x8a1f2d, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
		const cape = add(new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.15, 3, 4), capeMat));
		cape.position.set(0, 1.05, -0.28); cape.rotation.x = 0.14; g.add(cape);
		player.parts.heroCape = cape; player.parts.capeMat = capeMat;

		// belt -----------------------------------------------------------------
		const belt = add(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 16), leather), false);
		belt.rotation.x = Math.PI / 2; belt.position.y = 0.79; g.add(belt);
		const buckle = add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.05), gold), false);
		buckle.position.set(0, 0.79, 0.31); g.add(buckle);
		// tabard skirts (front & back)
		for (const zz of [0.28, -0.28]) {
			const skirt = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.04), cloth));
			skirt.position.set(0, 0.56, zz); g.add(skirt);
			const hem = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.05), gold), false);
			hem.position.set(0, 0.4, zz); g.add(hem);
		}

		// gorget + neck --------------------------------------------------------
		const gorget = add(new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.16, 12), steelDk));
		gorget.position.y = 1.6; g.add(gorget);

		// head / helm ----------------------------------------------------------
		const headG = new THREE.Group(); headG.position.y = 1.86; g.add(headG);
		const helm = add(new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 14), steel));
		helm.scale.set(1, 1.05, 1.02); headG.add(helm);
		const brow = add(new THREE.Mesh(new THREE.CylinderGeometry(0.275, 0.275, 0.1, 16), steelDk));
		brow.position.y = 0.02; headG.add(brow);
		const visor = add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.075, 0.12), visorMat), false);
		visor.position.set(0, 0.03, 0.22); headG.add(visor);
		// little face guard fins
		for (const s of [-1, 1]) {
			const fin = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.16), steelDk), false);
			fin.position.set(0.13 * s, -0.03, 0.16); headG.add(fin);
		}
		// crest / plume
		const crestBase = add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.3), gold), false);
		crestBase.position.set(0, 0.28, -0.02); headG.add(crestBase);
		const plume = add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.34, 8), capeMat));
		plume.position.set(0, 0.42, -0.08); plume.rotation.x = -0.5; headG.add(plume);
		player.parts.head = headG;

		// pauldrons ------------------------------------------------------------
		for (const s of [-1, 1]) {
			const pa = add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), steel));
			pa.scale.set(1.1, 0.8, 1.1); pa.position.set(0.4 * s, 1.5, 0); g.add(pa);
			const stud = add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 6), gold), false);
			stud.position.set(0.4 * s, 1.6, 0); g.add(stud);
		}

		// arms -----------------------------------------------------------------
		const mkArm = (side) => {
			const armG = new THREE.Group();
			armG.position.set(0.4 * side, 1.48, 0);
			const upper = add(new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.4, 8), cloth));
			upper.position.y = -0.24; armG.add(upper);
			const fore = add(new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.07, 0.34, 8), steelDk));
			fore.position.y = -0.56; armG.add(fore);
			const gaunt = add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), steel));
			gaunt.position.y = -0.74; armG.add(gaunt);
			g.add(armG);
			return armG;
		};
		// legs -----------------------------------------------------------------
		player.parts.cuisses = []; player.parts.greaves = [];
		const mkLeg = (side) => {
			const legG = new THREE.Group();
			legG.position.set(0.15 * side, 0.66, 0);
			const thigh = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.36, 8), steelDk));
			thigh.position.y = -0.2; legG.add(thigh);
			const shin = add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.085, 0.34, 8), steel));
			shin.position.y = -0.52; legG.add(shin);
			const boot = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.28), leather));
			boot.position.set(0, -0.72, 0.05); legG.add(boot);
			// cuisses = thigh plate (hidden until equipped)
			const cuiss = add(new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.12, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0x8a92a1, flatShading: true, metalness: 0.7, roughness: 0.4 })));
			cuiss.position.y = -0.2; cuiss.visible = false; legG.add(cuiss); player.parts.cuisses.push(cuiss);
			// greaves = shin plate (hidden until equipped)
			const greav = add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0xb9c0cc, flatShading: true, metalness: 0.7, roughness: 0.4 })));
			greav.position.y = -0.52; greav.visible = false; legG.add(greav); player.parts.greaves.push(greav);
			g.add(legG);
			return legG;
		};
		player.parts.armL = mkArm(-1);
		player.parts.armR = mkArm(1);
		player.parts.legL = mkLeg(-1);
		player.parts.legR = mkLeg(1);
		player.parts.torsoMat = cloth;

		// fur cloak (hidden until Fur Cloak is equipped) -----------------------
		const cloak = add(new THREE.Mesh(
			new THREE.PlaneGeometry(0.7, 1.0, 3, 4),
			new THREE.MeshStandardMaterial({ color: 0xd9cdbb, flatShading: true, roughness: 0.95, side: THREE.DoubleSide })
		));
		cloak.position.set(0, 1.05, -0.3); cloak.rotation.x = 0.12; cloak.visible = false;
		g.add(cloak);
		player.parts.cloak = cloak;

		// mounts ---------------------------------------------------------------
		player.parts.weaponMount = new THREE.Group();
		player.parts.weaponMount.position.y = -0.78;
		player.parts.armR.add(player.parts.weaponMount);
		player.parts.helmMount = new THREE.Group();
		player.parts.helmMount.position.y = 0.16;
		headG.add(player.parts.helmMount);
		// shield rides on the left forearm, facing outward
		player.parts.shieldMount = new THREE.Group();
		player.parts.shieldMount.position.set(-0.12, -0.62, 0.05);
		player.parts.shieldMount.rotation.set(Math.PI / 2, 0, 0);
		player.parts.armL.add(player.parts.shieldMount);

		player.bar = makeHealthBar(g, 1.55, 2.95, true);
		player.label = makeLabel(g, player.name, 3.55, '#fde68a');

		g.position.set(0, terrainHeight(0, 4), 4);
		scene.add(g);
	})();

	// equipment visuals ---------------------------------------------------------
	function clearGroup(g) {
		while (g.children.length) {
			const c = g.children.pop();
			g.remove(c);
		}
	}
	function buildWeaponMesh(name) {
		const g = new THREE.Group();
		const steel = new THREE.MeshStandardMaterial({ color: 0xd7dde6, flatShading: true, metalness: 0.9, roughness: 0.25 });
		const wood = new THREE.MeshStandardMaterial({ color: 0x7a5230, flatShading: true, roughness: 0.85 });
		const bone = new THREE.MeshStandardMaterial({ color: 0xf0ead8, flatShading: true, roughness: 0.6 });
		if (name === 'Iron Sword') {
			const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.035), steel);
			blade.position.y = -0.55; g.add(blade);
			const tip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.16, 4), steel);
			tip.position.y = -1.08; tip.rotation.x = Math.PI; g.add(tip);
			const guard = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), wood);
			guard.position.y = -0.08; g.add(guard);
			const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 6), wood);
			grip.position.y = 0.06; g.add(grip);
		} else if (name === 'Bone Dagger') {
			const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.55, 5), bone);
			blade.position.y = -0.38; blade.rotation.x = Math.PI; g.add(blade);
			const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 6), wood);
			grip.position.y = 0.02; g.add(grip);
		} else if (name === 'Wooden Staff') {
			const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.5, 6), wood);
			shaft.position.y = -0.35; g.add(shaft);
			const gem = new THREE.Mesh(
				new THREE.OctahedronGeometry(0.12, 0),
				new THREE.MeshStandardMaterial({ color: 0x4d8dff, emissive: 0x2a5fe0, emissiveIntensity: 1.4, flatShading: true })
			);
			gem.position.y = 0.48; g.add(gem);
		} else if (name === "Hunter's Bow") {
			const bowMat = wood;
			const arc = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 16, Math.PI * 1.15), bowMat);
			arc.position.y = -0.4; arc.rotation.z = Math.PI / 2; g.add(arc);
			const string = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.86, 4),
				new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.6 }));
			string.position.set(0.16, -0.4, 0); g.add(string);
		} else if (name === 'Boar Spear') {
			const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.7, 6), wood);
			shaft.position.y = -0.5; g.add(shaft);
			const head = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 5), steel);
			head.position.y = -1.45; head.rotation.x = Math.PI; g.add(head);
			for (const s of [-1, 1]) {
				const barb = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), bone);
				barb.position.set(0.09 * s, -1.28, 0); barb.rotation.z = 0.9 * s; g.add(barb);
			}
		} else if (name === 'War Hammer') {
			const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 1.15, 6), wood);
			shaft.position.y = -0.5; g.add(shaft);
			const headMat = new THREE.MeshStandardMaterial({ color: 0x9aa2ad, flatShading: true, metalness: 0.85, roughness: 0.4 });
			const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.26), headMat);
			head.position.y = -1.05; g.add(head);
			const spike = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 4), headMat);
			spike.position.set(0, -1.05, 0.22); spike.rotation.x = Math.PI / 2; g.add(spike);
		} else if (name === 'Steel Greatsword') {
			const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 0.04), steel);
			blade.position.y = -0.8; g.add(blade);
			const tip = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.22, 4), steel);
			tip.position.y = -1.52; tip.rotation.x = Math.PI; g.add(tip);
			const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.09),
				new THREE.MeshStandardMaterial({ color: 0xe8c266, metalness: 0.8, roughness: 0.35, flatShading: true }));
			guard.position.y = -0.08; g.add(guard);
			const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 6), leatherWeaponMat());
			grip.position.y = 0.1; g.add(grip);
			const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), steel);
			pommel.position.y = 0.27; g.add(pommel);
		} else {
			// generic blade for advanced weapons, tinted by type
			const tint = name.includes('Silver') ? 0xe6ebf2 : name.includes('Venom') ? 0x7fe08a :
				name.includes('Wyvern') ? 0xc76b4a : name.includes('Golem') ? 0x9fd0ff :
					name.includes('Troll') ? 0x8a9a5b : 0xcfd6e0;
			const bladeMat = new THREE.MeshStandardMaterial({ color: tint, emissive: name.includes('Golem') ? 0x1b3a66 : 0x000000, emissiveIntensity: 0.6, metalness: 0.85, roughness: 0.3, flatShading: true });
			if (name === 'Troll Club') {
				const club = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.09, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x6b5638, roughness: 0.9, flatShading: true }));
				club.position.y = -0.7; g.add(club);
				for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 4), bladeMat); const a = i / 6 * Math.PI * 2; sp.position.set(Math.cos(a) * 0.16, -0.85, Math.sin(a) * 0.16); sp.rotation.z = -Math.cos(a) * 1.2; sp.rotation.x = Math.sin(a) * 1.2; g.add(sp); }
				const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), leatherWeaponMat()); grip.position.y = 0.02; g.add(grip);
			} else {
				const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, name.includes('Dagger') ? 0.6 : 1.1, 0.035), bladeMat);
				blade.position.y = name.includes('Dagger') ? -0.4 : -0.65; g.add(blade);
				const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), bladeMat); tip.position.y = name.includes('Dagger') ? -0.72 : -1.24; tip.rotation.x = Math.PI; g.add(tip);
				const guard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, 0.08), new THREE.MeshStandardMaterial({ color: 0xe8c266, metalness: 0.8, roughness: 0.4, flatShading: true })); guard.position.y = -0.08; g.add(guard);
				const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 6), leatherWeaponMat()); grip.position.y = 0.06; g.add(grip);
			}
		}
		g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
		return g;
	}
	function buildShieldMesh(name) {
		const g = new THREE.Group();
		const tint = name.includes('Troll') ? 0x8a9a5b : name.includes('Steel') ? 0xb9c0cc : name.includes('Iron') ? 0x8a92a1 : 0x6b4a2c;
		const mat = new THREE.MeshStandardMaterial({ color: tint, flatShading: true, metalness: name.includes('Wood') ? 0 : 0.7, roughness: name.includes('Wood') ? 0.9 : 0.4 });
		const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.26, 0.09, 12), mat);
		body.rotation.x = Math.PI / 2; g.add(body);
		const boss = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8c266, metalness: 0.8, roughness: 0.35, flatShading: true }));
		boss.position.z = 0.06; g.add(boss);
		g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
		return g;
	}
	function leatherWeaponMat() { return new THREE.MeshStandardMaterial({ color: 0x5a3d26, roughness: 0.85, flatShading: true }); }
	function buildHelmMesh(name) {
		const g = new THREE.Group();
		if (name === 'Flower Crown') {
			const band = new THREE.Mesh(
				new THREE.TorusGeometry(0.26, 0.035, 6, 14),
				new THREE.MeshStandardMaterial({ color: 0x3f8a3a, flatShading: true, roughness: 0.85 })
			);
			band.rotation.x = Math.PI / 2; g.add(band);
			const cols = [0xff3355, 0x4d8dff, 0xffc933];
			for (let i = 0; i < 3; i++) {
				const b = new THREE.Mesh(
					new THREE.IcosahedronGeometry(0.075, 0),
					new THREE.MeshStandardMaterial({ color: cols[i], emissive: cols[i], emissiveIntensity: 0.7, flatShading: true })
				);
				const a = (i / 3) * Math.PI * 2;
				b.position.set(Math.cos(a) * 0.26, 0.04, Math.sin(a) * 0.26);
				g.add(b);
			}
		} else if (name === 'Antler Helm') {
			const band = new THREE.Mesh(
				new THREE.CylinderGeometry(0.3, 0.31, 0.14, 10),
				new THREE.MeshStandardMaterial({ color: 0x6b4a2c, flatShading: true, roughness: 0.85 })
			);
			g.add(band);
			const antlerMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, flatShading: true, roughness: 0.7 });
			for (const s of [-1, 1]) {
				const a1 = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.42, 5), antlerMat);
				a1.position.set(0.2 * s, 0.28, 0); a1.rotation.z = -0.5 * s; g.add(a1);
				const a2 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.24, 5), antlerMat);
				a2.position.set(0.3 * s, 0.34, 0.05); a2.rotation.z = -1.0 * s; g.add(a2);
			}
		} else if (name === 'Iron Helm') {
			const steelH = new THREE.MeshStandardMaterial({ color: 0xb9c0cc, flatShading: true, metalness: 0.85, roughness: 0.35 });
			const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), steelH);
			dome.position.y = 0.02; g.add(dome);
			const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.03, 6, 16), steelH);
			rim.rotation.x = Math.PI / 2; g.add(rim);
			const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.34), steelH);
			fin.position.set(0, 0.2, 0); g.add(fin);
		} else if (name === 'Wolf Skull Helm') {
			const boneMat = new THREE.MeshStandardMaterial({ color: 0xece4d0, flatShading: true, roughness: 0.6 });
			const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), boneMat);
			skull.scale.set(1, 0.9, 1.1); skull.position.y = 0.04; g.add(skull);
			const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6), boneMat);
			snout.position.set(0, 0.0, 0.28); snout.rotation.x = Math.PI / 2; g.add(snout);
			for (const s of [-1, 1]) {
				const fang = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), boneMat);
				fang.position.set(0.05 * s, -0.12, 0.34); fang.rotation.x = Math.PI; g.add(fang);
				const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6),
					new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff3020, emissiveIntensity: 1.5 }));
				eye.position.set(0.1 * s, 0.06, 0.2); g.add(eye);
			}
		} else {
			// generic helm (Steel Helm, Wyvern Helm, …)
			const tint = name.includes('Wyvern') ? 0xc76b4a : 0xc0c7d2;
			const mat = new THREE.MeshStandardMaterial({ color: tint, flatShading: true, metalness: 0.85, roughness: 0.35 });
			const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mat);
			dome.position.y = 0.02; g.add(dome);
			const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.035, 6, 16), mat); rim.rotation.x = Math.PI / 2; g.add(rim);
			const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), mat); nasal.position.set(0, -0.08, 0.28); g.add(nasal);
			if (name.includes('Wyvern')) for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.32, 5), mat); horn.position.set(0.2 * s, 0.18, 0); horn.rotation.z = -0.7 * s; g.add(horn); }
		}
		g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
		return g;
	}
	const ARMOR_TINT = {
		'Leather Armor': 0x7a5230,
		'Fur Cloak':     0x3a4f83,
		'Scale Mail':    0x2f7d74,
		'Iron Plate':    0x6b7280,
		'Steel Cuirass': 0x9aa2ad,
		'Wyvern Hauberk':0xc76b4a,
		'Golem Plate':   0x5f7fa6,
	};
	const LEG_TINT = { iron: 0x8a92a1, steel: 0xb9c0cc, leather: 0x6b4a2c };
	function legTint(name) { return name && name.includes('Steel') ? LEG_TINT.steel : name && name.includes('Iron') ? LEG_TINT.iron : LEG_TINT.leather; }
	function refreshEquipVisuals() {
		clearGroup(player.parts.weaponMount);
		if (player.equip.weapon) player.parts.weaponMount.add(buildWeaponMesh(player.equip.weapon));
		clearGroup(player.parts.helmMount);
		if (player.equip.helm) player.parts.helmMount.add(buildHelmMesh(player.equip.helm));
		clearGroup(player.parts.shieldMount);
		if (player.equip.shield) player.parts.shieldMount.add(buildShieldMesh(player.equip.shield));
		const arm = player.equip.armor;
		player.parts.cloak.visible = arm === 'Fur Cloak';
		player.parts.heroCape.visible = arm !== 'Fur Cloak';
		player.parts.torsoMat.color.setHex(ARMOR_TINT[arm] || 0x2f4b8f);
		player.parts.plate.material.color.setHex(arm === 'Iron Plate' || arm === 'Steel Cuirass' || arm === 'Golem Plate' ? 0xdfe4ec : 0xc9cfda);
		// leg armor (cuisses = thighs, greaves = shins)
		const cu = player.equip.cuisses, gr = player.equip.greaves;
		for (const p of player.parts.cuisses) { p.visible = !!cu; if (cu) p.material.color.setHex(legTint(cu)); }
		for (const p of player.parts.greaves) { p.visible = !!gr; if (gr) p.material.color.setHex(legTint(gr)); }
	}
	function playerAtk() {
		const wAtk = player.equip.weapon ? ITEMS[player.equip.weapon].atk : 0;
		let bonus = 0;
		for (const s of ['medallion', 'ring']) { const it = player.equip[s]; if (it && ITEMS[it].atk) bonus += ITEMS[it].atk; }
		if (player.consumableAtkTimer > 0) bonus += (player.consumableAtk || 0);
		return Math.floor(playerBaseAtk() + wAtk * (1 + player.atkLvl * 0.07) + bonus);
	}
	function playerDef() {
		let d = playerBaseDef();
		for (const s of ['shield', 'helm', 'armor', 'cuisses', 'greaves', 'medallion', 'ring']) {
			const it = player.equip[s];
			if (it && ITEMS[it].def) d += ITEMS[it].def;
		}
		if (player.frostWardTimer > 0) d += (player.frostWardBonus || 0);
		if (player.consumableDefTimer > 0) d += (player.consumableDef || 0);
		return d;
	}
	function refreshStatsUI() {
		ui.atk.textContent = playerAtk();
		ui.def.textContent = playerDef();
		if (ui.atkLvl) ui.atkLvl.textContent = 'Lv ' + player.atkLvl;
		if (ui.defLvl) ui.defLvl.textContent = 'Lv ' + player.defLvl;
		if (ui.atkXpBar) ui.atkXpBar.style.width = clamp((player.atkXp / xpForLevel(player.atkLvl)) * 100, 0, 100) + '%';
		if (ui.defXpBar) ui.defXpBar.style.width = clamp((player.defXp / xpForLevel(player.defLvl)) * 100, 0, 100) + '%';
		if (ui.mfgVal) ui.mfgVal.textContent = 'Lv ' + player.craftLvl;
		const mfgPct = clamp((player.craftXp / xpForLevel(player.craftLvl)) * 100, 0, 100);
		if (ui.mfgXpBar) ui.mfgXpBar.style.width = mfgPct + '%';
		if (ui.mfgHudXpText) ui.mfgHudXpText.textContent = player.craftXp + ' / ' + xpForLevel(player.craftLvl) + ' xp';
		if (ui.mfgVal2) ui.mfgVal2.textContent = 'Lv ' + player.craftLvl;
		if (ui.mfgXpBar2) ui.mfgXpBar2.style.width = mfgPct + '%';
		if (ui.mfgXpText) ui.mfgXpText.textContent = player.craftXp + ' / ' + xpForLevel(player.craftLvl) + ' xp';
		if (ui.mfgBonus) ui.mfgBonus.textContent = '+' + Math.round((player.craftLvl - 1) * 3) + '% craft rate';
		const SLOT_ICON = { weapon: '⚔️', shield: '🛡️', helm: '🪖', armor: '🧥', cuisses: '👖', greaves: '🥾' };
		for (const slot of EQUIP_SLOTS) {
			const btn = ui.eq[slot];
			if (!btn) continue;
			const icon = btn.querySelector('.eq-icon');
			const label = btn.querySelector('.eq-label');
			const it = player.equip[slot];
			if (it) {
				icon.textContent = ITEMS[it].icon; icon.classList.remove('opacity-30');
				label.textContent = it; label.className = 'eq-label text-[9px] text-amber-200';
				btn.title = ''; btn._ttItem = it;
			} else {
				icon.textContent = SLOT_ICON[slot] || '▫️';
				icon.classList.add('opacity-30');
				label.textContent = slot[0].toUpperCase() + slot.slice(1);
				label.className = 'eq-label text-[9px] text-zinc-400';
				btn.title = ''; btn._ttItem = null;
			}
		}
	}
	// ------------------------------------------------------------------ progression / XP
	function grantXp(kind, amount) {
		amount = Math.max(1, Math.round(amount));
		if (kind === 'atk') {
			player.atkXp += amount;
			while (player.atkXp >= xpForLevel(player.atkLvl)) {
				player.atkXp -= xpForLevel(player.atkLvl); player.atkLvl++;
				onLevelUp('Attack', player.atkLvl, 0xff6b6b);
			}
		} else if (kind === 'def') {
			player.defXp += amount;
			while (player.defXp >= xpForLevel(player.defLvl)) {
				player.defXp -= xpForLevel(player.defLvl); player.defLvl++;
				onLevelUp('Defense', player.defLvl, 0x60a5fa);
			}
		} else if (kind === 'craft') {
			player.craftXp += amount;
			while (player.craftXp >= xpForLevel(player.craftLvl)) {
				player.craftXp -= xpForLevel(player.craftLvl); player.craftLvl++;
				onLevelUp('Manufacture', player.craftLvl, 0xe879f9);
			}
		}
		refreshStatsUI();
	}
	player.grantXp = grantXp;

	// ------------------------------------------------------------------ save / load
	const SAVE_KEY = 'eternalIsles_save';
	function saveGame() {
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
			return true;
		} catch(e) { return false; }
	}
	function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch(e) {} }

	function onLevelUp(skill, lvl, color) {
		if (skill === 'Attack' || skill === 'Defense') {
			player.maxhp += 4; player.hp = Math.min(player.hp + 10, player.maxhp); refreshHpUI();
			const pts = talentPointsAvailable();
			if (pts > 0) log('✨ You earned a talent point! (' + pts + ' available — press N to spend)', 'craft');
		}
		log('★ ' + skill + ' level ' + lvl + '! ★', 'craft');
		floatText(skill + ' Lv ' + lvl + '!', headPos().add(new THREE.Vector3(0, 0.5, 0)), '#' + color.toString(16).padStart(6, '0'), 1.25);
		spawnLevelUpEffect(color);
		saveGame();
	}
	// challenge factor: fighting things far below your level yields little XP
	function challengeFactor(creatureLvl) {
		const diff = creatureLvl - combatLevel();          // positive → tougher than you
		return clamp(1 + diff * 0.18, 0.15, 2.2);
	}
	function equipItem(name) {
		const info = ITEMS[name];
		const slot = info.type;
		if (!removeItem(name, 1)) return;
		if (player.equip[slot]) addItem(player.equip[slot], 1);
		player.equip[slot] = name;
		refreshEquipVisuals(); refreshStatsUI(); saveGame();
		log('You equipped the ' + name + '.', 'craft');
		floatText(ITEMS[name].icon + ' ' + name, headPos(), '#e879f9', 0.9);
	}
	function unequip(slot) {
		const it = player.equip[slot];
		if (!it) return;
		if (!addItem(it, 1)) { log('No room in your inventory.', 'warn'); return; }
		player.equip[slot] = null;
		refreshEquipVisuals(); refreshStatsUI(); saveGame();
		log('You removed the ' + it + '.', 'sys');
	}
	EQUIP_SLOTS.forEach((slot) => { if (ui.eq[slot]) ui.eq[slot].addEventListener('click', () => unequip(slot)); });

	function headPos() { return player.group.position.clone().add(new THREE.Vector3(0, 2.3, 0)); }

	// ------------------------------------------------------------------ creatures
	const CREATURE_DEFS = {
		Rabbit: {
			count: 10, hp: 20, dmg: 3, speed: 2.6, hopper: true, aggro: 0, barW: 0.9, barY: 0.95, hitY: 0.6, level: 1, xp: 14, tiers: [0],
			drops: [{ item: 'Rabbit Fur', p: 1 }, { item: 'Raw Meat', p: 0.55 }, { item: 'Bones', p: 0.45 }],
			build() {
				const g = new THREE.Group();
				const fur = new THREE.MeshStandardMaterial({ color: 0xf3f3f0, flatShading: true, roughness: 0.9 });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), fur);
				body.scale.set(1, 0.9, 1.3); body.position.y = 0.3; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), fur);
				head.position.set(0, 0.52, 0.3); head.castShadow = true; g.add(head);
				for (const s of [-1, 1]) {
					const ear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.05), fur);
					ear.position.set(0.08 * s, 0.78, 0.26); ear.rotation.x = -0.25; ear.rotation.z = 0.12 * s;
					ear.castShadow = true; g.add(ear);
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6),
						new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 }));
					eye.position.set(0.09 * s, 0.56, 0.44); g.add(eye);
				}
				const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), fur);
				tail.position.set(0, 0.32, -0.36); g.add(tail);
				return g;
			},
		},
		Beaver: {
			count: 5, hp: 34, dmg: 4, speed: 2.0, hopper: false, aggro: 0, barW: 1.0, barY: 1.0, hitY: 0.55, nearWater: true, level: 3, xp: 26, tiers: [0],
			drops: [{ item: 'Beaver Fur', p: 1 }, { item: 'Raw Meat', p: 0.6 }, { item: 'Bones', p: 0.4 }],
			build() {
				const g = new THREE.Group();
				const fur = new THREE.MeshStandardMaterial({ color: 0x8a5a33, flatShading: true, roughness: 0.95 });
				const dark = new THREE.MeshStandardMaterial({ color: 0x5c3a1f, flatShading: true, roughness: 0.95 });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), fur);
				body.scale.set(1.05, 0.85, 1.35); body.position.y = 0.3; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), fur);
				head.position.set(0, 0.48, 0.36); head.castShadow = true; g.add(head);
				const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.04),
					new THREE.MeshStandardMaterial({ color: 0xfff4cf, roughness: 0.5 }));
				teeth.position.set(0, 0.38, 0.55); g.add(teeth);
				const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.5), dark);
				tail.position.set(0, 0.18, -0.55); tail.castShadow = true; g.add(tail);
				for (const s of [-1, 1]) {
					const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), dark);
					ear.position.set(0.12 * s, 0.64, 0.3); g.add(ear);
				}
				return g;
			},
		},
		Deer: {
			count: 6, hp: 45, dmg: 6, speed: 3.4, hopper: false, aggro: 0, barW: 1.2, barY: 1.7, hitY: 1.1, level: 5, xp: 38, tiers: [1, 2],
			drops: [{ item: 'Deer Fur', p: 1 }, { item: 'Deer Antlers', p: 0.7 }, { item: 'Bones', p: 0.6 }],
			build() {
				const g = new THREE.Group();
				const fur = new THREE.MeshStandardMaterial({ color: 0xb08a5a, flatShading: true, roughness: 0.95 });
				const antler = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, flatShading: true, roughness: 0.7 });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), fur);
				body.scale.set(0.9, 0.85, 1.5); body.position.y = 0.85; body.castShadow = true; g.add(body);
				const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.5, 6), fur);
				neck.position.set(0, 1.2, 0.42); neck.rotation.x = 0.5; g.add(neck);
				const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.36), fur);
				head.position.set(0, 1.42, 0.6); head.castShadow = true; g.add(head);
				for (const s of [-1, 1]) {
					const a1 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.36, 5), antler);
					a1.position.set(0.1 * s, 1.66, 0.52); a1.rotation.z = -0.45 * s; g.add(a1);
					const a2 = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.2, 5), antler);
					a2.position.set(0.18 * s, 1.7, 0.56); a2.rotation.z = -0.95 * s; g.add(a2);
					for (const f of [0.32, -0.38]) {
						const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.85, 6), fur);
						leg.position.set(0.16 * s, 0.42, f); leg.castShadow = true; g.add(leg);
					}
				}
				const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), fur);
				tail.position.set(0, 0.95, -0.55); g.add(tail);
				return g;
			},
		},
		Wolf: {
			count: 6, hp: 64, dmg: 9, speed: 4.0, hopper: false, aggro: 5.2, barW: 1.2, barY: 1.35, hitY: 0.8, level: 8, xp: 60, tiers: [1, 2],
			drops: [{ item: 'Wolf Fur', p: 1 }, { item: 'Raw Meat', p: 0.7 }, { item: 'Bones', p: 0.6 }],
			build() {
				const g = new THREE.Group();
				const fur = new THREE.MeshStandardMaterial({ color: 0x7d8087, flatShading: true, roughness: 0.95 });
				const dark = new THREE.MeshStandardMaterial({ color: 0x53565c, flatShading: true, roughness: 0.95 });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), fur);
				body.scale.set(0.95, 0.85, 1.6); body.position.y = 0.62; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), fur);
				head.position.set(0, 0.86, 0.55); head.castShadow = true; g.add(head);
				const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.26), dark);
				snout.position.set(0, 0.8, 0.78); g.add(snout);
				for (const s of [-1, 1]) {
					const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), dark);
					ear.position.set(0.11 * s, 1.05, 0.5); g.add(ear);
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6),
						new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2222, emissiveIntensity: 1.4 }));
					eye.position.set(0.1 * s, 0.9, 0.72); g.add(eye);
					for (const f of [0.35, -0.4]) {
						const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.62, 6), fur);
						leg.position.set(0.17 * s, 0.31, f); leg.castShadow = true; g.add(leg);
					}
				}
				const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), dark);
				tail.position.set(0, 0.72, -0.72); tail.rotation.x = 1.9; g.add(tail);
				return g;
			},
		},
		Fox: {
			count: 7, hp: 28, dmg: 4, speed: 4.2, hopper: false, aggro: 0, barW: 1.0, barY: 1.05, hitY: 0.55, level: 2, xp: 22, tiers: [0],
			drops: [{ item: 'Fox Pelt', p: 1 }, { item: 'Raw Meat', p: 0.5 }, { item: 'Bones', p: 0.4 }],
			build() {
				const g = new THREE.Group();
				const fur = new THREE.MeshStandardMaterial({ color: 0xd06a2c, flatShading: true, roughness: 0.9 });
				const white = new THREE.MeshStandardMaterial({ color: 0xf3eae0, flatShading: true, roughness: 0.9 });
				const dark = new THREE.MeshStandardMaterial({ color: 0x2b2320, flatShading: true, roughness: 0.9 });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), fur);
				body.scale.set(0.9, 0.8, 1.5); body.position.y = 0.4; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), fur);
				head.position.set(0, 0.55, 0.34); head.castShadow = true; g.add(head);
				const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 5), white);
				snout.position.set(0, 0.5, 0.52); snout.rotation.x = Math.PI / 2; g.add(snout);
				for (const s of [-1, 1]) {
					const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), dark);
					ear.position.set(0.09 * s, 0.72, 0.3); g.add(ear);
					for (const f of [0.3, -0.3]) {
						const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.4, 6), dark);
						leg.position.set(0.13 * s, 0.2, f); leg.castShadow = true; g.add(leg);
					}
				}
				const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 6), fur);
				tail.position.set(0, 0.45, -0.6); tail.rotation.x = 1.7; g.add(tail);
				const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), white);
				tailTip.position.set(0, 0.5, -0.82); g.add(tailTip);
				return g;
			},
		},
		Boar: {
			count: 6, hp: 56, dmg: 7, speed: 3.2, hopper: false, aggro: 4.0, barW: 1.2, barY: 1.25, hitY: 0.7, level: 6, xp: 46, tiers: [1, 2],
			drops: [{ item: 'Boar Tusk', p: 0.8 }, { item: 'Raw Meat', p: 0.75 }, { item: 'Bones', p: 0.6 }],
			build() {
				const g = new THREE.Group();
				const hide = new THREE.MeshStandardMaterial({ color: 0x4a3b30, flatShading: true, roughness: 0.95 });
				const dark = new THREE.MeshStandardMaterial({ color: 0x322822, flatShading: true, roughness: 0.95 });
				const tusk = new THREE.MeshStandardMaterial({ color: 0xece4d0, flatShading: true, roughness: 0.5 });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), hide);
				body.scale.set(0.95, 0.85, 1.45); body.position.y = 0.6; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), hide);
				head.scale.set(0.9, 0.85, 1.05); head.position.set(0, 0.62, 0.52); head.castShadow = true; g.add(head);
				const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.18, 8), dark);
				snout.position.set(0, 0.55, 0.78); snout.rotation.x = Math.PI / 2; g.add(snout);
				for (const s of [-1, 1]) {
					const t = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.24, 5), tusk);
					t.position.set(0.1 * s, 0.5, 0.75); t.rotation.set(-0.5, 0, 0.3 * s); g.add(t);
					const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), dark);
					ear.position.set(0.16 * s, 0.82, 0.42); g.add(ear);
					for (const f of [0.34, -0.34]) {
						const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.5, 6), dark);
						leg.position.set(0.2 * s, 0.25, f); leg.castShadow = true; g.add(leg);
					}
				}
				// bristled back
				for (let i = 0; i < 5; i++) {
					const br = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), dark);
					br.position.set(0, 0.98, 0.3 - i * 0.16); g.add(br);
				}
				return g;
			},
		},
		Bear: {
			count: 5, hp: 98, dmg: 13, speed: 3.6, hopper: false, aggro: 5.5, barW: 1.4, barY: 1.7, hitY: 1.0, level: 11, xp: 95, tiers: [2],
			drops: [{ item: 'Bear Pelt', p: 1 }, { item: 'Bear Claw', p: 0.7 }, { item: 'Raw Meat', p: 0.8 }, { item: 'Bones', p: 0.7 }],
			build() {
				const g = new THREE.Group();
				const fur = new THREE.MeshStandardMaterial({ color: 0x5b4632, flatShading: true, roughness: 0.98 });
				const dark = new THREE.MeshStandardMaterial({ color: 0x2f2419, flatShading: true, roughness: 0.98 });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), fur);
				body.scale.set(1, 0.95, 1.4); body.position.y = 0.85; body.castShadow = true; g.add(body);
				const hump = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), fur);
				hump.position.set(0, 1.25, 0.15); hump.castShadow = true; g.add(hump);
				const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), fur);
				head.position.set(0, 1.0, 0.7); head.castShadow = true; g.add(head);
				const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.24), dark);
				snout.position.set(0, 0.94, 0.95); g.add(snout);
				for (const s of [-1, 1]) {
					const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), fur);
					ear.position.set(0.2 * s, 1.28, 0.62); g.add(ear);
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6),
						new THREE.MeshStandardMaterial({ color: 0x160b06 }));
					eye.position.set(0.13 * s, 1.06, 0.94); g.add(eye);
					for (const f of [0.42, -0.42]) {
						const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.6, 7), fur);
						leg.position.set(0.28 * s, 0.35, f); leg.castShadow = true; g.add(leg);
						const paw = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), dark);
						paw.position.set(0.28 * s, 0.08, f + 0.05); g.add(paw);
					}
				}
				return g;
			},
		},
		Direwolf: {
			count: 5, hp: 155, dmg: 17, speed: 4.6, hopper: false, aggro: 6.5, barW: 1.5, barY: 1.6, hitY: 0.9, level: 13, xp: 140, tiers: [2, 3],
			drops: [{ item: 'Dire Pelt', p: 1 }, { item: 'Wolf Fur', p: 0.7 }, { item: 'Raw Meat', p: 0.7 }, { item: 'Bones', p: 0.6 }],
			build() {
				const g = new THREE.Group();
				const fur = new THREE.MeshStandardMaterial({ color: 0x40444c, flatShading: true, roughness: 0.95 });
				const dark = new THREE.MeshStandardMaterial({ color: 0x24272c, flatShading: true, roughness: 0.95 });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), fur);
				body.scale.set(1, 0.9, 1.7); body.position.y = 0.82; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), fur);
				head.position.set(0, 1.12, 0.72); head.castShadow = true; g.add(head);
				const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.34), dark);
				snout.position.set(0, 1.04, 1.0); g.add(snout);
				for (const s of [-1, 1]) {
					const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 4), dark);
					ear.position.set(0.14 * s, 1.4, 0.66); g.add(ear);
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xffcc00, emissiveIntensity: 1.6 }));
					eye.position.set(0.12 * s, 1.16, 0.92); g.add(eye);
					for (const f of [0.5, -0.5]) {
						const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.82, 6), fur);
						leg.position.set(0.22 * s, 0.4, f); leg.castShadow = true; g.add(leg);
					}
				}
				// spiky mane
				for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 4), dark); sp.position.set(0, 1.28, 0.4 - i * 0.16); g.add(sp); }
				const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), dark);
				tail.position.set(0, 0.95, -0.95); tail.rotation.x = 1.9; g.add(tail);
				return g;
			},
		},
		'Giant Spider': {
			count: 6, hp: 200, dmg: 21, speed: 4.0, hopper: false, aggro: 6.0, barW: 1.6, barY: 1.2, hitY: 0.6, level: 15, xp: 175, tiers: [3, 4],
			drops: [{ item: 'Spider Silk', p: 1 }, { item: 'Venom Gland', p: 0.75 }, { item: 'Bones', p: 0.5 }],
			build() {
				const g = new THREE.Group();
				const chit = new THREE.MeshStandardMaterial({ color: 0x2a2030, flatShading: true, roughness: 0.7, metalness: 0.2 });
				const mark = new THREE.MeshStandardMaterial({ color: 0x7a1030, emissive: 0x3a0010, emissiveIntensity: 0.5, flatShading: true });
				const abd = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), chit);
				abd.scale.set(1, 0.85, 1.15); abd.position.set(0, 0.6, -0.35); abd.castShadow = true; g.add(abd);
				const mk = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mark); mk.scale.set(1, 0.4, 1); mk.position.set(0, 0.85, -0.35); g.add(mk);
				const ceph = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), chit);
				ceph.position.set(0, 0.55, 0.35); ceph.castShadow = true; g.add(ceph);
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0xff3020, emissiveIntensity: 1.4 }));
					eye.position.set(0.1 * s, 0.62, 0.62); g.add(eye);
					const fang = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), chit); fang.position.set(0.06 * s, 0.42, 0.6); fang.rotation.x = Math.PI; g.add(fang);
					// 4 legs each side
					for (let i = 0; i < 4; i++) {
						const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 1.0, 5), chit);
						const ang = (-0.5 + i * 0.34);
						leg.position.set(0.35 * s, 0.5, 0.35 - i * 0.28); leg.rotation.z = (0.9 + i * 0.05) * s; leg.rotation.x = ang * 0.4;
						leg.castShadow = true; g.add(leg);
					}
				}
				return g;
			},
		},
		'Cave Troll': {
			count: 5, hp: 310, dmg: 28, speed: 2.8, hopper: false, aggro: 6.0, barW: 1.9, barY: 2.5, hitY: 1.4, level: 18, xp: 240, tiers: [3, 4],
			drops: [{ item: 'Troll Hide', p: 1 }, { item: 'Bones', p: 0.8 }, { item: 'Bear Claw', p: 0.5 }, { item: 'Raw Meat', p: 0.7 }],
			build() {
				const g = new THREE.Group();
				const skin = new THREE.MeshStandardMaterial({ color: 0x5f7047, flatShading: true, roughness: 0.95 });
				const dark = new THREE.MeshStandardMaterial({ color: 0x3f4a30, flatShading: true, roughness: 0.95 });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), skin);
				body.scale.set(1, 1.3, 0.9); body.position.y = 1.5; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), skin);
				head.position.set(0, 2.35, 0.1); head.castShadow = true; g.add(head);
				const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.3), dark); jaw.position.set(0, 2.18, 0.28); g.add(jaw);
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xffaa00, emissiveIntensity: 1.2 }));
					eye.position.set(0.14 * s, 2.42, 0.34); g.add(eye);
					const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), new THREE.MeshStandardMaterial({ color: 0xdccfae, flatShading: true })); tusk.position.set(0.12 * s, 2.12, 0.4); g.add(tusk);
					// massive arms
					const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 8), skin);
					arm.position.set(0.75 * s, 1.4, 0); arm.rotation.z = 0.25 * s; arm.castShadow = true; g.add(arm);
					const fist = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), dark); fist.position.set(0.9 * s, 0.85, 0); g.add(fist);
					const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.9, 8), dark);
					leg.position.set(0.3 * s, 0.5, 0); leg.castShadow = true; g.add(leg);
				}
				return g;
			},
		},
		Wyvern: {
			count: 4, hp: 420, dmg: 37, speed: 4.4, hopper: false, aggro: 7.5, barW: 2.1, barY: 2.2, hitY: 1.2, level: 22, xp: 330, tiers: [4],
			drops: [{ item: 'Wyvern Scale', p: 1 }, { item: 'Bones', p: 0.8 }, { item: 'Raw Meat', p: 0.8 }],
			build() {
				const g = new THREE.Group();
				const scale = new THREE.MeshStandardMaterial({ color: 0xa53f2c, flatShading: true, roughness: 0.6, metalness: 0.2 });
				const belly = new THREE.MeshStandardMaterial({ color: 0xd8a24a, flatShading: true, roughness: 0.7 });
				const wingM = new THREE.MeshStandardMaterial({ color: 0x7a2a1e, flatShading: true, roughness: 0.8, side: THREE.DoubleSide });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), scale);
				body.scale.set(1, 0.9, 1.7); body.position.y = 1.3; body.castShadow = true; g.add(body);
				const chest = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), belly); chest.scale.set(0.9, 0.8, 1); chest.position.set(0, 1.15, 0.55); g.add(chest);
				const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 8), scale); neck.position.set(0, 1.7, 0.7); neck.rotation.x = 0.7; g.add(neck);
				const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 6), scale); head.position.set(0, 2.05, 1.05); head.rotation.x = 1.6; head.castShadow = true; g.add(head);
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xffe030, emissiveIntensity: 1.6 }));
					eye.position.set(0.1 * s, 2.1, 1.0); g.add(eye);
					// wings
					const wing = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9, 2, 2), wingM);
					wing.position.set(1.0 * s, 1.6, -0.2); wing.rotation.set(0.2, 0.5 * s, 0.5 * s); g.add(wing);
					const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.7, 6), scale); leg.position.set(0.3 * s, 0.7, 0.2); leg.castShadow = true; g.add(leg);
				}
				const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.4, 6), scale); tail.position.set(0, 1.2, -1.2); tail.rotation.x = 1.4; g.add(tail);
				const barb = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 5), belly); barb.position.set(0, 1.2, -1.9); barb.rotation.x = -1.4; g.add(barb);
				return g;
			},
		},
		'Frost Golem': {
			count: 4, hp: 590, dmg: 48, speed: 2.4, hopper: false, aggro: 7.0, barW: 2.3, barY: 2.9, hitY: 1.6, level: 26, xp: 460, tiers: [4],
			drops: [{ item: 'Golem Core', p: 1 }, { item: 'Silver Ore', p: 0.7 }, { item: 'Bones', p: 0.6 }],
			build() {
				const g = new THREE.Group();
				const ice = new THREE.MeshStandardMaterial({ color: 0x9fc7e8, flatShading: true, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.95 });
				const deep = new THREE.MeshStandardMaterial({ color: 0x5f8fc0, flatShading: true, roughness: 0.4 });
				const core = new THREE.MeshStandardMaterial({ color: 0x2a6fff, emissive: 0x2a6fff, emissiveIntensity: 1.5, flatShading: true });
				const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), ice);
				body.scale.set(1, 1.4, 1); body.position.y = 1.7; body.castShadow = true; g.add(body);
				const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), core); c.position.set(0, 1.9, 0.55); g.add(c);
				const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), ice); head.position.set(0, 2.9, 0.05); head.castShadow = true; g.add(head);
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), core); eye.position.set(0.14 * s, 2.95, 0.34); g.add(eye);
					const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.1, 0.28), deep); arm.position.set(0.85 * s, 1.7, 0); arm.rotation.z = 0.15 * s; arm.castShadow = true; g.add(arm);
					const fist = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), ice); fist.position.set(0.95 * s, 1.05, 0); g.add(fist);
					const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), deep); leg.position.set(0.34 * s, 0.5, 0); leg.castShadow = true; g.add(leg);
					// ice shards on the shoulders
					const shard = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), ice); shard.position.set(0.5 * s, 2.4, -0.1); shard.rotation.z = 0.4 * s; g.add(shard);
				}
				return g;
			},
		},
		Dragon: {
			count: 1, hp: 3600, dmg: 135, speed: 3.2, hopper: false, aggro: 12, barW: 3.2, barY: 3.8, hitY: 2.0, level: 50, xp: 2000, tiers: [6], spawnInset: 2,
			drops: [
				{ item: 'Dragon Scale', p: 1 },
				{ item: 'Dragon Bone',  p: 1 },
				{ item: 'Dragon Fang',  p: 0.75 },
				{ item: 'Dragon Heart', p: 0.40 },
				{ item: 'Raw Meat',     p: 1 },
			],
			build() {
				const g = new THREE.Group();
				const scaleM  = new THREE.MeshStandardMaterial({ color: 0x8b0000, flatShading: true, roughness: 0.55, metalness: 0.35 });
				const bellyM  = new THREE.MeshStandardMaterial({ color: 0xc0392b, flatShading: true, roughness: 0.65 });
				const wingM   = new THREE.MeshStandardMaterial({ color: 0x5a0000, flatShading: true, roughness: 0.75, side: THREE.DoubleSide });
				const eyeM    = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff6600, emissiveIntensity: 3.0, flatShading: true });
				const hornM   = new THREE.MeshStandardMaterial({ color: 0x2a1a00, flatShading: true, roughness: 0.5, metalness: 0.4 });
				// body
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), scaleM);
				body.scale.set(1.1, 0.95, 1.8); body.position.y = 1.8; body.castShadow = true; g.add(body);
				const belly = new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 8), bellyM);
				belly.scale.set(0.95, 0.85, 1.4); belly.position.set(0, 1.6, 0.6); g.add(belly);
				// neck
				const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 1.3, 8), scaleM);
				neck.position.set(0, 2.65, 0.9); neck.rotation.x = 0.65; neck.castShadow = true; g.add(neck);
				// head
				const head = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.52, 0.95), scaleM);
				head.position.set(0, 3.4, 1.6); head.castShadow = true; g.add(head);
				// snout
				const snout = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.58), scaleM);
				snout.position.set(0, 3.22, 2.05); g.add(snout);
				// eyes
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), eyeM);
					eye.position.set(0.24 * s, 3.52, 1.72); g.add(eye);
					// horns
					const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.65, 6), hornM);
					horn.position.set(0.22 * s, 3.88, 1.55); horn.rotation.z = 0.28 * s; horn.rotation.x = -0.25; g.add(horn);
					// large wings
					const wingBone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.0, 6), hornM);
					wingBone.position.set(1.5 * s, 2.5, 0); wingBone.rotation.z = (0.4 + 0.2) * s; g.add(wingBone);
					const wingMem = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.5, 3, 2), wingM);
					wingMem.position.set(2.0 * s, 2.2, 0.1); wingMem.rotation.set(0.18, 0.4 * s, 0.55 * s); g.add(wingMem);
					// legs
					const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.9, 6), scaleM);
					thigh.position.set(0.55 * s, 0.95, 0.4); thigh.rotation.z = 0.15 * s; thigh.castShadow = true; g.add(thigh);
					const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.75, 6), scaleM);
					shin.position.set(0.6 * s, 0.45, 0.7); g.add(shin);
					const claw = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 5), hornM);
					claw.position.set(0.62 * s, 0.08, 0.95); claw.rotation.x = 0.5; g.add(claw);
					// spine ridges
					for (let k = 0; k < 5; k++) {
						const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 5), hornM);
						spine.position.set(0, 2.55 + k * 0.22, 0.3 - k * 0.38); spine.rotation.x = -0.3; g.add(spine);
					}
				}
				// tail
				const tail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 1.8, 8), scaleM);
				tail1.position.set(0, 1.7, -1.5); tail1.rotation.x = 1.2; tail1.castShadow = true; g.add(tail1);
				const tail2 = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.06, 1.4, 6), scaleM);
				tail2.position.set(0, 1.1, -2.9); tail2.rotation.x = 1.5; g.add(tail2);
				const tailBarb = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 5), hornM);
				tailBarb.position.set(0, 0.65, -4.1); tailBarb.rotation.x = -1.5; g.add(tailBarb);
				return g;
			},
		},
		// ---- Dragon's Lair bridging creatures (tier 5) ----
		Wyvern: {
			count: 4, hp: 800, dmg: 55, speed: 4.0, hopper: false, aggro: 8, barW: 2.0, barY: 2.2, hitY: 1.2, level: 30, xp: 520, tiers: [5],
			drops: [
				{ item: 'Raw Meat',    p: 1.00 },
				{ item: 'Dragon Scale', p: 0.30 },
				{ item: 'Titanium Ore', p: 0.20 },
			],
			build() {
				const g = new THREE.Group();
				const scaleM = new THREE.MeshStandardMaterial({ color: 0x2d6a2d, flatShading: true, roughness: 0.6, metalness: 0.2 });
				const wingM  = new THREE.MeshStandardMaterial({ color: 0x1a4a1a, flatShading: true, roughness: 0.75, side: THREE.DoubleSide });
				const eyeM   = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffcc00, emissiveIntensity: 2.5 });
				const clawM  = new THREE.MeshStandardMaterial({ color: 0x1a1a0a, flatShading: true });
				// body
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), scaleM);
				body.scale.set(1.0, 0.85, 1.5); body.position.y = 1.2; body.castShadow = true; g.add(body);
				// neck
				const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.9, 7), scaleM);
				neck.position.set(0, 1.9, 0.65); neck.rotation.x = 0.55; g.add(neck);
				// head
				const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.65), scaleM);
				head.position.set(0, 2.5, 1.1); g.add(head);
				const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.4), scaleM);
				snout.position.set(0, 2.36, 1.45); g.add(snout);
				// eyes
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeM);
					eye.position.set(0.18 * s, 2.58, 1.22); g.add(eye);
					// wings (2-bone, bat-style)
					const wBone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 1.4, 6), clawM);
					wBone.position.set(1.1 * s, 1.6, 0.1); wBone.rotation.z = 0.55 * s; g.add(wBone);
					const wMem = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.1, 2, 2), wingM);
					wMem.position.set(1.5 * s, 1.35, 0.15); wMem.rotation.set(0.1, 0.35 * s, 0.5 * s); g.add(wMem);
					// legs
					const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.7, 6), scaleM);
					leg.position.set(0.35 * s, 0.65, 0.25); leg.rotation.z = 0.1 * s; g.add(leg);
					const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), clawM);
					claw.position.set(0.37 * s, 0.22, 0.55); claw.rotation.x = 0.5; g.add(claw);
				}
				// tail
				const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.06, 1.4, 7), scaleM);
				tail.position.set(0, 1.15, -1.1); tail.rotation.x = 1.1; g.add(tail);
				return g;
			},
		},
		'Lava Titan': {
			count: 3, hp: 1600, dmg: 85, speed: 2.6, hopper: false, aggro: 9, barW: 2.4, barY: 3.0, hitY: 1.6, level: 38, xp: 900, tiers: [5],
			drops: [
				{ item: 'Raw Meat',     p: 0.60 },
				{ item: 'Titanium Ore', p: 0.80 },
				{ item: 'Gold Ore',     p: 0.50 },
				{ item: 'Dragon Scale', p: 0.20 },
			],
			build() {
				const g = new THREE.Group();
				const rockM  = new THREE.MeshStandardMaterial({ color: 0x3a1a00, flatShading: true, roughness: 0.95 });
				const glowM  = new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 1.8, flatShading: true });
				const eyeM   = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 3.5 });
				// legs
				for (const s of [-1, 1]) {
					const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 1.0, 7), rockM);
					thigh.position.set(0.38 * s, 0.5, 0); thigh.castShadow = true; g.add(thigh);
					const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.9, 7), rockM);
					shin.position.set(0.4 * s, -0.1, 0.15); g.add(shin);
				}
				// torso
				const torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.4, 0.9), rockM);
				torso.position.y = 1.7; torso.castShadow = true; g.add(torso);
				// lava cracks on torso
				for (let i = 0; i < 4; i++) {
					const crack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.05), glowM);
					crack.position.set(-0.35 + i * 0.22, 1.7, 0.46); g.add(crack);
				}
				// shoulders
				for (const s of [-1, 1]) {
					const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 7), rockM);
					shoulder.position.set(0.85 * s, 2.3, 0); g.add(shoulder);
					const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 1.2, 7), rockM);
					arm.position.set(0.95 * s, 1.65, 0.1); arm.rotation.z = 0.18 * s; arm.castShadow = true; g.add(arm);
					const fist = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), rockM);
					fist.position.set(1.02 * s, 1.05, 0.2); g.add(fist);
				}
				// neck
				const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.45, 7), rockM);
				neck.position.y = 2.55; g.add(neck);
				// head
				const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.8), rockM);
				head.position.y = 3.1; head.castShadow = true; g.add(head);
				// eyes (glowing lava)
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), eyeM);
					eye.position.set(0.22 * s, 3.18, 0.41); g.add(eye);
				}
				// horns
				for (const s of [-1, 1]) {
					const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 6), rockM);
					horn.position.set(0.28 * s, 3.6, 0.05); horn.rotation.z = 0.3 * s; g.add(horn);
				}
				return g;
			},
		},
		// ---- Eldenmere tier-6 creatures ----
		'Shadow Wraith': {
			count: 3, hp: 5000, dmg: 180, speed: 4.5, hopper: false, aggro: 14, barW: 2.2, barY: 2.8, hitY: 1.4, level: 60, xp: 3200, tiers: [7], spawnInset: 10,
			drops: [
				{ item: 'Shadow Essence', p: 1.00 },
				{ item: 'Ether Shard',    p: 0.60 },
				{ item: 'Voidstone',      p: 0.40 },
			],
			build() {
				const g = new THREE.Group();
				const bodyM = new THREE.MeshStandardMaterial({ color: 0x1a0030, emissive: 0x6600cc, emissiveIntensity: 1.5, flatShading: true, transparent: true, opacity: 0.85 });
				const glowM = new THREE.MeshStandardMaterial({ color: 0x9900ff, emissive: 0x9900ff, emissiveIntensity: 3.0, flatShading: true });
				const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), bodyM);
				body.scale.set(1.0, 1.4, 1.0); body.position.y = 1.8; body.castShadow = true; g.add(body);
				const trail = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.8, 8), bodyM);
				trail.position.y = 0.7; trail.rotation.x = Math.PI; g.add(trail);
				// eyes
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), glowM);
					eye.position.set(0.17 * s, 2.0, 0.42); g.add(eye);
				}
				// wispy arms
				for (const s of [-1, 1]) {
					const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 1.2, 5), bodyM);
					arm.position.set(0.65 * s, 1.6, 0); arm.rotation.z = 0.8 * s; g.add(arm);
				}
				return g;
			},
		},
		'Void Stalker': {
			count: 3, hp: 4500, dmg: 200, speed: 5.2, hopper: false, aggro: 16, barW: 2.0, barY: 2.4, hitY: 1.2, level: 62, xp: 3500, tiers: [7], spawnInset: 10,
			drops: [
				{ item: 'Void Fang',      p: 1.00 },
				{ item: 'Voidstone',      p: 0.70 },
				{ item: 'Ether Shard',    p: 0.45 },
			],
			build() {
				const g = new THREE.Group();
				const bodyM = new THREE.MeshStandardMaterial({ color: 0x0a0015, emissive: 0x440066, emissiveIntensity: 1.2, flatShading: true });
				const accentM = new THREE.MeshStandardMaterial({ color: 0xcc00ff, emissive: 0xcc00ff, emissiveIntensity: 2.5, flatShading: true });
				const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.55), bodyM);
				body.position.y = 1.2; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), bodyM);
				head.position.y = 2.05; head.castShadow = true; g.add(head);
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), accentM);
					eye.position.set(0.15 * s, 2.12, 0.3); g.add(eye);
					const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.9, 5), bodyM);
					arm.position.set(0.52 * s, 1.35, 0); arm.rotation.z = 0.6 * s; g.add(arm);
					const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.8, 5), bodyM);
					leg.position.set(0.22 * s, 0.45, 0); g.add(leg);
					// claw
					const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 4), accentM);
					claw.position.set(0.22 * s, 0.02, 0.1); claw.rotation.x = 0.4; g.add(claw);
				}
				return g;
			},
		},
		// Legendary deep-end creatures — spawn only at the far northern tip of Eldenmere
		'Infernal Titan': {
			count: 2, hp: 14000, dmg: 320, speed: 1.8, hopper: false, aggro: 14, barW: 3.5, barY: 4.2, hitY: 2.0, level: 75, xp: 7500, tiers: [7], spawnInset: 8,
			spawnZone: { x: 0, z: -310, r: 28 },
			drops: [
				{ item: 'Infernal Ember', p: 1.00 },
				{ item: 'Enriched Fire Essence', p: 0.25 },
				{ item: 'Ether Shard',    p: 0.60 },
			],
			build() {
				const g = new THREE.Group();
				const lavaM = new THREE.MeshStandardMaterial({ color: 0x8a1500, emissive: 0xff3300, emissiveIntensity: 1.2, flatShading: true, roughness: 0.7 });
				const glowM = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 4.0, flatShading: true });
				const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 1.2), lavaM);
				body.position.y = 2.0; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.0), lavaM);
				head.position.y = 3.7; head.castShadow = true; g.add(head);
				// lava cracks on body (glowing stripes)
				for (const ry of [1.2, 2.0, 2.8]) {
					const crack = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 0.1), glowM);
					crack.position.set(0, ry, 0.62); g.add(crack);
				}
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), glowM);
					eye.position.set(0.3 * s, 3.82, 0.46); g.add(eye);
					const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.55), lavaM);
					arm.position.set(1.32 * s, 1.85, 0); arm.castShadow = true; g.add(arm);
					const leg = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.1, 0.65), lavaM);
					leg.position.set(0.55 * s, 0.55, 0); leg.castShadow = true; g.add(leg);
				}
				// molten shoulder pads
				for (const s of [-1, 1]) {
					const pad = new THREE.Mesh(new THREE.SphereGeometry(0.55, 7, 6), lavaM);
					pad.position.set(1.1 * s, 3.1, 0); g.add(pad);
					const padGlow = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), glowM);
					padGlow.position.set(1.1 * s, 3.1, 0.3); g.add(padGlow);
				}
				return g;
			},
		},
		'Void Colossus': {
			count: 2, hp: 16000, dmg: 360, speed: 1.4, hopper: false, aggro: 12, barW: 4.0, barY: 4.8, hitY: 2.2, level: 80, xp: 9000, tiers: [7], spawnInset: 8,
			spawnZone: { x: 0, z: -295, r: 22 },
			drops: [
				{ item: 'Void Relic',     p: 1.00 },
				{ item: 'Enriched Fire Essence', p: 0.20 },
				{ item: 'Voidstone',      p: 0.70 },
			],
			build() {
				const g = new THREE.Group();
				const voidM  = new THREE.MeshStandardMaterial({ color: 0x080010, emissive: 0x5500aa, emissiveIntensity: 1.0, flatShading: true, transparent: true, opacity: 0.92 });
				const rimM   = new THREE.MeshStandardMaterial({ color: 0xcc00ff, emissive: 0xcc00ff, emissiveIntensity: 5.0, flatShading: true });
				const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.2, 2.8, 10), voidM);
				body.position.y = 2.2; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), voidM);
				head.position.y = 4.0; head.castShadow = true; g.add(head);
				// void eye cluster
				for (const [ex, ey, ez] of [[0, 4.1, 0.72], [-0.35, 3.85, 0.68], [0.35, 3.85, 0.68]]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), rimM);
					eye.position.set(ex, ey, ez); g.add(eye);
				}
				// glowing rings on body
				for (const ry of [1.8, 2.8, 3.4]) {
					const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.1, 6, 14), rimM);
					ring.position.y = ry; ring.rotation.x = Math.PI / 2; g.add(ring);
				}
				for (const s of [-1, 1]) {
					const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 2.2, 8), voidM);
					arm.position.set(1.55 * s, 2.5, 0); arm.rotation.z = 0.4 * s; arm.castShadow = true; g.add(arm);
					const claw = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.8, 5), rimM);
					claw.position.set(2.15 * s, 1.6, 0); claw.rotation.z = (s < 0 ? -1 : 1) * 1.8; g.add(claw);
					const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 1.4, 8), voidM);
					leg.position.set(0.6 * s, 0.7, 0); leg.castShadow = true; g.add(leg);
				}
				return g;
			},
		},
		'Ancient Golem': {
			count: 2, hp: 8000, dmg: 150, speed: 2.2, hopper: false, aggro: 10, barW: 3.0, barY: 3.5, hitY: 1.8, level: 65, xp: 4500, tiers: [7], spawnInset: 12,
			drops: [
				{ item: 'Ancient Core',   p: 1.00 },
				{ item: 'Starstone',      p: 0.80 },
				{ item: 'Aether Crystal', p: 0.60 },
				{ item: 'Ether Shard',    p: 0.50 },
			],
			build() {
				const g = new THREE.Group();
				const stoneM = new THREE.MeshStandardMaterial({ color: 0x3a3050, emissive: 0x6080ff, emissiveIntensity: 0.8, flatShading: true, roughness: 0.8, metalness: 0.3 });
				const coreM  = new THREE.MeshStandardMaterial({ color: 0x00ccff, emissive: 0x00ccff, emissiveIntensity: 4.0, flatShading: true });
				const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.0), stoneM);
				body.position.y = 1.6; body.castShadow = true; g.add(body);
				const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.85), stoneM);
				head.position.y = 2.9; head.castShadow = true; g.add(head);
				const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), coreM);
				core.position.y = 1.65; g.add(core);
				for (const s of [-1, 1]) {
					const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), coreM);
					eye.position.set(0.22 * s, 2.96, 0.38); g.add(eye);
					const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.4, 0.45), stoneM);
					arm.position.set(1.05 * s, 1.55, 0); arm.castShadow = true; g.add(arm);
					const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), stoneM);
					leg.position.set(0.38 * s, 0.5, 0); leg.castShadow = true; g.add(leg);
				}
				return g;
			},
		},
	};
	let findSpotIsleForced;
	findSpotIsleForced = function(isle, inset) {
		const p = findSpotIsle(isle, 2.0, inset);
		if (p) return p;
		// relax separation check entirely, just need walkable land on this isle
		for (let t = 0; t < 200; t++) {
			const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * (isle.r - (inset || 4));
			const x = isle.x + Math.cos(a) * r, z = isle.z + Math.sin(a) * r;
			if (walkable(x, z)) return new THREE.Vector3(x, terrainHeight(x, z), z);
		}
		// absolute fallback: isle centre
		return new THREE.Vector3(isle.x, terrainHeight(isle.x, isle.z), isle.z);
	};
	function spawnCreature(name) {
		const def = CREATURE_DEFS[name];
		// pick a random island that matches this creature's tier list
		const validIsles = ISLES.filter(isle => def.tiers.includes(isle.tier));
		const homeIsle = validIsles[Math.floor(Math.random() * validIsles.length)] || ISLES[0];
		let p;
		if (def.spawnZone) {
			// spawn within a fixed zone (for deep-end legendary creatures)
			const sz = def.spawnZone;
			let found = false;
			for (let t = 0; t < 300 && !found; t++) {
				const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * sz.r;
				const x = sz.x + Math.cos(a) * r, z = sz.z + Math.sin(a) * r;
				if (walkable(x, z)) { p = new THREE.Vector3(x, terrainHeight(x, z), z); found = true; }
			}
			if (!p) p = new THREE.Vector3(sz.x, terrainHeight(sz.x, sz.z), sz.z);
		} else {
			p = findSpotIsleForced(homeIsle, def.spawnInset !== undefined ? def.spawnInset : (def.nearWater ? 2 : 6));
		}
		const g = def.build();
		g.position.set(p.x, terrainHeight(p.x, p.z), p.z);
		const bar = makeHealthBar(g, def.barW, def.barY + 0.8, true);
		const label = makeLabel(g, name, def.barY + 1.35, '#fca5a5', 'Lv ' + def.level);
		const c = {
			name, def, group: g, bar, label,
			hp: def.hp, maxhp: def.hp,
			home: g.position.clone(),
			homeIsle,
			state: 'wander', // wander | combat | dead
			wTarget: null, wTimer: rand(0.5, 3),
			attackTimer: rand(0, 1), respawn: 0, phase: rand(0, Math.PI * 2),
			moving: false,
		};
		g.userData.interact = { kind: 'creature', creature: c };
		scene.add(g);
		clickables.push(g);
		creatures.push(c);
	}
	for (const name of Object.keys(CREATURE_DEFS))
		for (let i = 0; i < CREATURE_DEFS[name].count; i++) spawnCreature(name);

	function creatureTakeDamage(c, dmg, silent) {
		// Conductor: shocked enemies take increased damage
		const condRank = talentRank('lightning_conductor');
		if (condRank > 0 && player.lightningStuns.some(s => s.creature === c)) {
			const condBonus = [0, 0.10, 0.17, 0.24, 0.30, 0.35][condRank];
			dmg = Math.ceil(dmg * (1 + condBonus));
		}
		// Brittle: frozen enemies take more physical damage
		const brittleRank = talentRank('ice_brittle');
		if (brittleRank > 0 && player.iceFreeze.some(f => f.creature === c)) {
			const brittleBonus = [0, 0.15, 0.25, 0.35, 0.42, 0.50][brittleRank];
			dmg = Math.ceil(dmg * (1 + brittleBonus));
		}
		c.hp -= dmg;
		setBar(c.bar, c.hp / c.maxhp);
		if (!silent) {
			floatText('-' + Math.ceil(dmg), c.group.position.clone().add(new THREE.Vector3(0, c.def.barY + 0.9, 0)), '#f87171');
		} else {
			if (!c._dotFloatAccum) c._dotFloatAccum = 0;
			if (!c._dotFloatTimer) c._dotFloatTimer = 0;
			c._dotFloatAccum += dmg;
		}
		if (c.hp <= 0) killCreature(c);
		else if (c.state !== 'combat') { c.state = 'combat'; }
	}
	function flushDotFloatText(c, dt) {
		if (!c._dotFloatTimer) c._dotFloatTimer = 0;
		c._dotFloatTimer -= dt;
		if (c._dotFloatTimer <= 0 && c._dotFloatAccum > 0) {
			floatText('-' + Math.ceil(c._dotFloatAccum), c.group.position.clone().add(new THREE.Vector3(0, c.def.barY + 0.9, 0)), '#fb923c');
			c._dotFloatAccum = 0;
			c._dotFloatTimer = 0.6;
		}
	}
	function killCreature(c) {
		c.state = 'dead';
		c.respawn = 5;
		log('You killed the ' + c.name + '!', 'dmgOut');
		for (const d of c.def.drops) {
			if (Math.random() < d.p) {
				if (addItem(d.item, 1)) {
					log('You got 1 ' + d.item + '.', 'loot');
					floatText('+1 ' + ITEMS[d.item].icon, headPos(), '#fbbf24', 0.85);
				} else log('Your inventory is full — the ' + d.item + ' is lost.', 'warn');
			}
		}
		// ---- experience: scaled down hard when you badly outmatch the foe ----
		const f = challengeFactor(c.def.level);
		const atkGain = Math.max(1, Math.round(c.def.xp * 0.6 * f));
		const defGain = Math.max(1, Math.round(c.def.xp * 0.4 * f));
		const hp0 = headPos();
		floatText('+' + atkGain + ' ATK', hp0.clone().add(new THREE.Vector3(-0.6, 0.2, 0)), '#ff8f8f', 0.85);
		floatText('+' + defGain + ' DEF', hp0.clone().add(new THREE.Vector3(0.6, 0.5, 0)), '#8fbcff', 0.85);
		log('You gained ' + atkGain + ' Attack and ' + defGain + ' Defense experience.', 'sys');
		grantXp('atk', atkGain);
		grantXp('def', defGain);
		if (c.name === 'Dragon') { player.dragonKilled = true; saveGame(); }
		if (player.action && player.action.type === 'attack' && player.action.creature === c) player.action = null;
		// Overload: shocked enemies that die burst-stun nearby enemies
		const overloadRank = talentRank('lightning_overload');
		if (overloadRank > 0 && player.lightningStuns.some(s => s.creature === c)) {
			const olRadius = [0, 4, 5, 6, 7, 8][overloadRank];
			const olStunCycles = overloadRank >= 3 ? 2 : 1;
			creatures.forEach(cc => {
				if (cc !== c && cc.state !== 'dead' && cc.group.position.distanceTo(c.group.position) <= olRadius) {
					if (!player.lightningStuns.some(s => s.creature === cc)) {
						player.lightningStuns.push({ creature: cc, timer: olStunCycles * 2 });
						floatText('⚡ Overload!', cc.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#fde047', 0.9);
					}
				}
			});
		}
	}

// ------------------------------------------------------------------ combat helpers
	function playerHit(c) {
		let dmg = Math.max(1, playerAtk() + randInt(0, 2) - 1);
		if (player.nextAttackFireBonus) {
			dmg += player.nextAttackFireBonus;
			floatText('🔥 +' + player.nextAttackFireBonus, headPos().add(new THREE.Vector3(-0.5, 0.4, 0)), '#fb923c', 0.9);
			player.nextAttackFireBonus = 0;
		}
		if (player.nextAttackLightningBonus) {
			dmg += player.nextAttackLightningBonus;
			floatText('⚡ +' + player.nextAttackLightningBonus, headPos().add(new THREE.Vector3(0, 0.4, 0)), '#facc15', 0.9);
			player.nextAttackLightningBonus = 0;
		}
		if (player.nextAttackIceBonus) {
			dmg += player.nextAttackIceBonus;
			floatText('❄️ +' + player.nextAttackIceBonus, headPos().add(new THREE.Vector3(0.5, 0.4, 0)), '#7dd3fc', 0.9);
			player.nextAttackIceBonus = 0;
		}
		creatureTakeDamage(c, dmg);
		log('You hit the ' + c.name + ' for ' + dmg + '.', 'dmgOut');
		if (c.state !== 'dead') grantXp('atk', Math.max(1, dmg * 0.4 * challengeFactor(c.def.level)));
		if (c.state !== 'dead') applyPassiveOnHit(c);
		player.parts.armR.rotation.x = -1.9;
	}
	function creatureHit(c) {
		// Spirit Walk: immune to damage
		if (player.spiritWalkTimer > 0) {
			floatText('👻 Ethereal!', headPos(), '#e9d5ff', 0.8);
			return;
		}
		const raw = c.def.dmg + randInt(0, 2);
		let dmg = Math.max(1, raw - playerDef());
		// Fortitude: reduce incoming damage
		const fortRank = talentRank('spirit_fortitude');
		if (fortRank > 0) {
			const reduction = [0, 0.02, 0.04, 0.05, 0.06, 0.08][fortRank];
			dmg = Math.max(1, Math.floor(dmg * (1 - reduction)));
		}
		// Void Shroud consumable: reduce incoming damage
		if (player.consumableDmgReduceTimer > 0 && player.consumableDmgReduce) {
			dmg = Math.max(1, Math.floor(dmg * (1 - player.consumableDmgReduce)));
		}
		// Aegis: absorb damage
		if (player.aegisAbsorb > 0) {
			const absorbed = Math.min(player.aegisAbsorb, dmg);
			player.aegisAbsorb -= absorbed;
			dmg -= absorbed;
			floatText('🔮 -' + absorbed, headPos().add(new THREE.Vector3(0.4, 0.2, 0)), '#a78bfa', 0.8);
			if (player.aegisAbsorb <= 0) { player.aegisAbsorb = 0; player.aegisTimer = 0; log('🔮 Aegis shattered.', 'sys'); }
			if (dmg <= 0) return;
		}
		// Magma Shell: absorb damage and return fire
		if (player.magmaShellAbsorb > 0) {
			const absorbed = Math.min(player.magmaShellAbsorb, dmg);
			player.magmaShellAbsorb -= absorbed;
			dmg -= absorbed;
			floatText('🛡️ -' + absorbed, headPos().add(new THREE.Vector3(-0.4, 0.2, 0)), '#f97316', 0.8);
			if (player.magmaShellReturnDmg > 0) {
				creatureTakeDamage(c, player.magmaShellReturnDmg);
				floatText('🔥 ' + player.magmaShellReturnDmg, c.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#fb923c', 0.8);
			}
			if (player.magmaShellAbsorb <= 0) { player.magmaShellAbsorb = 0; player.magmaShellTimer = 0; log('🛡️ Magma Shell crumbled.', 'sys'); }
			if (dmg <= 0) return;
		}
		// Glacial Armor: absorb damage
		if (player.glacialArmorAbsorb > 0) {
			const absorbed = Math.min(player.glacialArmorAbsorb, dmg);
			player.glacialArmorAbsorb -= absorbed;
			dmg -= absorbed;
			floatText('🧊 -' + absorbed, headPos().add(new THREE.Vector3(0, 0.2, 0.4)), '#bae6fd', 0.8);
			if (player.glacialArmorAbsorb <= 0) {
				// manual expiry triggers explosion
				player.glacialArmorTimer = 0.01;
			}
			if (dmg <= 0) return;
		}
		player.hp -= dmg;
		player.lastHurt = elapsed;
		setBar(player.bar, player.hp / player.maxhp);
		refreshHpUI();
		floatText('-' + dmg, headPos(), '#fb923c');
		log('The ' + c.name + ' hits you for ' + dmg + '.', 'dmgIn');
		if (player.hp <= 0) { playerDeath(); return; }
		// taking hits trains defense — must check death BEFORE granting XP, because
		// a Defense level-up in onLevelUp restores HP to full, masking a lethal blow
		grantXp('def', Math.max(1, dmg * 0.5 * challengeFactor(c.def.level)));
		if (player.harvesting) { stopHarvest('You were attacked — harvesting interrupted!'); }
		if (player.action && player.action.type === 'fish') { stopHarvest('You were attacked — fishing interrupted!'); player.action = null; }
		// auto-defend, like the old lands
		if (!player.action && !player.dead) player.action = { type: 'attack', creature: c };
	}
	function playerDeath() {
		if (player.dead) return;
		player.dead = true;
		player.action = null; player.moveTarget = null; player.harvesting = null;
		hideProgress();
		log('You died! You awaken back at the beach…', 'warn');
		for (const c of creatures) if (c.state === 'combat') { c.state = 'wander'; c.hp = c.maxhp; setBar(c.bar, 1); }
		setTimeout(() => {
			player.group.position.set(0, terrainHeight(0, 4), 4);
			player.hp = player.maxhp;
			setBar(player.bar, 1); refreshHpUI();
			player.dead = false;
			player.phoenixMarkUsed = false;
			player.resurrectionMarkUsed = false;
			log('You feel restored.', 'sys');
		}, 1200);
	}
	function refreshHpUI() {
		ui.hpBar.style.width = clamp((player.hp / player.maxhp) * 100, 0, 100) + '%';
		ui.hpText.textContent = Math.max(0, Math.ceil(player.hp)) + ' / ' + player.maxhp;
	}

// ------------------------------------------------------------------ harvesting
	function startHarvest(node) {
		player.harvesting = { node, t: 0 };
		player.moveTarget = null;
		ui.progressWrap.classList.remove('hidden');
		ui.progressWrap.classList.add('flex');
		ui.progressLabel.textContent =
			node.verb[0].toUpperCase() + node.verb.slice(1) + ' ' + node.item + '…';
		ui.progressIcon.textContent = ITEMS[node.item].icon;
		log('You started ' + node.verb + ' ' + node.item + '.', 'harvest');
		// face the node
		const d = node.group.position.clone().sub(player.group.position);
		player.targetAngle = Math.atan2(d.x, d.z);
	}
	function hideProgress() {
		ui.progressWrap.classList.add('hidden');
		ui.progressWrap.classList.remove('flex');
	}
	function stopHarvest(msg) {
		if (!player.harvesting) return;
		player.harvesting = null;
		hideProgress();
		if (msg) log(msg, 'warn');
	}
	function updateHarvest(dt) {
		const h = player.harvesting;
		if (!h) return;
		h.t += dt;
		const pct = clamp(h.t / h.node.duration, 0, 1) * 100;
		ui.progressRing.style.background =
			'conic-gradient(#7fe0ff ' + pct + '%, rgba(255,255,255,0.08) 0)';
		if (h.t >= h.node.duration) {
			if (addItem(h.node.item, 1)) {
				log('You got 1 ' + h.node.item + '.', 'harvest');
				floatText('+1 ' + ITEMS[h.node.item].icon, headPos(), '#34d399');
				// fishing sometimes also nets iridescent scales
				if (h.node.water && Math.random() < 0.4) {
					if (addItem('Fish Scales', 1)) { log('You also got 1 Fish Scales.', 'loot'); }
				}
				h.t = 0; // keep going, EL style
			} else {
				stopHarvest('Your inventory is full.');
			}
		}
	}

// ------------------------------------------------------------------ input
	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	let started = false;

	renderer.domElement.addEventListener('pointerdown', (e) => {
		if (!started || player.dead || e.button !== 0) return;
		pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
		pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
		raycaster.setFromCamera(pointer, camera);

		// interactive objects first
		const hits = raycaster.intersectObjects(clickables, true);
		if (hits.length) {
			let o = hits[0].object;
			while (o && !o.userData.interact) o = o.parent;
			if (o) {
				const it = o.userData.interact;
				if (it.kind === 'creature' && it.creature.state !== 'dead') {
					// Fireball targeting mode
					if (player.fireballMode) {
						player.fireballMode = false;
						const rank = talentRank('fire_fireball');
						const dmg = Math.ceil(playerAtk() * ([0, 1.8, 2.8, 4.0, 5.5, 7.2][rank]));
						const geo = new THREE.SphereGeometry(0.18, 8, 8);
						const mat = new THREE.MeshBasicMaterial({ color: 0xff4400 });
						const mesh = new THREE.Mesh(geo, mat);
						const light = new THREE.PointLight(0xff4400, 1, 4);
						mesh.add(light);
						const startPos = headPos();
						const endPos = it.creature.group.position.clone().add(new THREE.Vector3(0, 1, 0));
						mesh.position.copy(startPos);
						scene.add(mesh);
						player.fireballs.push({ mesh, target: it.creature, startPos, endPos, t: 0, damage: dmg });
						log('🔮 Fireball launched at ' + it.creature.name + '!', 'craft');
						return;
					}
					// Ice Lance targeting mode
					if (player.iceLanceMode) {
						player.iceLanceMode = false;
						const rank = talentRank('ice_lance');
						const dmg = Math.ceil(playerAtk() * ([0, 1.1, 1.9, 2.9, 4.1, 5.6][rank]));
						const geo = new THREE.CylinderGeometry(0.06, 0.18, 0.9, 6);
						const mat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
						const mesh = new THREE.Mesh(geo, mat);
						const light = new THREE.PointLight(0xaaeeff, 1.2, 4);
						mesh.add(light);
						const startPos = headPos();
						const endPos = it.creature.group.position.clone().add(new THREE.Vector3(0, 1, 0));
						mesh.position.copy(startPos);
						scene.add(mesh);
						player.iceLances.push({ mesh, target: it.creature, startPos, endPos, t: 0, damage: dmg });
						log('🧊 Ice Lance launched at ' + it.creature.name + '!', 'craft');
						return;
					}
					// Lightning Strike targeting mode
					if (player.lightningStrikeMode) {
						player.lightningStrikeMode = false;
						const rank = talentRank('lightning_strike');
						const dmg = Math.ceil(playerAtk() * ([0, 0.45, 0.70, 1.05, 1.55, 2.10][rank]));
						player.lightningStrikes.push({ creature: it.creature, hitsLeft: 5, interval: 1.6, timer: 0, damage: dmg });
						log('🗲 Lightning Strike locked on ' + it.creature.name + ' — 5 bolts incoming!', 'craft');
						return;
					}
					stopHarvest();
					player.action = { type: 'attack', creature: it.creature };
					player.moveTarget = null;
					log('You attack the ' + it.creature.name + '!', 'sys');
					return;
				}
				if (it.kind === 'harvest') {
					stopHarvest();
					player.action = { type: 'harvest', node: it.node };
					player.moveTarget = null;
					return;
				}
				if (it.kind === 'npc') {
					stopHarvest(); player.action = null;
					if (it.npc === 'herald') {
						if (player.dragonKilled) {
							log('Herald: "Hail, ' + player.name + '! You passed through Dragon\'s Lair and slew the beast — Eldenmere salutes you, champion!"', 'craft');
						} else {
							log('Herald: "Welcome to Eldenmere, traveller. You\'ve come far — through Dragon\'s Lair no less. The great beast still prowls those southern crags…"', 'sys');
						}
					}
					return;
				}
			}
		}
		// then the ground
		const gHit = raycaster.intersectObject(ground);
		if (gHit.length) {
			const p = gHit[0].point;
			if (tooDeep(p.x, p.z)) { log('The water is too deep and cold out there.', 'warn'); return; }
			stopHarvest();
			player.action = null;
			player.moveTarget = new THREE.Vector3(p.x, 0, p.z);
			const ry = Math.max(terrainHeight(p.x, p.z), WATER_Y);
			showRing(new THREE.Vector3(p.x, ry, p.z));
			if (inWater(p.x, p.z)) log('You wade into the water…', 'sys');
		}
	});

	renderer.domElement.addEventListener('wheel', (e) => {
		camZoom = clamp(camZoom + (e.deltaY > 0 ? 0.08 : -0.08), 0.55, 1.7);
		e.preventDefault();
	}, { passive: false });

// ------------------------------------------------------------------ map overlay (M key)
	let mapOpen = false;
	const mapCanvas = document.createElement('canvas');
	mapCanvas.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;cursor:pointer;';
	document.body.appendChild(mapCanvas);
	mapCanvas.addEventListener('click', closeMap);

	const BIOME_COLORS = {
		temperate: '#4a9e5c',
		volcanic:  '#c0533a',
		frost:     '#7ab8d4',
		arcane:    '#6a2a9e',
	};

	function drawMap() {
		const W = window.innerWidth, H = window.innerHeight;
		mapCanvas.width = W; mapCanvas.height = H;
		const ctx = mapCanvas.getContext('2d');

		// dark semi-transparent background
		ctx.fillStyle = 'rgba(10,18,30,0.88)';
		ctx.fillRect(0, 0, W, H);

		// title
		ctx.fillStyle = '#e8d5a0';
		ctx.font = 'bold 22px Georgia, serif';
		ctx.textAlign = 'center';
		ctx.fillText('ETERNAL ISLES — Archipelago Map', W / 2, 36);
		ctx.font = '13px Georgia, serif';
		ctx.fillStyle = '#a0b4c8';
		ctx.fillText('Press M or Esc to close', W / 2, 58);

		// scale: fit the cluster (OUTER_R = 210 world units) into the canvas with padding
		const PAD = 90;
		const scale = Math.min((W - PAD * 2) / (OUTER_R * 2), (H - PAD * 2) / (OUTER_R * 2));
		const cx = W / 2, cy = H / 2 + 20; // shift down a bit to leave room for title

		// outer sea boundary circle
		ctx.beginPath();
		ctx.arc(cx, cy, OUTER_R * scale, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(80,130,180,0.35)';
		ctx.lineWidth = 2;
		ctx.setLineDash([8, 6]);
		ctx.stroke();
		ctx.setLineDash([]);

		// water fill inside boundary
		ctx.beginPath();
		ctx.arc(cx, cy, OUTER_R * scale, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(30,70,120,0.55)';
		ctx.fill();

		// draw each island
		for (const isle of ISLES) {
			const ix = cx + isle.x * scale;
			const iy = cy + isle.z * scale; // z maps to Y on the 2-D canvas
			const ir = isle.r * scale;
			const col = BIOME_COLORS[isle.biome] || '#888';

			// island body
			ctx.beginPath();
			ctx.arc(ix, iy, ir, 0, Math.PI * 2);
			ctx.fillStyle = col;
			ctx.fill();
			ctx.strokeStyle = 'rgba(255,255,255,0.25)';
			ctx.lineWidth = 1.5;
			ctx.stroke();

			// shore glow
			const grad = ctx.createRadialGradient(ix, iy, ir * 0.6, ix, iy, ir);
			grad.addColorStop(0, 'rgba(255,255,255,0)');
			grad.addColorStop(1, 'rgba(255,255,255,0.12)');
			ctx.beginPath();
			ctx.arc(ix, iy, ir, 0, Math.PI * 2);
			ctx.fillStyle = grad;
			ctx.fill();

			// tier badge
			ctx.beginPath();
			ctx.arc(ix, iy - ir * 0.55, 10, 0, Math.PI * 2);
			ctx.fillStyle = 'rgba(0,0,0,0.55)';
			ctx.fill();
			ctx.fillStyle = '#ffe680';
			ctx.font = 'bold 11px monospace';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText('T' + isle.tier, ix, iy - ir * 0.55);

			// island name label
			ctx.fillStyle = '#ffffff';
			ctx.font = 'bold 13px Georgia, serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'top';
			ctx.fillText(isle.name, ix, iy + ir + 5);

			// biome label in smaller text
			ctx.fillStyle = '#c0d8e0';
			ctx.font = '11px Georgia, serif';
			ctx.fillText(isle.biome, ix, iy + ir + 21);
		}

		// player dot
		if (player && player.group) {
			const px = player.group.position.x, pz = player.group.position.z;
			const sx = cx + px * scale, sy = cy + pz * scale;
			ctx.beginPath();
			ctx.arc(sx, sy, 6, 0, Math.PI * 2);
			ctx.fillStyle = '#ffffff';
			ctx.fill();
			ctx.beginPath();
			ctx.arc(sx, sy, 4, 0, Math.PI * 2);
			ctx.fillStyle = '#ffdd44';
			ctx.fill();
			ctx.fillStyle = '#ffffff';
			ctx.font = 'bold 12px Georgia, serif';
			ctx.textAlign = 'left';
			ctx.textBaseline = 'middle';
			ctx.fillText(' You', sx + 7, sy);
		}

		// compass rose (bottom-right)
		const crx = W - 56, cry = H - 56, crr = 28;
		ctx.strokeStyle = '#a0b4c8'; ctx.lineWidth = 1;
		const dirs = [['N', 0], ['E', Math.PI / 2], ['S', Math.PI], ['W', -Math.PI / 2]];
		for (const [label, angle] of dirs) {
			const ex = crx + Math.sin(angle) * crr, ey = cry - Math.cos(angle) * crr;
			ctx.beginPath(); ctx.moveTo(crx, cry); ctx.lineTo(ex, ey); ctx.stroke();
			ctx.fillStyle = label === 'N' ? '#ff6666' : '#c0d8e0';
			ctx.font = 'bold 12px monospace';
			ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
			ctx.fillText(label, crx + Math.sin(angle) * (crr + 12), cry - Math.cos(angle) * (crr + 12));
		}
		ctx.beginPath(); ctx.arc(crx, cry, 4, 0, Math.PI * 2);
		ctx.fillStyle = '#c0d8e0'; ctx.fill();

		// legend
		ctx.textAlign = 'left'; ctx.textBaseline = 'top';
		let ly = H - 50;
		ctx.fillStyle = '#a0b4c8'; ctx.font = '12px Georgia, serif';
		ctx.fillText('Biomes:', 14, ly);
		let lx = 14;
		for (const [biome, col] of Object.entries(BIOME_COLORS)) {
			ctx.beginPath(); ctx.rect(lx, ly + 16, 12, 12);
			ctx.fillStyle = col; ctx.fill();
			ctx.fillStyle = '#c0d8e0'; ctx.font = '11px Georgia, serif';
			ctx.fillText(biome, lx + 16, ly + 16);
			lx += 90;
		}
	}

	function openMap() {
		mapOpen = true;
		mapCanvas.style.display = 'block';
		drawMap();
	}
	function closeMap() {
		mapOpen = false;
		mapCanvas.style.display = 'none';
	}

	window.addEventListener('keydown', (e) => {
		if (e.key === 'm' || e.key === 'M') {
			if (mapOpen) closeMap(); else openMap();
		} else if (e.key === 'n' || e.key === 'N') {
			if (!started) return;
			const tm = document.getElementById('talentModal');
			if (tm && tm.classList.contains('hidden')) openTalentTree(); else closeTalentTree();
		} else if (e.key === 'Escape') {
			if (mapOpen) closeMap();
			closeTalentTree();
		} else if (['1','2','3','4','5'].includes(e.key) && started) {
			activateSkill(parseInt(e.key) - 1);
		}
	});

// contextual cursors ---------------------------------------------------------
	function makeCursor(emoji, hot) {
		const cv = document.createElement('canvas'); cv.width = cv.height = 40;
		const cx = cv.getContext('2d');
		cx.font = '30px system-ui, "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
		cx.textAlign = 'center'; cx.textBaseline = 'middle';
		cx.fillText(emoji, 20, 22);
		return 'url(' + cv.toDataURL('image/png') + ') ' + hot[0] + ' ' + hot[1] + ', pointer';
	}
	const CURSORS = {
		sword: makeCursor('⚔️', [20, 20]),
		axe:   makeCursor('🪓', [10, 30]),
		pick:  makeCursor('⛏️', [10, 30]),
		gather:makeCursor('🌿', [20, 20]),
		fish:  makeCursor('🎣', [8, 30]),
		walk:  'default',
	};
	const hoverRay = new THREE.Raycaster();
	const hoverPtr = new THREE.Vector2();
	let hoverHave = false, hoverTick = 0;
	renderer.domElement.addEventListener('pointermove', (e) => {
		hoverPtr.x = (e.clientX / window.innerWidth) * 2 - 1;
		hoverPtr.y = -(e.clientY / window.innerHeight) * 2 + 1;
		hoverHave = true;
	});
	function cursorForVerb(v) {
		return v === 'chopping' ? CURSORS.axe : v === 'mining' ? CURSORS.pick :
			v === 'fishing' ? CURSORS.fish : CURSORS.gather;
	}
	function updateHoverCursor(dt) {
		hoverTick -= dt;
		if (!started || !hoverHave || hoverTick > 0) return;
		hoverTick = 0.07;
		hoverRay.setFromCamera(hoverPtr, camera);
		const hits = hoverRay.intersectObjects(clickables, true);
		let cur = CURSORS.walk;
		if (hits.length) {
			let o = hits[0].object;
			while (o && !o.userData.interact) o = o.parent;
			if (o) {
				const it = o.userData.interact;
				if (it.kind === 'creature' && it.creature.state !== 'dead') cur = CURSORS.sword;
				else if (it.kind === 'harvest') cur = cursorForVerb(it.node.verb);
			}
		}
		renderer.domElement.style.cursor = cur;
	}

// ------------------------------------------------------------------ player update
	function moveEntityTowards(g, target, speed, dt) {
		const dx = target.x - g.position.x, dz = target.z - g.position.z;
		const dist = Math.sqrt(dx * dx + dz * dz);
		if (dist < 0.12) return true;
		const step = Math.min(speed * dt, dist);
		const nx = g.position.x + (dx / dist) * step;
		const nz = g.position.z + (dz / dist) * step;
		if (canStep(nx, nz) && !isSolidBlocked(nx, nz)) { g.position.x = nx; g.position.z = nz; }
		g.userData._angle = Math.atan2(dx, dz);
		return dist - step < 0.12;
	}
	function turnTowards(g, angle, dt, rate) {
		if (angle === undefined || Number.isNaN(angle)) return;
		let a = angle - g.rotation.y;
		while (a > Math.PI) a -= Math.PI * 2;
		while (a < -Math.PI) a += Math.PI * 2;
		g.rotation.y += a * Math.min(1, (rate || 12) * dt);
	}

	function updatePlayer(dt) {
		const g = player.group;
		player.moving = false;
		if (player.dead) return;

		const swimming = inWater(g.position.x, g.position.z);
		player.swimming = swimming;
		const spd = swimming ? player.speed * 0.55 : player.speed;

		// resolve current action
		if (player.action) {
			const a = player.action;
			if (a.type === 'attack') {
				const c = a.creature;
				if (c.state === 'dead') { player.action = null; }
				else {
					const d = g.position.distanceTo(c.group.position);
					if (d > 1.9) {
						player.moving = true;
						moveEntityTowards(g, c.group.position, spd, dt);
						player.targetAngle = g.userData._angle;
					} else {
						const dv = c.group.position.clone().sub(g.position);
						player.targetAngle = Math.atan2(dv.x, dv.z);
						player.attackTimer -= dt;
						if (player.attackTimer <= 0) {
							player.attackTimer = 1.15;
							playerHit(c);
							if (c.state !== 'dead') c.state = 'combat';
						}
					}
				}
			} else if (a.type === 'harvest') {
				const n = a.node;
				const d = g.position.distanceTo(n.group.position);
				if (d > n.range) {
					player.moving = true;
					moveEntityTowards(g, n.group.position, spd, dt);
					player.targetAngle = g.userData._angle;
				} else {
					player.action = null;
					startHarvest(n);
				}
			}
		} else if (player.moveTarget) {
			player.moving = true;
			if (moveEntityTowards(g, player.moveTarget, spd, dt)) player.moveTarget = null;
			player.targetAngle = g.userData._angle;
		}

		if (player.targetAngle !== undefined) turnTowards(g, player.targetAngle, dt);

		// vertical placement — float at the surface when swimming
		const groundY = terrainHeight(g.position.x, g.position.z);
		if (swimming) {
			g.position.y = WATER_Y - 0.35 + Math.sin(player.animT) * 0.05;
		} else {
			g.position.y = groundY + (player.moving ? Math.abs(Math.sin(player.animT)) * 0.06 : 0);
		}

		// animation ------------------------------------------------------------
		if (player.castT > 0) {
			player.castT -= dt;
			player.parts.armL.rotation.x = -2.5 + Math.sin(elapsed * 9) * 0.12;
			player.parts.armR.rotation.x = -2.5 - Math.sin(elapsed * 9) * 0.12;
			player.parts.legL.rotation.x = 0; player.parts.legR.rotation.x = 0;
			g.rotation.x = lerp(g.rotation.x, 0, 0.2);
		} else if (swimming) {
			player.animT += dt * (player.moving ? 8 : 3);
			const paddle = Math.sin(player.animT);
			player.parts.armL.rotation.x = -0.9 + paddle * 0.6;
			player.parts.armR.rotation.x = -0.9 - paddle * 0.6;
			player.parts.legL.rotation.x = paddle * 0.4;
			player.parts.legR.rotation.x = -paddle * 0.4;
			g.rotation.x = lerp(g.rotation.x, 0.5, 0.15); // lean forward into the water
		} else {
			player.animT += dt * (player.moving ? 10 : 2.4);
			const swing = player.moving ? Math.sin(player.animT) * 0.55 : Math.sin(player.animT) * 0.05;
			player.parts.armL.rotation.x = swing;
			player.parts.armR.rotation.x = lerp(player.parts.armR.rotation.x, -swing, 0.25);
			player.parts.legL.rotation.x = -swing;
			player.parts.legR.rotation.x = swing;
			g.rotation.x = lerp(g.rotation.x, 0, 0.15);
		}

		// regen out of combat (spirit_passive rank scales rate and tick speed)
		if (elapsed - player.lastHurt > 5 && player.hp < player.maxhp) {
			const spRank = talentRank('spirit_passive');
			const spiritTick = [0.8, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35, 0.25][spRank] || 0.8;
			const spiritHeal = [1, 1, 2, 3, 4, 5, 7, 9, 12][spRank] || 1;
			player.regenTimer -= dt;
			if (player.regenTimer <= 0) {
				player.regenTimer = spiritTick;
				player.hp = Math.min(player.maxhp, player.hp + spiritHeal);
				setBar(player.bar, player.hp / player.maxhp);
				refreshHpUI();
			}
		}
		updateHarvest(dt);
		updateTalentEffects(dt);
	}

// ------------------------------------------------------------------ creature update
	function updateCreature(c, dt) {
		const g = c.group;
		if (c.state === 'dead') {
			g.scale.y = Math.max(0.01, g.scale.y - dt * 2.2);
			g.position.y = terrainHeight(g.position.x, g.position.z);
			if (g.scale.y <= 0.02) g.visible = false;
			c.respawn -= dt;
			if (c.respawn <= 0) {
				let p;
				if (c.def.spawnZone) {
					const sz = c.def.spawnZone;
					let found = false;
					for (let t = 0; t < 300 && !found; t++) {
						const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * sz.r;
						const x = sz.x + Math.cos(a) * r, z = sz.z + Math.sin(a) * r;
						if (walkable(x, z)) { p = new THREE.Vector3(x, terrainHeight(x, z), z); found = true; }
					}
					if (!p) p = new THREE.Vector3(sz.x, terrainHeight(sz.x, sz.z), sz.z);
				} else {
					p = findSpotIsleForced(c.homeIsle, c.def.spawnInset !== undefined ? c.def.spawnInset : (c.def.nearWater ? 2 : 6));
				}
				g.position.set(p.x, terrainHeight(p.x, p.z), p.z);
				c.home.copy(g.position);
				c.hp = c.maxhp; setBar(c.bar, 1);
				g.scale.y = 1; g.visible = true;
				c.state = 'wander'; c.wTarget = null; c.wTimer = rand(1, 3);
			}
			return;
		}

		const distToPlayer = g.position.distanceTo(player.group.position);
		c.moving = false;

		if (c.state === 'wander') {
			// wolves are territorial
			if (c.def.aggro > 0 && !player.dead && distToPlayer < c.def.aggro) {
				c.state = 'combat';
				log('A ' + c.name + ' lunges at you!', 'warn');
			} else {
				c.wTimer -= dt;
				if (c.wTimer <= 0 && !c.wTarget) {
					for (let t = 0; t < 10; t++) {
						const nx = c.home.x + rand(-6, 6), nz = c.home.z + rand(-6, 6);
						if (walkable(nx, nz)) { c.wTarget = new THREE.Vector3(nx, 0, nz); break; }
					}
					c.wTimer = rand(2, 5.5);
				}
				if (c.wTarget) {
					c.moving = true;
					if (moveEntityTowards(g, c.wTarget, c.def.speed * 0.55, dt)) c.wTarget = null;
					turnTowards(g, g.userData._angle, dt, 8);
				}
			}
		}

		if (c.state === 'combat') {
			if (player.dead || distToPlayer > 15) {
				c.state = 'wander';
				c.hp = c.maxhp; setBar(c.bar, 1);
			} else {
				const isDragon      = c.name === 'Dragon';
				const isCaveTroll   = c.name === 'Cave Troll';
				const isFrostGolem  = c.name === 'Frost Golem';
				const isLavaTitan   = c.name === 'Lava Titan';
				const isShadowWraith= c.name === 'Shadow Wraith';
				const isVoidStalker = c.name === 'Void Stalker';
				const isAncientGolem= c.name === 'Ancient Golem';
				const isInfernalTitan = c.name === 'Infernal Titan';
				const isVoidColossus= c.name === 'Void Colossus';
				const dv = player.group.position.clone().sub(g.position);
				turnTowards(g, Math.atan2(dv.x, dv.z), dt, 10);
				// freeze/stun checks
				const freeze = player.iceFreeze.find(f => f.creature === c);
				if (freeze) { freeze.turnsLeft -= dt / 1.6; }
				const isFrozen = freeze && freeze.turnsLeft > 0;
				const isStunned = player.lightningStuns.some(s => s.creature === c);
				if (isDragon && distToPlayer > 4.5) {
					// Dragon: hold position and hurl fireballs when player is far
					c.moving = false;
					if (!isFrozen && !isStunned) {
						if (!c.fireballTimer) c.fireballTimer = 3.5;
						c.fireballTimer -= dt;
						if (c.fireballTimer <= 0) {
							c.fireballTimer = rand(3.0, 5.0);
							spawnDragonFireball(c, c.def.dmg + randInt(0, 20));
						}
					}
				} else if ((isCaveTroll || isFrostGolem || isLavaTitan || isShadowWraith || isVoidStalker || isAncientGolem || isInfernalTitan || isVoidColossus) && distToPlayer > 3.5 && distToPlayer < 22) {
					// Spellcasting creatures: move closer if very far, then cast when in range
					if (distToPlayer > 9) {
						c.moving = true;
						moveEntityTowards(g, player.group.position, c.def.speed, dt);
					} else {
						c.moving = false;
					}
					if (!isFrozen && !isStunned) {
						if (!c.spellTimer) c.spellTimer = isCaveTroll || isFrostGolem ? rand(4.5, 6.5) : rand(3.0, 5.0);
						c.spellTimer -= dt;
						if (c.spellTimer <= 0) {
							let interval, color, label, dmgMult;
							if (isCaveTroll)    { interval = rand(4.5, 6.5); color = 0x8B6914; label = '🪨 The Cave Troll hurls a boulder!'; dmgMult = 1.55; }
							else if (isFrostGolem)  { interval = rand(4.0, 6.0); color = 0x7dd3fc; label = '❄️ The Frost Golem launches an ice shard!'; dmgMult = 1.60; }
							else if (isLavaTitan)   { interval = rand(2.5, 4.0); color = 0xff4400; label = '🌋 The Lava Titan spews a lava ball!'; dmgMult = 1.80; }
							else if (isShadowWraith){ interval = rand(2.0, 3.5); color = 0x6600cc; label = '🌑 The Shadow Wraith fires a shadow bolt!'; dmgMult = 1.85; }
							else if (isVoidStalker) { interval = rand(2.0, 3.5); color = 0x330066; label = '🌀 The Void Stalker launches a void lance!'; dmgMult = 1.90; }
							else if (isAncientGolem){ interval = rand(2.5, 4.0); color = 0x7c6a3b; label = '🗿 The Ancient Golem sends a shockwave!'; dmgMult = 1.70; }
							else if (isInfernalTitan){ interval = rand(1.8, 3.0); color = 0xff1100; label = '🔥 The Infernal Titan unleashes an inferno burst!'; dmgMult = 1.95; }
							else                    { interval = rand(1.5, 2.8); color = 0x220044; label = '💀 The Void Colossus fires a void pulse!'; dmgMult = 2.00; }
							c.spellTimer = interval;
							spawnCreatureProjectile(c, Math.ceil(c.def.dmg * dmgMult) + randInt(0, 10), color, label);
						}
					}
					// still melee if close
					if (distToPlayer <= 1.8 && !isFrozen && !isStunned) {
						c.attackTimer -= dt;
						if (c.attackTimer <= 0) { c.attackTimer = 1.6; creatureHit(c); }
					}
				} else if (distToPlayer > 1.8) {
					c.moving = true;
					moveEntityTowards(g, player.group.position, c.def.speed, dt);
				} else {
					c.moving = false;
					// melee attack
					if (!isFrozen && !isStunned) {
						c.attackTimer -= dt;
						if (c.attackTimer <= 0) {
							c.attackTimer = 1.6;
							creatureHit(c);
						}
					}
				}
			}
		}

		// hop / bob animation
		c.phase += dt * (c.moving ? (c.def.hopper ? 9 : 7) : 2);
		const baseY = terrainHeight(g.position.x, g.position.z);
		if (c.def.hopper) g.position.y = baseY + (c.moving ? Math.abs(Math.sin(c.phase)) * 0.28 : Math.abs(Math.sin(c.phase * 0.6)) * 0.05);
		else g.position.y = baseY + (c.moving ? Math.abs(Math.sin(c.phase)) * 0.08 : Math.sin(c.phase * 0.5) * 0.02);
	}

// ------------------------------------------------------------------ craft window
	const MIX_SLOTS = 6;
	const mix = new Array(MIX_SLOTS).fill(null); // {item, count}
	function mixAggregate() {
		const m = {};
		for (const e of mix) if (e) m[e.item] = (m[e.item] || 0) + e.count;
		return m;
	}
	function moveToMix(item) {
		let slot = mix.find((e) => e && e.item === item);
		let newIdx = -1;
		if (!slot) {
			newIdx = mix.findIndex((e) => !e);
			if (newIdx === -1) { ui.mixHint.textContent = 'The mix box is full.'; return; }
		}
		if (!removeItem(item, 1)) return;
		if (newIdx !== -1) mix[newIdx] = slot = { item, count: 0 };
		slot.count++;
		renderMix();
	}
	function returnMixSlot(i) {
		const e = mix[i];
		if (!e) return;
		if (!addItem(e.item, e.count)) { log('No room in your inventory.', 'warn'); return; }
		mix[i] = null;
		renderMix();
	}
	function clearMixToInventory() {
		for (let i = 0; i < mix.length; i++) {
			if (mix[i]) { addItem(mix[i].item, mix[i].count); mix[i] = null; }
		}
		renderMix();
	}
	function renderMix() {
		ui.mixSlots.innerHTML = '';
		mix.forEach((e, i) => {
			const cell = document.createElement('button');
			cell.className =
				'relative flex h-16 items-center justify-center rounded-xl border text-2xl transition ' +
				(e ? 'border-amber-300/40 bg-amber-400/10 hover:bg-amber-400/20 cursor-pointer'
					: 'border-white/10 bg-white/[0.04]');
			if (e) {
				cell.innerHTML =
					'<span>' + ITEMS[e.item].icon + '</span>' +
					'<span class="absolute bottom-0.5 right-1.5 text-[11px] font-bold text-amber-200">' + e.count + '</span>';
				attachTooltip(cell, e.item, ' — click to take back');
				cell.addEventListener('click', () => returnMixSlot(i));
			}
			ui.mixSlots.appendChild(cell);
		});
		renderRecipes();
	}
	function reqMatches(agg, req) {
		const keysA = Object.keys(agg), keysR = Object.keys(req);
		if (keysA.length !== keysR.length) return false;
		for (const k of keysR) if (agg[k] !== req[k]) return false;
		return true;
	}
	function canAfford(req) {
		for (const k of Object.keys(req)) if (invCount(k) < req[k]) return false;
		return true;
	}
	function effectiveRate(r) { return clamp(r.rate + (player.craftLvl - 1) * 0.03, 0.1, 0.98); }
	function renderRecipes() {
		ui.recipeList.innerHTML = '';
		// group by tier, preserving insertion order
		const groups = [];
		const groupMap = {};
		for (const r of RECIPES) {
			if (!groupMap[r.tier]) { groupMap[r.tier] = []; groups.push(r.tier); }
			groupMap[r.tier].push(r);
		}
		// initialize open-state tracking on first render only
		if (_openRecipeTiers === null) {
			let defaultOpen = groups[0];
			for (const t of groups) {
				if (groupMap[t].some(r => canAfford(r.req))) { defaultOpen = t; break; }
			}
			_openRecipeTiers = new Set([defaultOpen]);
		}
		for (const tier of groups) {
			const recipes = groupMap[tier];
			const anyAfford = recipes.some(r => canAfford(r.req));
			// accordion header
			const header = document.createElement('button');
			header.className = 'w-full flex items-center justify-between rounded-lg px-3 py-2 text-left text-[11px] font-bold uppercase tracking-widest transition ' +
				(anyAfford ? 'text-amber-200 hover:bg-white/5' : 'text-zinc-500 hover:bg-white/5');
			const isOpen = _openRecipeTiers.has(tier);
			header.innerHTML = '<span>' + tier + '</span><span class="accordion-caret">' + (isOpen ? '▲' : '▼') + '</span>';
			const body = document.createElement('div');
			body.className = 'space-y-2 mb-2' + (isOpen ? '' : ' hidden');
			header.addEventListener('click', () => {
				const nowHidden = body.classList.toggle('hidden');
				header.querySelector('.accordion-caret').textContent = nowHidden ? '▼' : '▲';
				if (nowHidden) _openRecipeTiers.delete(tier); else _openRecipeTiers.add(tier);
			});
			ui.recipeList.appendChild(header);
			ui.recipeList.appendChild(body);
			for (const r of recipes) {
				const afford = canAfford(r.req);
				const pct = Math.round(effectiveRate(r) * 100);
				const row = document.createElement('div');
				row.className = 'rounded-xl border p-2.5 transition ' +
					(afford ? 'border-emerald-300/30 bg-emerald-400/5' : 'border-white/10 bg-white/[0.03] opacity-60');
				const ing = Object.entries(r.req)
					.map(([k, v]) => ITEMS[k].icon + '×' + v + ' <span class="text-zinc-400">' + k + '</span>')
					.join(' · ');
				row.innerHTML =
					'<div class="flex items-center justify-between">' +
					'<div class="flex items-center gap-2">' +
					'<span class="text-xl">' + ITEMS[r.out].icon + '</span>' +
					'<div><div class="text-sm font-semibold text-zinc-100">' + r.out +
					' <span class="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-cyan-200">' + r.tag + '</span>' +
					' <span class="ml-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-emerald-300">' + pct + '%</span></div>' +
					'<div class="mt-0.5 text-[11px] leading-tight">' + ing + '</div></div>' +
					'</div>' +
					'<button class="load-btn shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ' +
					(afford
						? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/30'
						: 'border-white/10 bg-white/5 text-zinc-500 cursor-not-allowed') +
					'">Load</button>' +
					'</div>';
				const btn = row.querySelector('.load-btn');
				btn.addEventListener('click', () => {
					clearMixToInventory();
					if (!canAfford(r.req)) { ui.mixHint.textContent = 'You are missing ingredients for that.'; return; }
					let i = 0;
					for (const [item, count] of Object.entries(r.req)) {
						removeItem(item, count);
						mix[i++] = { item, count };
					}
					renderMix();
					ui.mixHint.textContent = 'Ingredients loaded — press Mix!';
				});
				body.appendChild(row);
			}
		}
	}
	let mixing = false;
// Try to reload mix[] from inventory using the same recipe requirements.
// Returns true if the mix box was successfully re-populated.
	function reloadMixFromRecipe(req) {
		if (!canAfford(req)) return false;
		for (let i = 0; i < mix.length; i++) mix[i] = null;
		let idx = 0;
		for (const [item, count] of Object.entries(req)) {
			if (!removeItem(item, count)) { clearMixToInventory(); return false; }
			mix[idx++] = { item, count };
		}
		return true;
	}
	function doMix(times) {
		if (mixing) return;
		const remaining = { left: (times && times > 1) ? times : 1 };
		const agg = mixAggregate();
		if (Object.keys(agg).length === 0) { ui.mixHint.textContent = 'The mix box is empty.'; return; }
		const recipe = RECIPES.find((r) => reqMatches(agg, r.req));
		if (!recipe) {
			ui.mixHint.textContent = 'You mash it all together… nothing happens. Wrong combination.';
			log('That combination makes nothing.', 'warn');
			return;
		}
		function runOnce(isFirst) {
			if (!isFirst) {
				// reload the mix box for subsequent iterations
				if (!reloadMixFromRecipe(recipe.req)) { mixing = false; renderInventory(); renderMix(); return; }
			}
			// consume the ingredients up front (they're at risk — crafting can fail!)
			const spent = {};
			for (let i = 0; i < mix.length; i++) { if (mix[i]) { spent[mix[i].item] = (spent[mix[i].item] || 0) + mix[i].count; mix[i] = null; } }
			renderMix();
			player.castT = 1.5;
			spawnCraftSwirl(0x7fe0ff, 1.5);
			log('You begin to manufacture a ' + recipe.out + '…', 'craft');
			setTimeout(() => {
				const success = Math.random() < effectiveRate(recipe);
				player.grantXp('craft', success ? 12 : 5);
				if (success) {
					if (!addItem(recipe.out, 1)) {
						for (const [k, v] of Object.entries(spent)) addItem(k, v); // no room → give ingredients back
						ui.mixHint.textContent = 'No room in your inventory for the result!';
						mixing = false; renderInventory(); reloadMixFromRecipe(recipe.req); renderMix(); return;
					}
					spawnGroundRing(player.group.position, 0xe879f9, 0.5, 3.0, 0.8, 0.1);
					spawnSparkBurst(player.group.position, 0xffd36b, 22, 2.4, 3.2);
					ui.mixHint.textContent = 'Success! You made a ' + recipe.out + '. (' + recipe.tag + ')';
					log('You mixed a ' + recipe.out + '!', 'craft');
					floatText('⚗️ ' + recipe.out + '!', headPos(), '#e879f9', 1.1);
					// Enriched Fire Essence bonus roll when crafting a Fire Essence
					if (recipe.out === 'Fire Essence') {
						const enrichChance = 0.03 + (player.craftLvl - 1) * 0.002;
						if (Math.random() < enrichChance) {
							addItem('Enriched Fire Essence', 1);
							log('✨ The essence surges — you also created an Enriched Fire Essence!', 'craft');
							floatText('🔥✨ Enriched Essence!', headPos(), '#ff8800', 1.2);
						}
					}
				} else {
					// failure — you lose some materials, but salvage the rest (each item ~50%)
					const saved = [];
					for (const [k, v] of Object.entries(spent)) {
						let keep = 0; for (let n = 0; n < v; n++) if (Math.random() < 0.5) keep++;
						if (keep > 0) { addItem(k, keep); saved.push(keep + '× ' + k); }
					}
					spawnGroundRing(player.group.position, 0x9aa2ad, 0.5, 2.4, 0.7, 0.1);
					spawnSparkBurst(player.group.position, 0x777777, 16, 1.8, 1.8);
					ui.mixHint.textContent = 'The mixture fizzles and fails! ' + (saved.length ? 'Salvaged: ' + saved.join(', ') + '.' : 'All materials lost.');
					log('You failed to make the ' + recipe.out + '.', 'warn');
					floatText('✗ Failed!', headPos(), '#f87171', 1.05);
				}
				remaining.left--;
				if (remaining.left > 0) {
					runOnce(false);
				} else {
					mixing = false;
					renderInventory();
					reloadMixFromRecipe(recipe.req);
					renderMix();
				}
			}, 1350);
		}
		mixing = true;
		runOnce(true);
	}

	$('btnCraft').addEventListener('click', () => {
		ui.craftModal.classList.remove('hidden');
		ui.craftModal.classList.add('flex');
		ui.mixHint.textContent = 'Click items in your inventory to place them here.';
		_openRecipeTiers = null; // reset so first render picks the best default
		renderMix();
	});
	$('btnCraftClose').addEventListener('click', () => {
		clearMixToInventory();
		ui.craftModal.classList.add('hidden');
		ui.craftModal.classList.remove('flex');
	});

// Make craft modal draggable so player can reposition it to see the character animation
	(function() {
		const overlay = ui.craftModal;
		const panel = overlay.querySelector(':scope > div');
		if (!panel) return;
		panel.style.cursor = 'grab';
		panel.style.userSelect = 'none';
		let dragging = false, ox = 0, oy = 0;
		panel.addEventListener('mousedown', (e) => {
			if (e.target.closest('button, input, select, textarea, #recipeList, #mixSlots, #mixHint')) return;
			dragging = true;
			const r = panel.getBoundingClientRect();
			ox = e.clientX - r.left;
			oy = e.clientY - r.top;
			panel.style.cursor = 'grabbing';
			panel.style.position = 'fixed';
			panel.style.margin = '0';
			panel.style.left = r.left + 'px';
			panel.style.top = r.top + 'px';
			overlay.style.alignItems = 'flex-start';
			overlay.style.justifyContent = 'flex-start';
			e.preventDefault();
		});
		document.addEventListener('mousemove', (e) => {
			if (!dragging) return;
			panel.style.left = (e.clientX - ox) + 'px';
			panel.style.top  = (e.clientY - oy) + 'px';
		});
		document.addEventListener('mouseup', () => {
			if (!dragging) return;
			dragging = false;
			panel.style.cursor = 'grab';
		});
	})();

	$('btnMix').addEventListener('click', () => doMix(1));
	$('btnMix5').addEventListener('click', () => doMix(5));
	$('btnHelp').addEventListener('click', () => {
		ui.helpModal.classList.remove('hidden');
		ui.helpModal.classList.add('flex');
	});
	$('btnTalents').addEventListener('click', () => {
		const tm = document.getElementById('talentModal');
		if (tm && tm.classList.contains('hidden')) openTalentTree(); else closeTalentTree();
	});
	$('btnHelpClose').addEventListener('click', () => {
		ui.helpModal.classList.add('hidden');
		ui.helpModal.classList.remove('flex');
	});

// ------------------------------------------------------------------ intro
	function beginGame() {
		const nameEl = $('nameInput');
		let nm = (nameEl ? nameEl.value : '').trim();
		if (!nm) nm = 'Adventurer';
		nm = nm.slice(0, 16).replace(/[<>]/g, '');
		player.name = nm;
		const hasSave = loadGame();
		if (hasSave) {
			nm = player.name;
			refreshStatsUI();
			refreshHpUI();
			renderInventory();
			refreshEquipVisuals();
		}
		drawLabel(player.label, nm);
		if (ui.nameTag) ui.nameTag.textContent = nm.toUpperCase();
		document.getElementById('intro').style.display = 'none';
		ui.hud.classList.remove('hidden');
		const hotbarEl = document.getElementById('hotbar');
		if (hotbarEl) hotbarEl.classList.remove('hidden');
		refreshHotbarUI();
		document.getElementById('btnTalentClose').addEventListener('click', closeTalentTree);
		document.getElementById('btnTalentReset').addEventListener('click', () => {
			if (!confirm('Reset all talents? Your points will be fully refunded.')) return;
			player.talents = {};
			player.hotbar = [null, null, null, null, null];
			player.skillCooldowns = {};
			player.frostWardTimer = 0;
			player.frostWardBonus = 0;
			player.hotTimer = 0;
			player.hotHealTotal = 0;
			saveGame();
			renderTalentTree();
			refreshHotbarUI();
			log('✨ Talents reset — all points refunded.', 'sys');
		});
		started = true;
		if (hasSave) {
			log('Welcome back, ' + nm + '! Your progress has been restored.', 'sys');
		} else {
			log('Welcome to Isla Prima, ' + nm + '!', 'sys');
		}
		log('Click the ground to walk — you can wade into the shallows to swim.', 'sys');
		log('Click flowers, trees, rocks, fishing spots and creatures to interact.', 'sys');
		log('Slaying creatures raises your Attack and Defense. Wolves and bears bite first!', 'sys');
	}
	$('btnStart').addEventListener('click', beginGame);
	if ($('nameInput')) $('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') beginGame(); });

// pre-fill name from save if one exists
	(function() {
		try {
			const raw = localStorage.getItem('eternalIsles_save');
			if (raw) {
				const s = JSON.parse(raw);
				if (s.name && document.getElementById('nameInput')) document.getElementById('nameInput').value = s.name;
			}
		} catch(e) {}
	})();

// ------------------------------------------------------------------ main loop
	const clock = new THREE.Clock();
	let elapsed = 0;
	camTarget.copy(player.group.position);
	camera.position.copy(camTarget).add(CAM_OFFSET);
	camera.lookAt(camTarget.x, camTarget.y + 1, camTarget.z);
	renderInventory();
	refreshStatsUI();
	refreshHpUI();

	function animate() {
		requestAnimationFrame(animate);
		const dt = Math.min(clock.getDelta(), 0.05);
		elapsed += dt;

		if (started) {
			updatePlayer(dt);
			for (const c of creatures) updateCreature(c, dt);
		}

		// camera lerp
		camTarget.lerp(player.group.position, Math.min(1, 4.5 * dt));
		const desired = camTarget.clone().add(CAM_OFFSET.clone().multiplyScalar(camZoom));
		camera.position.lerp(desired, Math.min(1, 4.5 * dt));
		camera.lookAt(camTarget.x, camTarget.y + 1, camTarget.z);

		// click ring pulse
		if (ringT < 1) {
			ringT = Math.min(1, ringT + dt * 2.2);
			const s = 1 + ringT * 1.6;
			ring.scale.set(s, s, s);
			ring.material.opacity = 0.9 * (1 - ringT);
		} else ring.material.opacity = 0;

		// water waves
		{
			const pos = water.geometry.attributes.position;
			for (let i = 0; i < pos.count; i++) {
				const x = waterBase[i * 3], z = waterBase[i * 3 + 2];
				pos.setY(i, Math.sin(x * 0.12 + elapsed * 1.1) * 0.12 + Math.cos(z * 0.1 + elapsed * 0.8) * 0.1);
			}
			pos.needsUpdate = true;
		}

		// fireflies drift
		{
			const pos = fireflies.geometry.attributes.position;
			for (let i = 0; i < FIREFLY_N; i++) {
				const ph = ffPhase[i];
				pos.setX(i, ffBase[i * 3] + Math.sin(elapsed * 0.5 + ph) * 0.9);
				pos.setY(i, ffBase[i * 3 + 1] + Math.sin(elapsed * 0.9 + ph * 2) * 0.45);
				pos.setZ(i, ffBase[i * 3 + 2] + Math.cos(elapsed * 0.4 + ph) * 0.9);
			}
			pos.needsUpdate = true;
		}

		// flower sparkles rise & loop
		{
			const pos = sparkles.geometry.attributes.position;
			for (let i = 0; i < sparkN; i++) {
				const ph = spPhase[i];
				const t = (elapsed * 0.5 + ph) % 1.6;
				pos.setX(i, spAnchor[i * 3] + Math.sin(ph + elapsed) * 0.28);
				pos.setY(i, spAnchor[i * 3 + 1] + 0.3 + t * 0.8);
				pos.setZ(i, spAnchor[i * 3 + 2] + Math.cos(ph + elapsed) * 0.28);
			}
			pos.needsUpdate = true;
		}

		// fishing-spot ripples + bobbers
		for (const fs of fishingSpots) {
			const rings = fs.group.userData._rings, bob = fs.group.userData._bob;
			if (rings) rings.forEach((rg, k) => {
				const t = (elapsed * 0.6 + k * 0.5) % 1;
				rg.scale.setScalar(0.6 + t * 1.6);
				rg.material.opacity = 0.5 * (1 - t);
			});
			if (bob) bob.position.y = WATER_Y + 0.12 + Math.sin(elapsed * 2 + fs.x) * 0.05;
		}

		updateFireballs(dt);
		updateBuffAuras(dt);
		updateStatusSprites();
		updateFloaters(dt);
		updateEffects(dt);
		updateHealthBars(dt);
		updateLabels();
		updateHoverCursor(dt);
		renderer.render(scene, camera);
	}

	// ---- Persistent buff aura rings ----
	// Each entry: { mesh, color, radius, speed, phase, type }
	const buffAuraRings = [];
	function getOrCreateBuffAura(type, color, radius) {
		let entry = buffAuraRings.find(e => e.type === type);
		if (!entry) {
			const geo = new THREE.RingGeometry(radius * 0.82, radius, 40);
			geo.rotateX(-Math.PI / 2);
			const mat = new THREE.MeshBasicMaterial({
				color, transparent: true, opacity: 0.0,
				side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
			});
			const mesh = new THREE.Mesh(geo, mat);
			scene.add(mesh);
			entry = { mesh, color, radius, speed: 0.9 + Math.random() * 0.4, phase: Math.random() * Math.PI * 2, type };
			buffAuraRings.push(entry);
		}
		return entry;
	}
	function updateBuffAuras(dt) {
		// Define which buffs show which aura ring
		const AURA_DEFS = [
			{ type: 'frostWard',    active: () => player.frostWardTimer > 0,    color: 0x7dd3fc, radius: 1.15 },
			{ type: 'glacialArmor', active: () => player.glacialArmorTimer > 0,  color: 0xbae6fd, radius: 1.35 },
			{ type: 'magmaShell',   active: () => player.magmaShellTimer > 0,    color: 0xff6600, radius: 1.25 },
			{ type: 'aegis',        active: () => player.aegisTimer > 0,         color: 0xa78bfa, radius: 1.45 },
			{ type: 'spiritWalk',   active: () => player.spiritWalkTimer > 0,    color: 0xe9d5ff, radius: 1.05 },
			{ type: 'flameWall',    active: () => player.flameWallTimer > 0,     color: 0xff4400, radius: 3.8  },
			{ type: 'staticAura',   active: () => player.staticAuraTimer > 0,    color: 0xfde047, radius: 5.5  },
		];
		const pp = player.group.position;
		for (const def of AURA_DEFS) {
			const isActive = def.active();
			if (!isActive) {
				// hide if exists
				const existing = buffAuraRings.find(e => e.type === def.type);
				if (existing) existing.mesh.material.opacity = 0;
				continue;
			}
			const entry = getOrCreateBuffAura(def.type, def.color, def.radius);
			entry.phase += dt * entry.speed;
			const pulse = 0.28 + Math.sin(entry.phase) * 0.14;
			entry.mesh.material.opacity = pulse;
			entry.mesh.position.set(pp.x, pp.y + 0.12, pp.z);
			// slow rotation
			entry.mesh.rotation.z += dt * 0.5;
		}
	}

	// ---- Fireball projectile update ----
	const dragonFireballs = []; // { mesh, light, startPos, endPos, t, damage }
	function spawnDragonFireball(dragon, damage) {
		const mat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
		const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), mat);
		const light = new THREE.PointLight(0xff4400, 2.5, 6);
		mesh.add(light);
		const startPos = dragon.group.position.clone().add(new THREE.Vector3(0, 2.8, 0));
		const endPos = player.group.position.clone().add(new THREE.Vector3(0, 1.0, 0));
		mesh.position.copy(startPos);
		scene.add(mesh);
		dragonFireballs.push({ mesh, startPos, endPos, t: 0, damage });
		log('🐉 The Dragon breathes fire!', 'dmgIn');
	}
	const creatureProjectiles = [];
	function spawnCreatureProjectile(creature, damage, color, msg) {
		const mat = new THREE.MeshBasicMaterial({ color });
		const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), mat);
		const light = new THREE.PointLight(color, 2.0, 5);
		mesh.add(light);
		const startPos = creature.group.position.clone().add(new THREE.Vector3(0, 2.2, 0));
		const endPos = player.group.position.clone().add(new THREE.Vector3(0, 1.0, 0));
		mesh.position.copy(startPos);
		scene.add(mesh);
		creatureProjectiles.push({ mesh, startPos, endPos, t: 0, damage });
		log(msg, 'dmgIn');
	}
	function updateFireballs(dt) {
		// ice lances
		for (let i = player.iceLances.length - 1; i >= 0; i--) {
			const fb = player.iceLances[i];
			fb.t += dt / 0.9; // faster than fireball
			if (fb.t >= 1) {
				scene.remove(fb.mesh);
				player.iceLances.splice(i, 1);
				if (fb.target.state !== 'dead') {
					creatureTakeDamage(fb.target, fb.damage);
					floatText('🧊 ' + fb.damage, fb.target.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '#7dd3fc', 1.1);
					spawnSparkBurst(fb.target.group.position.clone(), 0xaaddff, 12, 2.0, 2.5);
					// freeze for 3 turns
					const existingFreeze = player.iceFreeze.find(f => f.creature === fb.target);
					if (existingFreeze) { existingFreeze.turnsLeft = Math.max(existingFreeze.turnsLeft, 3); }
					else { player.iceFreeze.push({ creature: fb.target, turnsLeft: 3 }); }
					log('❄️ Ice Lance: froze ' + fb.target.name + ' for 3 turns!', 'dmgOut');
					applyPassiveOnHit(fb.target);
				}
				continue;
			}
			// flat arc (lances fly straight with slight upward arc)
			const p = fb.startPos.clone().lerp(fb.endPos, fb.t);
			p.y += Math.sin(fb.t * Math.PI) * 1.2;
			fb.mesh.position.copy(p);
			// rotate lance to face direction of travel
			const dir = fb.endPos.clone().sub(fb.startPos).normalize();
			fb.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
		}
		// player fireballs
		for (let i = player.fireballs.length - 1; i >= 0; i--) {
			const fb = player.fireballs[i];
			fb.t += dt / 1.2;
			if (fb.t >= 1) {
				scene.remove(fb.mesh);
				player.fireballs.splice(i, 1);
				if (fb.target.state !== 'dead') {
					creatureTakeDamage(fb.target, fb.damage);
					floatText('🔥 ' + fb.damage, fb.target.group.position.clone().add(new THREE.Vector3(0, 2.2, 0)), '#ff6b35', 1.1);
					// apply burn from Ember Touch
					applyPassiveOnHit(fb.target);
				}
				continue;
			}
			const p = fb.startPos.clone().lerp(fb.endPos, fb.t);
			p.y += Math.sin(fb.t * Math.PI) * 2.5;
			fb.mesh.position.copy(p);
		}
		// dragon fireballs
		for (let i = dragonFireballs.length - 1; i >= 0; i--) {
			const fb = dragonFireballs[i];
			fb.t += dt / 1.6;
			if (fb.t >= 1) {
				scene.remove(fb.mesh);
				dragonFireballs.splice(i, 1);
				if (!player.dead) {
					let dmg = Math.max(1, fb.damage - playerDef());
					const fortRank = talentRank('spirit_fortitude');
					if (fortRank > 0) dmg = Math.max(1, Math.floor(dmg * (1 - [0,0.02,0.04,0.05,0.06,0.08][fortRank])));
					if (player.consumableDmgReduceTimer > 0 && player.consumableDmgReduce) dmg = Math.max(1, Math.floor(dmg * (1 - player.consumableDmgReduce)));
					player.hp -= dmg;
					player.lastHurt = elapsed;
					setBar(player.bar, player.hp / player.maxhp);
					refreshHpUI();
					floatText('🔥 -' + dmg, headPos(), '#ff4400');
					log('The Dragon\'s fireball hits you for ' + dmg + '!', 'dmgIn');
					if (player.hp <= 0) playerDeath();
					else grantXp('def', Math.max(1, dmg * 0.5 * challengeFactor(50)));
				}
				continue;
			}
			const p = fb.startPos.clone().lerp(fb.endPos, fb.t);
			p.y += Math.sin(fb.t * Math.PI) * 3.5;
			fb.mesh.position.copy(p);
		}
		// creature projectiles (Cave Troll, Frost Golem, Lava Titan, etc.)
		for (let i = creatureProjectiles.length - 1; i >= 0; i--) {
			const fb = creatureProjectiles[i];
			fb.t += dt / 1.4;
			if (fb.t >= 1) {
				scene.remove(fb.mesh);
				creatureProjectiles.splice(i, 1);
				if (!player.dead) {
					let dmg = Math.max(1, fb.damage - playerDef());
					const fortRank = talentRank('spirit_fortitude');
					if (fortRank > 0) dmg = Math.max(1, Math.floor(dmg * (1 - [0,0.02,0.04,0.05,0.06,0.08][fortRank])));
					if (player.consumableDmgReduceTimer > 0 && player.consumableDmgReduce) dmg = Math.max(1, Math.floor(dmg * (1 - player.consumableDmgReduce)));
					if (player.aegisAbsorb > 0) {
						const abs = Math.min(player.aegisAbsorb, dmg); player.aegisAbsorb -= abs; dmg -= abs;
						if (player.aegisAbsorb <= 0) { player.aegisAbsorb = 0; player.aegisTimer = 0; log('🔮 Aegis shattered.', 'sys'); }
					}
					if (dmg > 0) {
						player.hp -= dmg;
						player.lastHurt = elapsed;
						setBar(player.bar, player.hp / player.maxhp);
						refreshHpUI();
						floatText('-' + dmg, headPos(), '#c084fc');
						if (player.hp <= 0) playerDeath();
					}
				}
				continue;
			}
			const p = fb.startPos.clone().lerp(fb.endPos, fb.t);
			p.y += Math.sin(fb.t * Math.PI) * 2.8;
			fb.mesh.position.copy(p);
		}
	}

	// ---- Status indicator sprites ----
	const STATUS_CANVAS_W = 256, STATUS_CANVAS_H = 64;
	function getOrCreateStatusSprite(entity, yOff) {
		if (!entity._statusCanvas) {
			const cv = document.createElement('canvas');
			cv.width = STATUS_CANVAS_W; cv.height = STATUS_CANVAS_H;
			const tex = new THREE.CanvasTexture(cv);
			const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
			const sprite = new THREE.Sprite(mat);
			sprite.scale.set(2.4, 0.7, 1);
			scene.add(sprite);
			entity._statusCanvas = cv;
			entity._statusTex = tex;
			entity._statusSprite = sprite;
			entity._statusYOff = yOff;
			entity._statusLast = '';
		}
		return entity._statusSprite;
	}
	function drawStatusIcons(entity, icons) {
		const key = icons.join('');
		if (key === entity._statusLast) return;
		entity._statusLast = key;
		const cv = entity._statusCanvas;
		const ctx = cv.getContext('2d');
		ctx.clearRect(0, 0, STATUS_CANVAS_W, STATUS_CANVAS_H);
		ctx.font = '40px serif';
		const spacing = 44;
		const startX = (STATUS_CANVAS_W - icons.length * spacing) / 2 + 18;
		icons.forEach((ico, i) => ctx.fillText(ico, startX + i * spacing, 50));
		entity._statusTex.needsUpdate = true;
	}
	function updateStatusSprites() {
		// player
		const playerIcons = [];
		if (player.frostWardTimer > 0) playerIcons.push('🛡️');
		if (player.magmaShellTimer > 0) playerIcons.push('🌋');
		if (player.glacialArmorTimer > 0) playerIcons.push('🧊');
		if (player.aegisTimer > 0) playerIcons.push('🔮');
		if (player.spiritWalkTimer > 0) playerIcons.push('👻');
		if (player.flameWallTimer > 0) playerIcons.push('🔥');
		if (player.hotTimer > 0) playerIcons.push('💚');
		if (player.staticAuraTimer > 0) playerIcons.push('🌩️');
		if (player.nextAttackFireBonus > 0) playerIcons.push('🔸');
		if (player.nextAttackLightningBonus > 0) playerIcons.push('⚡');
		if (player.nextAttackIceBonus > 0) playerIcons.push('❄️');
		if (talentRank('spirit_passive') > 0) playerIcons.push('🌿');
		const playerSprite = getOrCreateStatusSprite(player, player._statusYOff || 4.2);
		if (playerIcons.length > 0) {
			drawStatusIcons(player, playerIcons);
			const pp = player.group.position.clone();
			pp.y += player._statusYOff || 4.2;
			playerSprite.position.copy(pp);
			playerSprite.visible = true;
		} else {
			if (player._statusLast !== '') { player._statusLast = ''; player._statusCanvas && (player._statusTex.needsUpdate = true); }
			playerSprite.visible = false;
		}
		// creatures
		for (const c of creatures) {
			if (c.state === 'dead') { if (c._statusSprite) c._statusSprite.visible = false; continue; }
			const icons = [];
			if (player.burnTargets.some(b => b.creature === c)) icons.push('🔥');
			if (player.iceFreeze.some(f => f.creature === c)) icons.push('❄️');
			if (player.lightningStuns.some(s => s.creature === c)) icons.push('⚡');
			const yOff = (c.def && c.def.barY != null ? c.def.barY + 2.05 : 3.5);
			const sprite = getOrCreateStatusSprite(c, yOff);
			if (icons.length > 0) {
				drawStatusIcons(c, icons);
				const cp = c.group.position.clone();
				cp.y += yOff;
				sprite.position.copy(cp);
				sprite.visible = true;
			} else {
				sprite.visible = false;
			}
		}
	}

	animate();
})();
