/* The coach on screen: a rider on a spin bike, seen from the front, drawn in a small window during workouts.

   Everything about how he looks and moves is in this file; nothing here knows about workouts, trainers or the voice. The
   ride (index.html) loads it, makes one figure, and tells it each frame how fast to pedal, how hard the effort is and
   whether the coach is speaking:

     const fig = makeCoachFigure({ THREE, RoomEnvironment, renderer, box });
     fig.draw(dt, { show, cadence, effort, talking });   // every frame, after the ride's own scene is drawn
     fig.line(line);                                      // a spoken line starts (or null: it stops); lively ones get a smile and a fist pump
     fig.listen(audioElement);                            // the clip being played, so the mouth moves with its loudness

   THREE and RoomEnvironment are three.js and its room of soft lights; renderer is the ride's WebGLRenderer, which draws
   the figure into the rectangle of box, an element on the page. A plain script, not a module, so that the page still
   works when opened straight from disk.

   The legs follow the pedals, the lean follows the effort; he looks at you, his jaw moves with the voice, he blinks and
   his eyes glance about. Made to look like a film cartoon: each arm, each leg and the body is one smooth skin, the light
   is reflected in the eyes, the helmet and the steel, and skin and cloth have a fine surface. */
window.makeCoachFigure = ({ THREE, RoomEnvironment, renderer, box }) => {
  const V3 = THREE.Vector3, canvas2d = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const S = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 0.8, 0.1, 20), UP = new V3(0, 1, 0), P = (x, y, z) => new V3(x, y, z);
  cam.position.set(1.05, 1.64, 2.0); cam.lookAt(0, 1.37, 0.1);
  S.background = new THREE.Color(0x76b8f0);
  // a warm sun that casts shadows, the blue of the sky from the other side, and a warm rim of light from behind
  const hemiL = new THREE.HemisphereLight(0xe4efff, 0x8a7868, 1.1); S.add(hemiL);
  const keyL = new THREE.DirectionalLight(0xffe6c4, 3.2); keyL.position.set(2.2, 3.4, 2.4); keyL.castShadow = true;
  keyL.shadow.mapSize.set(1024, 1024); keyL.shadow.bias = -0.0005; keyL.shadow.normalBias = 0.02;
  Object.assign(keyL.shadow.camera, { left: -1.3, right: 1.3, top: 2.1, bottom: -0.4, near: 0.5, far: 9 });
  S.add(keyL);
  const fillL = new THREE.DirectionalLight(0xcfe0ff, 1.2); fillL.position.set(-2.5, 1.5, 1.5); S.add(fillL);
  const rimL = new THREE.DirectionalLight(0xffe2b0, 2.6); rimL.position.set(-1, 2.6, -2.6); S.add(rimL);
  const bounceL = new THREE.DirectionalLight(0xffdcb8, 0.9); bounceL.position.set(0.4, -0.6, 2); S.add(bounceL);   // light thrown back up from the ground: no black under the nose and chin

  // the studio's own light, reflected in everything: made on the first draw (see studioLight), a little on cloth, fully on metal
  const mat = (c, rough = 0.7, metal = 0, map = null) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, map, envMapIntensity: metal > 0.3 ? 1 : 0.45 });
  const mesh = (geo, m, parent = S) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };
  const between = (o, a, b) => {                       // stretch a unit-tall mesh (centred on its own axis) from a to b
    const d = new V3().subVectors(b, a), L = d.length() || 1e-6;
    o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(UP, d.divideScalar(L)); o.scale.y = L;
  };
  const tube = (rA, rB, m, seg = 16) => mesh(new THREE.CylinderGeometry(rB, rA, 1, seg), m);   // rA at the start, rB at the end
  const ball = (r, m, parent = S) => mesh(new THREE.SphereGeometry(r, 20, 14), m, parent);
  // a canvas texture: drawn on a 256 grid, at any size
  const tex = (draw, rep, size = 256) => { const [c, g] = canvas2d(size, size); g.scale(size / 256, size / 256); draw(g); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; return t; };

  // the studio: pale concrete and oak planks
  const oak = tex(g => {
    for (let y = 0; y < 256; y += 32) {
      const base = 120 + Math.random() * 25 | 0; g.fillStyle = `rgb(${base},${base * 0.72 | 0},${base * 0.47 | 0})`; g.fillRect(0, y, 256, 32);
      for (let k = 0; k < 40; k++) { g.strokeStyle = `rgba(60,38,20,${0.08 + Math.random() * 0.1})`; g.beginPath(); const yy = y + Math.random() * 32; g.moveTo(0, yy); g.bezierCurveTo(80, yy + 3, 170, yy - 3, 256, yy + 1); g.stroke(); }
      g.fillStyle = 'rgba(40,25,12,0.6)'; g.fillRect(0, y, 256, 1.5); g.fillRect((y * 7) % 256, y, 1.5, 32);
    }
  }, 2);
  const backdrop = tex(g => {                            // behind the rider: a blue sky, paler to the horizon, with a few heaped clouds
    const sky = g.createLinearGradient(0, 85, 0, 200); sky.addColorStop(0, '#2478d8'); sky.addColorStop(0.55, '#76b8f0'); sky.addColorStop(1, '#e2eef6');
    g.fillStyle = sky; g.fillRect(0, 0, 256, 256);
    const puff = (x, y, r, a) => { const c = g.createRadialGradient(x, y, 0, x, y, r); c.addColorStop(0, `rgba(255,255,255,${a})`); c.addColorStop(0.55, `rgba(255,255,255,${a * 0.8})`); c.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = c; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
    for (const [cx, cy, k] of [[90, 172, 1.2], [121, 152, 1], [99, 117, 0.8], [83, 138, 0.7], [118, 100, 0.6]]) {
      g.save(); g.translate(cx, cy); g.scale(0.5, 1);    // the wall is twice as wide as it is high
      for (let i = 0; i < 12; i++) { const q = Math.random() * 2 - 1; puff(q * 26 * k, (Math.random() - 0.8) * 7 * k * (1 - q * q), (5 + Math.random() * 6) * k, 0.75); }
      g.restore();
    }
  }, 1, 1024);
  const wallM = mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshBasicMaterial({ map: backdrop })); wallM.position.set(0, 2, -1.3);
  const floor = mesh(new THREE.PlaneGeometry(8, 6), mat(0xffffff, 0.55, 0, oak)); floor.rotation.x = -Math.PI / 2;

  // the bike: a studio spin bike
  const frameM = mat(0x2b2d31, 0.45, 0.4), steel = mat(0x8c9198, 0.3, 0.85), dark = mat(0x18191b, 0.6), orange = mat(0xe8702c, 0.4, 0.2);
  const BB = P(0, 0.4, 0.02), GRIP = 0.33, BAR_Y = 1.1;
  const rod = (a, b, r, m) => { const o = tube(r, r, m, 12); between(o, a, b); return o; };
  rod(P(0, 0.05, -0.55), P(0, 0.05, 0.62), 0.04, frameM);
  for (const z of [-0.55, 0.62]) { rod(P(-0.28, 0.035, z), P(0.28, 0.035, z), 0.035, frameM); for (const x of [-0.27, 0.27]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), dark).position.set(x, 0.01, z); }
  rod(P(0, 0.05, 0.5), P(0, 1.03, GRIP - 0.03), 0.05, frameM);
  rod(P(0, 0.06, -0.12), BB, 0.045, frameM); rod(BB, P(0, 0.97, -0.27), 0.045, frameM);
  rod(BB, P(0, 0.45, 0.44), 0.03, orange);
  const flyG = new THREE.Group(); flyG.position.set(0, 0.45, 0.44); S.add(flyG);
  const fly = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.06, 40), steel, flyG); fly.rotation.z = Math.PI / 2;
  for (let k = 0; k < 5; k++) { const sp = mesh(new THREE.BoxGeometry(0.065, 0.38, 0.03), dark, flyG); sp.rotation.x = k * Math.PI / 5; }    // spokes, so you can see it turn
  const guard = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.05, 40, 1, true, Math.PI * 0.55, Math.PI * 0.9), frameM); guard.rotation.z = Math.PI / 2; guard.position.set(0.035, 0.45, 0.44);
  for (const sx of [-1, 1])                           // the bullhorn bars, each side built as its own curve
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([P(sx * 0.08, BAR_Y - 0.03, GRIP - 0.05), P(sx * 0.22, BAR_Y, GRIP), P(sx * 0.24, BAR_Y + 0.03, GRIP + 0.16), P(sx * 0.2, BAR_Y + 0.05, GRIP + 0.2)]), 24, 0.022, 10), dark);
  rod(P(-0.08, BAR_Y - 0.03, GRIP - 0.05), P(0.08, BAR_Y - 0.03, GRIP - 0.05), 0.024, dark);
  const phone = mesh(new THREE.BoxGeometry(0.08, 0.15, 0.012), mat(0x111111, 0.2, 0.3)); phone.position.set(0, BAR_Y + 0.07, GRIP + 0.02); phone.rotation.x = -0.5;
  const saddle = mesh(new THREE.CapsuleGeometry(0.06, 0.16, 6, 12), dark); saddle.rotation.x = Math.PI / 2; saddle.scale.set(1.15, 1, 0.5); saddle.position.set(0, 1.0, -0.27);
  const crankArm = [mesh(new THREE.BoxGeometry(0.025, 1, 0.035), steel), mesh(new THREE.BoxGeometry(0.025, 1, 0.035), steel)];
  const pedalM = [mesh(new THREE.BoxGeometry(0.09, 0.02, 0.1), dark), mesh(new THREE.BoxGeometry(0.09, 0.02, 0.1), dark)];

  // the rider: a man in a cycling jersey and bib shorts
  // skin: soft and a little moist, with a warm glow in the shadows as if light passed through it
  const SKIN = { color: 0xe9a57e, roughness: 0.45, sheen: 0.6, sheenColor: 0xff8a66, sheenRoughness: 0.45, clearcoat: 0.12, clearcoatRoughness: 0.35, emissive: 0x5a1c10, emissiveIntensity: 0.12, envMapIntensity: 0.5 };
  const skin = new THREE.MeshPhysicalMaterial(SKIN), shortsM = mat(0x1f6fb8, 0.45), sockM = mat(0x2486d4, 0.7), shoeM = mat(0xf0f0f0, 0.45), gloveM = mat(0x1c1d21, 0.6);
  const jersey = tex(g => {                             // around the body, the front in the middle: a chest sash, side panels, collar, hem, zip
    const grad = g.createLinearGradient(0, 0, 0, 256); grad.addColorStop(0, '#36a3ea'); grad.addColorStop(1, '#1b5c9c');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    const band = (y0, y1, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, y0); g.lineTo(256, y0 - 30); g.lineTo(256, y1 - 30); g.lineTo(0, y1); g.fill(); };
    band(96, 128, '#f4f6f8'); band(128, 142, '#e8473a'); band(142, 150, '#ffc531'); band(150, 156, '#14365e');   // a sash across the chest
    g.fillStyle = '#14365e'; g.fillRect(54, 0, 20, 256); g.fillRect(182, 0, 20, 256);                       // side panels, with yellow piping
    g.fillStyle = '#ffc531'; g.fillRect(52, 0, 2, 256); g.fillRect(74, 0, 2, 256); g.fillRect(180, 0, 2, 256); g.fillRect(202, 0, 2, 256);
    g.fillStyle = '#e8473a'; g.fillRect(0, 0, 256, 6); g.fillStyle = '#ffc531'; g.fillRect(0, 6, 256, 2);   // collar
    g.fillStyle = '#e8473a'; g.fillRect(0, 236, 256, 20);                                                      // hem
    g.fillStyle = '#f4f6f8'; g.font = 'bold 15px sans-serif'; g.textAlign = 'center'; g.fillText('GOLDEN HOUR', 128, 196); g.fillText('GOLDEN HOUR', 0, 60); g.fillText('GOLDEN HOUR', 256, 60);
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
    g.fillStyle = '#d6dadf'; g.fillRect(126.5, 6, 3, 230);                                                     // the zip, down the front
  }, 1, 1024);
  // surface texture: fine bump maps for the skin's pores, the jersey's knit, ribbed socks, the gloves' mesh
  const bump = (draw, rep) => { const t = tex(draw, rep); t.colorSpace = THREE.NoColorSpace; return t; };
  const speckle = (g, n, a, s) => { g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < n; i++) { const v = Math.random() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${a * Math.random()})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, s * (0.5 + Math.random()), 0, 7); g.fill(); } };
  const poresB = bump(g => speckle(g, 5000, 0.5, 0.9), 6);
  const mottle = tex(g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${Math.random() < 0.6 ? '200,120,110' : '255,235,220'},${0.02 + Math.random() * 0.03})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 14, 0, 7); g.fill(); } }, 2);
  Object.assign(skin, { map: mottle, bumpMap: poresB, bumpScale: 0.3 });
  const knitB = bump(g => { g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256); for (let y = 0; y < 256; y += 4) for (let x = 0; x < 256; x += 4) { g.fillStyle = (x + y) % 8 ? '#a0a0a0' : '#606060'; g.fillRect(x, y, 3, 3); } }, 6);
  const ribB = bump(g => { for (let x = 0; x < 256; x += 8) { g.fillStyle = '#404040'; g.fillRect(x, 0, 4, 256); g.fillStyle = '#c0c0c0'; g.fillRect(x + 4, 0, 4, 256); } }, 2);
  const meshB = bump(g => { g.fillStyle = '#c0c0c0'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#303030'; for (let y = 0; y < 256; y += 10) for (let x = (y / 10 % 2) * 5; x < 256; x += 10) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); } }, 3);
  Object.assign(sockM, { bumpMap: ribB, bumpScale: 1.5 }); Object.assign(gloveM, { bumpMap: meshB, bumpScale: 1.5 });
  Object.assign(shortsM, { bumpMap: knitB, bumpScale: 0.6, roughness: 0.35 });
  const topM = mat(0xffffff, 0.75, 0, jersey); Object.assign(topM, { bumpMap: knitB, bumpScale: 1 });
  const irisTex = tex(g => {                             // the iris: amber streaks out from the pupil, a dark ring at the edge (the cap uses the top fifth)
    g.fillStyle = '#a8641c'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 160; i++) { const x = Math.random() * 256; g.fillStyle = Math.random() < 0.5 ? 'rgba(226,160,60,0.55)' : 'rgba(96,52,14,0.5)'; g.fillRect(x, 0, 1 + Math.random() * 2, 40 + Math.random() * 12); }
    g.fillStyle = 'rgba(240,180,70,0.45)'; g.fillRect(0, 0, 256, 16);
    g.fillStyle = 'rgba(50,26,8,0.85)'; g.fillRect(0, 45, 256, 10);
  }, 1);
  const sm = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const gs = (x, y, cx, cy, sx, sy) => Math.exp(-((x - cx) ** 2) / (2 * sx * sx) - ((y - cy) ** 2) / (2 * sy * sy));
  const weld = geo => {                                  // one normal where a seam or a pole repeats a point
    const p = geo.attributes.position, n = geo.attributes.normal, m = new Map();
    for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(5)},${p.getY(i).toFixed(5)},${p.getZ(i).toFixed(5)}`; if (!m.has(k)) m.set(k, []); m.get(k).push(i); }
    for (const ids of m.values()) if (ids.length > 1) { const s = new V3(); for (const i of ids) s.add(new V3().fromBufferAttribute(n, i)); s.normalize(); for (const i of ids) n.setXYZ(i, s.x, s.y, s.z); }
  };
  const along = (keys, u) => {                           // a smooth curve through [u, a, b] keys, read at u: gives [a, b]
    let i = 1; while (i < keys.length - 1 && keys[i][0] < u) i++;
    const p1 = keys[i - 1], p2 = keys[i], p0 = keys[i - 2] || p1, p3 = keys[i + 1] || p2, t = Math.max(0, Math.min(1, (u - p1[0]) / (p2[0] - p1[0])));
    return [1, 2].map(q => { const a = p0[q], b = p1[q], c = p2[q], d = p3[q]; return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t); });
  };
  // the body: one skin from the hips to the base of the neck, wider than deep, with a chest, shoulders and a rounded back.
  // The texture goes round from the back, so the front is in its middle.
  const torsoGeo = (() => {
    const keys = [[0, 0.03, 0.02], [0.03, 0.15, 0.1], [0.14, 0.17, 0.112], [0.36, 0.155, 0.1], [0.58, 0.172, 0.113], [0.76, 0.19, 0.122], [0.86, 0.192, 0.112], [0.93, 0.15, 0.092], [0.98, 0.08, 0.065], [1, 0.03, 0.03]];
    const R = 56, C = 48, pos = [], uv = [], idx = [], sq = q => Math.sign(q) * Math.abs(q) ** 0.8;
    for (let i = 0; i <= R; i++) {
      const v = i / R, [hw, hd] = along(keys, v).map(q => Math.max(0.005, q));
      for (let j = 0; j <= C; j++) {
        const th = j / C * Math.PI * 2, cx = -Math.sin(th), cz = -Math.cos(th);
        pos.push(hw * sq(cx), v - 0.5, hd * sq(cz) * (cz > 0 ? 1 + 0.12 * gs(v, 0, 0.72, 0, 0.1, 1) : 1) - 0.03 * Math.sin(Math.PI * v));
        uv.push(j / C, v);
        if (i < R && j < C) { const a = i * (C + 1) + j, b = a + 1, c = a + C + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.computeVertexNormals(); weld(geo);
    return geo;
  })();
  const torso = mesh(torsoGeo, topM), hips = ball(1, shortsM); hips.scale.set(0.17, 0.1, 0.12);
  const collar = mesh(new THREE.TorusGeometry(0.056, 0.012, 8, 28), topM);
  const neck = tube(0.05, 0.043, skin, 24);
  // An arm or a leg is one smooth skin from shoulder to wrist, or hip to ankle, bent round the elbow or knee. keys give its
  // radius along the way, and how far the muscle sits off the bone (+ towards the point of the joint, - into the bend);
  // parts give the cloth or skin for each stretch: [where it ends, material, how much thicker it is than the skin].
  const limb = (keys, parts, segs = 20) => {
    const rows = []; let u0 = 0;
    parts.forEach(([u1, , pad = 0], m) => {
      const n = Math.max(2, Math.round((u1 - u0) * 44));
      for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n, [r, off] = along(keys, u); rows.push({ u, m, v: i / n, r: r + pad, off }); }
      u0 = u1;
    });
    const N = rows.length, W = segs + 1, pos = new Float32Array(N * W * 3), uv = new Float32Array(N * W * 2), idx = [], geo = new THREE.BufferGeometry();
    rows.forEach((row, i) => { for (let j = 0; j < W; j++) uv.set([j / segs, row.v], (i * W + j) * 2); });
    for (let i = 0; i < N - 1; i++) if (rows[i].m === rows[i + 1].m) for (let j = 0; j < segs; j++) { const a = i * W + j, b = a + 1, c = a + W, d = c + 1; idx.push(a, b, c, b, d, c); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    let start = 0; parts.forEach((p, m) => { const n = (rows.filter(r => r.m === m).length - 1) * segs * 6; geo.addGroup(start, n, m); start += n; });
    const o = mesh(geo, parts.map(p => p[1])); o.frustumCulled = false;
    const d1 = new V3(), d2 = new V3(), bn = new V3(), c = new V3(), t = new V3(), e2 = new V3(), n1 = new V3(), n2 = new V3();
    o.set = (A, J, B) => {                                // from A, round the joint at J, to B
      const L1 = d1.subVectors(J, A).length(), L2 = d2.subVectors(B, J).length(); d1.divideScalar(L1); d2.divideScalar(L2);
      if (bn.crossVectors(d1, d2).lengthSq() < 1e-8) bn.set(1, 0, 0);
      bn.normalize();
      const L = L1 + L2, w = Math.min(0.07, L1 * 0.45, L2 * 0.45);
      rows.forEach((row, i) => {
        const s = row.u * L, q = (s - L1 + w) / (2 * w);
        if (q <= 0) { c.copy(A).addScaledVector(d1, s); t.copy(d1); }
        else if (q >= 1) { c.copy(J).addScaledVector(d2, s - L1); t.copy(d2); }
        else { c.copy(J).addScaledVector(d1, -w * (1 - q) * (1 - q)).addScaledVector(d2, w * q * q); t.copy(d1).lerp(d2, q).normalize(); }
        e2.crossVectors(t, bn); c.addScaledVector(e2, row.off);
        for (let j = 0; j < W; j++) {
          const th = j / segs * Math.PI * 2, cs = Math.cos(th) * row.r, sn = Math.sin(th) * row.r, k = (i * W + j) * 3;
          pos[k] = c.x + bn.x * cs + e2.x * sn; pos[k + 1] = c.y + bn.y * cs + e2.y * sn; pos[k + 2] = c.z + bn.z * cs + e2.z * sn;
        }
      });
      geo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
      const nr = geo.attributes.normal;                   // the seam down the limb: one normal for both edges
      for (let i = 0; i < N; i++) { const a = i * W, b = a + segs; n1.fromBufferAttribute(nr, a).add(n2.fromBufferAttribute(nr, b)).normalize(); nr.setXYZ(a, n1.x, n1.y, n1.z); nr.setXYZ(b, n1.x, n1.y, n1.z); }
    };
    return o;
  };
  // legs: bib shorts to above the knee, a thigh that narrows to the knee, a calf, white socks
  const LEG = [[0, 0.092, 0], [0.14, 0.09, 0.006], [0.3, 0.08, 0.008], [0.43, 0.062, 0.006], [0.5, 0.056, 0.008], [0.57, 0.052, 0], [0.67, 0.058, -0.01], [0.8, 0.046, -0.005], [0.9, 0.036, 0], [1, 0.034, 0]];
  const leg = [0, 1].map(() => limb(LEG, [[0.4, shortsM, 0.003], [0.88, skin], [1, sockM, 0.002]]));
  const shoes = [0, 1].map(() => { const g = new THREE.Group(); S.add(g); const u = mesh(new THREE.CapsuleGeometry(0.045, 0.15, 6, 12), shoeM, g); u.rotation.x = Math.PI / 2; u.scale.set(1, 1, 0.75); const sole = mesh(new THREE.BoxGeometry(0.085, 0.015, 0.23), mat(0x18191b, 0.6), g); sole.position.y = -0.033; return g; });
  // arms: short sleeves over the shoulders, then bare arms, fingerless gloves
  const sleeveM = mat(0xffffff, 0.75, 0, tex(g => {     // sleeves: white, with a red and yellow cuff at the elbow end
    g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#e8473a'; g.fillRect(0, 0, 256, 44); g.fillStyle = '#ffc531'; g.fillRect(0, 44, 256, 10);
  }, 1)); Object.assign(sleeveM, { bumpMap: knitB, bumpScale: 1 });
  const deltM = mat(0xf4f6f8, 0.75); deltM.bumpMap = knitB; const delt = [ball(0.058, deltM), ball(0.058, deltM)];
  const ARM = [[0, 0.054, 0], [0.14, 0.053, -0.002], [0.3, 0.048, -0.005], [0.45, 0.04, 0], [0.53, 0.039, 0.004], [0.62, 0.043, 0.002], [0.78, 0.036, 0], [0.92, 0.029, 0], [1, 0.028, 0]];
  const arm = [0, 1].map(() => limb(ARM, [[0.26, sleeveM, 0.004], [1, skin]]));
  // hands, built round the bar (its axis along x, the bar's centre at the origin): a gloved palm on top, four fingers curled
  // over the front and under it, the thumb round the back. With nothing in it, the same grip is a fist.
  const knuckle = (a, b, r, m, parent) => { const o = mesh(new THREE.CylinderGeometry(r, r, 1, 10), m, parent); between(o, a, b); ball(r, m, parent).position.copy(b); return o; };
  const handG = [-1, 1].map(sx => {
    const g = new THREE.Group(); S.add(g);
    const palm = ball(1, gloveM, g); palm.scale.set(0.043, 0.019, 0.048); palm.position.set(0, 0.03, -0.04); palm.rotation.x = 0.3;
    const RG = 0.031, on = (x, a) => P(x, RG * Math.sin(a), RG * Math.cos(a));                   // a point on the grip, at angle a (0 = in front)
    [[-0.026, 0.95, 0.0088], [-0.009, 1, 0.009], [0.009, 0.95, 0.0086], [0.025, 0.8, 0.0076]].forEach(([x, len, r]) => {
      const fx = sx * x, a0 = 1.75, step = 2.9 * len / 3, root = P(fx, 0.034, -0.012);
      const j1 = on(fx, a0 - step * 0.6), j2 = on(fx, a0 - step * 1.6), tip = on(fx, a0 - step * 2.5);
      knuckle(root, j1, r, gloveM, g); knuckle(j1, j2, r * 0.93, skin, g); knuckle(j2, tip, r * 0.85, skin, g);
    });
    const t0 = P(sx * -0.036, 0.016, -0.055), t1 = P(sx * -0.042, -0.012, -0.034), t2 = P(sx * -0.036, -0.03, -0.008);   // the thumb
    ball(0.011, gloveM, g).position.copy(t0); knuckle(t0, t1, 0.0105, gloveM, g); knuckle(t1, t2, 0.0095, skin, g);
    return g;
  });
  const HAND_AT = [-1, 1].map(sx => P(sx * 0.17, BAR_Y - 0.011, GRIP - 0.018)), WRIST = P(0, 0.03, -0.085);
  const HAND_Q = [-1, 1].map(sx => {                     // the bar's direction where the hand holds it, outwards, rising and forwards
    const D = new V3(0.92 * sx, 0.2, 0.33).normalize(), Z = new V3().crossVectors(D, new V3(0, 1, 0)).multiplyScalar(sx).normalize();
    const X = D.clone().multiplyScalar(sx), Y = new V3().crossVectors(Z, X).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  });
  const FIST_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3(-1, 0, 0), new V3(0, 0, 1), new V3(0, 1, 0)));

  // the head, sculpted from a fine sphere (metres, facing +z), as a film cartoon draws one: round and wide in the cheeks,
  // big eye sockets, a button nose, a small chin; rosy cheeks and dark hair. Two morphs: the jaw drops, and a wide smile.
  // The mouth is a real opening (the points along the lips' parting are see-through) onto teeth and a tongue inside.
  // the mouth's height (on one ring of the sphere's points, which becomes the parting of the lips), and half its width
  const MOUTH_RING = Math.round(Math.acos(-0.061 / 0.1176) / Math.PI * 150), MOUTH_UY = Math.cos(Math.PI * MOUTH_RING / 150), MOUTH_Y = 0.1176 * MOUTH_UY, MW = 0.028;
  const headGeo = new THREE.SphereGeometry(1, 160, 150, -Math.PI / 2);          // the seam at the back, under the hair
  const hp = headGeo.attributes.position, NV = hp.count, U = Float32Array.from(hp.array);
  for (let i = 0; i < NV; i++) {
    const ux = U[i * 3], uy = U[i * 3 + 1], uz = U[i * 3 + 2];
    let x = ux * 0.08, y = uy * 0.098, z = uz * 0.094;
    if (y < 0) y *= 1 + 0.2 * sm(-0.3, 0.6, uz);                                   // a longer lower face
    if (z < 0) z *= 1.1;                                                            // the back of the skull
    const fr = sm(0.2, 0.7, uz);
    x *= 1 + 0.1 * gs(y, 0, -0.045, 0, 0.035, 1) * sm(-0.4, 0.2, uz);              // round, wide cheeks
    const ax = Math.abs(x);
    let d = 0.007 * sm(-0.02, -0.09, y);                                            // the jaw comes forward
    d -= 0.016 * gs(ax, y, 0.033, 0.002, 0.026, 0.022);                             // eye sockets, very big for very big eyes
    d += 0.004 * gs(ax, y, 0.033, 0.039, 0.026, 0.006);                             // brow ridge
    const nw = 0.006 + 0.003 * sm(-0.005, -0.03, y);                                // nose: hardly a bridge
    d += (0.002 + 0.005 * sm(0.008, -0.026, y)) * Math.exp(-x * x / (2 * nw * nw)) * (1 - sm(0.014, 0.026, y)) * (1 - sm(-0.03, -0.042, y));
    d += 0.013 * gs(x, y, 0, -0.03, 0.0095, 0.009) + 0.004 * gs(ax, y, 0.011, -0.035, 0.0055, 0.0055);   // a button tip, and small wings
    d += 0.005 * gs(x, y, 0, -0.058, 0.03, 0.018);                                  // the muzzle
    d += 0.002 * gs(x, y, 0, -0.0555, 0.022, 0.0035) + 0.003 * gs(x, y, 0, -0.0665, 0.02, 0.0045) - 0.002 * gs(x, y, 0, MOUTH_Y, MW, 0.0015);  // lips
    d += 0.009 * gs(x, y, 0, -0.098, 0.018, 0.016) - 0.0015 * gs(x, y, 0, -0.077, 0.014, 0.004);       // chin, and the crease above it
    d += 0.004 * gs(ax, y, 0.048, -0.014, 0.014, 0.01) + 0.006 * gs(ax, y, 0.04, -0.04, 0.018, 0.018) - 0.003 * gs(ax, y, 0.066, 0.03, 0.01, 0.015);   // cheekbones, full cheeks, temples
    hp.setXYZ(i, x, y, z + d * fr);
  }
  headGeo.computeVertexNormals(); weld(headGeo);
  const B = Float32Array.from(hp.array);
  const morph = fn => {                                  // a morph target: position offsets, and the normals that go with them
    const dp = new Float32Array(NV * 3);
    for (let i = 0; i < NV; i++) { const o = fn(B[i * 3], B[i * 3 + 1], B[i * 3 + 2], U[i * 3 + 2]); if (o) dp.set(o, i * 3); }
    const g2 = headGeo.clone(); const p2 = g2.attributes.position;
    for (let i = 0; i < NV * 3; i++) p2.array[i] = B[i] + dp[i];
    g2.computeVertexNormals(); weld(g2);
    const dn = Float32Array.from(g2.attributes.normal.array, (v, i) => v - headGeo.attributes.normal.array[i]); g2.dispose();
    return [new THREE.Float32BufferAttribute(dp, 3), new THREE.Float32BufferAttribute(dn, 3)];
  };
  const mouthHalf = x => 0.018 * sm(MW * 0.95, MW * 1.5, Math.abs(x));  // a sharp parting at the lips, a soft stretch beyond them
  const jawOpen = morph((x, y, z, uz) => {
    if (uz < -0.3) return null;
    const k = sm(MOUTH_Y - 0.0003 + mouthHalf(x), MOUTH_Y - 0.0018 - mouthHalf(x), y) * (1 - 0.6 * sm(0.04, 0.08, Math.abs(x))) * sm(-0.3, 0.2, uz);
    const lips = 1 - gs(0, y, 0, MOUTH_Y - 0.007, 1, 0.009) * Math.min(1, (x / (MW + 0.002)) ** 2);   // the lips stay joined at the corners: a round mouth
    return [0, -0.016 * k * lips, -0.003 * k];
  });
  const smile = morph((x, y) => {                        // the corners go up and out, the whole mouth curves, the cheeks lift
    const ax = Math.abs(x), c = gs(ax, y, MW, MOUTH_Y, 0.009, 0.009), ch = gs(ax, y, 0.04, -0.04, 0.014, 0.014);
    const curve = Math.min(1, (x / MW) ** 2) * gs(0, y, 0, MOUTH_Y, 1, 0.007) * (1 - sm(MW, MW * 1.4, ax));
    return [Math.sign(x) * 0.004 * c, 0.004 * c + 0.0045 * curve + 0.003 * ch, 0.004 * ch - 0.0015 * c];
  });
  headGeo.morphTargetsRelative = true;
  headGeo.morphAttributes.position = [jawOpen[0], smile[0]]; headGeo.morphAttributes.normal = [jawOpen[1], smile[1]];
  // where the hair grows: a hairline a little back at the temples, down to the sideburns and the nape, clear of the ears
  const hairAt = (ux, uy, uz) => {
    let h = uz >= 0 ? 0.12 + 0.5 * sm(0, 0.9, uz) + 0.1 * gs(Math.abs(ux), uz, 0.45, 0.85, 0.12, 0.2) : 0.12 - 0.62 * sm(0, 1, -uz);
    if (Math.abs(ux) > 0.6) h -= 0.38 * gs(uz, 0, 0.22, 0, 0.1, 1);                                  // sideburns
    const ear = Math.hypot(uz + 0.06, uy + 0.12) < 0.27 && Math.abs(ux) > 0.6;
    return ear ? 0 : sm(h, h + 0.07, uy);
  };
  const cols = new Float32Array(NV * 4), HAIR_RGB = [0.13, 0.1, 0.09];
  for (let i = 0; i < NV; i++) {
    const x = B[i * 3], y = B[i * 3 + 1], ux = U[i * 3], uy = U[i * 3 + 1], uz = U[i * 3 + 2], ax = Math.abs(x);
    let c = [1, 1, 1].map(v => v * (0.97 + 0.06 * Math.random()));
    const mix = (to, k) => { c = c.map((v, j) => v + (to[j] - v) * k); };
    mix([1.1, 0.76, 0.74], Math.min(1, 0.75 * gs(ax, y, 0.046, -0.033, 0.017, 0.015) + 0.5 * gs(x, y, 0, -0.031, 0.008, 0.008)));   // rosy cheeks and nose tip
    const lip = Math.exp(-(x * x) / (2 * (MW * 0.8) ** 2)) * (gs(0, y, 0, -0.0555, 1, 0.003) + gs(0, y, 0, -0.0665, 1, 0.004)) * sm(0.3, 0.7, uz);
    mix([0.95, 0.66, 0.63], 0.5 * Math.min(1, lip));
    // the parting of the lips is see-through: the ring of points along it, fading back in towards the corners. The skin
    // is cut halfway to the next ring, so closed lips leave a fine line, and it opens as the jaw pulls the ring below away.
    const alpha = Math.abs(uy - MOUTH_UY) < 1e-5 && uz > 0.4 ? sm(MW - 0.006, MW, ax) : 1;
    mix(HAIR_RGB, 0.85 * hairAt(ux, uy, uz));                                                                    // the scalp under the hair
    cols.set([...c, alpha], i * 4);
  }
  headGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
  const headG = new THREE.Group(); S.add(headG);
  const head = mesh(headGeo, new THREE.MeshPhysicalMaterial({ ...SKIN, vertexColors: true, alphaTest: 0.5, bumpMap: poresB, bumpScale: 0.25 }), headG);
  head.receiveShadow = false;                            // a softly lit face: no hard shadow under the nose or the helmet's brim
  // the hair: the scalp pushed out, fuller on top and swept forward, short at the sides
  const hairGeo = new THREE.SphereGeometry(1, 160, 150, -Math.PI / 2), hq = hairGeo.attributes.position, hn = new V3();
  {
    const hcol = new Float32Array(hq.count * 3);
    for (let i = 0; i < hq.count; i++) {
      const ux = hq.getX(i), uy = hq.getY(i), uz = hq.getZ(i);
      const j = i;                                       // the same sphere as the head, point for point
      const hr = hairAt(ux, uy, uz), top = sm(0.1, 0.75, uy) * sm(-0.7, 0.3, uz);
      const th = hr > 0.02 ? hr * (0.0035 + 0.009 * top + 0.0012 * Math.sin(ux * 90) * Math.sin(uz * 70)) : uz > 0.45 && uy < -0.3 ? -0.03 : -0.004;   // off the face, just under the skin; round the mouth, well behind it
      hn.fromBufferAttribute(headGeo.attributes.normal, j);
      hq.setXYZ(i, B[j * 3] + hn.x * th, B[j * 3 + 1] + hn.y * th + 0.004 * top * hr, B[j * 3 + 2] + hn.z * th + 0.005 * top * hr * sm(0, 0.8, uz));
      const v = 0.85 + 0.3 * Math.random(); hcol.set([v, v, v], i * 3);
    }
    hairGeo.setAttribute('color', new THREE.Float32BufferAttribute(hcol, 3));
    hairGeo.computeVertexNormals(); weld(hairGeo);
  }
  const strands = tex(g => {
    g.fillStyle = '#5a4c44'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) { const x = Math.random() * 256, l = 40 + Math.random() * 120; g.strokeStyle = `rgba(${Math.random() < 0.5 ? '10,8,6' : '120,104,96'},${0.25 + Math.random() * 0.4})`; g.lineWidth = 0.6 + Math.random(); g.beginPath(); g.moveTo(x, Math.random() * 256); g.lineTo(x + (Math.random() - 0.5) * 6, Math.random() * 256 + l); g.stroke(); }
  }, 1);
  strands.repeat.set(10, 3);
  const hair = mesh(hairGeo, new THREE.MeshStandardMaterial({ color: 0x3a2e2a, roughness: 0.5, vertexColors: true, map: strands, envMapIntensity: 0.6 }), headG);
  const onFace = (x, y) => {                             // the point of the face in front of (x, y), and its normal
    let j = 0, best = 9;
    for (let k = 0; k < NV; k++) if (U[k * 3 + 2] > 0.3) { const dd = (B[k * 3] - x) ** 2 + (B[k * 3 + 1] - y) ** 2; if (dd < best) { best = dd; j = k; } }
    return [new V3(B[j * 3], B[j * 3 + 1], B[j * 3 + 2]), new V3().fromBufferAttribute(headGeo.attributes.normal, j)];
  };
  // inside the mouth: a dark hollow, a band of upper teeth that follows the curve of the lips and shows only as the mouth
  // opens (at rest the lips are closed on a smile), and a tongue low down that drops with the jaw
  const inMouth = (geo, m) => { const o = mesh(geo, m, headG); o.castShadow = o.receiveShadow = false; return o; };
  const lipZ = onFace(0, MOUTH_Y)[0].z, lipSag = lipZ - onFace(MW * 0.9, MOUTH_Y)[0].z, lipR = ((MW * 0.9) ** 2 + lipSag ** 2) / (2 * lipSag), lipA = Math.asin(Math.min(1, MW * 1.08 / lipR));
  const hollow = inMouth(new THREE.SphereGeometry(1, 20, 14), mat(0x3d0d12, 0.8)); hollow.scale.set(MW + 0.001, 0.015, 0.008); hollow.position.set(0, MOUTH_Y - 0.004, lipZ - 0.02);
  const toothTex = tex(g => {                            // ivory, a little darker up at the gums, with a faint line between one tooth and the next
    const v = g.createLinearGradient(0, 0, 0, 256); v.addColorStop(0, '#d9cdbf'); v.addColorStop(0.5, '#f3ede3'); v.addColorStop(1, '#f6f1e8'); g.fillStyle = v; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(120,104,92,0.45)'; for (let x = 128 - 96; x <= 128 + 96; x += 32) g.fillRect(x - 1, 0, 2, 256);
  }, 1);
  const teeth = inMouth(new THREE.CylinderGeometry(lipR, lipR, 0.016, 32, 1, true, -lipA, 2 * lipA), mat(0xffffff, 0.35, 0, toothTex)); teeth.position.z = lipZ - 0.006 - lipR;
  const tongue = inMouth(new THREE.SphereGeometry(1, 16, 10), mat(0xd9626c, 0.45)); tongue.scale.set(0.017, 0.006, 0.011);
  // eyebrows: thick dark strokes, arched high over the eyes
  const browM = mat(0x140d0a, 0.7), brows = new THREE.Group(); headG.add(brows);
  for (const sx of [-1, 1]) for (let s = 0; s < 6; s++) {
    const pts = [[0.011, 0.035], [0.021, 0.0415], [0.033, 0.044], [0.046, 0.0415], [0.056, 0.035]].map(([x, y], q) => {
      const [p, nn] = onFace(sx * x, y + (s - 2.5) * 0.0012 * (1 - q * 0.17) + (Math.random() - 0.5) * 0.0005); return p.addScaledVector(nn, 0.0015);
    });
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0022, 6), browM, brows);
  }
  // ears: a flattened shell with a rim, big and standing out a little
  for (const sx of [-1, 1]) {
    const eg = new THREE.Group(); eg.position.set(sx * 0.078, -0.008, -0.01); eg.rotation.set(0, sx * 0.5, sx * -0.08); headG.add(eg);
    const shell = ball(1, skin, eg); shell.scale.set(0.011, 0.035, 0.022);
    const rim = mesh(new THREE.TorusGeometry(1, 0.17, 8, 24), skin, eg); rim.rotation.y = Math.PI / 2; rim.scale.set(0.02, 0.034, 0.013); rim.position.x = sx * 0.004;
  }
  // eyes: very big eyeballs with an amber iris and a pupil that follow you, two catchlights, and lids that blink
  const eyes = [-1, 1].map(sx => {
    const R = 0.024, EX = 0.033, EY = 0.002, [p] = onFace(sx * EX, EY), g = new THREE.Group(); g.position.set(sx * EX, EY, p.z - R * 0.5); headG.add(g);
    const look = new THREE.Group(); g.add(look);
    ball(R, Object.assign(mat(0xf8f5f0, 0.25), { envMapIntensity: 0.35 }), look);
    const iris = mesh(new THREE.SphereGeometry(R * 1.004, 32, 6, 0, Math.PI * 2, 0, 0.7), mat(0xffffff, 0.2, 0, irisTex), look); iris.rotation.x = Math.PI / 2;
    const pupil = mesh(new THREE.SphereGeometry(R * 1.008, 16, 4, 0, Math.PI * 2, 0, 0.3), mat(0x050505, 0.05), look); pupil.rotation.x = Math.PI / 2;
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    mesh(new THREE.SphereGeometry(0.0032, 10, 8), white, look).position.set(0.006, 0.008, R * 0.93);       // a catchlight, and a smaller one across from it
    mesh(new THREE.SphereGeometry(0.0015, 8, 6), white, look).position.set(-0.006, -0.005, R * 0.95);
    // the cornea: a clear dome over the iris that only adds what it reflects, the lights and the room
    const cornea = mesh(new THREE.SphereGeometry(R * 1.025, 24, 8, 0, Math.PI * 2, 0, 0.6), new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.08, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, envMapIntensity: 0.5 }), look);
    cornea.rotation.x = Math.PI / 2; cornea.castShadow = cornea.receiveShadow = false;
    const lidM = skin;
    const upper = mesh(new THREE.SphereGeometry(R + 0.0009, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidM, g);
    const lower = mesh(new THREE.SphereGeometry(R + 0.0008, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), lidM, g); lower.rotation.x = 0.62;
    const lash = mesh(new THREE.TorusGeometry(R + 0.0009, 0.0015, 5, 24, Math.PI), browM, upper); lash.rotation.x = Math.PI / 2;
    return { look, upper };
  });

  // the helmet: a road helmet, long and tapering to a tail at the back, its shell cut into ribs by long vents that run
  // front to back, over a dark liner that shows through them. A sphere turned on its side, so its rings run front to back.
  const PH0 = -(Math.PI / 2 + 0.45), PHL = Math.PI + 0.5;                        // from low at the back, over the top, to the brow
  const helmetGeo = (r, cut) => {
    const geo = new THREE.SphereGeometry(r, 128, 128, PH0, PHL); geo.rotateZ(-Math.PI / 2);
    const q = geo.attributes.position, uv = geo.attributes.uv, col = new Float32Array(q.count * 3);
    for (let i = 0; i < q.count; i++) {
      let x = q.getX(i), y = q.getY(i), z = q.getZ(i);
      if (z < 0) { z *= 1.38; y -= 0.24 * z * z; }                                // the tail
      q.setXYZ(i, x, y, z);
      const u = uv.getX(i), rim = u < 0.05 || u > 0.97 ? 0.12 : 1;                // a dark trim round the edge
      col.set(rim < 1 ? [0.12, 0.12, 0.13] : [1, 1, 1], i * 3);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    if (cut) {                                                                    // the vents: eight slots, the outer ones shorter
      const vent = (u, v) => {
        for (const c of [0.045, 0.135, 0.225, 0.315]) for (const sv of [-1, 1]) {
          const k = Math.round((c - 0.045) / 0.09), lo = 0.16 + 0.07 * k, hi = 0.9 - 0.05 * k, mid = (lo + hi) / 2, half = (hi - lo) / 2;
          const along = Math.abs(u - mid) / half; if (along >= 1) continue;
          if (Math.abs(v - (0.5 + sv * c)) < 0.03 * Math.pow(1 - along ** 4, 0.5)) return true;
        }
        return false;
      };
      const ix = geo.index.array, keep = [];
      for (let t = 0; t < ix.length; t += 3) {
        const [i0, i1, i2] = [ix[t], ix[t + 1], ix[t + 2]];
        if (!vent((uv.getX(i0) + uv.getX(i1) + uv.getX(i2)) / 3, (uv.getY(i0) + uv.getY(i1) + uv.getY(i2)) / 3)) keep.push(i0, i1, i2);
      }
      geo.setIndex(keep);
    }
    geo.computeVertexNormals();
    return geo;
  };
  const helmetG = new THREE.Group(); helmetG.scale.set(0.096, 0.097, 0.114); helmetG.position.set(0, 0.042, -0.008); helmetG.rotation.x = -0.24; headG.add(helmetG);
  mesh(helmetGeo(1, true), new THREE.MeshPhysicalMaterial({ color: 0xf2553a, vertexColors: true, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15, side: THREE.DoubleSide }), helmetG);
  mesh(helmetGeo(0.93, false), new THREE.MeshStandardMaterial({ color: 0x1e1f23, roughness: 0.9, side: THREE.DoubleSide }), helmetG);
  for (const sx of [-1, 1]) mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([P(sx * 0.087, 0.03, 0.0), P(sx * 0.084, -0.05, 0.022), P(sx * 0.048, -0.1, 0.03), P(0, -0.117, 0.03)]), 12, 0.0022, 5), mat(0x18181b, 0.6), headG);
  headG.scale.setScalar(1.36);                           // a big head, as cartoons have

  // anti-aliased: the window is drawn into its own multisampled target, then onto the screen
  let rt = null;
  const quadS = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false })); quadS.add(quad);

  const ik = (A, T, L1, L2, pole) => {                 // two-bone reach: where the knee or elbow goes
    const d = new V3().subVectors(T, A), D = Math.min(d.length(), L1 + L2 - 1e-3); d.normalize();
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
    return new V3().copy(A).addScaledVector(d, a).addScaledVector(p, h);
  };
  const st8 = { crank: 0, rpm: 85, eff: 0.5, talk: 0, gestureAt: -9, blinkAt: 2, breath: 0, gazeAt: 0, gaze: new V3() }, aim = new V3();
  let lit = false;
  const studioLight = () => {                             // the room the rider is lit by and reflects: soft boxes of light, blurred
    lit = true;
    try { const pm = new THREE.PMREMGenerator(renderer); S.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); hemiL.intensity = 0.7; } catch (err) {}
  };
  let ac = null, an = null, buf = null;
  return {
    listen(audioEl) {                                    // measure how loud the coach is, to move the mouth
      try {
        ac = ac || new AudioContext(); if (ac.state !== 'running') { ac.resume(); return; }
        if (!an) { an = ac.createAnalyser(); an.fftSize = 512; buf = new Uint8Array(an.fftSize); an.connect(ac.destination); }
        ac.createMediaElementSource(audioEl).connect(an);
      } catch (err) {}
    },
    line(l) {                                             // a line starts (or null: the coach stops talking)
      if (l && (/!/.test(l.text) || /^(ok-|finish)/.test(l.id))) st8.gestureAt = performance.now() / 1000;
    },
    // one frame. show: whether the window is up; cadence: pedal turns a minute; effort: the share of full power asked for
    // (0.5 is easy, 1 is all out); talking: whether the coach is speaking
    draw(dt, { show, cadence = 85, effort = 0.5, talking = false }) {
      box.hidden = !show;
      if (!show) return;
      if (!lit) studioLight();
      const t = performance.now() / 1000;
      // pedalling, effort, breathing and voice
      st8.rpm += (cadence - st8.rpm) * Math.min(1, dt * 1.5);
      st8.crank += st8.rpm / 60 * Math.PI * 2 * dt;
      st8.eff += (effort - st8.eff) * Math.min(1, dt * 0.8);
      const e = Math.max(0, Math.min(1, (st8.eff - 0.45) / 0.5)), c = st8.crank;
      st8.breath += dt * (0.35 + 0.45 * e) * Math.PI * 2;                                    // faster breathing when it's hard
      let lvl = 0;
      if (an && talking) { an.getByteTimeDomainData(buf); let q = 0; for (const v of buf) q += (v - 128) * (v - 128); lvl = Math.min(1, Math.sqrt(q / buf.length) / 22); }
      else if (talking) lvl = 0.35 + 0.35 * Math.abs(Math.sin(t * 11)) * Math.abs(Math.sin(t * 3.7));   // the browser's voice can't be measured
      st8.talk += (lvl - st8.talk) * Math.min(1, dt * 18);
      flyG.rotation.x = c * 2.6;                                                                // the flywheel turns the same way as the cranks, faster
      // body: lean with the effort, a little bob and sway with each pedal stroke
      const lean = 0.5 + 0.25 * e, breathe = Math.sin(st8.breath);
      const hip = P(Math.sin(c) * 0.012 * e, 1.07 + Math.sin(2 * c) * 0.01 * (0.4 + e), -0.26);
      const shoulder = hip.clone().add(P(Math.sin(c) * 0.022 * e, Math.cos(lean) * 0.53, Math.sin(lean) * 0.53));
      hips.position.copy(hip).add(P(0, -0.01, 0.01));
      between(torso, hip.clone().add(P(0, -0.02, 0)), shoulder.clone().add(P(0, 0.06, 0)));
      torso.scale.x = 1 + 0.012 * breathe; torso.scale.z = 1 + 0.04 * breathe;
      // legs to the pedals, turning forwards: over the top, down the front, back along the bottom
      for (const k of [0, 1]) {
        const side = k ? 1 : -1, a = c + (k ? 0 : Math.PI);
        const pedal = P(side * 0.14, BB.y - 0.17 * Math.cos(a), BB.z - 0.17 * Math.sin(a));
        between(crankArm[k], P(side * 0.07, BB.y, BB.z), P(side * 0.07, pedal.y, pedal.z));
        pedalM[k].position.copy(pedal);
        const H = hip.clone().add(P(side * 0.095, -0.03, 0)), foot = pedal.clone().add(P(0, 0.05, 0.02));
        const kn = ik(H, foot, 0.45, 0.44, P(side * 0.08, 0.3, 1));
        leg[k].set(H, kn, foot);
        shoes[k].position.copy(pedal).add(P(0, 0.045, 0.03)); shoes[k].rotation.x = 0.1 * Math.sin(a + 0.6);
      }
      // arms on the bars, or the right fist up for a moment on a lively line
      const g = Math.max(0, Math.min(1, (t - st8.gestureAt) / 0.25)) * Math.max(0, Math.min(1, (st8.gestureAt + 1.6 - t) / 0.35));
      for (const k of [0, 1]) {
        const side = k ? 1 : -1, S0 = shoulder.clone().add(P(side * 0.175, -0.04, 0));
        const hg = handG[k]; hg.position.copy(HAND_AT[k]); hg.quaternion.copy(HAND_Q[k]);
        if (k && g > 0) { hg.position.lerp(shoulder.clone().add(P(0.31, 0.29, 0.2 + 0.03 * Math.sin(t * 9))), g); hg.quaternion.slerp(FIST_Q, g); }
        const wrist = WRIST.clone().applyQuaternion(hg.quaternion).add(hg.position);
        const el = ik(S0, wrist, 0.29, 0.26, P(side * 0.7, -0.4, -0.4));
        delt[k].position.copy(S0).add(P(-side * 0.006, 0, 0)); arm[k].set(S0, el, wrist);
      }
      // head: on the neck, looking at you (all the more while talking), nodding with the voice; he blinks, smiles on the lively lines
      const neckTop = shoulder.clone().add(P(0, Math.cos(lean * 0.4) * 0.12, Math.sin(lean * 0.4) * 0.12)), nd = new V3().subVectors(neckTop, shoulder).normalize();
      between(neck, shoulder.clone().add(P(0, 0.02, 0)), neckTop.clone().addScaledVector(nd, 0.03));
      collar.position.copy(shoulder).addScaledVector(nd, 0.035); collar.quaternion.setFromUnitVectors(new V3(0, 0, 1), nd);
      headG.position.copy(neckTop).add(P(0, 0.1 + st8.talk * 0.006 * Math.sin(t * 7) + 0.004 * e * Math.sin(2 * c + 0.8), 0.035));
      const look = headG.position.clone().add(P(0.1 * Math.sin(t * 0.23), -0.15, 1)).lerp(cam.position, 0.72 + 0.2 * Math.min(1, st8.talk * 3));
      headG.lookAt(look); headG.rotateZ(0.05 * Math.sin(t * 0.4) + 0.04 * st8.talk * Math.sin(t * 2.3));
      if (t > st8.blinkAt) st8.blinkAt = t + 2.5 + Math.random() * 3;
      const blink = Math.max(0, 1 - Math.abs(st8.blinkAt - t - 0.07) / 0.07);
      if (t > st8.gazeAt) {                                 // the eyes do not stare: now and then they flick a little off you, and back
        st8.gazeAt = t + 0.6 + Math.random() * 2.2;
        if (Math.random() < 0.55 || talking && Math.random() < 0.5) st8.gaze.set(0, 0, 0); else st8.gaze.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.14, 0);
      }
      aim.copy(cam.position).add(st8.gaze);
      for (const ey of eyes) { ey.look.lookAt(aim); ey.upper.rotation.x = -0.78 + 0.15 * e + blink * (1.4 - 0.15 * e); }
      const jaw = head.morphTargetInfluences[0] = Math.min(1, 0.2 * g + st8.talk * 0.9);   // at rest the lips are closed, on a smile
      head.morphTargetInfluences[1] = 0.75 + 0.25 * g + 0.1 * Math.min(1, st8.talk * 2);
      tongue.position.set(0, MOUTH_Y - 0.012 - 0.007 * jaw, lipZ - 0.023);
      teeth.position.y = MOUTH_Y + 0.013 - 0.009 * Math.min(1, jaw * 2);   // the upper teeth: behind the lip, peeping under it as the mouth opens
      brows.position.y = 0.0015 * Math.min(1, st8.talk * 2) * (0.5 + 0.5 * Math.sin(t * 1.7)) - 0.0012 * e;
      // draw: into the multisampled target, then into the window's rectangle on screen
      const rc = box.getBoundingClientRect(), dpr = renderer.getPixelRatio(), W = Math.round(rc.width * dpr), Hh = Math.round(rc.height * dpr);
      if (!rt || rt.width !== W || rt.height !== Hh) {
        if (rt) rt.dispose();
        rt = new THREE.WebGLRenderTarget(W, Hh, { samples: 4, type: THREE.HalfFloatType });
        quad.material.map = rt.texture; quad.material.needsUpdate = true;
      }
      cam.aspect = rc.width / rc.height; cam.updateProjectionMatrix();
      const exposure = renderer.toneMappingExposure;
      renderer.setRenderTarget(rt); renderer.render(S, cam); renderer.setRenderTarget(null);
      renderer.toneMappingExposure = 0.85;
      renderer.setScissorTest(true);
      renderer.setScissor(rc.left, innerHeight - rc.bottom, rc.width, rc.height); renderer.setViewport(rc.left, innerHeight - rc.bottom, rc.width, rc.height);
      renderer.render(quadS, quadCam);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
      renderer.toneMappingExposure = exposure;
    }
  };
};
