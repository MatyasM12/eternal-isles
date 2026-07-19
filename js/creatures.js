'use strict';

// ------------------------------------------------------------------ creatures
const CREATURE_DEFS = {
    Rabbit: {
        count: 10, hp: 35, dmg: 3, speed: 2.6, hopper: true, aggro: 0, barW: 0.9, barY: 0.95, hitY: 0.6, level: 1, xp: 14, tiers: [0],
        drops: [{item: 'Rabbit Fur', p: 1}, {item: 'Raw Meat', p: 0.55}, {item: 'Bones', p: 0.45}],
        build() {
            const g = new THREE.Group();
            const fur = new THREE.MeshStandardMaterial({color: 0xf3f3f0, flatShading: true, roughness: 0.9});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), fur);
            body.scale.set(1, 0.9, 1.3);
            body.position.y = 0.3;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), fur);
            head.position.set(0, 0.52, 0.3);
            head.castShadow = true;
            g.add(head);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.32, 0.05), fur);
                ear.position.set(0.08 * s, 0.78, 0.26);
                ear.rotation.x = -0.25;
                ear.rotation.z = 0.12 * s;
                ear.castShadow = true;
                g.add(ear);
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 6),
                    new THREE.MeshStandardMaterial({color: 0x1a1a1a, roughness: 0.4}));
                eye.position.set(0.09 * s, 0.56, 0.44);
                g.add(eye);
            }
            const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), fur);
            tail.position.set(0, 0.32, -0.36);
            g.add(tail);
            return g;
        },
    },
    Beaver: {
        count: 5, hp: 60, dmg: 4, speed: 2.0, hopper: false, aggro: 0, barW: 1.0, barY: 1.0, hitY: 0.55, nearWater: true, level: 3, xp: 26, tiers: [0],
        drops: [{item: 'Beaver Fur', p: 1}, {item: 'Raw Meat', p: 0.6}, {item: 'Bones', p: 0.4}],
        build() {
            const g = new THREE.Group();
            const fur = new THREE.MeshStandardMaterial({color: 0x8a5a33, flatShading: true, roughness: 0.95});
            const dark = new THREE.MeshStandardMaterial({color: 0x5c3a1f, flatShading: true, roughness: 0.95});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), fur);
            body.scale.set(1.05, 0.85, 1.35);
            body.position.y = 0.3;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), fur);
            head.position.set(0, 0.48, 0.36);
            head.castShadow = true;
            g.add(head);
            const teeth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.04),
                new THREE.MeshStandardMaterial({color: 0xfff4cf, roughness: 0.5}));
            teeth.position.set(0, 0.38, 0.55);
            g.add(teeth);
            const tail = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.5), dark);
            tail.position.set(0, 0.18, -0.55);
            tail.castShadow = true;
            g.add(tail);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), dark);
                ear.position.set(0.12 * s, 0.64, 0.3);
                g.add(ear);
            }
            return g;
        },
    },
    Deer: {
        count: 6, hp: 79, dmg: 6, speed: 3.4, hopper: false, aggro: 0, barW: 1.2, barY: 1.7, hitY: 1.1, level: 5, xp: 38, tiers: [1, 2],
        drops: [{item: 'Deer Fur', p: 1}, {item: 'Deer Antlers', p: 0.7}, {item: 'Bones', p: 0.6}],
        build() {
            const g = new THREE.Group();
            const fur = new THREE.MeshStandardMaterial({color: 0xb08a5a, flatShading: true, roughness: 0.95});
            const antler = new THREE.MeshStandardMaterial({color: 0xe8dcc0, flatShading: true, roughness: 0.7});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), fur);
            body.scale.set(0.9, 0.85, 1.5);
            body.position.y = 0.85;
            body.castShadow = true;
            g.add(body);
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.5, 6), fur);
            neck.position.set(0, 1.2, 0.42);
            neck.rotation.x = 0.5;
            g.add(neck);
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.36), fur);
            head.position.set(0, 1.42, 0.6);
            head.castShadow = true;
            g.add(head);
            for (const s of [-1, 1]) {
                const a1 = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.36, 5), antler);
                a1.position.set(0.1 * s, 1.66, 0.52);
                a1.rotation.z = -0.45 * s;
                g.add(a1);
                const a2 = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.2, 5), antler);
                a2.position.set(0.18 * s, 1.7, 0.56);
                a2.rotation.z = -0.95 * s;
                g.add(a2);
                for (const f of [0.32, -0.38]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.85, 6), fur);
                    leg.position.set(0.16 * s, 0.42, f);
                    leg.castShadow = true;
                    g.add(leg);
                }
            }
            const tail = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), fur);
            tail.position.set(0, 0.95, -0.55);
            g.add(tail);
            return g;
        },
    },
    Wolf: {
        count: 6, hp: 112, dmg: 9, speed: 4.0, hopper: false, aggro: 5.2, barW: 1.2, barY: 1.35, hitY: 0.8, level: 8, xp: 60, tiers: [1, 2],
        drops: [{item: 'Wolf Fur', p: 1}, {item: 'Raw Meat', p: 0.7}, {item: 'Bones', p: 0.6}],
        build() {
            const g = new THREE.Group();
            const fur = new THREE.MeshStandardMaterial({color: 0x7d8087, flatShading: true, roughness: 0.95});
            const dark = new THREE.MeshStandardMaterial({color: 0x53565c, flatShading: true, roughness: 0.95});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), fur);
            body.scale.set(0.95, 0.85, 1.6);
            body.position.y = 0.62;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), fur);
            head.position.set(0, 0.86, 0.55);
            head.castShadow = true;
            g.add(head);
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.26), dark);
            snout.position.set(0, 0.8, 0.78);
            g.add(snout);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), dark);
                ear.position.set(0.11 * s, 1.05, 0.5);
                g.add(ear);
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6),
                    new THREE.MeshStandardMaterial({color: 0x300000, emissive: 0xff2222, emissiveIntensity: 1.4}));
                eye.position.set(0.1 * s, 0.9, 0.72);
                g.add(eye);
                for (const f of [0.35, -0.4]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.62, 6), fur);
                    leg.position.set(0.17 * s, 0.31, f);
                    leg.castShadow = true;
                    g.add(leg);
                }
            }
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 5), dark);
            tail.position.set(0, 0.72, -0.72);
            tail.rotation.x = 1.9;
            g.add(tail);
            return g;
        },
    },
    Fox: {
        count: 7, hp: 49, dmg: 4, speed: 4.2, hopper: false, aggro: 0, barW: 1.0, barY: 1.05, hitY: 0.55, level: 2, xp: 22, tiers: [0],
        drops: [{item: 'Fox Pelt', p: 1}, {item: 'Raw Meat', p: 0.5}, {item: 'Bones', p: 0.4}],
        build() {
            const g = new THREE.Group();
            const fur = new THREE.MeshStandardMaterial({color: 0xd06a2c, flatShading: true, roughness: 0.9});
            const white = new THREE.MeshStandardMaterial({color: 0xf3eae0, flatShading: true, roughness: 0.9});
            const dark = new THREE.MeshStandardMaterial({color: 0x2b2320, flatShading: true, roughness: 0.9});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), fur);
            body.scale.set(0.9, 0.8, 1.5);
            body.position.y = 0.4;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), fur);
            head.position.set(0, 0.55, 0.34);
            head.castShadow = true;
            g.add(head);
            const snout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 5), white);
            snout.position.set(0, 0.5, 0.52);
            snout.rotation.x = Math.PI / 2;
            g.add(snout);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), dark);
                ear.position.set(0.09 * s, 0.72, 0.3);
                g.add(ear);
                for (const f of [0.3, -0.3]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.4, 6), dark);
                    leg.position.set(0.13 * s, 0.2, f);
                    leg.castShadow = true;
                    g.add(leg);
                }
            }
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 6), fur);
            tail.position.set(0, 0.45, -0.6);
            tail.rotation.x = 1.7;
            g.add(tail);
            const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), white);
            tailTip.position.set(0, 0.5, -0.82);
            g.add(tailTip);
            return g;
        },
    },
    Boar: {
        count: 6, hp: 98, dmg: 7, speed: 3.2, hopper: false, aggro: 4.0, barW: 1.2, barY: 1.25, hitY: 0.7, level: 6, xp: 46, tiers: [1, 2],
        drops: [{item: 'Boar Tusk', p: 0.8}, {item: 'Raw Meat', p: 0.75}, {item: 'Bones', p: 0.6}],
        build() {
            const g = new THREE.Group();
            const hide = new THREE.MeshStandardMaterial({color: 0x4a3b30, flatShading: true, roughness: 0.95});
            const dark = new THREE.MeshStandardMaterial({color: 0x322822, flatShading: true, roughness: 0.95});
            const tusk = new THREE.MeshStandardMaterial({color: 0xece4d0, flatShading: true, roughness: 0.5});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), hide);
            body.scale.set(0.95, 0.85, 1.45);
            body.position.y = 0.6;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), hide);
            head.scale.set(0.9, 0.85, 1.05);
            head.position.set(0, 0.62, 0.52);
            head.castShadow = true;
            g.add(head);
            const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.18, 8), dark);
            snout.position.set(0, 0.55, 0.78);
            snout.rotation.x = Math.PI / 2;
            g.add(snout);
            for (const s of [-1, 1]) {
                const t = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.24, 5), tusk);
                t.position.set(0.1 * s, 0.5, 0.75);
                t.rotation.set(-0.5, 0, 0.3 * s);
                g.add(t);
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 4), dark);
                ear.position.set(0.16 * s, 0.82, 0.42);
                g.add(ear);
                for (const f of [0.34, -0.34]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.5, 6), dark);
                    leg.position.set(0.2 * s, 0.25, f);
                    leg.castShadow = true;
                    g.add(leg);
                }
            }
// bristled back
            for (let i = 0; i < 5; i++) {
                const br = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), dark);
                br.position.set(0, 0.98, 0.3 - i * 0.16);
                g.add(br);
            }
            return g;
        },
    },
    Bear: {
        count: 5, hp: 172, dmg: 13, speed: 3.6, hopper: false, aggro: 5.5, barW: 1.4, barY: 1.7, hitY: 1.0, level: 11, xp: 95, tiers: [2],
        drops: [{item: 'Bear Pelt', p: 1}, {item: 'Bear Claw', p: 0.7}, {item: 'Raw Meat', p: 0.8}, {item: 'Bones', p: 0.7}],
        build() {
            const g = new THREE.Group();
            const fur = new THREE.MeshStandardMaterial({color: 0x5b4632, flatShading: true, roughness: 0.98});
            const dark = new THREE.MeshStandardMaterial({color: 0x2f2419, flatShading: true, roughness: 0.98});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), fur);
            body.scale.set(1, 0.95, 1.4);
            body.position.y = 0.85;
            body.castShadow = true;
            g.add(body);
            const hump = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), fur);
            hump.position.set(0, 1.25, 0.15);
            hump.castShadow = true;
            g.add(hump);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), fur);
            head.position.set(0, 1.0, 0.7);
            head.castShadow = true;
            g.add(head);
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.24), dark);
            snout.position.set(0, 0.94, 0.95);
            g.add(snout);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), fur);
                ear.position.set(0.2 * s, 1.28, 0.62);
                g.add(ear);
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6),
                    new THREE.MeshStandardMaterial({color: 0x160b06}));
                eye.position.set(0.13 * s, 1.06, 0.94);
                g.add(eye);
                for (const f of [0.42, -0.42]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.6, 7), fur);
                    leg.position.set(0.28 * s, 0.35, f);
                    leg.castShadow = true;
                    g.add(leg);
                    const paw = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), dark);
                    paw.position.set(0.28 * s, 0.08, f + 0.05);
                    g.add(paw);
                }
            }
            return g;
        },
    },
    Direwolf: {
        count: 5, hp: 271, dmg: 17, speed: 4.6, hopper: false, aggro: 6.5, barW: 1.5, barY: 1.6, hitY: 0.9, level: 13, xp: 140, tiers: [2, 3],
        drops: [{item: 'Dire Pelt', p: 1}, {item: 'Wolf Fur', p: 0.7}, {item: 'Raw Meat', p: 0.7}, {item: 'Bones', p: 0.6}],
        build() {
            const g = new THREE.Group();
            const fur = new THREE.MeshStandardMaterial({color: 0x40444c, flatShading: true, roughness: 0.95});
            const dark = new THREE.MeshStandardMaterial({color: 0x24272c, flatShading: true, roughness: 0.95});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), fur);
            body.scale.set(1, 0.9, 1.7);
            body.position.y = 0.82;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), fur);
            head.position.set(0, 1.12, 0.72);
            head.castShadow = true;
            g.add(head);
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.34), dark);
            snout.position.set(0, 1.04, 1.0);
            g.add(snout);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 4), dark);
                ear.position.set(0.14 * s, 1.4, 0.66);
                g.add(ear);
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), new THREE.MeshStandardMaterial({color: 0x330000, emissive: 0xffcc00, emissiveIntensity: 1.6}));
                eye.position.set(0.12 * s, 1.16, 0.92);
                g.add(eye);
                for (const f of [0.5, -0.5]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.82, 6), fur);
                    leg.position.set(0.22 * s, 0.4, f);
                    leg.castShadow = true;
                    g.add(leg);
                }
            }
// spiky mane
            for (let i = 0; i < 6; i++) {
                const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 4), dark);
                sp.position.set(0, 1.28, 0.4 - i * 0.16);
                g.add(sp);
            }
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), dark);
            tail.position.set(0, 0.95, -0.95);
            tail.rotation.x = 1.9;
            g.add(tail);
            return g;
        },
    },
    'Giant Spider': {
        count: 6, hp: 350, dmg: 21, speed: 4.0, hopper: false, aggro: 6.0, barW: 1.6, barY: 1.2, hitY: 0.6, level: 15, xp: 175, tiers: [3, 4],
        drops: [{item: 'Spider Silk', p: 1}, {item: 'Venom Gland', p: 0.75}, {item: 'Bones', p: 0.5}],
        build() {
            const g = new THREE.Group();
            const chit = new THREE.MeshStandardMaterial({color: 0x2a2030, flatShading: true, roughness: 0.7, metalness: 0.2});
            const mark = new THREE.MeshStandardMaterial({color: 0x7a1030, emissive: 0x3a0010, emissiveIntensity: 0.5, flatShading: true});
            const abd = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), chit);
            abd.scale.set(1, 0.85, 1.15);
            abd.position.set(0, 0.6, -0.35);
            abd.castShadow = true;
            g.add(abd);
            const mk = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), mark);
            mk.scale.set(1, 0.4, 1);
            mk.position.set(0, 0.85, -0.35);
            g.add(mk);
            const ceph = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), chit);
            ceph.position.set(0, 0.55, 0.35);
            ceph.castShadow = true;
            g.add(ceph);
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshStandardMaterial({color: 0x110000, emissive: 0xff3020, emissiveIntensity: 1.4}));
                eye.position.set(0.1 * s, 0.62, 0.62);
                g.add(eye);
                const fang = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 4), chit);
                fang.position.set(0.06 * s, 0.42, 0.6);
                fang.rotation.x = Math.PI;
                g.add(fang);
// 4 legs each side
                for (let i = 0; i < 4; i++) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.02, 1.0, 5), chit);
                    const ang = (-0.5 + i * 0.34);
                    leg.position.set(0.35 * s, 0.5, 0.35 - i * 0.28);
                    leg.rotation.z = (0.9 + i * 0.05) * s;
                    leg.rotation.x = ang * 0.4;
                    leg.castShadow = true;
                    g.add(leg);
                }
            }
            return g;
        },
    },
    'Cave Troll': {
        count: 5, hp: 543, dmg: 28, speed: 2.8, hopper: false, aggro: 6.0, barW: 1.9, barY: 2.5, hitY: 1.4, level: 18, xp: 240, tiers: [3, 4],
        drops: [{item: 'Troll Hide', p: 1}, {item: 'Bones', p: 0.8}, {item: 'Bear Claw', p: 0.5}, {item: 'Raw Meat', p: 0.7}],
        build() {
            const g = new THREE.Group();
            const skin = new THREE.MeshStandardMaterial({color: 0x5f7047, flatShading: true, roughness: 0.95});
            const dark = new THREE.MeshStandardMaterial({color: 0x3f4a30, flatShading: true, roughness: 0.95});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), skin);
            body.scale.set(1, 1.3, 0.9);
            body.position.y = 1.5;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), skin);
            head.position.set(0, 2.35, 0.1);
            head.castShadow = true;
            g.add(head);
            const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.3), dark);
            jaw.position.set(0, 2.18, 0.28);
            g.add(jaw);
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshStandardMaterial({color: 0x220000, emissive: 0xffaa00, emissiveIntensity: 1.2}));
                eye.position.set(0.14 * s, 2.42, 0.34);
                g.add(eye);
                const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 5), new THREE.MeshStandardMaterial({color: 0xdccfae, flatShading: true}));
                tusk.position.set(0.12 * s, 2.12, 0.4);
                g.add(tusk);
// massive arms
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 8), skin);
                arm.position.set(0.75 * s, 1.4, 0);
                arm.rotation.z = 0.25 * s;
                arm.castShadow = true;
                g.add(arm);
                const fist = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), dark);
                fist.position.set(0.9 * s, 0.85, 0);
                g.add(fist);
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.9, 8), dark);
                leg.position.set(0.3 * s, 0.5, 0);
                leg.castShadow = true;
                g.add(leg);
            }
            return g;
        },
    },
    Wyvern: {
        count: 4, hp: 735, dmg: 37, speed: 4.4, hopper: false, aggro: 7.5, barW: 2.1, barY: 2.2, hitY: 1.2, level: 22, xp: 330, tiers: [4],
        drops: [{item: 'Wyvern Scale', p: 1}, {item: 'Bones', p: 0.8}, {item: 'Raw Meat', p: 0.8}],
        build() {
            const g = new THREE.Group();
            const scale = new THREE.MeshStandardMaterial({color: 0xa53f2c, flatShading: true, roughness: 0.6, metalness: 0.2});
            const belly = new THREE.MeshStandardMaterial({color: 0xd8a24a, flatShading: true, roughness: 0.7});
            const wingM = new THREE.MeshStandardMaterial({color: 0x7a2a1e, flatShading: true, roughness: 0.8, side: THREE.DoubleSide});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), scale);
            body.scale.set(1, 0.9, 1.7);
            body.position.y = 1.3;
            body.castShadow = true;
            g.add(body);
            const chest = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), belly);
            chest.scale.set(0.9, 0.8, 1);
            chest.position.set(0, 1.15, 0.55);
            g.add(chest);
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 8), scale);
            neck.position.set(0, 1.7, 0.7);
            neck.rotation.x = 0.7;
            g.add(neck);
            const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 6), scale);
            head.position.set(0, 2.05, 1.05);
            head.rotation.x = 1.6;
            head.castShadow = true;
            g.add(head);
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), new THREE.MeshStandardMaterial({color: 0x220000, emissive: 0xffe030, emissiveIntensity: 1.6}));
                eye.position.set(0.1 * s, 2.1, 1.0);
                g.add(eye);
// wings
                const wing = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9, 2, 2), wingM);
                wing.position.set(1.0 * s, 1.6, -0.2);
                wing.rotation.set(0.2, 0.5 * s, 0.5 * s);
                g.add(wing);
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.7, 6), scale);
                leg.position.set(0.3 * s, 0.7, 0.2);
                leg.castShadow = true;
                g.add(leg);
            }
            const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.4, 6), scale);
            tail.position.set(0, 1.2, -1.2);
            tail.rotation.x = 1.4;
            g.add(tail);
            const barb = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.4, 5), belly);
            barb.position.set(0, 1.2, -1.9);
            barb.rotation.x = -1.4;
            g.add(barb);
            return g;
        },
    },
    'Frost Golem': {
        count: 4, hp: 1033, dmg: 48, speed: 2.4, hopper: false, aggro: 7.0, barW: 2.3, barY: 2.9, hitY: 1.6, level: 26, xp: 460, tiers: [4],
        drops: [{item: 'Golem Core', p: 1}, {item: 'Silver Ore', p: 0.7}, {item: 'Bones', p: 0.6}],
        build() {
            const g = new THREE.Group();
            const ice = new THREE.MeshStandardMaterial({color: 0x9fc7e8, flatShading: true, roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.95});
            const deep = new THREE.MeshStandardMaterial({color: 0x5f8fc0, flatShading: true, roughness: 0.4});
            const core = new THREE.MeshStandardMaterial({color: 0x2a6fff, emissive: 0x2a6fff, emissiveIntensity: 1.5, flatShading: true});
            const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), ice);
            body.scale.set(1, 1.4, 1);
            body.position.y = 1.7;
            body.castShadow = true;
            g.add(body);
            const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), core);
            c.position.set(0, 1.9, 0.55);
            g.add(c);
            const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), ice);
            head.position.set(0, 2.9, 0.05);
            head.castShadow = true;
            g.add(head);
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), core);
                eye.position.set(0.14 * s, 2.95, 0.34);
                g.add(eye);
                const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.1, 0.28), deep);
                arm.position.set(0.85 * s, 1.7, 0);
                arm.rotation.z = 0.15 * s;
                arm.castShadow = true;
                g.add(arm);
                const fist = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), ice);
                fist.position.set(0.95 * s, 1.05, 0);
                g.add(fist);
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), deep);
                leg.position.set(0.34 * s, 0.5, 0);
                leg.castShadow = true;
                g.add(leg);
// ice shards on the shoulders
                const shard = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 5), ice);
                shard.position.set(0.5 * s, 2.4, -0.1);
                shard.rotation.z = 0.4 * s;
                g.add(shard);
            }
            return g;
        },
    },
    Dragon: {
        count: 1, hp: 6300, dmg: 135, speed: 3.2, hopper: false, aggro: 12, barW: 3.2, barY: 3.8, hitY: 2.0, level: 50, xp: 2000, tiers: [6], spawnInset: 2,
        drops: [
            {item: 'Dragon Scale', p: 1},
            {item: 'Dragon Bone', p: 1},
            {item: 'Dragon Fang', p: 0.75},
            {item: 'Dragon Heart', p: 0.40},
            {item: 'Raw Meat', p: 1},
        ],
        build() {
            const g = new THREE.Group();
            const scaleM = new THREE.MeshStandardMaterial({color: 0x8b0000, flatShading: true, roughness: 0.55, metalness: 0.35});
            const bellyM = new THREE.MeshStandardMaterial({color: 0xc0392b, flatShading: true, roughness: 0.65});
            const wingM = new THREE.MeshStandardMaterial({color: 0x5a0000, flatShading: true, roughness: 0.75, side: THREE.DoubleSide});
            const eyeM = new THREE.MeshStandardMaterial({color: 0x000000, emissive: 0xff6600, emissiveIntensity: 3.0, flatShading: true});
            const hornM = new THREE.MeshStandardMaterial({color: 0x2a1a00, flatShading: true, roughness: 0.5, metalness: 0.4});
// body
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 10), scaleM);
            body.scale.set(1.1, 0.95, 1.8);
            body.position.y = 1.8;
            body.castShadow = true;
            g.add(body);
            const belly = new THREE.Mesh(new THREE.SphereGeometry(0.52, 10, 8), bellyM);
            belly.scale.set(0.95, 0.85, 1.4);
            belly.position.set(0, 1.6, 0.6);
            g.add(belly);
// neck
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 1.3, 8), scaleM);
            neck.position.set(0, 2.65, 0.9);
            neck.rotation.x = 0.65;
            neck.castShadow = true;
            g.add(neck);
// head
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.52, 0.95), scaleM);
            head.position.set(0, 3.4, 1.6);
            head.castShadow = true;
            g.add(head);
// snout
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.3, 0.58), scaleM);
            snout.position.set(0, 3.22, 2.05);
            g.add(snout);
// eyes
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), eyeM);
                eye.position.set(0.24 * s, 3.52, 1.72);
                g.add(eye);
// horns
                const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.65, 6), hornM);
                horn.position.set(0.22 * s, 3.88, 1.55);
                horn.rotation.z = 0.28 * s;
                horn.rotation.x = -0.25;
                g.add(horn);
// large wings
                const wingBone = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.0, 6), hornM);
                wingBone.position.set(1.5 * s, 2.5, 0);
                wingBone.rotation.z = (0.4 + 0.2) * s;
                g.add(wingBone);
                const wingMem = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.5, 3, 2), wingM);
                wingMem.position.set(2.0 * s, 2.2, 0.1);
                wingMem.rotation.set(0.18, 0.4 * s, 0.55 * s);
                g.add(wingMem);
// legs
                const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.9, 6), scaleM);
                thigh.position.set(0.55 * s, 0.95, 0.4);
                thigh.rotation.z = 0.15 * s;
                thigh.castShadow = true;
                g.add(thigh);
                const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.75, 6), scaleM);
                shin.position.set(0.6 * s, 0.45, 0.7);
                g.add(shin);
                const claw = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 5), hornM);
                claw.position.set(0.62 * s, 0.08, 0.95);
                claw.rotation.x = 0.5;
                g.add(claw);
// spine ridges
                for (let k = 0; k < 5; k++) {
                    const spine = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 5), hornM);
                    spine.position.set(0, 2.55 + k * 0.22, 0.3 - k * 0.38);
                    spine.rotation.x = -0.3;
                    g.add(spine);
                }
            }
// tail
            const tail1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.14, 1.8, 8), scaleM);
            tail1.position.set(0, 1.7, -1.5);
            tail1.rotation.x = 1.2;
            tail1.castShadow = true;
            g.add(tail1);
            const tail2 = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.06, 1.4, 6), scaleM);
            tail2.position.set(0, 1.1, -2.9);
            tail2.rotation.x = 1.5;
            g.add(tail2);
            const tailBarb = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 5), hornM);
            tailBarb.position.set(0, 0.65, -4.1);
            tailBarb.rotation.x = -1.5;
            g.add(tailBarb);
            return g;
        },
    },
// ---- Dragon's Lair bridging creatures (tier 5) ----
    Wyvern: {
        count: 4, hp: 1400, dmg: 55, speed: 4.0, hopper: false, aggro: 8, barW: 2.0, barY: 2.2, hitY: 1.2, level: 30, xp: 520, tiers: [5],
        drops: [
            {item: 'Raw Meat', p: 1.00},
            {item: 'Dragon Scale', p: 0.30},
            {item: 'Titanium Ore', p: 0.20},
        ],
        build() {
            const g = new THREE.Group();
            const scaleM = new THREE.MeshStandardMaterial({color: 0x2d6a2d, flatShading: true, roughness: 0.6, metalness: 0.2});
            const wingM = new THREE.MeshStandardMaterial({color: 0x1a4a1a, flatShading: true, roughness: 0.75, side: THREE.DoubleSide});
            const eyeM = new THREE.MeshStandardMaterial({color: 0x000000, emissive: 0xffcc00, emissiveIntensity: 2.5});
            const clawM = new THREE.MeshStandardMaterial({color: 0x1a1a0a, flatShading: true});
// body
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), scaleM);
            body.scale.set(1.0, 0.85, 1.5);
            body.position.y = 1.2;
            body.castShadow = true;
            g.add(body);
// neck
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 0.9, 7), scaleM);
            neck.position.set(0, 1.9, 0.65);
            neck.rotation.x = 0.55;
            g.add(neck);
// head
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.65), scaleM);
            head.position.set(0, 2.5, 1.1);
            g.add(head);
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.4), scaleM);
            snout.position.set(0, 2.36, 1.45);
            g.add(snout);
// eyes
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeM);
                eye.position.set(0.18 * s, 2.58, 1.22);
                g.add(eye);
// wings (2-bone, bat-style)
                const wBone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 1.4, 6), clawM);
                wBone.position.set(1.1 * s, 1.6, 0.1);
                wBone.rotation.z = 0.55 * s;
                g.add(wBone);
                const wMem = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.1, 2, 2), wingM);
                wMem.position.set(1.5 * s, 1.35, 0.15);
                wMem.rotation.set(0.1, 0.35 * s, 0.5 * s);
                g.add(wMem);
// legs
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.7, 6), scaleM);
                leg.position.set(0.35 * s, 0.65, 0.25);
                leg.rotation.z = 0.1 * s;
                g.add(leg);
                const claw = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), clawM);
                claw.position.set(0.37 * s, 0.22, 0.55);
                claw.rotation.x = 0.5;
                g.add(claw);
            }
// tail
            const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.06, 1.4, 7), scaleM);
            tail.position.set(0, 1.15, -1.1);
            tail.rotation.x = 1.1;
            g.add(tail);
            return g;
        },
    },
    'Lava Titan': {
        count: 3, hp: 2800, dmg: 85, speed: 2.6, hopper: false, aggro: 9, barW: 2.4, barY: 3.0, hitY: 1.6, level: 38, xp: 900, tiers: [5],
        drops: [
            {item: 'Raw Meat', p: 0.60},
            {item: 'Titanium Ore', p: 0.80},
            {item: 'Gold Ore', p: 0.50},
            {item: 'Dragon Scale', p: 0.20},
        ],
        build() {
            const g = new THREE.Group();
            const rockM = new THREE.MeshStandardMaterial({color: 0x3a1a00, flatShading: true, roughness: 0.95});
            const glowM = new THREE.MeshStandardMaterial({color: 0xff4400, emissive: 0xff2200, emissiveIntensity: 1.8, flatShading: true});
            const eyeM = new THREE.MeshStandardMaterial({color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 3.5});
// legs
            for (const s of [-1, 1]) {
                const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 1.0, 7), rockM);
                thigh.position.set(0.38 * s, 0.5, 0);
                thigh.castShadow = true;
                g.add(thigh);
                const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.9, 7), rockM);
                shin.position.set(0.4 * s, -0.1, 0.15);
                g.add(shin);
            }
// torso
            const torso = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.4, 0.9), rockM);
            torso.position.y = 1.7;
            torso.castShadow = true;
            g.add(torso);
// lava cracks on torso
            for (let i = 0; i < 4; i++) {
                const crack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.05), glowM);
                crack.position.set(-0.35 + i * 0.22, 1.7, 0.46);
                g.add(crack);
            }
// shoulders
            for (const s of [-1, 1]) {
                const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 7), rockM);
                shoulder.position.set(0.85 * s, 2.3, 0);
                g.add(shoulder);
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 1.2, 7), rockM);
                arm.position.set(0.95 * s, 1.65, 0.1);
                arm.rotation.z = 0.18 * s;
                arm.castShadow = true;
                g.add(arm);
                const fist = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), rockM);
                fist.position.set(1.02 * s, 1.05, 0.2);
                g.add(fist);
            }
// neck
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.45, 7), rockM);
            neck.position.y = 2.55;
            g.add(neck);
// head
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.8), rockM);
            head.position.y = 3.1;
            head.castShadow = true;
            g.add(head);
// eyes (glowing lava)
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), eyeM);
                eye.position.set(0.22 * s, 3.18, 0.41);
                g.add(eye);
            }
// horns
            for (const s of [-1, 1]) {
                const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 6), rockM);
                horn.position.set(0.28 * s, 3.6, 0.05);
                horn.rotation.z = 0.3 * s;
                g.add(horn);
            }
            return g;
        },
    },
// ---- Eldenmere tier-6 creatures ----
    'Shadow Wraith': {
        count: 7, hp: 8750, dmg: 180, speed: 4.5, hopper: false, aggro: 14, barW: 2.2, barY: 2.8, hitY: 1.4, level: 60, xp: 3200, tiers: [7], spawnInset: 10,
        drops: [
            {item: 'Shadow Essence', p: 1.00},
            {item: 'Ether Shard', p: 0.60},
            {item: 'Voidstone', p: 0.40},
        ],
        build() {
            const g = new THREE.Group();
            const bodyM = new THREE.MeshStandardMaterial({color: 0x1a0030, emissive: 0x6600cc, emissiveIntensity: 1.5, flatShading: true, transparent: true, opacity: 0.85});
            const glowM = new THREE.MeshStandardMaterial({color: 0x9900ff, emissive: 0x9900ff, emissiveIntensity: 3.0, flatShading: true});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), bodyM);
            body.scale.set(1.0, 1.4, 1.0);
            body.position.y = 1.8;
            body.castShadow = true;
            g.add(body);
            const trail = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.8, 8), bodyM);
            trail.position.y = 0.7;
            trail.rotation.x = Math.PI;
            g.add(trail);
// eyes
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), glowM);
                eye.position.set(0.17 * s, 2.0, 0.42);
                g.add(eye);
            }
// wispy arms
            for (const s of [-1, 1]) {
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.02, 1.2, 5), bodyM);
                arm.position.set(0.65 * s, 1.6, 0);
                arm.rotation.z = 0.8 * s;
                g.add(arm);
            }
            return g;
        },
    },
    'Void Stalker': {
        count: 7, hp: 7875, dmg: 200, speed: 5.2, hopper: false, aggro: 16, barW: 2.0, barY: 2.4, hitY: 1.2, level: 62, xp: 3500, tiers: [7], spawnInset: 10,
        drops: [
            {item: 'Void Fang', p: 1.00},
            {item: 'Voidstone', p: 0.70},
            {item: 'Ether Shard', p: 0.45},
        ],
        build() {
            const g = new THREE.Group();
            const bodyM = new THREE.MeshStandardMaterial({color: 0x0a0015, emissive: 0x440066, emissiveIntensity: 1.2, flatShading: true});
            const accentM = new THREE.MeshStandardMaterial({color: 0xcc00ff, emissive: 0xcc00ff, emissiveIntensity: 2.5, flatShading: true});
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.55), bodyM);
            body.position.y = 1.2;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 6), bodyM);
            head.position.y = 2.05;
            head.castShadow = true;
            g.add(head);
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), accentM);
                eye.position.set(0.15 * s, 2.12, 0.3);
                g.add(eye);
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 0.9, 5), bodyM);
                arm.position.set(0.52 * s, 1.35, 0);
                arm.rotation.z = 0.6 * s;
                g.add(arm);
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.8, 5), bodyM);
                leg.position.set(0.22 * s, 0.45, 0);
                g.add(leg);
// claw
                const claw = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 4), accentM);
                claw.position.set(0.22 * s, 0.02, 0.1);
                claw.rotation.x = 0.4;
                g.add(claw);
            }
            return g;
        },
    },
// Legendary deep-end creatures — spawn only at the far northern tip of Eldenmere
    'Infernal Titan': {
        count: 4, hp: 24500, dmg: 320, speed: 1.8, hopper: false, aggro: 14, barW: 3.5, barY: 4.2, hitY: 2.0, level: 75, xp: 7500, tiers: [7], spawnInset: 8,
        spawnZone: {x: 0, z: -310, r: 28},
        drops: [
            {item: 'Infernal Ember', p: 1.00},
            {item: 'Enriched Fire Essence', p: 0.25},
            {item: 'Ether Shard', p: 0.60},
        ],
        build() {
            const g = new THREE.Group();
            const lavaM = new THREE.MeshStandardMaterial({color: 0x8a1500, emissive: 0xff3300, emissiveIntensity: 1.2, flatShading: true, roughness: 0.7});
            const glowM = new THREE.MeshStandardMaterial({color: 0xff6600, emissive: 0xff6600, emissiveIntensity: 4.0, flatShading: true});
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.4, 1.2), lavaM);
            body.position.y = 2.0;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.0), lavaM);
            head.position.y = 3.7;
            head.castShadow = true;
            g.add(head);
// lava cracks on body (glowing stripes)
            for (const ry of [1.2, 2.0, 2.8]) {
                const crack = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 0.1), glowM);
                crack.position.set(0, ry, 0.62);
                g.add(crack);
            }
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), glowM);
                eye.position.set(0.3 * s, 3.82, 0.46);
                g.add(eye);
                const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.8, 0.55), lavaM);
                arm.position.set(1.32 * s, 1.85, 0);
                arm.castShadow = true;
                g.add(arm);
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.1, 0.65), lavaM);
                leg.position.set(0.55 * s, 0.55, 0);
                leg.castShadow = true;
                g.add(leg);
            }
// molten shoulder pads
            for (const s of [-1, 1]) {
                const pad = new THREE.Mesh(new THREE.SphereGeometry(0.55, 7, 6), lavaM);
                pad.position.set(1.1 * s, 3.1, 0);
                g.add(pad);
                const padGlow = new THREE.Mesh(new THREE.SphereGeometry(0.25, 6, 5), glowM);
                padGlow.position.set(1.1 * s, 3.1, 0.3);
                g.add(padGlow);
            }
            return g;
        },
    },
    'Void Colossus': {
        count: 3, hp: 28000, dmg: 360, speed: 1.4, hopper: false, aggro: 12, barW: 4.0, barY: 4.8, hitY: 2.2, level: 80, xp: 9000, tiers: [7], spawnInset: 8,
        spawnZone: {x: 0, z: -295, r: 22},
        drops: [
            {item: 'Void Relic', p: 1.00},
            {item: 'Enriched Fire Essence', p: 0.20},
            {item: 'Voidstone', p: 0.70},
        ],
        build() {
            const g = new THREE.Group();
            const voidM = new THREE.MeshStandardMaterial({color: 0x080010, emissive: 0x5500aa, emissiveIntensity: 1.0, flatShading: true, transparent: true, opacity: 0.92});
            const rimM = new THREE.MeshStandardMaterial({color: 0xcc00ff, emissive: 0xcc00ff, emissiveIntensity: 5.0, flatShading: true});
            const body = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.2, 2.8, 10), voidM);
            body.position.y = 2.2;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), voidM);
            head.position.y = 4.0;
            head.castShadow = true;
            g.add(head);
// void eye cluster
            for (const [ex, ey, ez] of [[0, 4.1, 0.72], [-0.35, 3.85, 0.68], [0.35, 3.85, 0.68]]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), rimM);
                eye.position.set(ex, ey, ez);
                g.add(eye);
            }
// glowing rings on body
            for (const ry of [1.8, 2.8, 3.4]) {
                const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.1, 6, 14), rimM);
                ring.position.y = ry;
                ring.rotation.x = Math.PI / 2;
                g.add(ring);
            }
            for (const s of [-1, 1]) {
                const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 2.2, 8), voidM);
                arm.position.set(1.55 * s, 2.5, 0);
                arm.rotation.z = 0.4 * s;
                arm.castShadow = true;
                g.add(arm);
                const claw = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.8, 5), rimM);
                claw.position.set(2.15 * s, 1.6, 0);
                claw.rotation.z = (s < 0 ? -1 : 1) * 1.8;
                g.add(claw);
                const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 1.4, 8), voidM);
                leg.position.set(0.6 * s, 0.7, 0);
                leg.castShadow = true;
                g.add(leg);
            }
            return g;
        },
    },
    'Ancient Golem': {
        count: 5, hp: 14000, dmg: 150, speed: 2.2, hopper: false, aggro: 10, barW: 3.0, barY: 3.5, hitY: 1.8, level: 65, xp: 4500, tiers: [7], spawnInset: 12,
        drops: [
            {item: 'Ancient Core', p: 1.00},
            {item: 'Starstone', p: 0.80},
            {item: 'Aether Crystal', p: 0.60},
            {item: 'Ether Shard', p: 0.50},
        ],
        build() {
            const g = new THREE.Group();
            const stoneM = new THREE.MeshStandardMaterial({color: 0x3a3050, emissive: 0x6080ff, emissiveIntensity: 0.8, flatShading: true, roughness: 0.8, metalness: 0.3});
            const coreM = new THREE.MeshStandardMaterial({color: 0x00ccff, emissive: 0x00ccff, emissiveIntensity: 4.0, flatShading: true});
            const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.0), stoneM);
            body.position.y = 1.6;
            body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.85), stoneM);
            head.position.y = 2.9;
            head.castShadow = true;
            g.add(head);
            const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), coreM);
            core.position.y = 1.65;
            g.add(core);
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), coreM);
                eye.position.set(0.22 * s, 2.96, 0.38);
                g.add(eye);
                const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.4, 0.45), stoneM);
                arm.position.set(1.05 * s, 1.55, 0);
                arm.castShadow = true;
                g.add(arm);
                const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), stoneM);
                leg.position.set(0.38 * s, 0.5, 0);
                leg.castShadow = true;
                g.add(leg);
            }
            return g;
        },
    },
    // ---- Icereach Peaks tier-9 creatures ----
    'Arctic Hare': {
        count: 2, hp: 55, dmg: 4, speed: 3.8, hopper: true, aggro: 0, barW: 0.9, barY: 0.95, hitY: 0.6, level: 30, xp: 160, tiers: [9],
        drops: [{item: 'Arctic Hare Pelt', p: 1}, {item: 'Raw Meat', p: 0.65}, {item: 'Bones', p: 0.4}],
        build() {
            const g = new THREE.Group();
            const fur = new THREE.MeshStandardMaterial({color: 0xf0f4f8, flatShading: true, roughness: 0.88});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), fur);
            body.scale.set(1, 0.9, 1.3); body.position.y = 0.3; body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), fur);
            head.position.set(0, 0.52, 0.3); head.castShadow = true;
            g.add(head);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.36, 0.05), fur);
                ear.position.set(0.08 * s, 0.82, 0.26); ear.rotation.x = -0.22; ear.rotation.z = 0.1 * s;
                ear.castShadow = true; g.add(ear);
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6),
                    new THREE.MeshStandardMaterial({color: 0xff3a60, roughness: 0.4}));
                eye.position.set(0.09 * s, 0.56, 0.44); g.add(eye);
            }
            const tail = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), fur);
            tail.position.set(0, 0.32, -0.36); g.add(tail);
            return g;
        },
    },
    'Frost Elk': {
        count: 1, hp: 320, dmg: 20, speed: 3.2, hopper: false, aggro: 0, barW: 1.4, barY: 1.8, hitY: 1.2, level: 38, xp: 260, tiers: [9],
        drops: [{item: 'Frost Elk Hide', p: 1}, {item: 'Frost Elk Antler', p: 0.75}, {item: 'Raw Meat', p: 0.8}, {item: 'Bones', p: 0.5}],
        build() {
            const g = new THREE.Group();
            const fur = new THREE.MeshStandardMaterial({color: 0xd0dce8, flatShading: true, roughness: 0.92});
            const antlerM = new THREE.MeshStandardMaterial({color: 0xbcd4e6, flatShading: true, roughness: 0.6});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.44, 10, 8), fur);
            body.scale.set(0.95, 0.82, 1.6); body.position.y = 0.95; body.castShadow = true;
            g.add(body);
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.6, 7), fur);
            neck.position.set(0, 1.38, 0.4); neck.rotation.x = -0.45; neck.castShadow = true;
            g.add(neck);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), fur);
            head.position.set(0, 1.7, 0.7); head.scale.set(0.85, 0.85, 1.2); head.castShadow = true;
            g.add(head);
            for (const s of [-1, 1]) {
                const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.7, 5), antlerM);
                antler.position.set(0.18 * s, 1.98, 0.58); antler.rotation.z = 0.55 * s;
                g.add(antler);
                const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.42, 5), antlerM);
                tine.position.set(0.36 * s, 2.22, 0.5); tine.rotation.set(0.3, 0, 0.7 * s);
                g.add(tine);
                for (const fz of [-0.35, 0.35]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.9, 7), fur);
                    leg.position.set(0.26 * s, 0.38, fz); leg.castShadow = true;
                    g.add(leg);
                }
            }
            return g;
        },
    },
    'Arctic Wolf': {
        count: 2, hp: 420, dmg: 28, speed: 3.8, hopper: false, aggro: 10, barW: 1.2, barY: 1.3, hitY: 0.9, level: 44, xp: 330, tiers: [9],
        drops: [{item: 'Arctic Wolf Fur', p: 1}, {item: 'Glacial Fang', p: 0.6}, {item: 'Raw Meat', p: 0.7}, {item: 'Bones', p: 0.5}],
        build() {
            const g = new THREE.Group();
            const fur = new THREE.MeshStandardMaterial({color: 0xe8eef4, flatShading: true, roughness: 0.9});
            const dark = new THREE.MeshStandardMaterial({color: 0x9fb0c0, flatShading: true, roughness: 0.9});
            const eye = new THREE.MeshStandardMaterial({color: 0x44aaff, emissive: 0x2266aa, emissiveIntensity: 0.8, roughness: 0.3});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), fur);
            body.scale.set(0.85, 0.78, 1.5); body.position.y = 0.62; body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), fur);
            head.position.set(0, 0.88, 0.52); head.scale.set(0.9, 0.85, 1.15); head.castShadow = true;
            g.add(head);
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.22), fur);
            snout.position.set(0, 0.8, 0.72); g.add(snout);
            const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.55, 6), fur);
            tail.position.set(0, 0.82, -0.6); tail.rotation.x = 0.8; g.add(tail);
            for (const s of [-1, 1]) {
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.19, 5), dark);
                ear.position.set(0.13 * s, 1.12, 0.42); ear.rotation.z = 0.15 * s;
                g.add(ear);
                const ev = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eye);
                ev.position.set(0.1 * s, 0.92, 0.7); g.add(ev);
                for (const fz of [-0.25, 0.25]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.6, 6), fur);
                    leg.position.set(0.22 * s, 0.28, fz); leg.castShadow = true;
                    g.add(leg);
                }
            }
            return g;
        },
    },
    'Snow Leopard': {
        count: 1, hp: 780, dmg: 50, speed: 4.4, hopper: false, aggro: 16, barW: 1.4, barY: 1.4, hitY: 1.0, level: 52, xp: 480, tiers: [9],
        drops: [{item: 'Snow Leopard Pelt', p: 1}, {item: 'Snow Leopard Claw', p: 0.65}, {item: 'Raw Meat', p: 0.7}, {item: 'Glacial Crystal', p: 0.3}],
        build() {
            const g = new THREE.Group();
            const spotM = new THREE.MeshStandardMaterial({color: 0xd8e4ee, flatShading: true, roughness: 0.85});
            const darkM = new THREE.MeshStandardMaterial({color: 0x7a8ea0, flatShading: true, roughness: 0.85});
            const eyeM  = new THREE.MeshStandardMaterial({color: 0xaaddff, emissive: 0x66bbff, emissiveIntensity: 1.2});
            const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), spotM);
            body.scale.set(0.82, 0.7, 1.7); body.position.y = 0.6; body.castShadow = true;
            g.add(body);
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), spotM);
            head.position.set(0, 0.82, 0.64); head.scale.set(0.95, 0.88, 1.0); head.castShadow = true;
            g.add(head);
            const snout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.18), spotM);
            snout.position.set(0, 0.74, 0.82); g.add(snout);
            // fluffy tail
            const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.04, 0.8, 7), spotM);
            tail.position.set(0, 0.7, -0.7); tail.rotation.x = 0.9; g.add(tail);
            for (const s of [-1, 1]) {
                // spots (dark patches on body)
                const spot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), darkM);
                spot.position.set(0.28 * s, 0.68, 0.1 * s); g.add(spot);
                const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 5), darkM);
                ear.position.set(0.12 * s, 1.05, 0.56); ear.rotation.z = 0.2 * s;
                g.add(ear);
                const ev = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), eyeM);
                ev.position.set(0.09 * s, 0.86, 0.8); g.add(ev);
                for (const fz of [-0.28, 0.28]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.62, 6), spotM);
                    leg.position.set(0.24 * s, 0.25, fz); leg.castShadow = true;
                    g.add(leg);
                }
            }
            return g;
        },
    },
    'Glacial Mammoth': {
        count: 1, hp: 3800, dmg: 95, speed: 2.0, hopper: false, aggro: 12, barW: 2.8, barY: 4.0, hitY: 2.2, level: 62, xp: 680, tiers: [9],
        drops: [
            {item: 'Mammoth Tusk', p: 1.00},
            {item: 'Mammoth Hide', p: 1.00},
            {item: 'Glacial Crystal', p: 0.70},
            {item: 'Raw Meat', p: 1.00},
            {item: 'Bones', p: 0.60},
        ],
        build() {
            const g = new THREE.Group();
            const hideM = new THREE.MeshStandardMaterial({color: 0xb8c8d4, flatShading: true, roughness: 0.92});
            const tuskM = new THREE.MeshStandardMaterial({color: 0xe8f4ff, flatShading: true, roughness: 0.55});
            const eyeM  = new THREE.MeshStandardMaterial({color: 0x3a3028, roughness: 0.5});
            // massive body
            const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), hideM);
            body.scale.set(1.1, 0.95, 1.5); body.position.y = 1.8; body.castShadow = true;
            g.add(body);
            // shaggy fur effect (slightly larger dark sphere behind)
            const fur = new THREE.Mesh(new THREE.SphereGeometry(1.06, 8, 6),
                new THREE.MeshStandardMaterial({color: 0x90a0b0, flatShading: true, roughness: 0.98, side: THREE.BackSide}));
            fur.scale.copy(body.scale); fur.position.copy(body.position); g.add(fur);
            // head
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), hideM);
            head.scale.set(0.9, 0.9, 1.2); head.position.set(0, 2.4, 1.45); head.castShadow = true;
            g.add(head);
            // trunk
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.9, 7), hideM);
            trunk.position.set(0, 1.8, 2.1); trunk.rotation.x = 0.55; g.add(trunk);
            // tusks
            for (const s of [-1, 1]) {
                const tusk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 1.2, 6), tuskM);
                tusk.position.set(0.4 * s, 1.9, 1.9); tusk.rotation.set(0.6, 0, 0.35 * -s);
                g.add(tusk);
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), eyeM);
                eye.position.set(0.32 * s, 2.6, 1.8); g.add(eye);
                // ears
                const ear = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), hideM);
                ear.scale.set(0.4, 0.7, 0.15); ear.position.set(0.65 * s, 2.7, 1.2);
                g.add(ear);
                // legs — front and back pair
                for (const fz of [-0.55, 0.55]) {
                    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 1.2, 8), hideM);
                    leg.position.set(0.55 * s, 0.6, fz); leg.castShadow = true;
                    g.add(leg);
                }
            }
            return g;
        },
    },
    'Frostborn Warlord': {
        count: 1, hp: 45000, dmg: 180, speed: 0.8, hopper: false, aggro: 20, barW: 4.2, barY: 6.2, hitY: 3.8, level: 75, xp: 12000, tiers: [9],
        spawnZone: { x: 88, z: -90, r: 3 },
        drops: [
            { item: 'Glacial Crystal', p: 1.00 },
            { item: 'Frost Elk Hide',  p: 1.00 },
            { item: 'Snow Leopard Claw', p: 0.80 },
            { item: 'Mammoth Tusk',    p: 0.60 },
            { item: 'Gold Coin',       p: 1.00 },
            { item: 'Raw Meat',        p: 1.00 },
        ],
        build() {
            const g = new THREE.Group();
            const armorM  = new THREE.MeshStandardMaterial({ color: 0x4a6fa5, flatShading: true, roughness: 0.5, metalness: 0.7 });
            const darkM   = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, flatShading: true, roughness: 0.6, metalness: 0.6 });
            const skinM   = new THREE.MeshStandardMaterial({ color: 0xc8d8e8, flatShading: true, roughness: 0.8 });
            const eyeM    = new THREE.MeshStandardMaterial({ color: 0x00ccff, emissive: 0x00aaff, emissiveIntensity: 2.5 });
            const bladeM  = new THREE.MeshStandardMaterial({ color: 0xb0d4f1, flatShading: true, roughness: 0.3, metalness: 0.9 });
            const hiltM   = new THREE.MeshStandardMaterial({ color: 0x2a2a3a, flatShading: true, roughness: 0.5, metalness: 0.8 });

            // torso
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.88, 0.46), armorM);
            torso.position.set(0, 1.52, 0); torso.castShadow = true;
            g.add(torso);
            // pauldrons (shoulder pads)
            for (const s of [-1, 1]) {
                const pauM = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 7), armorM);
                pauM.scale.set(1, 0.75, 1); pauM.position.set(0.52 * s, 1.88, 0);
                g.add(pauM);
            }
            // waist/belt
            const belt = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.2, 0.48), darkM);
            belt.position.set(0, 1.1, 0);
            g.add(belt);
            // hips
            const hips = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.36, 0.44), armorM);
            hips.position.set(0, 0.88, 0);
            g.add(hips);
            // head
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skinM);
            head.position.set(0, 2.2, 0); head.castShadow = true;
            g.add(head);
            // helmet
            const helm = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 7), armorM);
            helm.position.set(0, 2.3, 0); helm.scale.set(1, 0.78, 1);
            g.add(helm);
            // horned helmet spikes
            for (const s of [-1, 1]) {
                const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 5), darkM);
                spike.position.set(0.22 * s, 2.68, 0.04); spike.rotation.z = 0.35 * s;
                g.add(spike);
            }
            // eyes
            for (const s of [-1, 1]) {
                const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 6), eyeM);
                eye.position.set(0.1 * s, 2.2, 0.28);
                g.add(eye);
            }
            // arms
            for (const s of [-1, 1]) {
                const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.55, 7), armorM);
                upper.position.set(0.58 * s, 1.52, 0); upper.rotation.z = 0.2 * s;
                upper.castShadow = true; g.add(upper);
                const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.52, 7), armorM);
                lower.position.set(0.7 * s, 1.12, 0);
                lower.castShadow = true; g.add(lower);
            }
            // legs
            for (const s of [-1, 1]) {
                const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.13, 0.62, 7), armorM);
                thigh.position.set(0.2 * s, 0.56, 0); thigh.castShadow = true;
                g.add(thigh);
                const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.55, 7), darkM);
                shin.position.set(0.2 * s, 0.08, 0);
                shin.castShadow = true; g.add(shin);
            }

            // --- big greatsword (held in right hand, angled up) ---
            const swordGroup = new THREE.Group();
            swordGroup.position.set(0.72, 1.05, 0.08);
            swordGroup.rotation.z = -0.22;
            swordGroup.rotation.x = 0.15;
            g.add(swordGroup);
            g.userData._swordGroup = swordGroup;

            // pommel
            const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.095, 7, 6), hiltM);
            pommel.position.set(0, -1.35, 0); swordGroup.add(pommel);
            // grip
            const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.65, 7), hiltM);
            grip.position.set(0, -0.98, 0); swordGroup.add(grip);
            // crossguard
            const guard = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.1), hiltM);
            guard.position.set(0, -0.62, 0); swordGroup.add(guard);
            // blade
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.1, 0.06), bladeM);
            blade.position.set(0, 0.42, 0); swordGroup.add(blade);
            // blade tip
            const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 5), bladeM);
            tip.position.set(0, 1.54, 0); swordGroup.add(tip);
            // fuller (blade groove)
            const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.8, 0.065), bladeM);
            fuller.position.set(0, 0.44, 0); swordGroup.add(fuller);

            g.userData._bossArmorM = armorM;
            g.userData._bossBladeM = bladeM;
            g.userData._bossEyeM   = eyeM;
            g.scale.set(2, 2, 2);
            return g;
        },
    },
    'Cave Worm': {
        count: 3, hp: 1190, dmg: 72, speed: 2.4, hopper: false, aggro: 14.0, barW: 2.2, barY: 3.6, hitY: 1.6, level: 58, xp: 520, tiers: [8],
        drops: [{item: 'Bones', p: 1}, {item: 'Raw Meat', p: 1}, {item: 'Sulphur', p: 0.7}, {item: 'Iron Ore', p: 0.6}, {item: 'Gold Coin', p: 0.5}],
        build() {
            const g = new THREE.Group();
            const ph = new THREE.Mesh(
                new THREE.CylinderGeometry(0.35, 0.5, 2.0, 8),
                new THREE.MeshStandardMaterial({color: 0x8b5e3c, flatShading: true, roughness: 0.9})
            );
            ph.position.y = 1.0;
            ph.castShadow = true;
            g.add(ph);
            g.userData._cwPlaceholder = ph;

            cavewormDataPromise.then((data) => {
                if (!data) {
                    console.warn('[CaveWorm] no data');
                    return;
                }
// parse a fresh scene per creature — avoids SkinnedMesh clone bug
                gltfLoader.parse(data, '', (gltf) => {
                    const model = gltf.scene;
                    model.scale.set(44.2, 44.2, 44.2);
                    model.position.y = 0;
                    model.rotation.y = 0;
                    model.traverse((node) => {
                        if (node.isMesh || node.isSkinnedMesh) {
                            node.castShadow = true;
                            node.receiveShadow = true;
                            node.visible = true;
                            if (node.material) {
                                const mats = Array.isArray(node.material) ? node.material : [node.material];
                                mats.forEach(mat => {
                                    mat.side = THREE.DoubleSide;
                                });
                            }
                        }
                    });
                    if (g.userData._cwPlaceholder) {
                        g.remove(g.userData._cwPlaceholder);
                        g.userData._cwPlaceholder = null;
                    }
                    g.add(model);
                    console.log('[CaveWorm] spawned ok, anims:', gltf.animations.map(a => a.name));
                    if (gltf.animations && gltf.animations.length > 0) {
                        const mixer = new THREE.AnimationMixer(model);
                        const clip = gltf.animations[0];
                        const action = mixer.clipAction(clip);
                        action.play();
                        g.userData._cwMixer = mixer;
                        g.userData._cwAction = action;
                    }
                }, (err) => {
                    console.warn('[CaveWorm] parse error', err);
                });
            });

            return g;
        },
    },
};
let findSpotIsleForced;
findSpotIsleForced = function (isle, inset) {
    const p = findSpotIsle(isle, 2.0, inset);
    if (p) return p;
// relax separation check entirely, just need walkable land on this isle
    for (let t = 0; t < 200; t++) {
        const a = rand(0, Math.PI * 2), r = Math.sqrt(_rng()) * (isle.r - (inset || 4));
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
    const homeIsle = validIsles[Math.floor(_rng() * validIsles.length)] || ISLES[0];
    let p;
    if (def.spawnZone) {
// spawn within a fixed zone (for deep-end legendary creatures)
        const sz = def.spawnZone;
        let found = false;
        for (let t = 0; t < 300 && !found; t++) {
            const a = rand(0, Math.PI * 2), r = Math.sqrt(_rng()) * sz.r;
            const x = sz.x + Math.cos(a) * r, z = sz.z + Math.sin(a) * r;
            if (walkable(x, z)) {
                p = new THREE.Vector3(x, terrainHeight(x, z), z);
                found = true;
            }
        }
        if (!p) p = new THREE.Vector3(sz.x, terrainHeight(sz.x, sz.z), sz.z);
    } else {
        p = findSpotIsleForced(homeIsle, def.spawnInset !== undefined ? def.spawnInset : (def.nearWater ? 2 : 6));
    }
    const g = def.build();
    g.position.set(p.x, terrainHeight(p.x, p.z), p.z);
    const bar = makeHealthBar(g, def.barW, def.barY + 0.8, true);
    bar.hp = def.hp;
    bar.maxhp = def.hp;
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
    g.userData.interact = {kind: 'creature', creature: c};
    scene.add(g);
    clickables.push(g);
    creatures.push(c);
}

function spawnAllCreatures() {
    for (const name of Object.keys(CREATURE_DEFS))
        for (let i = 0; i < CREATURE_DEFS[name].count; i++) spawnCreature(name);
}

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
// Earth Entangle / Petrify / Nature's Wrath: rooted/petrified enemies take bonus damage
    {
        const entangleEntry = player.earthEntangleTargets && player.earthEntangleTargets.find(e => e.creature === c);
        const petrifyEntry  = player.earthPetrifyTargets  && player.earthPetrifyTargets.find(p => p.creature === c);
        const ampPct = Math.max(entangleEntry ? entangleEntry.dmgAmpPct : 0, petrifyEntry ? petrifyEntry.dmgAmpPct : 0);
        if (ampPct > 0) dmg = Math.ceil(dmg * (1 + ampPct / 100));
        // Nature's Wrath: extra multiplier when target is immobilised
        const nwRank = talentRank('earth_natures_wrath');
        if (nwRank > 0 && (entangleEntry || petrifyEntry)) {
            const nwBonus = [0, 0.10, 0.18, 0.27, 0.37, 0.50][nwRank];
            dmg = Math.ceil(dmg * (1 + nwBonus));
        }
    }
// Forward hit to server (multiplayer authoritative HP); still subtract locally for
// immediate feedback — the server will echo creature:damaged which may correct it.
    if (typeof netAttackCreature === 'function') netAttackCreature(c, dmg);
    c.hp -= dmg;
    setBar(c.bar, c.hp / c.maxhp, c.hp, c.maxhp);
    if (!silent) {
        floatText('-' + Math.ceil(dmg), c.group.position.clone().add(new THREE.Vector3(0, c.def.barY + 0.9, 0)), '#f87171');
    } else {
        if (!c._dotFloatAccum) c._dotFloatAccum = 0;
        if (!c._dotFloatTimer) c._dotFloatTimer = 0;
        c._dotFloatAccum += dmg;
    }
    if (c.hp <= 0) killCreature(c);
    else if (c.state !== 'combat') {
        c.state = 'combat';
    }
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
    const atkGain = Math.max(1, Math.round(c.def.xp * 1.5 * f));
    const defGain = Math.max(1, Math.round(c.def.xp * 1.0 * f));
    const hp0 = headPos();
    floatText('+' + atkGain + ' ATK', hp0.clone().add(new THREE.Vector3(-0.6, 0.2, 0)), '#ff8f8f', 0.85);
    floatText('+' + defGain + ' DEF', hp0.clone().add(new THREE.Vector3(0.6, 0.5, 0)), '#8fbcff', 0.85);
    log('You gained ' + atkGain + ' Attack and ' + defGain + ' Defense experience.', 'sys');
    grantXp('atk', atkGain);
    grantXp('def', defGain);
    if (c.name === 'Dragon') {
        player.dragonKilled = true;
        saveGame();
    }
    if (player.action && player.action.type === 'attack' && player.action.creature === c) player.action = null;
// Overload: shocked enemies that die burst-stun nearby enemies
    const overloadRank = talentRank('lightning_overload');
    if (overloadRank > 0 && player.lightningStuns.some(s => s.creature === c)) {
        const olRadius = [0, 4, 5, 6, 7, 8][overloadRank];
        const olStunCycles = overloadRank >= 3 ? 2 : 1;
        creatures.forEach(cc => {
            if (cc !== c && cc.state !== 'dead' && cc.group.position.distanceTo(c.group.position) <= olRadius) {
                if (!player.lightningStuns.some(s => s.creature === cc)) {
                    player.lightningStuns.push({creature: cc, timer: olStunCycles * 2});
                    floatText('⚡ Overload!', cc.group.position.clone().add(new THREE.Vector3(0, 2, 0)), '#fde047', 0.9);
                }
            }
        });
    }
}

// ------------------------------------------------------------------ creature update
function updateCreature(c, dt) {
    const g = c.group;

// Apply state from server. Never downgrade combat → wander while actively fighting.
    if (c.netState) {
        if (c.netState === 'dead' && c.state !== 'dead') {
            c.state = 'dead';
            c.respawn = 9999;
        } else if (c.netState !== 'dead') {
            if (!(c.netState === 'wander' && c.state === 'combat')) {
                c.state = c.netState;
            }
        }
        c.netState = null;
    }

// Death animation
    if (c.state === 'dead') {
        g.scale.y = Math.max(0.01, g.scale.y - dt * 2.2);
        g.position.y = terrainHeight(g.position.x, g.position.z);
        if (g.scale.y <= 0.02) g.visible = false;
        return;
    }

// Always lerp toward server position — server is the single authority.
    if (c.netPos) {
        const dx = c.netPos.x - g.position.x, dz = c.netPos.z - g.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 0.05) {
            g.position.x = c.netPos.x;
            g.position.z = c.netPos.z;
            c.netPos = null;
        } else {
            const alpha = Math.min(1, dt * 12);
            g.position.x += dx * alpha;
            g.position.z += dz * alpha;
            g.userData._angle = Math.atan2(dx, dz);
        }
    }

// Keep Y on terrain + hop/bob animation
    c.moving = c.state === 'combat' || !!c.netPos;
    c.phase += dt * (c.moving ? (c.def.hopper ? 9 : 7) : 2);
    const baseY = terrainHeight(g.position.x, g.position.z);
    if (c.def.hopper) g.position.y = baseY + (c.moving ? Math.abs(Math.sin(c.phase)) * 0.28 : Math.abs(Math.sin(c.phase * 0.6)) * 0.05);
    else g.position.y = baseY + (c.moving ? Math.abs(Math.sin(c.phase)) * 0.08 : Math.sin(c.phase * 0.5) * 0.02);
    if (g.userData._angle !== undefined) {
        let a = g.userData._angle - g.rotation.y;
        while (a > Math.PI) a -= Math.PI * 2;
        while (a < -Math.PI) a += Math.PI * 2;
        g.rotation.y += a * Math.min(1, 8 * dt);
    }
}
