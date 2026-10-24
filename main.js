(function () {
'use strict';

window.__portfolioReady = true;

const $ = (s, r) => (r || document).querySelector(s);
const root = document.documentElement;
const hasGsap = typeof window.gsap !== 'undefined';
const hasThree = typeof window.THREE !== 'undefined';
const isMobile = matchMedia('(max-width: 860px)').matches;
const canHover = matchMedia('(hover: hover)').matches;

let loading = root.classList.contains('loading');

/* ===================== Langue (FR / ES) — textes dans lang.js ===================== */
const I18 = window.I18N;
let LANG = 'fr';
try { LANG = localStorage.getItem('lang') || 'fr'; } catch (e) {}
if (!I18[LANG]) LANG = 'fr';
let KB, FALLBACK, CHIPS, STEPS, UI;
function loadLang() { const d = I18[LANG]; KB = d.KB; FALLBACK = d.FALLBACK; CHIPS = d.CHIPS; STEPS = d.STEPS; UI = d.UI; }
loadLang();

/* ===================== Renderer (repli sans 3D) ===================== */
const canvas = $('#bg');
let renderer = null;
if (hasThree) {
    try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(innerWidth, innerHeight);
        renderer.setClearColor(0x000000, 0);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
    } catch (e) { renderer = null; }
}
if (!hasGsap) root.classList.add('no-gsap');

/* ===================== État partagé ===================== */
// work = robot en réparation au chargement (1) ou à sa place normale (0) · build = avancement 0-100 · door = trappe de poitrine ouverte (1)
if (!renderer || !hasGsap) { root.classList.remove('loading'); loading = false; }
const state = { drop: 0, eye: loading ? 0.2 : 1, wave: 0, work: loading ? 1 : 0, build: loading ? 0 : 100, door: 0, intro: loading ? 0 : 1 };
// Cinématique « orbite » : k = poids de la trajectoire (0 = placement normal), ang/R = position sur l'orbite, land = atterrissage
const cin = { on: false, k: 0, ang: 0, R: 6.8, sc: 0.5, landSc: 0.12, land: 0, globe: 0, rotX: 0, rotY: 0, target: 'fr' };

const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
const pointer = { x: -999, y: -999, target: null };
let hoverRobot = false;
// Placement du robot : côté courant (1 = droite, -1 = gauche), mode mini, téléportation
let side = 1, sideWant = 1, robotMini = false, lastScrollT = 0, playOrbit = null;
try { robotMini = localStorage.getItem('robotMini') === '1'; } catch (e) {}
addEventListener('scroll', () => { lastScrollT = performance.now(); }, { passive: true });
// Déplacement manuel du robot (glisser-déposer) : décalage en unités 3D
const robotPos = { x: 0, y: 0 };
const drag = { tx: 0, ty: 0, x: 0, y: 0, pinned: false, down: false, active: false, moved: false, sx: 0, sy: 0, bx: 0, by: 0, said: false };
let overInteractive = false;
let talkUntil = 0;
let tourActive = false;
let chatOpen = false;
let voiceOn = false;
const bubble = $('#bubble');
let bubbleTimer = null;

const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const robotTalk = ms => { talkUntil = performance.now() + ms; };

function speak(msg, ms) {
    if (tourActive || cin.on) return;
    bubble.textContent = msg;
    bubble.classList.add('show');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => bubble.classList.remove('show'), ms || 3200);
    robotTalk(Math.min(ms || 3200, msg.length * 45));
}

/* ===================== Le robot 3D ===================== */
if (renderer) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 200);
    camera.position.set(0, 0, 24);

    // Environnement de reflets (mini studio photo généré)
    (function buildEnv() {
        const pm = new THREE.PMREMGenerator(renderer);
        const env = new THREE.Scene();
        env.add(new THREE.Mesh(new THREE.BoxGeometry(30, 30, 30), new THREE.MeshBasicMaterial({ color: 0x8a867c, side: THREE.BackSide })));
        const panel = (w, h, x, y, z, r, g, b) => {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b), side: THREE.DoubleSide }));
            m.position.set(x, y, z);
            m.lookAt(0, 0, 0);
            env.add(m);
        };
        panel(14, 9, 0, 13, 2, 5, 5, 5);
        panel(7, 9, -11, 4, 11, 4, 4, 4);
        panel(6, 8, 12, 2, -8, 3, 1.2, 0.4);
        panel(10, 4, 0, -3, 13, 1.5, 1.5, 1.5);
        scene.environment = pm.fromScene(env, 0.04).texture;
        pm.dispose();
    })();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbfb9ad, 0.5));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(5, 8, 6);
    scene.add(sun);
    const rimLight = new THREE.DirectionalLight(0xff5a1f, 0.3);
    rimLight.position.set(-6, 2, -4);
    scene.add(rimLight);

    // Textures utilitaires
    const radialTex = (inner, outer) => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, inner);
        gr.addColorStop(1, outer);
        g.fillStyle = gr;
        g.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(c);
    };
    const glowTex = radialTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    const shadowTex = radialTex('rgba(0,0,0,0.38)', 'rgba(0,0,0,0)');

    // Matériaux
    const mShell = new THREE.MeshPhysicalMaterial({ color: 0xe9e6df, roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18, envMapIntensity: 0.9 });
    const mShade = new THREE.MeshStandardMaterial({ color: 0xc4c0b6, roughness: 0.45, metalness: 0.1, envMapIntensity: 0.8 });
    const mDark = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.45, metalness: 0.65, envMapIntensity: 0.9 });
    const mMetal = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.3, metalness: 1, envMapIntensity: 1 });
    const mGlass = new THREE.MeshPhysicalMaterial({ color: 0x07080a, roughness: 0.06, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.2 });
    const mAcc = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.35, emissive: 0xff5a1f, emissiveIntensity: 0.3 });
    const mEye = new THREE.MeshBasicMaterial({ color: 0x140c08, toneMapped: false });
    const mFlame = new THREE.MeshBasicMaterial({ color: 0xff7a3a, transparent: true, opacity: 0.9, toneMapped: false });

    // Aides de modélisation
    const place = (mesh, x, y, z, parent) => { mesh.position.set(x, y, z); (parent || robot).add(mesh); return mesh; };
    const rrShape = (w, h, rc) => {
        const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
        s.moveTo(x + rc, y);
        s.lineTo(x + w - rc, y); s.quadraticCurveTo(x + w, y, x + w, y + rc);
        s.lineTo(x + w, y + h - rc); s.quadraticCurveTo(x + w, y + h, x + w - rc, y + h);
        s.lineTo(x + rc, y + h); s.quadraticCurveTo(x, y + h, x, y + h - rc);
        s.lineTo(x, y + rc); s.quadraticCurveTo(x, y, x + rc, y);
        return s;
    };
    const rbox = (w, h, d, r, mat, x, y, z, p) => {
        const iw = Math.max(w - 2 * r, 0.04), ih = Math.max(h - 2 * r, 0.04);
        const rc = Math.max(Math.min(r * 0.8, iw / 2 - 0.005, ih / 2 - 0.005), 0.005);
        const g = new THREE.ExtrudeGeometry(rrShape(iw, ih, rc), {
            depth: Math.max(d - 2 * r, 0.04), bevelEnabled: true, bevelThickness: r, bevelSize: r,
            bevelSegments: 5, curveSegments: 6
        });
        g.center();
        return place(new THREE.Mesh(g, mat), x, y, z, p);
    };
    const cyl = (rt, rb, h, mat, x, y, z, p) => place(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 32), mat), x, y, z, p);
    const sph = (r, mat, x, y, z, p) => place(new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), mat), x, y, z, p);
    const cap = (r, len, mat, x, y, z, p) => place(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 8, 20), mat), x, y, z, p);
    const tor = (R, r, mat, x, y, z, p) => place(new THREE.Mesh(new THREE.TorusGeometry(R, r, 14, 56), mat), x, y, z, p);
    const glow = (color, size, parent, x, y, z) => {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        s.scale.set(size, size, 1);
        s.position.set(x, y, z);
        s.raycast = () => {};
        parent.add(s);
        return s;
    };

    const rig = new THREE.Group();
    scene.add(rig);
    const robot = new THREE.Group();
    rig.add(robot);

    /* ----- Torse (forme d'œuf) ----- */
    const profile = [[0.0, -1.15], [0.5, -1.1], [0.95, -0.85], [1.2, -0.35], [1.27, 0.25], [1.1, 0.8], [0.7, 1.12], [0.4, 1.22], [0.0, 1.24]]
        .map(p => new THREE.Vector2(p[0], p[1]));
    const torso = place(new THREE.Mesh(new THREE.LatheGeometry(profile, 48), mShell), 0, 0, 0);
    torso.scale.z = 0.82;
    const belt = tor(1.17, 0.07, mDark, 0, -0.55, 0);
    belt.rotation.x = Math.PI / 2; belt.scale.y = 0.82;
    const collar = tor(0.62, 0.05, mAcc, 0, 1.08, 0);
    collar.rotation.x = Math.PI / 2; collar.scale.y = 0.82;

    // Écran de poitrine animé
    const scr = document.createElement('canvas');
    scr.width = 256; scr.height = 160;
    const sctx = scr.getContext('2d');
    const scrTex = new THREE.CanvasTexture(scr);
    scrTex.colorSpace = THREE.SRGBColorSpace;
    // Baie de maintenance (visible quand la trappe est ouverte) : les fils se réparent pendant le chargement
    const bay = new THREE.Group();
    bay.position.set(0, 0.3, 1.0);
    robot.add(bay);
    rbox(1.5, 0.96, 0.16, 0.06, new THREE.MeshStandardMaterial({ color: 0x191919, roughness: 0.65, metalness: 0.3 }), 0, 0, 0, bay);
    const bayIn = new THREE.Group();
    bayIn.position.z = 0.1;
    bay.add(bayIn);
    // Câbles réalistes : gaine colorée, connecteurs, prises avec voyant ; le bout libre pend puis vient se brancher
    const WN = 6, WYL = [0.3, 0.18, 0.06, -0.06, -0.18, -0.3], WYR = [0.18, 0.3, -0.06, 0.06, -0.3, -0.18];
    const CCOL = [0xff5a1f, 0xe8e4da, 0x3a7bd5, 0xf2c230, 0x3fae6b, 0xd6382c];
    const mBlack = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 });
    const CN = 44, CR = 8, CRAD = 0.026;
    const cableIdx = [];
    for (let k = 0; k < CN; k++) for (let j = 0; j < CR; j++) {
        const a0 = k * CR + j, a1 = k * CR + (j + 1) % CR, b0 = (k + 1) * CR + j, b1 = (k + 1) * CR + (j + 1) % CR;
        cableIdx.push(a0, b0, a1, a1, b0, b1);
    }
    const wires = [];
    for (let i = 0; i < WN; i++) {
        const z = 0.035 + i * 0.012;
        const mat = new THREE.MeshStandardMaterial({ color: CCOL[i], roughness: 0.42, metalness: 0.05, emissive: CCOL[i], emissiveIntensity: 0 });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((CN + 1) * CR * 3), 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((CN + 1) * CR * 3), 3));
        geo.setIndex(cableIdx);
        const tube = place(new THREE.Mesh(geo, mat), 0, 0, 0, bayIn);
        tube.frustumCulled = false;
        tube.raycast = () => {};
        // prise gauche (fixe) et prise droite (récepteur) avec voyant
        rbox(0.14, 0.1, 0.1, 0.025, mDark, -0.66, WYL[i], z, bayIn);
        rbox(0.17, 0.14, 0.12, 0.03, mDark, 0.7, WYR[i], z, bayIn);
        rbox(0.05, 0.075, 0.125, 0.01, mBlack, 0.64, WYR[i], z, bayIn);
        const led = place(new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false })), 0.73, WYR[i] + 0.085, z + 0.04, bayIn);
        // connecteur mobile (tête du câble)
        const conn = new THREE.Group();
        bayIn.add(conn);
        rbox(0.2, 0.11, 0.1, 0.03, mDark, -0.1, 0, 0, conn);
        rbox(0.035, 0.12, 0.11, 0.01, new THREE.MeshStandardMaterial({ color: CCOL[i], roughness: 0.5 }), -0.15, 0, 0, conn);
        [-0.022, 0.022].forEach(py => { const pn = cyl(0.012, 0.012, 0.07, mMetal, 0.02, py, 0, conn); pn.rotation.z = Math.PI / 2; });
        conn.traverse(o => { o.raycast = () => {}; });
        wires.push({ geo, mat, conn, led, z, F: new THREE.Vector3(), th: 0, p: 0, ax: -0.62, ay: WYL[i], bx: 0.62, by: WYR[i], hx: -0.12 + i * 0.12, hy: -0.37 - (i % 2) * 0.045 });
    }
    const wC = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
    const wP = new THREE.Vector3(), wT = new THREE.Vector3(), wS = new THREE.Vector3(), wZ = new THREE.Vector3(0, 0, 1);
    const wsm = x => x * x * (3 - 2 * x);
    const updateCable = (c, t, i) => {
        const p = Math.max(0, Math.min(1, (state.build - (6 + i * 13.5)) / 13.5));
        c.p = p;
        const sw = Math.sin(t * 2.1 + i * 1.3);
        let fx, fy, th, sag;
        const qx = c.bx - 0.3, qy = c.by;
        if (p < 0.14) {
            fx = c.hx + sw * 0.03; fy = c.hy - Math.abs(sw) * 0.01; th = -Math.PI / 2 + sw * 0.25 + (p > 0 ? Math.sin(t * 40) * 0.12 : 0); sag = 0.16;
        } else if (p < 0.72) {
            const u = wsm((p - 0.14) / 0.58);
            fx = c.hx + (qx - c.hx) * u + sw * 0.02 * (1 - u);
            fy = c.hy + (qy - c.hy) * u + Math.sin(u * Math.PI) * 0.16;
            th = -Math.PI / 2 * (1 - u) + Math.sin(u * 5) * 0.08 * (1 - u); sag = 0.16 - 0.1 * u;
        } else {
            const v = wsm(Math.min(1, (p - 0.72) / 0.2));
            fx = qx + (c.bx - qx) * v + Math.sin(v * 18) * 0.012 * (1 - v);
            fy = qy; th = 0; sag = 0.06;
        }
        c.F.set(fx, fy, c.z);
        c.th = th;
        const dx = Math.cos(th), dy = Math.sin(th);
        const ex = fx - dx * 0.2, ey = fy - dy * 0.2;
        const pts = wC.points;
        pts[0].set(c.ax, c.ay, c.z);
        pts[1].set(c.ax + 0.16, c.ay, c.z);
        const x1 = c.ax + 0.16, x2 = ex - dx * 0.12, y1 = c.ay, y2 = ey - dy * 0.12;
        pts[2].set(x1 + (x2 - x1) / 3, y1 + (y2 - y1) / 3 - sag * 0.9, c.z);
        pts[3].set(x1 + (x2 - x1) * 2 / 3, y1 + (y2 - y1) * 2 / 3 - sag * 0.9, c.z);
        pts[4].set(x2, y2, c.z);
        pts[5].set(ex, ey, c.z);
        const pos = c.geo.attributes.position.array, nor = c.geo.attributes.normal.array;
        for (let k = 0; k <= CN; k++) {
            const u2 = k / CN;
            wC.getPoint(u2, wP);
            wC.getTangent(u2, wT).normalize();
            wS.crossVectors(wT, wZ).normalize();
            for (let j = 0; j < CR; j++) {
                const aa = j / CR * Math.PI * 2, ca = Math.cos(aa), sa = Math.sin(aa);
                const nx = wS.x * ca, ny = wS.y * ca, nz = sa;
                const o = (k * CR + j) * 3;
                pos[o] = wP.x + nx * CRAD; pos[o + 1] = wP.y + ny * CRAD; pos[o + 2] = wP.z + nz * CRAD;
                nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
            }
        }
        c.geo.attributes.position.needsUpdate = true;
        c.geo.attributes.normal.needsUpdate = true;
        c.conn.position.set(fx, fy, c.z);
        c.conn.rotation.z = th;
        const plugged = p >= 0.92;
        c.led.material.color.setHex(plugged ? 0x38ff7a : (p > 0 ? 0xffa21a : 0xff2a1a));
        c.led.visible = plugged || p > 0 ? true : Math.sin(t * 6 + i) > -0.3;
        c.mat.emissiveIntensity = p >= 0.9 ? 0.9 * Math.max(0, 1 - (state.build - (6 + i * 13.5) - 12.2) / 6) : 0;
    };

    // Trappe de poitrine (écran) : s'ouvre sur sa charnière gauche
    const door = new THREE.Group();
    door.position.set(-0.78, 0.3, 1.2);
    robot.add(door);
    rbox(1.56, 1.02, 0.18, 0.08, mDark, 0.78, 0, 0, door);
    const screen = place(new THREE.Mesh(new THREE.PlaneGeometry(1.35, 0.8), new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false })), 0.78, 0, 0.1, door);
    const drawScreen = (t, talkK, label) => {
        const W = scr.width, H = scr.height;
        sctx.fillStyle = '#0b0b0b';
        sctx.fillRect(0, 0, W, H);
        sctx.fillStyle = '#ff5a1f';
        sctx.font = '600 20px -apple-system, "Inter", "Helvetica Neue", sans-serif';
        sctx.fillText(label, 12, 28);
        sctx.fillStyle = '#6b6a65';
        sctx.fillRect(12, 40, W - 24, 2);
        sctx.strokeStyle = '#ff5a1f';
        sctx.lineWidth = 3;
        sctx.beginPath();
        for (let x = 0; x <= W; x += 4) {
            const ph = ((x / W) * 2.5 + t * 1.1) % 1;
            const spike = ph < 0.12 ? Math.sin((ph / 0.12) * Math.PI) * -1 : 0;
            const y = H * 0.68 + spike * 44 + Math.sin(x * 0.35 + t * 22) * 14 * talkK;
            if (x === 0) sctx.moveTo(x, y); else sctx.lineTo(x, y);
        }
        sctx.stroke();
        scrTex.needsUpdate = true;
    };

    /* ----- Cou ----- */
    [1.3, 1.43, 1.56].forEach(y => tor(0.36, 0.08, mDark, 0, y, 0).rotation.x = Math.PI / 2);

    /* ----- Tête ----- */
    const head = new THREE.Group();
    head.position.set(0, 2.62, 0);
    robot.add(head);
    rbox(2.6, 1.95, 2.1, 0.5, mShell, 0, 0, 0, head);
    rbox(2.22, 1.2, 0.3, 0.25, mGlass, 0, 0.06, 0.95, head);
    for (let i = 0; i < 3; i++) rbox(0.6 - i * 0.08, 0.06, 0.06, 0.02, mDark, 0, -0.74 - i * 0.0, 1.04 - i * 0.0, head).position.y = -0.7 - i * 0.1;

    const eyes = new THREE.Group();
    eyes.position.set(0, 0.06, 1.12);
    head.add(eyes);
    const eyeGlows = [];
    [-0.5, 0.5].forEach(x => {
        const e = place(new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 6, 14), mEye), x, 0, 0, eyes);
        eyeGlows.push(glow(0xff5a1f, 0.9, eyes, x, 0, 0.05));
    });

    [-1, 1].forEach(s => {
        const ear = cyl(0.5, 0.5, 0.36, mDark, s * 1.4, 0, 0, head);
        ear.rotation.z = Math.PI / 2;
        const lamp = cyl(0.3, 0.3, 0.4, mAcc, s * 1.4, 0, 0, head);
        lamp.rotation.z = Math.PI / 2;
        const rim = tor(0.5, 0.04, mMetal, s * 1.58, 0, 0, head);
        rim.rotation.y = Math.PI / 2;
    });

    cyl(0.05, 0.05, 0.6, mMetal, 0, 1.28, 0, head);
    [1.08, 1.2, 1.32].forEach(y => tor(0.09, 0.02, mMetal, 0, y, 0, head).rotation.x = Math.PI / 2);
    const bulb = sph(0.17, mAcc, 0, 1.65, 0, head);
    const bulbGlow = glow(0xff5a1f, 0.8, head, 0, 1.65, 0);

    /* ----- Bras et mains ----- */
    const fingers = [];
    function makeArm(side) {
        const sh = new THREE.Group();
        sh.position.set(side * 1.55, 0.62, 0);
        robot.add(sh);
        sph(0.42, mShade, 0, 0, 0, sh);
        const jr = tor(0.4, 0.05, mDark, side * 0.12, 0, 0, sh);
        jr.rotation.y = Math.PI / 2;
        cap(0.2, 0.78, mShell, 0, -0.7, 0, sh);
        const el = new THREE.Group();
        el.position.set(0, -1.35, 0);
        sh.add(el);
        sph(0.27, mDark, 0, 0, 0, el);
        cap(0.18, 0.7, mShell, 0, -0.62, 0, el);
        tor(0.19, 0.04, mDark, 0, -1.0, 0, el).rotation.x = Math.PI / 2;
        // main : paume + 3 doigts + pouce
        const hand = new THREE.Group();
        hand.position.set(0, -1.28, 0);
        el.add(hand);
        const palm = sph(0.28, mShade, 0, 0, 0, hand);
        palm.scale.set(1.05, 0.9, 0.7);
        [-0.14, 0, 0.14].forEach((fx, i) => {
            const g = new THREE.Group();
            g.position.set(fx, -0.2, 0);
            hand.add(g);
            cap(0.055, 0.2, mDark, 0, -0.14, 0, g);
            g.rotation.z = fx * 1.3;
            fingers.push({ g, base: fx * 1.3, i });
        });
        const thumb = new THREE.Group();
        thumb.position.set(side * 0.24, -0.04, 0.02);
        hand.add(thumb);
        cap(0.055, 0.16, mDark, 0, -0.1, 0, thumb);
        thumb.rotation.z = side * -0.7;
        return { sh, el, hand };
    }
    const armR = makeArm(1);
    const armL = makeArm(-1);

    /* ----- Base en lévitation ----- */
    const podProfile = [[0.2, -2.95], [0.45, -2.75], [0.8, -2.3], [0.95, -1.7], [0.9, -1.3], [0.6, -1.15]].map(p => new THREE.Vector2(p[0], p[1]));
    place(new THREE.Mesh(new THREE.LatheGeometry(podProfile, 40), mDark), 0, 0, 0);
    tor(0.96, 0.06, mAcc, 0, -1.55, 0).rotation.x = Math.PI / 2;
    tor(0.7, 0.04, mMetal, 0, -2.2, 0).rotation.x = Math.PI / 2;
    const flame = place(new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.8, 20), mFlame), 0, -3.3, 0);
    flame.rotation.x = Math.PI;
    flame.raycast = () => {};
    const flameGlow = glow(0xff7a3a, 2.2, robot, 0, -3.2, 0);
    flameGlow.material.opacity = 0.5;

    robot.position.y = -0.6;

    // Ombre au sol
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -4.6;
    shadow.raycast = () => {};
    rig.add(shadow);

    const SP = 150;
    const sPos = new Float32Array(SP * 3).fill(-999);
    const sVel = new Float32Array(SP * 3);
    const sLife = new Float32Array(SP);
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    const sparks = new THREE.Points(sGeo, new THREE.PointsMaterial({ size: 0.24, map: glowTex, color: 0xff6a2a, transparent: true, depthWrite: false, toneMapped: false }));
    sparks.frustumCulled = false;
    sparks.raycast = () => {};
    scene.add(sparks);

    // ---- Globe en points (continents), orbite du robot et atterrissage sur la France / l'Espagne ----
    const TARGETS = { fr: { lat: 46.6, lon: 2.5 }, es: { lat: 40.0, lon: -3.7 } };
    const G = 4.6;
    const oP = new THREE.Vector3();
    const ll = (lat, lon, r) => {
        const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
        return new THREE.Vector3(r * Math.cos(a) * Math.sin(b), r * Math.sin(a), r * Math.cos(a) * Math.cos(b));
    };
    const globeRoot = new THREE.Group();
    scene.add(globeRoot);
    const globe = new THREE.Group();
    globeRoot.add(globe);
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(G * 0.992, 48, 32), new THREE.MeshBasicMaterial({ color: 0x1f1f1d })));
    const dotC = document.createElement('canvas');
    dotC.width = dotC.height = 32;
    const dctx = dotC.getContext('2d');
    dctx.fillStyle = '#fff'; dctx.beginPath(); dctx.arc(16, 16, 14, 0, 7); dctx.fill();
    const dotTex = new THREE.CanvasTexture(dotC);
    const land = [];
    const L = window.LAND;
    if (L) {
        const bin = atob(L.b64);
        const isLand = (lat, lon) => {
            const x = Math.min(L.w - 1, Math.floor((lon + 180) / 360 * L.w)), y = Math.min(L.h - 1, Math.floor((90 - lat) / 180 * L.h));
            const idx = y * L.w + x;
            return (bin.charCodeAt(idx >> 3) >> (7 - (idx & 7))) & 1;
        };
        for (let lat = -87.5; lat <= 87.5; lat += 2.5) {
            const n = Math.max(1, Math.round(144 * Math.cos(lat * Math.PI / 180)));
            for (let k = 0; k < n; k++) {
                const lon = -180 + (k + 0.5) * 360 / n;
                if (isLand(lat, lon)) { const v = ll(lat, lon, G); land.push(v.x, v.y, v.z); }
            }
        }
    }
    const dotGeo = new THREE.BufferGeometry();
    dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(land), 3));
    const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ size: 0.13, map: dotTex, color: 0xece9e0, transparent: true, alphaTest: 0.4, depthWrite: false, toneMapped: false }));
    dots.raycast = () => {};
    globe.add(dots);
    const pins = Object.keys(TARGETS).map(id => {
        const p = ll(TARGETS[id].lat, TARGETS[id].lon, G * 1.004);
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff5a1f, toneMapped: false }));
        mesh.position.copy(p);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff5a1f, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
        sprite.position.copy(p);
        sprite.scale.setScalar(0.7);
        mesh.raycast = sprite.raycast = () => {};
        globe.add(mesh, sprite);
        return { id, mesh, sprite };
    });
    // Trajectoire du robot (anneau orange fin)
    const ringRoot = new THREE.Group();
    scene.add(ringRoot);
    const ringMat = new THREE.LineBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0 });
    const ringPts = [];
    for (let i = 0; i < 160; i++) {
        const a = i / 160 * Math.PI * 2, I = 0.38;
        ringPts.push(new THREE.Vector3(6.8 * Math.cos(a), 6.8 * Math.sin(a) * Math.sin(I), 6.8 * Math.sin(a) * Math.cos(I)));
    }
    ringRoot.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), ringMat));
    globeRoot.visible = ringRoot.visible = false;
    const fixGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    fixGlow.visible = false;
    fixGlow.raycast = () => {};
    scene.add(fixGlow);

    playOrbit = (to, o) => {
        o = o || {};
        const rad = d => d * Math.PI / 180;
        const tg = TARGETS[to], fr = TARGETS[o.from] || { lat: 18, lon: -35 };
        cin.on = true; cin.target = to; cin.land = 0; cin.globe = 0; cin.k = 0;
        cin.ang = -Math.PI * 1.5; cin.R = 6.8; cin.sc = 0.5;
        cin.rotX = rad(fr.lat * 0.7); cin.rotY = -rad(fr.lon);
        if (o.atStart) o.atStart();
        const spin = (to === 'es' ? 1 : -1) * Math.PI * 2;
        const tl = gsap.timeline({ onComplete: () => { cin.on = false; cin.k = 0; cin.land = 0; cin.globe = 0; if (o.onDone) o.onDone(); } });
        tl.to(state, { door: 0, duration: 0.35, ease: 'power2.inOut' }, 0)
            .to(state, { work: 0, eye: 1, duration: 0.5, ease: 'power2.inOut' }, 0.45)
            .to(cin, { k: 1, duration: 0.9, ease: 'power2.inOut' }, 0.1)
            .to(cin, { globe: 1, duration: 0.9, ease: 'back.out(1.3)' }, 0.25)
            .to(cin, { ang: Math.PI / 2, duration: 1.6, ease: 'power1.inOut' }, 0.4)
            .to(cin, { rotY: -rad(tg.lon) + spin, rotX: rad(tg.lat), duration: 2.0, ease: 'power2.inOut' }, 0.4)
            .to(cin, { land: 1, duration: 0.55, ease: 'power2.inOut' }, 2.0)
            .add(() => { if (o.onMid) o.onMid(); }, 2.5)
            .add(() => { if (o.atEnd) o.atEnd(); }, 2.85)
            .to(cin, { globe: 0, duration: 0.5, ease: 'power2.in' }, 2.9)
            .to(cin, { k: 0, duration: 0.9, ease: 'power3.inOut' }, 2.85);
        return tl;
    };

    let miniK = 1, wasMini = false, sideSm = 1, pinK = 0;

    addEventListener('resize', () => {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
    });

    /* ---------- Boucle de rendu ---------- */
    const clock = new THREE.Clock();
    const lerp = (a, b, k) => a + (b - a) * k;
    const tmp = new THREE.Vector3(), vA = new THREE.Vector3(), vB = new THREE.Vector3();
    
    const ray = new THREE.Raycaster();
    const vel = new THREE.Vector2(), prevPos = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    let sp = 0, tourK = 0, frame = 0, nextBlink = 2, blinkUntil = 0, talkK = 0, happy = 0, sparkAcc = 0;

    const tick = () => {
        requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;
        frame++;

        const max = document.documentElement.scrollHeight - innerHeight;
        const target = max > 0 ? scrollY / max : 0;
        sp += (target - sp) * Math.min(1, dt * 3);
        mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 4);
        mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 4);

        // Placement : grand à droite dans l'accueil, puis dans les marges (côté qui alterne, avec téléportation).
        // Pendant le scroll, ou si la marge est trop étroite, il devient un mini-robot qui ne cache plus le texte.
        const halfH = Math.tan(THREE.MathUtils.degToRad(17.5)) * 24;
        const halfW = halfH * camera.aspect;
        tourK += ((tourActive ? 1 : 0) - tourK) * Math.min(1, dt * 3);
        const hero = Math.max(0, 1 - sp * 6);
        const upp = (2 * halfH) / innerHeight;
        const marginW = Math.max(0, (innerWidth - Math.min(1200, innerWidth) * 0.9) / 2) * upp;
        const fullS = Math.min(0.6, (marginW * 0.92) / 4.5);
        const roomy = !isMobile && fullS >= 0.4;
        const scrolling = performance.now() - lastScrollT < 450;
        const wantMini = robotMini || !roomy || scrolling;
        miniK += ((wantMini ? 1 : 0) - miniK) * Math.min(1, dt * (wantMini ? 9 : 3.5));
        const miniS = isMobile ? 0.22 : 0.3;
        const secScale = lerp(roomy ? fullS : miniS, miniS, miniK);
        const dockX = (isMobile ? 1 : sideSm) * (halfW - Math.max(marginW / 2, 0.8));
        const dockY = isMobile ? halfH * 0.74 : lerp(roomy ? 0.3 : halfH * 0.42, halfH * 0.42, miniK);
        const heroX = isMobile ? 0 : halfW * 0.45, heroY = isMobile ? 4.9 : 0.3;
        const scale = lerp(lerp(secScale, isMobile ? 0.36 : 0.88, hero), isMobile ? 0.3 : 0.42, tourK);
        const nx = lerp(lerp(dockX, heroX, hero), halfW - (isMobile ? 1.0 : 1.9), tourK);
        const ny = lerp(lerp(dockY, heroY, hero), halfH * (isMobile ? 0.5 : 0.36), tourK);
        const nry = -0.45 * Math.tanh(nx / 3);
        if (miniK > 0.8) wasMini = true;
        if (wasMini && miniK < 0.5) {
            wasMini = false;
            if (roomy && tourK < 0.1 && state.work < 0.1 && !chatOpen && Date.now() > waveCool) { waveCool = Date.now() + 8000; doWave(null, 1); }
        }

        // Déplacement manuel : le robot suit la souris avec un peu d'inertie
        if (drag.justPinned) { pinK = 1; drag.justPinned = false; }
        if (drag.pinned) {
            drag.x += (drag.tx - drag.x) * Math.min(1, dt * 10);
            drag.y += (drag.ty - drag.y) * Math.min(1, dt * 10);
        }
        pinK += ((drag.pinned ? 1 : 0) - pinK) * Math.min(1, dt * (drag.pinned ? 20 : 4));
        sideSm += (side - sideSm) * Math.min(1, dt * 3.2);
        const dk = (1 - state.work) * (1 - tourK);

        // Mode réparation (chargement) : le robot est au centre, trappe de poitrine ouverte
        const wk = state.work;
        const stacked = camera.aspect < 1.15;
        const wx = 0;
        const wy = (stacked ? 0.9 : -0.1) - (1 - state.intro) * 0.9;
        const ws = (stacked ? 0.95 : Math.min(1.3, halfH / 5.9)) * (0.86 + 0.14 * state.intro);
        const wry = 0.12;
        const x = Math.max(-halfW + 0.7, Math.min(halfW - 0.7, lerp(lerp(nx, wx, wk), drag.x, pinK * dk)));
        const y = Math.max(-halfH + 1.2, Math.min(halfH - 1.2, lerp(lerp(ny, wy, wk), drag.y, pinK * dk)));
        rig.position.set(x, y + state.drop * 16, 0);

        // Cinématique orbite : le globe, la trajectoire du robot et son atterrissage
        const cs = Math.min(1, halfW / 8.8, halfH / 7);
        const ck = cin.k;
        globeRoot.visible = ringRoot.visible = cin.globe > 0.003;
        if (globeRoot.visible) {
            globeRoot.position.set(0, -0.3 * cs, -3 * cs);
            ringRoot.position.copy(globeRoot.position);
            ringRoot.scale.setScalar(cs);
            globeRoot.scale.setScalar(Math.max(0.0001, cs * cin.globe * (1 + 0.45 * cin.land)));
            globe.rotation.set(cin.rotX, cin.rotY, 0);
            ringMat.opacity = 0.5 * cin.globe * (1 - cin.land);
            globeRoot.updateMatrixWorld(true);
            pins.forEach(p => {
                const sel = p.id === cin.target && cin.land > 0.5;
                p.sprite.scale.setScalar((sel ? 1.3 : 0.7) + 0.18 * Math.sin(t * 5 + (sel ? 1 : 0)) * (sel ? 2 : 1));
            });
        }
        let oYaw = 0, oSc = 0.4;
        if (ck > 0.001) {
            const R = cin.R * cs, ph = cin.ang, I = 0.38;
            oP.set(R * Math.cos(ph), R * Math.sin(ph) * Math.sin(I), R * Math.sin(ph) * Math.cos(I)).add(globeRoot.position);
            oYaw = Math.atan2(-Math.sin(ph), Math.cos(ph) * Math.cos(I));
            oSc = cin.sc * cs;
            if (cin.land > 0.001) {
                const pin = pins.find(p => p.id === cin.target);
                vA.copy(pin.mesh.position);
                globe.localToWorld(vA);
                vA.z += 0.5 * cs;
                oP.lerp(vA, cin.land);
                oYaw = oYaw * (1 - cin.land);
                oSc = lerp(oSc, cin.landSc * cs, cin.land);
            }
            rig.position.x = lerp(rig.position.x, oP.x, ck);
            rig.position.y = lerp(rig.position.y, oP.y + Math.sin(ck * Math.PI) * 1.4 * cs, ck);
            rig.position.z = oP.z * ck;
        }

        // Vitesse du robot -> il penche dans le sens du déplacement et le réacteur réagit
        if (dt > 0) {
            vel.x += ((rig.position.x - prevPos.x) / dt - vel.x) * Math.min(1, dt * 7);
            vel.y += ((rig.position.y - prevPos.y) / dt - vel.y) * Math.min(1, dt * 7);
        }
        robotPos.x = rig.position.x; robotPos.y = rig.position.y;
        prevPos.copy(rig.position);
        if (state.drop > 0.05) { vel.x = vel.y = 0; }
        const vcl = (v, m) => Math.max(-m, Math.min(m, v));
        robot.rotation.z += (vcl(-vel.x * 0.07, 0.5) - robot.rotation.z) * Math.min(1, dt * 7);
        robot.rotation.x += (vcl(vel.y * 0.035, 0.3) - robot.rotation.x) * Math.min(1, dt * 7);
        const speedK = Math.min(1.6, Math.hypot(vel.x, vel.y) * 0.25);
        rig.scale.setScalar(lerp(lerp(scale, ws, wk), oSc, ck));
        rig.rotation.y = lerp(lerp(nry, wry, wk), oYaw, ck);
        door.rotation.y = -1.75 * state.door;

        // États d'animation
        const talking = performance.now() < talkUntil;
        talkK += ((talking ? 1 : 0) - talkK) * Math.min(1, dt * 10);
        happy += ((hoverRobot || state.wave > 0.5 ? 1 : 0) - happy) * Math.min(1, dt * 8);

        // Flottement
        const fl = Math.sin(t * 1.3);
        robot.position.y = -0.6 + fl * 0.22 + Math.sin(t * 9) * 0.04 * talkK;
        shadow.scale.setScalar(1 - fl * 0.06);

        // Tête et yeux
        head.rotation.y = lerp(mouse.sx * 0.55 - rig.rotation.y * 0.5, Math.sin(t * 1.3) * 0.08, wk);
        head.rotation.x = lerp(mouse.sy * 0.3, 0.4 + Math.sin(t * 3) * 0.02, wk) + Math.sin(t * 10) * 0.05 * talkK;
        eyes.position.x = mouse.sx * 0.12;
        eyes.position.y = 0.06 - mouse.sy * 0.08;
        if (t > nextBlink) { blinkUntil = t + 0.14; nextBlink = t + 2.5 + Math.random() * 3; }
        eyes.scale.y = t < blinkUntil ? 0.08 : 1 - 0.35 * happy;
        const e = Math.max(0, Math.min(1, state.eye * (1 + 0.15 * Math.sin(t * 3) + 0.2 * Math.sin(t * 14) * talkK)));
        mEye.color.setRGB(0.08 + 0.92 * e, 0.05 + 0.4 * e, 0.04 + 0.11 * e);
        eyeGlows.forEach(s => { s.material.opacity = 0.55 * e; });

        // Antenne, flamme, écran
        const pulse = 1 + 0.18 * Math.sin(t * 4) + 0.3 * talkK;
        bulb.scale.setScalar(pulse);
        bulbGlow.material.opacity = (0.35 + 0.2 * Math.sin(t * 4)) * state.eye;
        const thrust = 1 + Math.max(-0.35, Math.min(0.9, vel.y * 0.12)) + speedK * 0.35;
        flame.scale.set(1 - speedK * 0.12, (0.8 + Math.random() * (0.35 + speedK * 0.3)) * thrust, 1);
        flame.position.x = lerp(flame.position.x, -vel.x * 0.05, Math.min(1, dt * 8));
        flameGlow.material.opacity = 0.45 + Math.random() * 0.15 + speedK * 0.25;
        flameGlow.scale.setScalar(2.2 * (1 + speedK * 0.45));
        mAcc.emissiveIntensity = 0.25 + 0.2 * Math.sin(t * 3);
        if (frame % 2 === 0) drawScreen(t, talkK, 'AB-01');

        // Bras : repos + salut ; pendant le chargement ils s'écartent pour laisser la trappe ouverte
        const w = state.wave;
        const rz = lerp(0.12 + Math.sin(t * 1.3) * 0.04, 2.5, w);
        const rez = lerp(-0.2, Math.sin(t * 9) * 0.55, w);
        armR.sh.rotation.z = lerp(rz, 0.5 + Math.sin(t * 2) * 0.03, wk);
        armR.sh.rotation.x = lerp(0, -0.12, wk);
        armR.el.rotation.z = lerp(rez, -0.35, wk);
        armR.el.rotation.x = 0;
        armL.sh.rotation.z = lerp(-(0.12 + Math.sin(t * 1.3 + 1) * 0.04), -0.5 - Math.sin(t * 2 + 1) * 0.03, wk);
        armL.sh.rotation.x = lerp(0, -0.12, wk);
        armL.el.rotation.z = lerp(0.2, 0.35, wk);
        armL.el.rotation.x = 0;
        fingers.forEach(f => { f.g.rotation.z = f.base + Math.sin(t * 12 + f.i) * 0.22 * w; });

        // Survol du robot (raycast)
        if (frame % 3 === 0 && state.drop < 0.25 && state.work < 0.2 && cin.k < 0.01 && pointer.x > -900 && !drag.down) {
            ndc.set((pointer.x / innerWidth) * 2 - 1, -(pointer.y / innerHeight) * 2 + 1);
            ray.setFromCamera(ndc, camera);
            const hit = ray.intersectObject(rig, true).length > 0;
            const t0 = pointer.target;
            const blocked = t0 && t0.closest && t0.closest('a, button, input, textarea, label, summary, .box, header, #chat, #tour, #bubble');
            const over = hit && !blocked;
            if (over !== hoverRobot) {
                hoverRobot = over;
                updateCursor();
                if (over) onRobotHover();
            }
        }

        // Réparation : les fils se rebranchent un à un, des étincelles jaillissent au point de soudure
        scene.updateMatrixWorld(true);
        let fixing = -1;
        if (state.door > 0.02) wires.forEach((wr, i) => {
            updateCable(wr, t, i);
            if (wr.p > 0.04 && wr.p < 0.93) fixing = i;
        });
        const fixOn = wk > 0.3 && fixing >= 0 && state.door > 0.8 && wires[fixing].p > 0.14;
        fixGlow.visible = fixOn;
        if (fixOn) {
            const fw = wires[fixing];
            bayIn.localToWorld(vB.copy(fw.F));
            fixGlow.position.copy(vB);
            fixGlow.position.z += 0.1;
            const gs2 = (0.5 + Math.random() * 0.35) * rig.scale.x;
            fixGlow.scale.set(gs2, gs2, 1);
            sparkAcc += dt * 40;
            while (sparkAcc > 1) {
                sparkAcc -= 1;
                for (let k = 0; k < SP; k++) {
                    if (sLife[k] <= 0) {
                        sPos[k * 3] = vB.x; sPos[k * 3 + 1] = vB.y; sPos[k * 3 + 2] = vB.z + 0.15;
                        sVel[k * 3] = (Math.random() - 0.5) * 3;
                        sVel[k * 3 + 1] = Math.random() * 3 + 0.5;
                        sVel[k * 3 + 2] = 0.5 + Math.random() * 2;
                        sLife[k] = 0.3 + Math.random() * 0.35;
                        break;
                    }
                }
            }
        }
        for (let k = 0; k < SP; k++) {
            if (sLife[k] > 0) {
                sLife[k] -= dt;
                sVel[k * 3 + 1] -= 9 * dt;
                sPos[k * 3] += sVel[k * 3] * dt;
                sPos[k * 3 + 1] += sVel[k * 3 + 1] * dt;
                sPos[k * 3 + 2] += sVel[k * 3 + 2] * dt;
                if (sLife[k] <= 0) { sPos[k * 3] = sPos[k * 3 + 1] = sPos[k * 3 + 2] = -999; }
            }
        }
        sGeo.attributes.position.needsUpdate = true;

        renderer.render(scene, camera);

        // Bulle de dialogue au-dessus de la tête
        head.getWorldPosition(tmp);
        tmp.y += 3.0 * rig.scale.x;
        tmp.project(camera);
        const bw = bubble.classList.contains('show') ? bubble.offsetWidth : 0;
        const bx = Math.max(bw / 2 + 8, Math.min(innerWidth - bw / 2 - 8, (tmp.x * 0.5 + 0.5) * innerWidth));
        bubble.style.transform = `translate(${bx}px, ${Math.max(60, (-tmp.y * 0.5 + 0.5) * innerHeight)}px) translate(-50%, -100%)`;
    };
    tick();
}

/* ===================== Souris, curseur, survol ===================== */
const cursor = $('#cursor');
function updateCursor() { cursor.classList.toggle('big', overInteractive || hoverRobot); }

addEventListener('pointermove', e => {
    mouse.x = (e.clientX / innerWidth - 0.5) * 2;
    mouse.y = (e.clientY / innerHeight - 0.5) * 2;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.target = e.target;
});
document.addEventListener('pointerleave', () => { pointer.x = -999; hoverRobot = false; updateCursor(); });

if (hasGsap && canHover) {
    gsap.set(cursor, { xPercent: -50, yPercent: -50 });
    const cx = gsap.quickTo(cursor, 'x', { duration: 0.2, ease: 'power3' });
    const cy = gsap.quickTo(cursor, 'y', { duration: 0.2, ease: 'power3' });
    addEventListener('pointermove', e => { cx(e.clientX); cy(e.clientY); cursor.classList.add('on'); });
    document.addEventListener('mouseover', e => {
        overInteractive = !!e.target.closest('a, button, summary, .box, input, textarea, label');
        updateCursor();
    });
}

// Le robot dit coucou quand on le survole ; un clic ouvre la discussion
let waveCool = 0;
let waving = false;
function doWave(msg, hold) {
    if (!hasGsap || waving) return;
    waving = true;
    gsap.timeline({ onComplete: () => { waving = false; } })
        .to(state, { wave: 1, duration: 0.5, ease: 'power2.out' })
        .to(state, { wave: 0, duration: 0.6, ease: 'power2.inOut' }, '+=' + (hold || 2.4));
    if (msg) speak(msg, 3000);
}
function onRobotHover() {
    if (Date.now() < waveCool) return;
    waveCool = Date.now() + 5000;
    doWave(UI.hi, 1.5);
}
addEventListener('click', () => { if (hoverRobot && !chatOpen && !tourActive && !drag.moved && !cin.on) openChat(); });

// Glisser-déposer : on peut déplacer le robot s'il gêne la lecture
const unitsPerPx = () => (2 * Math.tan(THREE.MathUtils.degToRad(17.5)) * 24) / innerHeight;
document.addEventListener('mousedown', e => { if (hoverRobot && !tourActive) e.preventDefault(); });
addEventListener('pointerdown', e => {
    drag.moved = false;
    if (e.button !== 0 || !hoverRobot || tourActive || e.pointerType === 'touch' || !hasThree) return;
    drag.down = true; drag.active = false;
    drag.sx = e.clientX; drag.sy = e.clientY; drag.bx = robotPos.x; drag.by = robotPos.y;
});
addEventListener('pointermove', e => {
    if (!drag.down) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.active && Math.hypot(dx, dy) > 6) {
        drag.active = true; drag.moved = true;
        document.body.classList.add('dragging');
        drag.x = drag.tx = drag.bx; drag.y = drag.ty = drag.by; drag.pinned = true; drag.justPinned = true;
        if (!drag.said) { drag.said = true; speak(UI.grab, 1400); }
    }
    if (drag.active) {
        const u = unitsPerPx();
        drag.tx = drag.bx + dx * u;
        drag.ty = drag.by - dy * u;
    }
});
const endDrag = () => {
    if (!drag.down) return;
    drag.down = false;
    if (drag.active) { drag.active = false; document.body.classList.remove('dragging'); speak(UI.free, 1800); updMode(); }
};
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);

/* ===================== Voix (synthèse vocale du navigateur) ===================== */
let bestVoices = {};
function pickVoice(lang) {
    if (!('speechSynthesis' in window)) return null;
    const vs = speechSynthesis.getVoices();
    if (!vs.length) return null;
    const pre = lang.slice(0, 2).toLowerCase();
    let best = null, bs = -1;
    vs.forEach(v => {
        if (!v.lang || v.lang.slice(0, 2).toLowerCase() !== pre) return;
        let sc = v.lang.toLowerCase() === lang.toLowerCase() ? 20 : 0;
        const n = v.name;
        if (/natural|neural/i.test(n)) sc += 120;
        if (/online/i.test(n)) sc += 40;
        if (/google/i.test(n)) sc += 70;
        if (/premium|enhanced|améliorée|mejorada/i.test(n)) sc += 60;
        if (/siri/i.test(n)) sc += 50;
        if (/amélie|amelie|thomas|audrey|aurélie|monica|mónica|paulina|jorge|marisol|eddy|flo|reed/i.test(n)) sc += 25;
        if (/compact|espeak|robot/i.test(n)) sc -= 80;
        if (sc > bs) { bs = sc; best = v; }
    });
    return best;
}
if ('speechSynthesis' in window) speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', () => { bestVoices = {}; });
function say(text, onend) {
    if (!voiceOn || !('speechSynthesis' in window)) { return false; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = UI.speech; u.rate = 0.98; u.pitch = 1;
    const v = bestVoices[UI.speech] || (bestVoices[UI.speech] = pickVoice(UI.speech));
    if (v) { u.voice = v; u.lang = v.lang; }
    if (onend) u.onend = onend;
    speechSynthesis.speak(u);
    return true;
}
function setVoice(on) {
    voiceOn = on;
    if (!on && 'speechSynthesis' in window) speechSynthesis.cancel();
    $('#chat-voice').textContent = UI.voice + (on ? UI.on : UI.off);
    $('#tour-voice').textContent = UI.voice + (on ? UI.on : UI.off);
}
$('#chat-voice').addEventListener('click', () => setVoice(!voiceOn));
$('#tour-voice').addEventListener('click', () => setVoice(!voiceOn));

/* ===================== Machine à écrire ===================== */
function typeInto(el, text, onTick, done) {
    const tk = {};
    el._tk = tk;
    el.textContent = '';
    let i = 0;
    (function step() {
        if (el._tk !== tk) return;
        i = Math.min(text.length, i + 2);
        el.textContent = text.slice(0, i);
        if (onTick) onTick();
        if (i < text.length) setTimeout(step, 16);
        else if (done) done();
    })();
}

/* ===================== Discussion ===================== */
const chat = $('#chat'), log = $('#chat-log'), chipsBox = $('#chat-chips'), launch = $('#chat-launch');
let greeted = false;

function findAnswer(q) {
    const text = ' ' + norm(q) + ' ';
    let best = null, bestScore = 0;
    KB.forEach(entry => {
        let score = 0;
        entry.k.forEach(k => {
            const nk = norm(k);
            const hit = nk.length <= 3 ? text.includes(' ' + nk + ' ') : text.includes(nk);
            if (hit) score += nk.length >= 6 ? 2 : 1;
        });
        if (score > bestScore) { bestScore = score; best = entry; }
    });
    return best;
}

function addMsg(who, text, go) {
    const d = document.createElement('div');
    d.className = 'msg ' + who;
    log.appendChild(d);
    const scroll = () => { log.scrollTop = log.scrollHeight; };
    if (who === 'bot') {
        typeInto(d, text, scroll, () => {
            if (go) {
                const a = document.createElement('a');
                a.href = '#' + go;
                a.textContent = UI.seeSection;
                d.appendChild(a);
            }
            scroll();
        });
    } else {
        d.textContent = text;
    }
    scroll();
    return d;
}

function ask(q) {
    q = q.trim();
    if (!q) return;
    addMsg('me', q);
    const wait = document.createElement('div');
    wait.className = 'msg bot typing';
    wait.textContent = '…';
    log.appendChild(wait);
    log.scrollTop = log.scrollHeight;
    setTimeout(() => {
        wait.remove();
        const entry = findAnswer(q);
        const answer = entry ? entry.a : FALLBACK;
        addMsg('bot', answer, entry && entry.go);
        robotTalk(Math.min(6000, answer.length * 40));
        say(answer);
        if (entry && entry.act === 'tour') setTimeout(startTour, 1800);
    }, 420);
}

function renderChips() {
    chipsBox.innerHTML = '';
    CHIPS.forEach(c => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = c;
        b.addEventListener('click', () => ask(c));
        chipsBox.appendChild(b);
    });
}

function openChat() {
    if (tourActive) stopTour(true);
    chat.hidden = false;
    chatOpen = true;
    launch.style.display = 'none';
    bubble.classList.remove('show');
    if (!greeted) {
        greeted = true;
        renderChips();
        addMsg('bot', UI.chatHello);
        robotTalk(2500);
    }
}
function closeChat() {
    chat.hidden = true;
    chatOpen = false;
    launch.style.display = '';
    if ('speechSynthesis' in window) speechSynthesis.cancel();
}
launch.addEventListener('click', openChat);
$('#chat-close').addEventListener('click', closeChat);
log.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (a && matchMedia('(max-width: 860px)').matches) closeChat();
});

/* ===================== Visite guidée ===================== */
const tour = $('#tour'), tourText = $('#tour-text'), tourStepEl = $('#tour-step');
let tourIdx = 0, tourTimer = null, tourAuto = true, tourReady = false;

function scrollToSection(id) {
    if (id === 'accueil') window.scrollTo({ top: 0, behavior: 'smooth' });
    else $('#' + id).scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function scheduleNext(textLen) {
    clearTimeout(tourTimer);
    if (!tourAuto || tourIdx >= STEPS.length - 1) return;
    tourTimer = setTimeout(() => showStep(tourIdx + 1), Math.max(3500, textLen * 35));
}
function showStep(i) {
    clearTimeout(tourTimer);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    tourIdx = i;
    tourReady = false;
    const step = STEPS[i];
    scrollToSection(step.id);
    tourStepEl.textContent = (i + 1) + '/' + STEPS.length;
    $('#tour-prev').disabled = i === 0;
    $('#tour-next').textContent = i === STEPS.length - 1 ? UI.finish : UI.next;
    robotTalk(step.text.length * 45);
    const spoken = say(step.text, () => { if (tourAuto && tourActive && tourIdx === i) { clearTimeout(tourTimer); tourTimer = setTimeout(() => { if (tourIdx === i && tourIdx < STEPS.length - 1) showStep(i + 1); }, 900); } });
    typeInto(tourText, step.text, null, () => {
        tourReady = true;
        if (!spoken) scheduleNext(step.text.length);
        if (i === STEPS.length - 1) doWave(null, 2);
    });
}
function startTour() {
    if (chatOpen) closeChat();
    tourActive = true;
    bubble.classList.remove('show');
    tour.hidden = false;
    document.body.classList.add('tour-on');
    showStep(0);
}
function stopTour(silent) {
    clearTimeout(tourTimer);
    tourActive = false;
    tour.hidden = true;
    document.body.classList.remove('tour-on');
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (!silent) doWave(UI.thanks, 1.6);
}
$('#tour-start').addEventListener('click', startTour);
$('#tour-stop').addEventListener('click', () => stopTour());
$('#tour-prev').addEventListener('click', () => { if (tourIdx > 0) showStep(tourIdx - 1); });
$('#tour-next').addEventListener('click', () => { if (tourIdx < STEPS.length - 1) showStep(tourIdx + 1); else stopTour(); });
$('#tour-auto').addEventListener('click', () => {
    tourAuto = !tourAuto;
    $('#tour-auto').textContent = UI.auto + (tourAuto ? UI.on : UI.off);
    if (tourAuto && tourReady) scheduleNext(STEPS[tourIdx].text.length); else clearTimeout(tourTimer);
});

addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (chatOpen) closeChat(); if (tourActive) stopTour(true); }
});

/* ===================== Progression, menu, commentaires du robot ===================== */
const progress = $('#progress');
addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
}, { passive: true });

$('#year').textContent = new Date().getFullYear();

const toggle = $('.menu-toggle');
const menu = $('#menu');
toggle.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
});
menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => menu.classList.remove('open')));

const SIDES = { apropos: 1, competences: -1, projets: 1, veille: -1, certifications: 1, cv: -1, contact: 1 };
let lastSection = '';
const spy = new IntersectionObserver(entries => {
    entries.forEach(en => {
        if (!en.isIntersecting) return;
        const id = en.target.id;
        menu.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
        if (id !== lastSection && UI.sayings[id] && renderer && !root.classList.contains('loading') && !tourActive && !chatOpen) {
            speak(UI.sayings[id], 2800);
        }
        lastSection = id;
        if (SIDES[id]) { sideWant = SIDES[id]; side = sideWant; }
    });
}, { rootMargin: '-45% 0px -50% 0px' });
document.querySelectorAll('main section').forEach(s => spy.observe(s));

$('#replay').addEventListener('click', () => {
    try { sessionStorage.removeItem('robotSeen'); } catch (e) {}
    scrollTo(0, 0);
    location.reload();
});

/* ===================== Animations au scroll & hero ===================== */
function setupScroll() {
    if (!hasGsap || !window.ScrollTrigger) return;
    gsap.registerPlugin(ScrollTrigger);
    gsap.utils.toArray('.reveal').forEach(el => {
        gsap.fromTo(el, { y: 40, opacity: 0 }, {
            y: 0, opacity: 1, duration: 0.8, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 90%' },
            onComplete: () => { gsap.set(el, { clearProps: 'transform,opacity' }); el.classList.add('ready'); }
        });
    });
}

let roleIndex = 0;
function typeRole() {
    const el = $('#role');
    const roles = UI.roles;
    const txt = roles[roleIndex % roles.length];
    const o = { n: 0 };
    gsap.to(o, {
        n: txt.length, duration: txt.length * 0.04, ease: 'none',
        onUpdate: () => { el.textContent = txt.slice(0, Math.round(o.n)); },
        onComplete: () => { roleIndex++; gsap.delayedCall(1.8, typeRole); }
    });
}

function revealHero() {
    if (!hasGsap) { $('#role').textContent = UI.roles[0]; return; }
    gsap.fromTo('.h-title .line > span', { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 1.1, stagger: 0.12, ease: 'power4.out' });
    gsap.fromTo('[data-hero]', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.1, ease: 'power3.out', delay: 0.3 });
    document.querySelectorAll('[data-count]').forEach(el => {
        const o = { n: 0 };
        gsap.to(o, { n: +el.dataset.count, duration: 1.4, delay: 0.9, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.n); } });
    });
    typeRole();
}

/* ===================== Éveil du robot & chargement ===================== */
function greet() {
    gsap.delayedCall(0.6, () => doWave(UI.greet));
    gsap.delayedCall(4.4, () => { if (!chatOpen && !tourActive) speak(UI.hint, 4500); });
}

let loaderDone = false;
function endLoader() {
    if (loaderDone) return;
    loaderDone = true;
    try { sessionStorage.setItem('robotSeen', '1'); } catch (e) {}
    root.classList.remove('loading');
    if (hasGsap) gsap.fromTo('.site-header', { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out' });
    if (window.ScrollTrigger) ScrollTrigger.refresh();
    gsap.delayedCall(1.5, () => window.__askLang && window.__askLang());
}

function runLoader() {
    const count = $('#ld-count'), txt = $('#ld-text'), bar = $('.ld-bar i');
    const quips = UI.quips;
    let lastQuip = -1, ready = false, chosen = false, autoT = null;
    const o = { v: 0 };

    // Langue présélectionnée : celle déjà choisie, sinon celle du navigateur
    let sel = LANG;
    try { if (!localStorage.getItem('lang') && /^es/i.test(navigator.language || '')) sel = 'es'; } catch (e) {}
    const picks = document.querySelectorAll('.pick');
    const markSel = () => picks.forEach(p => p.classList.toggle('sel', p.dataset.pick === sel));
    markSel();

    // Entrée en douceur : le robot se pose dans le cadre, puis la trappe s'ouvre lentement
    gsap.to(state, { intro: 1, duration: 1.4, ease: 'power2.out' });
    gsap.to(state, { door: 1, duration: 1.1, delay: 0.5, ease: 'power3.inOut' });
    // Les yeux s'allument peu à peu pendant la réparation
    gsap.timeline({ delay: 0.5 })
        .to(state, { eye: 0.7, duration: 0.08 })
        .to(state, { eye: 0.15, duration: 0.08 })
        .to(state, { eye: 0.4, duration: 0.2 });

    const choose = l => {
        if (!ready || chosen) return;
        chosen = true;
        clearTimeout(autoT);
        sel = l; markSel();
        root.classList.add('ld-choosing');
        playOrbit(l, {
            atStart: () => { gsap.to('#loader, .ld-mid', { opacity: 0, duration: 0.45 }); },
            onMid: () => applyLang(l),
            atEnd: () => {
                gsap.to('#curtain', { yPercent: -100, duration: 0.9, ease: 'power4.inOut', onComplete: endLoader });
                gsap.delayedCall(0.4, () => { revealHero(); greet(); });
            }
        });
    };
    picks.forEach(p => p.addEventListener('click', () => choose(p.dataset.pick)));

    const tl = gsap.timeline();
    tl.to(o, {
        v: 100, duration: 4.6, ease: 'sine.inOut',
        onUpdate: () => {
            const v = o.v;
            state.build = v;
            state.eye = Math.max(state.eye, 0.25 + 0.75 * (v / 100) * (v / 100));
            count.textContent = Math.round(v);
            bar.style.transform = `scaleX(${v / 100})`;
            txt.textContent = v < 6 ? UI.diag : v >= 100 ? UI.repaired : UI.repair + Math.min(6, Math.floor((v - 6) / 13.5) + 1) + '/6';
            for (let q = quips.length - 1; q >= 0; q--) {
                if (v >= quips[q][0]) {
                    if (q !== lastQuip) { lastQuip = q; speak(quips[q][1], 2400); }
                    break;
                }
            }
        },
        onComplete: () => {
            ready = true;
            state.build = 100;
            gsap.to(state, { door: 0, eye: 1, duration: 0.9, ease: 'power2.inOut' });
            root.classList.add('ld-ready');
            gsap.delayedCall(0.6, () => { doWave(null, 1.4); speak(UI.pickSay, 6000); });
            autoT = setTimeout(() => choose(sel), 11000);
        }
    });

    $('#skip').addEventListener('click', () => { if (!ready) tl.timeScale(12); }, { once: true });
}

/* ===================== Changement de langue ===================== */
const SKIP_DOM = '#lang-toast, .pick, #ld-ask, .langsw, #robot-mode, #role, #tour-text, #chat-log, #year, [data-count], #tour-step, #tour-voice, #chat-voice, #tour-auto, #tour-next, #ld-count';
let domNodes = null, attrEls = null;
function collectDom() {
    domNodes = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: n => {
            const p = n.parentElement;
            if (!p || /^(SCRIPT|STYLE)$/.test(p.tagName) || !n.nodeValue.trim() || p.closest(SKIP_DOM)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        }
    });
    while (w.nextNode()) { w.currentNode.__fr = w.currentNode.nodeValue; domNodes.push(w.currentNode); }
    attrEls = [];
    document.querySelectorAll('[aria-label], [title], [placeholder]').forEach(el => {
        ['aria-label', 'title', 'placeholder'].forEach(a => { if (el.hasAttribute(a)) attrEls.push({ el, a, fr: el.getAttribute(a) }); });
    });
    const md = document.querySelector('meta[name="description"]');
    if (md) attrEls.push({ el: md, a: 'content', fr: md.getAttribute('content') });
    attrEls.push({ el: document.documentElement, a: 'data-title', fr: document.title });
}
const norm2 = s => s.replace(/\s+/g, ' ').trim();
function applyDom() {
    if (!domNodes) collectDom();
    const es = LANG === 'es';
    domNodes.forEach(n => {
        const tr = es ? I18.domEs[norm2(n.__fr)] : null;
        if (tr) { const m = n.__fr.match(/^(\s*)[\s\S]*?(\s*)$/); n.nodeValue = m[1] + tr + m[2]; } else n.nodeValue = n.__fr;
    });
    attrEls.forEach(o => {
        const v = es ? (I18.attrEs[o.fr] || I18.domEs[o.fr] || o.fr) : o.fr;
        if (o.a === 'data-title') document.title = v; else o.el.setAttribute(o.a, v);
    });
    root.lang = LANG;
}
function refreshUi() {
    setVoice(voiceOn);
    updMode();
    $('#tour-auto').textContent = UI.auto + (tourAuto ? UI.on : UI.off);
    $('#tour-next').textContent = tourActive && tourIdx === STEPS.length - 1 ? UI.finish : UI.next;
    $('#tour-step').textContent = (tourIdx + 1) + '/' + STEPS.length;
}
function syncLangBtns() {
    document.querySelectorAll('.langsw [data-lang]').forEach(b => {
        const on = b.dataset.lang === LANG;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on);
    });
}
function applyLang(l) {
    LANG = l;
    try { localStorage.setItem('lang', LANG); } catch (e) {}
    syncLangBtns();
    loadLang();
    applyDom();
    refreshUi();
    roleIndex = 0;
    if (greeted) { log.innerHTML = ''; greeted = false; chipsBox.innerHTML = ''; if (chatOpen) { greeted = true; renderChips(); addMsg('bot', UI.chatHello); } }
    if (tourActive) showStep(tourIdx);
}
// Changement de langue simple (fondu) : utilisé si l'animation d'orbite n'est pas possible
function setLang(l) {
    if (l === LANG || !I18[l]) return;
    syncLangBtns();
    document.body.classList.add('swap');
    setTimeout(() => {
        applyLang(l);
        if (renderer) speak(UI.hi, 1500);
        document.body.classList.remove('swap');
    }, 190);
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Changement de langue avec le voyage en orbite : le robot décolle, tourne autour du globe et se pose sur le pays choisi
function switchLang(l) {
    if (l === LANG || !I18[l] || cin.on) return;
    if (!playOrbit || !hasGsap || reducedMotion || tourActive || chatOpen || root.classList.contains('loading')) { setLang(l); return; }
    const veil = $('#veil');
    syncLangBtns();
    playOrbit(l, {
        from: LANG,
        atStart: () => {
            document.body.classList.add('orbit-on');
            bubble.classList.remove('show');
            gsap.to(veil, { opacity: 1, duration: 0.4 });
        },
        onMid: () => applyLang(l),
        atEnd: () => gsap.to(veil, { opacity: 0, duration: 0.6 }),
        onDone: () => { document.body.classList.remove('orbit-on'); doWave(UI.hi, 1.2); }
    });
}
document.querySelectorAll('.langsw [data-lang]').forEach(b => b.addEventListener('click', () => switchLang(b.dataset.lang)));

// Visiteur dont le navigateur est en espagnol : on propose la version espagnole une seule fois
function maybeAskLang() {
    let asked = false;
    try { asked = !!localStorage.getItem('langAsked'); } catch (e) {}
    let seen = false;
    try { seen = !!sessionStorage.getItem('robotSeen'); } catch (e) {}
    if (asked || seen || LANG !== 'fr' || !/^es/i.test(navigator.language || '')) return;
    const t = $('#lang-toast');
    setTimeout(() => { t.hidden = false; }, 1200);
    const close = () => { t.hidden = true; try { localStorage.setItem('langAsked', '1'); } catch (e) {} };
    $('#lt-yes').addEventListener('click', () => { close(); switchLang('es'); });
    $('#lt-no').addEventListener('click', close);
    setTimeout(close, 15000);
}
window.__askLang = maybeAskLang;

// Taille du robot : auto (grand quand tu t'arrêtes) ou mini en permanence
const modeBtn = $('#robot-mode');
function updMode() {
    modeBtn.textContent = drag.pinned ? UI.modeReset : (robotMini ? UI.modeMini : UI.modeAuto);
    modeBtn.setAttribute('aria-pressed', !drag.pinned && robotMini);
    // Rangé dans l'en-tête du chat ; flottant seulement quand il faut replacer le robot
    const home = drag.pinned ? document.body : $('#chat .chat-btns');
    if (modeBtn.parentNode !== home) home.insertBefore(modeBtn, drag.pinned ? null : home.firstChild);
}
if (!renderer) modeBtn.hidden = true;
modeBtn.addEventListener('click', () => {
    if (drag.pinned) { drag.pinned = false; updMode(); return; }
    robotMini = !robotMini;
    try { localStorage.setItem('robotMini', robotMini ? '1' : '0'); } catch (e) {}
    updMode();
});
syncLangBtns();
if (LANG !== 'fr') { applyDom(); }
refreshUi();

/* ===================== Démarrage ===================== */
setupScroll();
if (loading) {
    runLoader();
} else {
    revealHero();
    if (renderer) gsap.delayedCall(0.6, () => doWave(UI.rewake));
    if (hasGsap) gsap.delayedCall(1.5, () => window.__askLang && window.__askLang());
}

})();
