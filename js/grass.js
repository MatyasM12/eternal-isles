// ================================================================
//  Procedural animated grass — Three.js r128, global scope
//  Instanced blade geometry with bezier curvature, multi-layer
//  wind shader, biome colours, 3 LOD rings, player push.
// ================================================================

// ------------------------------------------------------------------ blade geometry
function _createBladeGeometry(segments, width, height, curvature) {
	const vertCount = (segments + 1) * 2 + 1;
	const positions = new Float32Array(vertCount * 3);
	const uvs       = new Float32Array(vertCount * 2);
	const indices   = [];

	for (let i = 0; i <= segments; i++) {
		const t  = i / segments;
		const bx = 2 * (1 - t) * t * curvature;
		const by = t * height;
		const bw = width * (1 - t * 0.82);
		const vi = i * 2;
		positions[vi * 3]         = bx - bw * 0.5;
		positions[vi * 3 + 1]     = by;
		positions[vi * 3 + 2]     = 0;
		uvs[vi * 2]               = 0;  uvs[vi * 2 + 1]     = t;
		positions[(vi+1) * 3]     = bx + bw * 0.5;
		positions[(vi+1) * 3 + 1] = by;
		positions[(vi+1) * 3 + 2] = 0;
		uvs[(vi+1) * 2]           = 1;  uvs[(vi+1) * 2 + 1] = t;
	}
	const tipIdx = (segments + 1) * 2;
	positions[tipIdx * 3]     = curvature * 0.5;
	positions[tipIdx * 3 + 1] = height;
	positions[tipIdx * 3 + 2] = 0;
	uvs[tipIdx * 2] = 0.5; uvs[tipIdx * 2 + 1] = 1.0;

	for (let i = 0; i < segments; i++) {
		const a = i*2, b = i*2+1, c = (i+1)*2, d = (i+1)*2+1;
		indices.push(a, b, c,  b, d, c);
	}
	indices.push(segments*2, segments*2+1, tipIdx);

	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	geo.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
	geo.setIndex(indices);
	geo.computeVertexNormals();
	return geo;
}

// ------------------------------------------------------------------ shaders
const GRASS_VERT = `
precision highp float;

attribute vec4 aPositionRotation; // xyz = world pos, w = rotation
attribute vec4 aScaleVariation;   // x=scaleX, y=scaleY, z=tilt, w=colorVar

uniform float windTime;
uniform vec2  windDir;
uniform float windBase;
uniform float windGust;
uniform float windGustFreq;
uniform vec3  pushPos0;
uniform vec3  pushPos1;
uniform vec3  pushPos2;
uniform vec3  pushPos3;
uniform float pushRad0;
uniform float pushRad1;
uniform float pushRad2;
uniform float pushRad3;

varying vec2  vUv;
varying float vColorVar;
varying float vAo;

// fast hash for per-blade variation
float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// 2-D value noise
float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f*f*(3.0-2.0*f);
	float a = hash2(i);
	float b = hash2(i + vec2(1,0));
	float c = hash2(i + vec2(0,1));
	float d = hash2(i + vec2(1,1));
	return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}

void main() {
	vUv       = uv;
	vColorVar = aScaleVariation.w;

	float rot  = aPositionRotation.w;
	float sx   = aScaleVariation.x;
	float sy   = aScaleVariation.y;
	float tilt = aScaleVariation.z;

	// scale blade
	vec3 lp = position;
	lp.x *= sx;
	lp.y *= sy;

	float t   = uv.y;            // 0 at root, 1 at tip
	float tSq = t * t;           // displacement quadratic with height
	vAo = 1.0 - (1.0 - t) * 0.65; // roots are darker

	// tilt
	lp.x += tilt * t * 0.4;

	// rotate blade around Y by per-instance angle
	float cosR = cos(rot), sinR = sin(rot);
	vec3 rotated;
	rotated.x = lp.x * cosR - lp.z * sinR;
	rotated.y = lp.y;
	rotated.z = lp.x * sinR + lp.z * cosR;

	// world root position
	vec3 wp = aPositionRotation.xyz + rotated;

	// --- wind ---
	float phaseOffset = hash(aPositionRotation.x * 3.1 + aPositionRotation.z * 7.9);

	// Layer 1: global sway (low freq)
	float sway = sin(windTime * 1.1 + phaseOffset * 6.28) * windBase;
	// Layer 2: gust wave rolling across field
	float gustWave = noise2(vec2(aPositionRotation.x, aPositionRotation.z) * windGustFreq + windTime * 0.6);
	float gust = (gustWave * 2.0 - 1.0) * windGust;
	// Layer 3: high-freq turbulence per blade
	float flutter = sin(windTime * 4.8 + phaseOffset * 12.56) * 0.06 * windBase;

	float totalWind = (sway + gust + flutter) * tSq; // tSq = roots fixed, tips flex
	wp.x += windDir.x * totalWind;
	wp.z += windDir.y * totalWind;

	// --- interactive push (up to 4 pushers) ---
	float push = 0.0;
	vec2 pushDir = vec2(0.0);

	vec2 d0 = wp.xz - pushPos0.xz;
	float len0 = length(d0);
	if (pushRad0 > 0.0 && len0 < pushRad0) push += (1.0 - len0/pushRad0) * 1.8, pushDir += normalize(d0 + 0.001);

	vec2 d1 = wp.xz - pushPos1.xz;
	float len1 = length(d1);
	if (pushRad1 > 0.0 && len1 < pushRad1) push += (1.0 - len1/pushRad1) * 1.8, pushDir += normalize(d1 + 0.001);

	vec2 d2 = wp.xz - pushPos2.xz;
	float len2 = length(d2);
	if (pushRad2 > 0.0 && len2 < pushRad2) push += (1.0 - len2/pushRad2) * 1.8, pushDir += normalize(d2 + 0.001);

	vec2 d3 = wp.xz - pushPos3.xz;
	float len3 = length(d3);
	if (pushRad3 > 0.0 && len3 < pushRad3) push += (1.0 - len3/pushRad3) * 1.8, pushDir += normalize(d3 + 0.001);

	if (push > 0.0) {
		vec2 pd = normalize(pushDir) * clamp(push, 0.0, 2.0) * tSq;
		wp.x += pd.x;
		wp.z += pd.y;
	}

	gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
}
`;

const GRASS_FRAG = `
precision mediump float;

uniform vec3  baseColor;
uniform vec3  tipColor;
uniform vec3  sunDir;
uniform vec3  sunColor;
uniform vec3  ambientColor;
uniform float sssStrength;
uniform float fadeStart;
uniform float fadeEnd;
uniform vec3  cameraPos;

varying vec2  vUv;
varying float vColorVar;
varying float vAo;

void main() {
	// height gradient base→tip + per-blade colour variation
	vec3 col = mix(baseColor, tipColor, vUv.y);
	// slight golden warm variation per blade
	col = mix(col, col * vec3(1.12, 1.05, 0.82), vColorVar * 0.18);

	// root AO darkening
	col *= vAo;

	// simple hemisphere lighting
	float NdotL = clamp(dot(normalize(sunDir), vec3(0,1,0)), 0.0, 1.0) * 0.6 + 0.4;
	col *= sunColor * NdotL + ambientColor * 0.3;

	// subsurface scattering approximation — back-lit blades glow
	float sss = clamp(1.0 - vUv.y * 0.7, 0.0, 1.0) * sssStrength;
	col += baseColor * sss * 0.35;

	// edge alpha — thin tips fade out so blades look tapered
	float edgeFade = min(vUv.x * 6.0, (1.0 - vUv.x) * 6.0);
	float alpha = clamp(edgeFade, 0.0, 1.0);

	gl_FragColor = vec4(col, alpha);
}
`;

// ------------------------------------------------------------------ biome colour palettes
const _GRASS_BIOME = {
	temperate: { base: new THREE.Color(0x3a7d2c), tip: new THREE.Color(0x8bbf40) },
	volcanic:  { base: new THREE.Color(0x5c3c22), tip: new THREE.Color(0x8a6040) },
	frost:     { base: new THREE.Color(0x7899a8), tip: new THREE.Color(0xc8dde8) },
	arcane:    { base: new THREE.Color(0x4a2d70), tip: new THREE.Color(0x9060d0) },
};

// ------------------------------------------------------------------ material factory
function _createGrassMaterial(biome) {
	const pal = _GRASS_BIOME[biome] || _GRASS_BIOME.temperate;
	return new THREE.ShaderMaterial({
		uniforms: {
			baseColor:    { value: pal.base.clone() },
			tipColor:     { value: pal.tip.clone() },
			sunDir:       { value: new THREE.Vector3(0.45, 0.85, 0.25).normalize() },
			sunColor:     { value: new THREE.Color(0xfff4dd) },
			ambientColor: { value: new THREE.Color(0x446688) },
			sssStrength:  { value: 0.55 },
			fadeStart:    { value: 55 },
			fadeEnd:      { value: 80 },
			cameraPos:    { value: new THREE.Vector3() },
			windTime:     { value: 0 },
			windDir:      { value: new THREE.Vector2(1, 0.35).normalize() },
			windBase:     { value: 0.38 },
			windGust:     { value: 0.72 },
			windGustFreq: { value: 0.04 },
			pushPos0:     { value: new THREE.Vector3() },
			pushPos1:     { value: new THREE.Vector3() },
			pushPos2:     { value: new THREE.Vector3() },
			pushPos3:     { value: new THREE.Vector3() },
			pushRad0:     { value: 0 },
			pushRad1:     { value: 0 },
			pushRad2:     { value: 0 },
			pushRad3:     { value: 0 },
		},
		vertexShader:   GRASS_VERT,
		fragmentShader: GRASS_FRAG,
		side:           THREE.DoubleSide,
		transparent:    true,
		depthWrite:     false,
		alphaTest:      0.08,
	});
}

// ------------------------------------------------------------------ patch noise (JS-side, for placement masking)
function _patchNoise(x, z, freq) {
	const ix = Math.floor(x * freq), iz = Math.floor(z * freq);
	const fx = x * freq - ix,       fz = z * freq - iz;
	const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
	function h(a, b) {
		let n = (a * 1619 + b * 31337) ^ (a * 31337 + b * 1619);
		n = (n ^ (n >>> 16)) * 0x45d9f3b;
		n = (n ^ (n >>> 16)) * 0x45d9f3b;
		return ((n ^ (n >>> 16)) >>> 0) / 0xffffffff;
	}
	return (
		h(ix,   iz)   * (1-ux) * (1-uz) +
		h(ix+1, iz)   *    ux  * (1-uz) +
		h(ix,   iz+1) * (1-ux) *    uz  +
		h(ix+1, iz+1) *    ux  *    uz
	);
}

// ------------------------------------------------------------------ placement
function _placeGrass(isle, density, minH, maxSlopeAngle) {
	const halfW = isle.r * (isle.elongX || 1) * 1.05;
	const halfD = isle.r * (isle.elongZ || 1) * 1.05;
	const gridStep = 1 / Math.sqrt(density);
	const instances = [];

	// simple seeded rng tied to isle position so placement is deterministic
	let _s = Math.round(Math.abs(isle.x * 7 + isle.z * 13)) | 0;
	function _r() { _s = (_s * 1664525 + 1013904223) & 0xffffffff; return (_s >>> 0) / 0xffffffff; }

	// patch noise frequency: ~15-unit blobs give natural clearing/meadow variation
	const PATCH_FREQ  = 0.068;
	const PATCH_FREQ2 = 0.034; // second octave for larger structure
	const PATCH_THRESH = 0.44; // ~45% of island is grass patches

	for (let gx = -halfW; gx < halfW; gx += gridStep) {
		for (let gz = -halfD; gz < halfD; gz += gridStep) {
			const wx = isle.x + gx + (_r() - 0.5) * gridStep;
			const wz = isle.z + gz + (_r() - 0.5) * gridStep;

			const h = terrainHeight(wx, wz);
			if (h < minH) continue;

			// patch mask — two octaves of value noise create organic blobs
			const patch = _patchNoise(wx, wz, PATCH_FREQ) * 0.65
			            + _patchNoise(wx, wz, PATCH_FREQ2) * 0.35;
			if (patch < PATCH_THRESH) continue;

			// slope rejection via finite difference
			const eps = gridStep * 0.6;
			const hx  = terrainHeight(wx + eps, wz);
			const hz  = terrainHeight(wx, wz + eps);
			const slope = Math.atan(Math.sqrt((hx - h) ** 2 + (hz - h) ** 2) / eps);
			if (slope > maxSlopeAngle) continue;

			// density fade near isle edge
			const dx = (wx - isle.x) / (isle.r * (isle.elongX || 1));
			const dz = (wz - isle.z) / (isle.r * (isle.elongZ || 1));
			const edgeDist = 1 - Math.sqrt(dx * dx + dz * dz);
			if (edgeDist < 0.05) continue;
			if (_r() > Math.min(1, edgeDist * 2)) continue;

			instances.push({
				x: wx, y: h, z: wz,
				rotation:  _r() * Math.PI * 2,
				scaleX:    0.72 + _r() * 0.56,
				scaleY:    0.6  + _r() * 0.85,
				tilt:      (_r() - 0.5) * 0.28,
				colorVar:  _r(),
			});
		}
	}
	return instances;
}

// ------------------------------------------------------------------ build InstancedMesh
function _buildGrassMesh(instances, bladeGeo, material, maxCount) {
	const count = Math.min(instances.length, maxCount);
	const geo   = bladeGeo.clone();
	const posRot  = new Float32Array(count * 4);
	const scaleVar = new Float32Array(count * 4);

	for (let i = 0; i < count; i++) {
		const inst = instances[i];
		posRot[i*4]   = inst.x;
		posRot[i*4+1] = inst.y;
		posRot[i*4+2] = inst.z;
		posRot[i*4+3] = inst.rotation;
		scaleVar[i*4]   = inst.scaleX;
		scaleVar[i*4+1] = inst.scaleY;
		scaleVar[i*4+2] = inst.tilt;
		scaleVar[i*4+3] = inst.colorVar;
	}

	geo.setAttribute('aPositionRotation', new THREE.InstancedBufferAttribute(posRot,  4));
	geo.setAttribute('aScaleVariation',   new THREE.InstancedBufferAttribute(scaleVar, 4));

	const mesh = new THREE.InstancedMesh(geo, material, count);
	mesh.frustumCulled = false;
	mesh.matrixAutoUpdate = false;
	return mesh;
}

// ================================================================
//  PUBLIC API — called by game.js
// ================================================================

// LOD ring definitions: { radiusFraction (of isle.r), density, segments, heightScale, widthScale }
const _LOD_RINGS = [
	{ radiusFraction: 0.55, density: 26, segments: 5, hs: 1.0,  ws: 1.0  },  // near  — full blades
	{ radiusFraction: 0.85, density: 10, segments: 3, hs: 0.88, ws: 0.85 },  // mid   — fewer, simpler
	{ radiusFraction: 1.05, density: 4,  segments: 2, hs: 0.7,  ws: 0.7  },  // outer — sparse, cheapest
];

/**
 * GrassSystem — manages all grass meshes for all islands.
 * Must be constructed after terrainHeight() is available.
 *
 * @param {THREE.Scene} scene
 * @param {Array}       isles   — the ISLES array from game.js
 */
function GrassSystem(scene, isles) {
	this._scene    = scene;
	this._meshes   = [];       // all InstancedMesh objects
	this._mats     = [];       // all ShaderMaterials
	this._windTime = 0;

	const WATER_MARGIN = 0.55; // don't place below this terrain height
	const MAX_SLOPE    = 0.52; // radians (~30°)

	for (const isle of isles) {
		const biome   = isle.biome || 'temperate';
		const baseMat = _createGrassMaterial(biome);
		this._mats.push(baseMat);

		// Build each LOD ring with its own geometry (different segment count)
		for (let ri = 0; ri < _LOD_RINGS.length; ri++) {
			const ring = _LOD_RINGS[ri];
			const mat  = ri === 0 ? baseMat : baseMat.clone(); // share first, clone rest for fade tweak
			if (ri > 0) this._mats.push(mat);

			// Adjust fade distances so far ring fades at correct distance
			mat.uniforms.fadeStart.value = 50 + ri * 18;
			mat.uniforms.fadeEnd.value   = 75 + ri * 18;

			// Geometry
			const width    = 0.065 * ring.ws;
			const height   = 1.05 * ring.hs;
			const curvature = 0.28;
			const bladeGeo  = _createBladeGeometry(ring.segments, width, height, curvature);

			// Place instances in the ring annulus around the isle
			const prevFrac = ri === 0 ? 0 : _LOD_RINGS[ri-1].radiusFraction;
			const currFrac = ring.radiusFraction;

			// We place in the full disc up to currFrac but skip inner area placed by previous ring
			// Simple approach: place full disc, deduplicate later is expensive —
			// instead expand gridStep for outer rings naturally (lower density handles it)
			const instances = _placeGrass(
				Object.assign({}, isle, {
					r: isle.r * currFrac,
				}),
				ring.density,
				WATER_MARGIN,
				MAX_SLOPE
			);

			if (instances.length === 0) continue;

			// Remove instances that fall inside the previous (closer) ring's coverage
			const innerR2 = ri === 0 ? 0 : (isle.r * prevFrac) ** 2;
			const filtered = ri === 0 ? instances : instances.filter(inst => {
				const dx = inst.x - isle.x, dz = inst.z - isle.z;
				return (dx*dx + dz*dz) >= innerR2;
			});

			if (filtered.length === 0) continue;

			const mesh = _buildGrassMesh(filtered, bladeGeo, mat, 120000);
			scene.add(mesh);
			this._meshes.push(mesh);
		}
	}
}

/**
 * update — call every frame from animate()
 * @param {number}        dt     — delta time in seconds
 * @param {number}        elapsed — total elapsed time
 * @param {THREE.Vector3} playerPos
 * @param {THREE.Vector3} cameraPos
 */
GrassSystem.prototype.update = function(dt, elapsed, playerPos, cameraPos) {
	this._windTime += dt;
	const wt = this._windTime;

	for (const mat of this._mats) {
		const u = mat.uniforms;
		u.windTime.value = wt;
		u.cameraPos.value.copy(cameraPos);

		// player push
		u.pushPos0.value.copy(playerPos);
		u.pushRad0.value = 1.8;
		// slots 1-3 unused for now (other players / creatures could go here)
		u.pushRad1.value = 0;
		u.pushRad2.value = 0;
		u.pushRad3.value = 0;
	}
};

/**
 * dispose — remove all meshes and free GPU memory
 */
GrassSystem.prototype.dispose = function() {
	for (const mesh of this._meshes) {
		this._scene.remove(mesh);
		mesh.geometry.dispose();
	}
	for (const mat of this._mats) mat.dispose();
	this._meshes = [];
	this._mats   = [];
};
