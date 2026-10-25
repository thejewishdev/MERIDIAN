/* =========================================================
   MERIDIAN — the planet
   A real 3D Earth (three.js): day/night shading with city lights,
   ocean glint, drifting clouds, atmosphere, and our routes.
   ========================================================= */
(() => {
  const wrap = document.getElementById('globe');
  const canvas = document.getElementById('globeCanvas');
  const labelLayer = document.getElementById('globeLabels');
  const chipsEl = document.getElementById('globeChips');
  if (!wrap || !canvas) return;

  const DEG = Math.PI / 180;
  const flag = c => `assets/img/flags/${c}.svg`;
  const places = [
    { n: 'Lisbon', c: 'pt', lat: 38.72, lon: -9.14, home: true },
    { n: 'Paris', c: 'fr', lat: 48.86, lon: 2.35 },
    { n: 'Tuscany', c: 'it', lat: 43.46, lon: 11.17 },
    { n: 'Santorini', c: 'gr', lat: 36.39, lon: 25.46 },
    { n: 'Cappadocia', c: 'tr', lat: 38.64, lon: 34.83 },
    { n: 'Maasai Mara', c: 'ke', lat: -1.49, lon: 35.14 },
    { n: 'Maldives', c: 'mv', lat: 3.87, lon: 72.82 },
    { n: 'Bali', c: 'id', lat: -8.34, lon: 115.09 },
    { n: 'Tokyo', c: 'jp', lat: 35.68, lon: 139.69 },
    { n: 'Tahiti', c: 'pf', lat: -17.85, lon: -149.27 }
  ];

  // chips are in the HTML (so nothing shifts when this script arrives late); just wire them up
  places.forEach((p, i) => {
    let b = chipsEl.children[i];
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<img class="flag" src="${flag(p.c)}" alt="">${p.n}`;
      chipsEl.appendChild(b);
    }
    b.addEventListener('click', () => focusOn(p));
    p.chip = b;
  });

  const webgl = (() => { try { return !!(window.THREE && window.EARTH_TEX && canvas.getContext('webgl')); } catch { return false; } })();
  if (!webgl) {
    wrap.classList.add('globe--fallback');
    const f = document.createElement('div');
    f.className = 'globe__fallback';
    if (window.EARTH_TEX) f.style.setProperty('--tex', `url(${EARTH_TEX.day})`);
    wrap.prepend(f);
    document.dispatchEvent(new Event('globe:ready'));
    return;
  }

  /* ---------- scene ---------- */
  // on retina screens the pixel density already smooths edges, so skip MSAA there
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 2, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  camera.position.set(0, 0, 4.6);

  const sunDir = new THREE.Vector3(-.65, .35, .7).normalize();   // fixed in view space: sunlit from upper-left
  const loader = new THREE.TextureLoader();
  // once every texture is in, draw one frame straight away (still behind the loader): the GPU upload and shader
  // compile then happen before anyone scrolls (otherwise they cause a visible hitch); main.js lifts the loader after
  let texPending = 0;
  const warmUp = () => {
    renderer.render(scene, camera);
    document.dispatchEvent(new Event('globe:ready'));
  };
  const tex = k => {
    texPending++;
    const t = loader.load(EARTH_TEX[k], t2 => {
      // relief is sampled one texel apart, whatever size the bump map is (phones get a half-size set)
      if (k === 'bump' && t2.image) earthMat.uniforms.bumpTexel.value.set(1 / t2.image.width, 1 / t2.image.height);
      if (--texPending === 0) warmUp();
    });
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
  };

  // position on the unit sphere matching three's equirectangular UVs
  const toVec = (lat, lon, r = 1) => {
    const phi = (90 - lat) * DEG, theta = (lon + 180) * DEG;
    return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
  };

  const earthGroup = new THREE.Group();
  earthGroup.rotation.order = 'XYZ';
  scene.add(earthGroup);

  /* ---------- earth surface ---------- */
  const earthMat = new THREE.ShaderMaterial({
    uniforms: {
      dayTex: { value: tex('day') }, nightTex: { value: tex('night') },
      waterTex: { value: tex('water') }, bumpTex: { value: tex('bump') },
      bumpTexel: { value: new THREE.Vector2(1 / 1024, 1 / 512) },
      sunDir: { value: sunDir }
    },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform sampler2D dayTex, nightTex, waterTex, bumpTex;
      uniform vec2 bumpTexel;
      uniform vec3 sunDir;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vec3 n = normalize(vN);
        vec3 v = normalize(cameraPosition - vP);
        // cheap relief from the topology map
        float h = texture2D(bumpTex, vUv).r;
        float hx = texture2D(bumpTex, vUv + vec2(bumpTexel.x, 0.0)).r - h;
        float hy = texture2D(bumpTex, vUv + vec2(0.0, bumpTexel.y)).r - h;
        float d = dot(n, sunDir) + (hx + hy) * 1.6;
        float dayMix = smoothstep(-0.18, 0.22, d);

        vec3 day = texture2D(dayTex, vUv).rgb;
        day = pow(day, vec3(0.9)) * 1.12;
        vec3 night = texture2D(nightTex, vUv).rgb;
        night = pow(night, vec3(1.4)) * vec3(1.6, 1.25, 0.8);

        vec3 col = mix(night + day * 0.03, day * (0.18 + 0.95 * max(d, 0.0)), dayMix);

        // sun glint on the oceans
        float water = texture2D(waterTex, vUv).r;
        vec3 hv = normalize(sunDir + v);
        float spec = pow(max(dot(n, hv), 0.0), 60.0) * water * dayMix;
        col += vec3(1.0, 0.86, 0.68) * spec * 0.9;

        // atmospheric rim on the surface itself
        float fres = pow(1.0 - max(dot(n, v), 0.0), 2.6);
        col = mix(col, vec3(0.42, 0.66, 1.0), fres * (0.25 + 0.55 * dayMix));
        // warm band along the terminator
        col += vec3(1.0, 0.42, 0.15) * 0.18 * (1.0 - abs(dayMix * 2.0 - 1.0)) * smoothstep(-0.3, 0.1, d);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), earthMat);
  earthGroup.add(earth);

  /* ---------- clouds ---------- */
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { cloudTex: { value: tex('clouds') }, sunDir: { value: sunDir }, shift: { value: 0 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
        vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform sampler2D cloudTex; uniform vec3 sunDir; uniform float shift;
      varying vec2 vUv; varying vec3 vN; varying vec3 vP;
      void main() {
        vec3 n = normalize(vN);
        float c = texture2D(cloudTex, vUv + vec2(shift, 0.0)).r;
        float d = dot(n, sunDir);
        float lit = smoothstep(-0.2, 0.35, d);
        vec3 col = mix(vec3(0.05, 0.06, 0.1), vec3(1.0), lit);
        gl_FragColor = vec4(col, c * (0.25 + 0.6 * lit) * 0.85);
      }`,
    transparent: true, depthWrite: false
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 48), cloudMat);
  earthGroup.add(clouds);

  /* ---------- atmosphere glow ---------- */
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.13, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: sunDir } },
      vertexShader: `
        varying vec3 vN; varying vec3 vW;
        void main() {
          vN = normalize(normalMatrix * normal);
          vW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 sunDir;
        varying vec3 vN; varying vec3 vW;
        void main() {
          // back faces: 0 at the outer edge of the shell, 1 at the planet's limb
          float i = pow(smoothstep(0.0, 0.47, -dot(vN, vec3(0.0, 0.0, 1.0))), 2.2);
          float lit = 0.35 + 0.65 * smoothstep(-0.4, 0.5, dot(vW, sunDir));
          gl_FragColor = vec4(vec3(0.36, 0.62, 1.0), i * lit * 0.9);
        }`,
      side: THREE.BackSide, transparent: true, depthWrite: false
    })
  );
  scene.add(atmo);

  /* ---------- markers ---------- */
  const SUN = 0xff5b23, INK = 0x15120f;
  const ringGeo = new THREE.RingGeometry(.022, .03, 40);
  places.forEach(p => {
    p.pos = toVec(p.lat, p.lon, 1.003);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(p.home ? .016 : .013, 16, 12), new THREE.MeshBasicMaterial({ color: p.home ? 0xfff9ef : SUN }));
    dot.position.copy(p.pos);
    earthGroup.add(dot);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: p.home ? 0xfff9ef : SUN, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.copy(p.pos);
    ring.lookAt(p.pos.clone().multiplyScalar(2));
    earthGroup.add(ring);
    p.ring = ring;

    const el = document.createElement('div');
    el.className = 'globe__label' + (p.home ? ' is-home' : '');
    el.innerHTML = `<img class="flag" src="${flag(p.c)}" alt="">${p.home ? 'HQ · ' : ''}${p.n}`;
    el.addEventListener('click', () => focusOn(p));
    labelLayer.appendChild(el);
    p.el = el;
  });

  /* ---------- flight routes ---------- */
  const routes = [];
  for (let i = 0; i < places.length - 1; i++) {
    const a = places[i].pos.clone().normalize(), b = places[i + 1].pos.clone().normalize();
    const ang = a.angleTo(b), lift = .06 + ang * .14, pts = [];
    for (let k = 0; k <= 64; k++) {
      const t = k / 64;
      const p = new THREE.Vector3().copy(a).multiplyScalar(Math.sin((1 - t) * ang) / Math.sin(ang))
        .add(b.clone().multiplyScalar(Math.sin(t * ang) / Math.sin(ang)));
      pts.push(p.multiplyScalar(1.004 + Math.sin(Math.PI * t) * lift));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const ghost = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, .0035, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .28, depthWrite: false }));
    const live = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, .006, 8, false),
      new THREE.MeshBasicMaterial({ color: SUN }));
    live.geometry.setDrawRange(0, 0);
    const plane = new THREE.Mesh(new THREE.SphereGeometry(.014, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    plane.visible = false;
    earthGroup.add(ghost, live, plane);
    routes.push({ curve, live, plane, count: live.geometry.index.count });
  }

  /* ---------- sizing ---------- */
  let halfW = 0, halfH = 0;
  let lastW = 0, lastH = 0;
  const resize = () => {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    // phones fire resize whenever the URL bar shows/hides; resizing the canvas then would clear and reallocate it for nothing
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    halfW = w / 2; halfH = h / 2;
    renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  /* ---------- interaction ---------- */
  // start with Europe → Africa → Asia facing us
  const state = { ry: -toYaw(places[3]), rx: 22 * DEG, vy: 0, auto: true };
  earthGroup.rotation.set(state.rx, state.ry, 0);
  function toYaw(p) { const v = toVec(p.lat, p.lon); return Math.atan2(v.x, v.z); }

  let dragging = false, lastX = 0, lastY = 0, focusTween = null, idleTimer = null;
  const pauseAuto = () => { state.auto = false; clearTimeout(idleTimer); idleTimer = setTimeout(() => state.auto = true, 5000); };
  canvas.addEventListener('pointerdown', e => {
    dragging = true; lastX = e.clientX; lastY = e.clientY; state.vy = 0;
    focusTween && focusTween.kill();
    canvas.setPointerCapture(e.pointerId); pauseAuto();
  });
  canvas.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    state.ry += dx * .006; state.rx = Math.max(-1.1, Math.min(1.1, state.rx + dy * .004));
    state.vy = dx * .006;
    lastX = e.clientX; lastY = e.clientY;
  });
  const release = () => { dragging = false; pauseAuto(); };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  function focusOn(p) {
    if (!webgl) return;
    pauseAuto();
    clearTimeout(idleTimer); idleTimer = setTimeout(() => state.auto = true, 7000);
    let target = -toYaw(p);
    // shortest way round
    target = state.ry + ((((target - state.ry) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
    state.vy = 0;
    focusTween && focusTween.kill();
    const rx = Math.max(-1.1, Math.min(1.1, p.lat * DEG));
    if (window.gsap) focusTween = gsap.to(state, { ry: target, rx, duration: 1.8, ease: 'power3.inOut' });
    else { state.ry = target; state.rx = rx; }
    places.forEach(q => { q.el.classList.toggle('is-active', q === p && !q.home); q.chip.classList.toggle('is-active', q === p); });
  }

  /* ---------- render loop (only while on screen) ---------- */
  let visible = false, last = performance.now(), t = 0;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '100px' }).observe(wrap);
  const tmp = new THREE.Vector3(), tmpN = new THREE.Vector3(), camDir = new THREE.Vector3();

  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    // 60fps is plenty for a slowly turning planet: on 120Hz screens this halves the globe's GPU work
    if (now - last < 1000 / 64) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    t += dt;

    if (!dragging) {
      if (state.auto) state.ry += dt * .09;
      state.ry += state.vy; state.vy *= .94;
    }
    earthGroup.rotation.x = state.rx;
    earthGroup.rotation.y = state.ry;
    cloudMat.uniforms.shift.value = (t * .0035) % 1;

    // routes light up one after another, a little plane flies each leg
    const legDur = 1.6, cycle = routes.length * legDur + 2.5;
    const ct = t % cycle;
    routes.forEach((r, i) => {
      const local = Math.max(0, Math.min(1, (ct - i * legDur) / legDur));
      const eased = local < .5 ? 2 * local * local : 1 - Math.pow(-2 * local + 2, 2) / 2;
      r.live.geometry.setDrawRange(0, Math.floor(r.count * eased / 3) * 3);
      r.plane.visible = local > 0 && local < 1;
      if (r.plane.visible) r.plane.position.copy(r.curve.getPoint(eased));
    });

    // pulsing rings
    places.forEach((p, i) => {
      const k = (t * .8 + i * .17) % 1;
      p.ring.scale.setScalar(1 + k * 2.4);
      p.ring.material.opacity = (1 - k) * .9;
    });

    renderer.render(scene, camera);

    // HTML labels follow their markers and hide behind the planet
    // (sizes are cached on resize and styles only written when they change: no layout work per frame)
    camDir.copy(camera.position).normalize();
    places.forEach(p => {
      tmp.copy(p.pos).applyMatrix4(earthGroup.matrixWorld);
      const facing = tmpN.copy(tmp).normalize().dot(camDir);
      tmp.project(camera);
      const x = (tmp.x + 1) * halfW, y = (1 - tmp.y) * halfH;
      const o = Math.round(Math.max(0, Math.min(1, (facing - .15) / .25)) * 100) / 100;
      if (o !== p.o) {
        p.o = o;
        p.el.style.opacity = o;
        const pe = o > .5 ? 'auto' : 'none';
        if (pe !== p.pe) { p.pe = pe; p.el.style.pointerEvents = pe; }
      }
      if (o > 0 || p.lastT === undefined) {
        const tr = `translate3d(${(x + 12).toFixed(1)}px, ${(y - 11).toFixed(1)}px, 0) scale(${.85 + o * .15})`;
        if (tr !== p.lastT) { p.lastT = tr; p.el.style.transform = tr; }
      }
    });
  }
  requestAnimationFrame(frame);
})();
