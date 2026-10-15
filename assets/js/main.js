/* =========================================================
   MERIDIAN — interactions
   ========================================================= */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const flagURL = code => `assets/img/flags/${code}.svg`;
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    // phones resize the viewport when the URL bar hides; don't re-measure everything mid-scroll
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  // every journey starts at take-off: scroll scenes are measured from the top
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const startHash = location.hash;
  scrollTo(0, 0);

  /* =========================================================
     LOADER — split-flap departure board
     ========================================================= */
  const board = $('#board');
  const BOARD_LEN = 10;
  const flaps = Array.from({ length: BOARD_LEN }, () => {
    const f = document.createElement('div');
    f.className = 'flap';
    f.textContent = ' ';
    board.appendChild(f);
    return f;
  });
  function setBoard(word) {
    const left = Math.max(0, Math.floor((BOARD_LEN - word.length) / 2));
    const centred = (' '.repeat(left) + word).padEnd(BOARD_LEN, ' ').slice(0, BOARD_LEN);
    flaps.forEach((f, i) => {
      const target = centred[i];
      let n = 3 + i + ((Math.random() * 4) | 0);
      clearInterval(f._t);
      f._t = setInterval(() => {
        f.classList.remove('is-flipping'); void f.offsetWidth; f.classList.add('is-flipping');
        if (--n <= 0) { f.textContent = target; clearInterval(f._t); }
        else f.textContent = CHARS[(Math.random() * CHARS.length) | 0];
      }, 70);
    });
  }
  const loaderWords = ['TOKYO', 'PARIS', 'BALI', 'SANTORINI', 'TUSCANY', 'BON VOYAGE'];
  let lw = 0;
  setBoard(loaderWords[lw]);
  const boardTimer = setInterval(() => { if (lw < loaderWords.length - 1) setBoard(loaderWords[++lw]); }, 520);

  const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#loaderClock').textContent = clock();

  // real preload: the board stays up only until the hero photo is downloaded and decoded, no longer
  const heroImg = $('#heroImg');
  let loaded = false, shownPct = 0;
  const t0 = performance.now();
  // decode() resolves once the photo is ready to paint, so the curtain never lifts on a half-drawn sky
  const whenLoaded = heroImg.complete ? Promise.resolve() : new Promise(ok => { heroImg.addEventListener('load', ok, { once: true }); heroImg.addEventListener('error', ok, { once: true }); });
  whenLoaded.then(() => heroImg.decode ? heroImg.decode() : 0).catch(() => {}).then(() => { loaded = true; });
  (function tick() {
    if (loaded || performance.now() - t0 > 7000) { finishLoading(); return; } // never block forever
    // creep towards 90% while waiting; finishLoading jumps to 100
    shownPct += (90 - shownPct) * .04;
    $('#loaderPct').textContent = Math.round(shownPct);
    $('#loaderBar').style.transform = `scaleX(${shownPct / 100})`; // a transform, not width: no layout per frame while the photo decodes
    requestAnimationFrame(tick);
  })();

  let started = false;
  function finishLoading() {
    if (started) return; started = true;
    clearInterval(boardTimer);
    setBoard('BON VOYAGE');
    $('#loaderPct').textContent = '100';
    $('#loaderBar').style.transform = 'scaleX(1)';
    requestAnimationFrame(() => {
      document.body.classList.remove('is-loading');
      if (hasGSAP) {
        gsap.to('#loader', { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut', onComplete: () => $('#loader').remove() });
        introHero(.55);
      } else {
        $('#loader').remove();
      }
      scrollTo(0, 0);
      initScenes();
      if (hasGSAP) ScrollTrigger.refresh();
      const target = startHash && document.querySelector(startHash);
      if (target) setTimeout(() => goTo(target), 1200);
      queueGlobe();
    });
  }

  /* =========================================================
     GLOBE — three.js + textures + globe.js, loaded on demand
     ========================================================= */
  let globeQueued = false;
  const loadScript = src => new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.async = false; s.onload = ok; s.onerror = fail;
    document.body.appendChild(s);
  });
  function loadGlobe() {
    if (globeQueued) return; globeQueued = true;
    // phones get half-size textures: their globe is ~350px wide, so 2048px maps were never visible there
    const small = matchMedia('(max-width: 900px)').matches;
    // over http the textures are plain WebP files (smaller, cached, decoded off the main thread);
    // opened from disk (file://) WebGL refuses them, so fall back to the copies embedded in JS
    const local = location.protocol === 'file:';
    if (!local) {
      const dir = small ? 'assets/img/earth/sm/' : 'assets/img/earth/';
      window.EARTH_TEX = Object.fromEntries(['day', 'night', 'water', 'bump', 'clouds'].map(k => [k, dir + k + '.webp']));
    }
    // fetched in parallel, executed in order
    Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'),
      local && loadScript(small ? 'assets/js/earth-textures-sm.js' : 'assets/js/earth-textures.js'),
      loadScript('assets/js/globe.js')
    ]).catch(() => {});
  }
  function queueGlobe() {
    // streams in during idle time once the hero is up; anyone who scrolls straight down gets it sooner
    'requestIdleCallback' in window ? requestIdleCallback(loadGlobe, { timeout: 2500 }) : setTimeout(loadGlobe, 1200);
    // then the section photos, decoded one by one long before anyone reaches them
    setTimeout(startWarmUp, 2500);
    if (!('IntersectionObserver' in window)) return;
    const gio = new IntersectionObserver(([e]) => { if (e.isIntersecting) { gio.disconnect(); loadGlobe(); } }, { rootMargin: '100% 0px' });
    gio.observe($('#globe'));
  }

  /* =========================================================
     SCROLLING — native. The page used to scroll through Lenis (JS smooth scroll): every frame of scrolling then
     ran on the main thread, so any busy moment stalled the scroll itself, its smoothing made the page trail the
     trackpad, and Safari caps such JS-driven motion at 60fps even on 120Hz screens. Native scrolling runs on the
     browser's compositor thread: it stays smooth whatever the page is doing, and Mac trackpads already glide.
     ========================================================= */
  const goTo = target => target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  if (finePointer) {
    // "gliding" = scrolling fast enough that content slides under a resting pointer: hover is switched off only
    // then (see style.css), so passing content doesn't fire photo zooms, card tilts or the experience panels
    const root = document.documentElement;
    let lastY = scrollY, lastT = performance.now(), glideTimer = 0;
    addEventListener('scroll', () => {
      const now = performance.now(), v = Math.abs(scrollY - lastY) / Math.max(1, now - lastT) * 16.7; // px per frame
      lastY = scrollY; lastT = now;
      if (v < 8) return;
      if (!root.classList.contains('is-gliding')) root.classList.add('is-gliding');
      clearTimeout(glideTimer);
      glideTimer = setTimeout(() => root.classList.remove('is-gliding'), 80);
    }, { passive: true });
  }
  // mobile menu
  const menu = $('#menu'), menuBtn = $('#menuBtn');
  const setMenu = open => {
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', open);
    menu.setAttribute('aria-hidden', !open);
  };
  menuBtn.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  $$('a', menu).forEach(a => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { setMenu(false); menuBtn.focus(); } });

  $$('[data-scroll]').forEach(a => a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    const target = id && $(id);
    if (!target) return;
    e.preventDefault();
    goTo(target);
  }));

  /* =========================================================
     HERO — pause its loops (photo drift, film grain, blinking dot) while it's off screen
     ========================================================= */
  new IntersectionObserver(([e]) => {
    $('#heroStage').classList.toggle('is-offscreen', !e.isIntersecting);
  }).observe($('#heroStage'));
  // endless CSS loops (swinging luggage tags, live-time dots, hint arrows) still cost a style pass every
  // frame while the page scrolls, even off screen; pause each section's loops while it's out of view
  const loops = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('is-offscreen', !e.isIntersecting)));
  $$('#destinations, #why').forEach(s => loops.observe(s));

  function introHero(delay) {
    const tl = gsap.timeline({ delay });
    tl.from('.reel', { scale: 1.25, duration: 2.2, ease: 'expo.out' }, 0)
      .from('.hero__title .line-mask > span', { yPercent: 110, duration: 1.3, stagger: .12, ease: 'expo.out' }, .55)
      .from('.hero__kicker .line-mask > span', { yPercent: 110, duration: 1, ease: 'expo.out' }, .5)
      .from('.hud, .nav, .scroll-cue, .rail', { opacity: 0, duration: 1 }, 1);
  }

  /* =========================================================
     SCROLL-DRIVEN SCENES
     ========================================================= */
  // passport turner; set up in initScenes for the current layout (laptop spread / phone single pages)
  let ppGo = null;

  function initScenes() {
    if (!hasGSAP) return;
    // anticipatePin pins a little early to hide the lag between native (threaded) scrolling and the pin
    const pinAhead = 1;
    const mm = gsap.matchMedia();

    // --- Hero → airplane window
    mm.add({ desktop: '(min-width: 901px)', mobile: '(max-width: 900px)' }, ctx => {
      const { desktop } = ctx.conditions;
      // the window's final opening (top/right/bottom/left in %, corner radius in px)
      const [t, r, b, l, rad] = desktop ? [15, 34, 15, 34, 180] : [20, 14, 30, 14, 120];
      // one progress value drives both the video's clip and the window frame, so the frame always hugs the picture
      const win = { p: 0 };
      const frame = $('.window-frame'), reelFrame = $('#reelFrame');
      const drawWindow = () => {
        const p = win.p, k = n => (n * p).toFixed(3);
        reelFrame.style.clipPath = `inset(${k(t)}% ${k(r)}% ${k(b)}% ${k(l)}% round ${k(rad)}px)`;
        frame.style.inset = `${k(t)}% ${k(r)}% ${k(b)}% ${k(l)}%`;
        frame.style.borderRadius = `${k(rad)}px`;
      };
      drawWindow();
      const tl = gsap.timeline({
        scrollTrigger: { trigger: '.hero', start: 'top top', end: '+=130%', scrub: true, pin: true, anticipatePin: pinAhead } // native scrolling is already smooth: follow it directly
      });
      tl.to('#heroContent', { y: -80, opacity: 0, duration: .3, ease: 'power1.in' }, 0)
        .to('.hud, #scrollCue', { opacity: 0, duration: .2, ease: 'none' }, 0)
        .to('.reel__shade', { opacity: .35, duration: .6, ease: 'none' }, 0)
        .to(win, { p: 1, duration: 1, ease: 'power1.inOut', onUpdate: drawWindow }, 0)
        .fromTo('.window-frame', { opacity: 0 }, { opacity: 1, duration: .45, ease: 'power1.out' }, .2)
        .fromTo('#windowCopy', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .35, ease: 'power2.out' }, .7)
        .fromTo('.window-glow', { opacity: 0 }, { opacity: 1, duration: .25, ease: 'none' }, .85)
        .fromTo('.window-frame__shade', { scaleY: 0 }, { scaleY: 1, duration: .3, ease: 'power2.out' }, .9)
        .to({}, { duration: .2 }); // rest on the finished window before the page moves on
      return () => { reelFrame.style.clipPath = ''; frame.style.inset = ''; frame.style.borderRadius = ''; };
    });

    // --- Marquee driven by scroll velocity
    $$('.marquee__row').forEach(row => {
      const track = $('.marquee__track', row);
      row.appendChild(track.cloneNode(true));
      const dir = +row.dataset.dir;
      let x = 0, speed = 1, w = track.offsetWidth, on = false;
      const setX = gsap.quickSetter(row.children, 'x', 'px');
      const tick = () => {
        x -= (0.6 + speed) * dir;
        if (x <= -w) x += w; if (x > 0) x -= w;
        setX(x);
        speed += (0 - speed) * .06;
      };
      ScrollTrigger.create({
        trigger: row, start: 'top bottom', end: 'bottom top',
        onToggle: s => { if (s.isActive && !on) { gsap.ticker.add(tick); on = true; } else if (!s.isActive && on) { gsap.ticker.remove(tick); on = false; } },
        onUpdate: s => { speed = Math.min(14, Math.abs(s.getVelocity()) / 220); },
        onRefresh: () => { w = track.offsetWidth; }
      });
    });

    // --- Why us: a passport you open and leaf through (swipe it, or use the arrows); scrolling never turns the pages
    const ppHolder = $('#ppFaces');
    const ppFaces = $$('.pp-face', ppHolder);
    const book = $('#ppBook');
    const blank = () => { const d = document.createElement('div'); d.className = 'pp-page'; return d; };
    mm.add({ spread: '(min-width: 901px)', single: '(max-width: 900px)' }, ctx => {
      const spread = ctx.conditions.spread;
      // laptop: two pages per sheet (front | back); phone: one page per sheet
      const sheets = spread
        ? [[0, 1], [2, 3], [4, 5], [6, null]].map(([f, b]) => [ppFaces[f], b === null ? blank() : ppFaces[b]])
        : ppFaces.map(f => [f, blank()]);
      const baseL = document.createElement('div'), baseR = document.createElement('div');
      baseL.className = 'pp-base pp-base--left'; baseR.className = 'pp-base pp-base--right';
      book.append(baseL, baseR);
      const leaves = sheets.map(([front, back], i) => {
        const leaf = document.createElement('div');
        leaf.className = 'leaf' + (i === 0 ? ' leaf--cover' : '');
        leaf.style.zIndex = sheets.length - i;
        // a hair of real depth per sheet, so turning pages never z-fight with their neighbours
        gsap.set(leaf, { z: (sheets.length - i) * .5 });
        leaf.innerHTML = '<div class="leaf__side leaf__side--front"><i class="leaf__shade"></i></div><div class="leaf__side leaf__side--back"><i class="leaf__shade"></i></div>';
        leaf.children[0].prepend(front);
        leaf.children[1].prepend(back);
        book.appendChild(leaf);
        return leaf;
      });
      const inks = el => $$('.pp-stamp, .pp-mini, .pp-next', el);
      // force3D:false keeps the stamps painted into their page: as 3D layers they'd escape the page's
      // backface-visibility and show through, mirrored, once it has turned
      gsap.set(inks(book), { opacity: 0, scale: 2.4, force3D: false });
      if (spread) gsap.set(book, { xPercent: -25 }); // closed passport sits centred

      // the whole book as one paused timeline; each click plays it forward or back to the next resting point
      const flips = leaves.length - 1;
      const tl = gsap.timeline({ paused: true });
      const rests = [0];
      let t = 0;
      leaves.slice(0, flips).forEach((leaf, i) => {
        const [shadeF, shadeB] = $$('.leaf__shade', leaf);
        // each shade only exists while its own face is towards the viewer and it has something to show
        const shade = el => { let shown = false; return (o, facing) => {
          const on = facing && o > 0;
          if (on !== shown) { shown = on; el.style.visibility = on ? 'visible' : 'hidden'; }
          el.style.opacity = o;
        }; };
        const setShadeF = shade(shadeF), setShadeB = shade(shadeB);
        // phones fade the turned page out via its back face: fading the leaf itself would flatten its 3D
        const setFade = spread ? null : gsap.quickSetter(leaf.children[1], 'opacity');
        // per frame only compositor-friendly writes (opacity on promoted layers); stacking changes
        // just once, when the page passes upright, instead of on every frame of the turn
        let turned = null, lastF = -1, lastB = -1, lastFade = -1, lastOver = null;
        tl.to(leaf, {
          rotationY: -180, duration: 1, ease: 'power2.inOut',
          onUpdate() {
            const r = this.ratio * 180;  // 0 → 180
            const over = r > 90;
            if (over !== turned) {
              turned = over;
              leaf.style.zIndex = over ? 100 + i : leaves.length - i;
              gsap.set(leaf, { z: over ? (i + 1) * .5 : (leaves.length - i) * .5 });
            }
            const f = Math.round(Math.min(1, r / 90) * 90) / 100, b = Math.round(Math.max(0, 1 - (r - 90) / 90) * 90) / 100;
            if (f !== lastF || over !== lastOver) setShadeF(lastF = f, !over);
            if (b !== lastB || over !== lastOver) setShadeB(lastB = b, over);
            lastOver = over;
            if (setFade) {
              const o = r < 110 ? 1 : Math.round(Math.max(0, 1 - (r - 110) / 45) * 100) / 100;
              if (o !== lastFade) {
                // a fully faded page leaves the 3D stack entirely rather than being composited at opacity 0
                if ((o === 0) !== (lastFade === 0)) leaf.style.visibility = o === 0 ? 'hidden' : '';
                setFade(lastFade = o);
              }
            }
          }
        }, t);
        if (i === 0 && spread) {
          tl.to(book, { xPercent: 0, duration: 1, ease: 'power2.inOut' }, t)
            .to(baseL, { opacity: 1, duration: .2 }, t + .45);
        }
        // stamp whatever pages this flip uncovers
        const shown = spread ? [leaf.children[1], leaves[i + 1].children[0]] : [leaves[i + 1].children[0]];
        const marks = shown.flatMap(inks);
        if (marks.length) tl.to(marks, { opacity: 1, scale: 1, duration: .28, stagger: .18, ease: 'power4.in', force3D: false }, t + .95);
        // rest once this page and its stamps have landed; the next turn starts from there
        t = tl.duration();
        rests.push(t);
      });

      let page = 0, tween = null;
      const prev = $('#ppPrev'), next = $('#ppNext'), count = $('#ppCount');
      const sync = () => {
        prev.disabled = page === 0;
        next.disabled = page === rests.length - 1;
        count.textContent = page === 0 ? 'Cover' : `Page ${page} / ${rests.length - 1}`;
      };
      ppGo = n => {
        page = Math.max(0, Math.min(rests.length - 1, n));
        tween && tween.kill();
        // a turn takes about a second whichever way, and never stacks up if clicked fast
        tween = tl.tweenTo(rests[page], { duration: Math.min(1.6, Math.max(.5, Math.abs(tl.time() - rests[page]) * .8)), ease: 'none' });
        sync();
      };
      ppGo.page = () => page;
      sync();

      return () => {
        tween && tween.kill(); tl.kill(); ppGo = null;
        ppFaces.forEach(f => ppHolder.appendChild(f));
        book.innerHTML = '';
        gsap.set(book, { clearProps: 'all' });
        gsap.set(inks(ppHolder), { clearProps: 'all' });
      };
    });
  }

  /* =========================================================
     PASSPORT CONTROLS — arrows, or a sideways swipe on the passport (finger, or two fingers on a trackpad).
     Nothing here listens to page scrolling; vertical scrolling over the passport stays native.
     ========================================================= */
  $('#ppPrev').addEventListener('click', () => ppGo && ppGo(ppGo.page() - 1));
  $('#ppNext').addEventListener('click', () => ppGo && ppGo(ppGo.page() + 1));
  const passportEl = $('#passport');
  // touch / pen / mouse drag: a mostly horizontal move of 40px or more turns one page
  let sx = 0, sy = 0, tracking = false;
  passportEl.addEventListener('pointerdown', e => { tracking = true; sx = e.clientX; sy = e.clientY; });
  passportEl.addEventListener('pointerup', e => {
    if (!tracking || !ppGo) return; tracking = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) ppGo(ppGo.page() + (dx < 0 ? 1 : -1));
  });
  passportEl.addEventListener('pointercancel', () => { tracking = false; });
  // trackpad: a sideways two-finger swipe arrives as wheel events with deltaX; one gesture turns one page.
  // passive, so it can never hold up scrolling
  let wx = 0, wheelLock = false, wheelIdle = 0;
  passportEl.addEventListener('wheel', e => {
    if (!ppGo || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => { wheelLock = false; wx = 0; }, 180); // gesture (and its momentum) over
    if (wheelLock) return;
    wx += e.deltaX;
    if (Math.abs(wx) > 60) { wheelLock = true; ppGo(ppGo.page() + (wx > 0 ? 1 : -1)); }
  }, { passive: true });

  /* =========================================================
     FLIGHT RAIL + ODOMETER
     ========================================================= */
  const stops = $$('#railStops li');
  const railFill = $('#railFill'), plane = $('#railPlane'), odo = $('#odoKm');
  const odoBox = $('#odometer'), odoChapter = $('#odoChapter'), footer = $('.footer');
  const nav = $('#nav'), rail = $('#rail');
  // the km digits change on every scroll frame: edit the text node in place (the span is size-contained in CSS, so only it relays out)
  const odoText = odo.firstChild || odo.appendChild(document.createTextNode(''));
  let railH = 0, stopTops = [], footerTop = Infinity, docMax = 1, heroEnd = 0, darkRanges = [], destRange = [0, 0], lastSeg = -1, lastKm = -1;
  const measure = () => {
    const docTop = el => el.getBoundingClientRect().top + scrollY;
    footerTop = docTop(footer);
    docMax = document.documentElement.scrollHeight - innerHeight;
    heroEnd = docTop($('.marquee'));
    darkRanges = $$('.exp, .arrival, .footer').map(el => [docTop(el), docTop(el) + el.offsetHeight]);
    const dl = $('.dlist'); destRange = [docTop(dl), docTop(dl) + dl.offsetHeight];
    stopTops = stops.map(li => {
      const sec = document.getElementById(li.dataset.target);
      return sec ? sec.getBoundingClientRect().top + scrollY : 0;
    });
    stops.forEach((li, i) => { li.style.top = (i / (stops.length - 1)) * 100 + '%'; });
    railH = rail.offsetHeight;
  };
  const updateRail = () => {
    if (!stopTops.length) return;
    const y = scrollY + innerHeight * .4;
    let seg = 0;
    while (seg < stopTops.length - 1 && y >= stopTops[seg + 1]) seg++;
    let frac = 0;
    if (seg < stopTops.length - 1) frac = Math.min(1, Math.max(0, (y - stopTops[seg]) / (stopTops[seg + 1] - stopTops[seg])));
    if (scrollY >= docMax - 2) { seg = stopTops.length - 1; frac = 0; }
    const p = Math.min(1, (seg + frac) / (stopTops.length - 1));
    railFill.style.transform = `scaleY(${p})`;
    plane.style.transform = `translateY(${p * railH}px) translateY(-50%) rotate(180deg)`;
    if (seg !== lastSeg) {
      lastSeg = seg;
      stops.forEach((li, i) => { li.classList.toggle('is-passed', i <= seg); li.classList.toggle('is-current', i === seg); });
      odoChapter.textContent = `Ch. 0${seg} — ${stops[seg].textContent.trim()}`;
    }
    // hidden in the hero, over the activity panels (bottom-left) and in the footer
    const [expTop, expBottom] = darkRanges[0] || [0, 0];
    const overActs = scrollY + innerHeight > expTop + 200 && scrollY < expBottom - innerHeight * .4;
    // the destination photos alternate sides and reach the bottom-left corner: step aside there too
    const overDests = scrollY + innerHeight > destRange[0] + 200 && scrollY + innerHeight < destRange[1];
    odoBox.classList.toggle('is-on', scrollY > innerHeight * .9 && scrollY + innerHeight < footerTop + 120 && !overActs && !overDests);
    const km = Math.round(Math.min(1, scrollY / Math.max(1, docMax)) * 40075);
    if (km !== lastKm) { lastKm = km; odoText.data = String(km).padStart(5, '0').replace(/(\d{2})(\d{3})/, '$1 $2'); }
    // light text over dark sections, dark text over paper
    const darkAt = (screenY, heroLimit) => {
      if (scrollY < heroEnd - screenY) return scrollY < heroLimit;
      const d = scrollY + screenY;
      return darkRanges.some(([a, b]) => d >= a && d < b);
    };
    nav.classList.toggle('on-dark', darkAt(40, innerHeight * .55));
    nav.classList.toggle('is-scrolled', scrollY > heroEnd - 80);
    rail.classList.toggle('on-dark', darkAt(innerHeight / 2, innerHeight * .12));
    odoBox.classList.toggle('on-dark', darkAt(innerHeight - 40, innerHeight * .1));
  };
  stops.forEach(li => li.addEventListener('click', () => {
    const t = document.getElementById(li.dataset.target);
    goTo(t);
  }));
  if (hasGSAP) ScrollTrigger.addEventListener('refresh', () => { measure(); updateRail(); });
  addEventListener('load', () => { measure(); updateRail(); });
  addEventListener('resize', () => { measure(); updateRail(); });
  addEventListener('scroll', updateRail, { passive: true });
  measure();

  /* =========================================================
     LIVE LOCAL TIMES
     ========================================================= */
  const tzEls = $$('[data-tz]');
  const updateTimes = () => tzEls.forEach(el => {
    try { el.textContent = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', timeZone: el.dataset.tz }).format(new Date()); }
    catch { el.textContent = '—'; }
  });
  updateTimes(); setInterval(updateTimes, 15000);

  /* =========================================================
     PHOTO WARM-UP — decode every section photo (off the main thread) during idle
     time after load, one at a time, so none decodes while its section scrolls in
     ========================================================= */
  // Starting only when a section came near was too late: the pinned passport and destinations hold the
  // page for several screens, then a flick reaches experiences/postcards before their photos were ready
  // (each decode on arrival showed up as a visible hitch at the section's heading)
  const warmSections = $$('#destinations, #experiences, #postcards');
  const warmQueue = warmSections.flatMap(sec => $$('img[loading="lazy"]:not(.flag)', sec));
  // the postcard lettering is filled with a photo set as a CSS background: warm those too
  $$('#postcards [style*="background-image"]').forEach(el => {
    const url = (el.style.backgroundImage.match(/url\(["']?([^"')]+)/) || [])[1];
    if (url) { const img = new Image(); img.src = url; warmQueue.push(img); }
  });
  let warming = false;
  const warmNext = () => {
    const img = warmQueue.shift();
    if (!img) { warming = false; return; }
    warming = true;
    img.loading = 'eager';
    (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() =>
      'requestIdleCallback' in window ? requestIdleCallback(warmNext, { timeout: 400 }) : setTimeout(warmNext, 30));
  };
  function startWarmUp() { if (!warming) warmNext(); }
  if ('IntersectionObserver' in window) {
    // jumping ahead (menu link, hard fling): the section you're heading for goes to the front of the queue
    const ahead = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      ahead.unobserve(e.target);
      const mine = warmQueue.filter(img => e.target.contains(img));
      if (!mine.length) return;
      warmQueue.splice(0, warmQueue.length, ...mine, ...warmQueue.filter(img => !mine.includes(img)));
      startWarmUp();
    }), { rootMargin: '150% 0px' });
    warmSections.forEach(sec => ahead.observe(sec));
  }

  /* =========================================================
     POSTCARD DECK
     ========================================================= */
  const deckCards = $$('#deck .card');
  let order = deckCards.map((_, i) => i);
  const layout = () => order.forEach((cardIdx, pos) => deckCards[cardIdx].dataset.pos = pos);
  layout();
  const top = () => deckCards[order[0]];
  const flip = () => top().classList.toggle('is-flipped');
  const nextCard = () => {
    const leaving = top();
    leaving.classList.add('is-leaving');
    setTimeout(() => {
      leaving.classList.remove('is-leaving', 'is-flipped');
      order.push(order.shift());
      layout();
    }, 550);
  };
  deckCards.forEach(c => c.addEventListener('click', () => { if (c === top()) flip(); }));
  $('#flipBtn').addEventListener('click', flip);
  $('#nextBtn').addEventListener('click', nextCard);
  // flip the first postcard once when it comes into view, so people discover the back
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setTimeout(() => top().classList.add('is-flipped'), 900); io.disconnect(); }
    }, { threshold: .6 });
    io.observe($('#deck'));
  }

  /* =========================================================
     BOARDING PASS
     ========================================================= */
  const toSelect = $('#toSelect');
  const syncTo = () => {
    const opt = toSelect.selectedOptions[0];
    $('#toFlag').src = flagURL(opt.value);
    $('#stubCode').textContent = opt.dataset.code;
  };
  toSelect.addEventListener('change', syncTo);

  const monthSel = $('#monthSelect');
  const now = new Date();
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const o = document.createElement('option');
    o.textContent = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    monthSel.appendChild(o);
  }

  let travellers = 2;
  $$('.counter button').forEach(b => b.addEventListener('click', () => {
    travellers = Math.max(1, Math.min(12, travellers + +b.dataset.step));
    $('#travellers').textContent = travellers;
  }));

  // barcode
  const bc = $('#barcode');
  let stops2 = [], x = 0;
  while (x < 100) {
    const w = .6 + Math.random() * 2.2, gap = .6 + Math.random() * 1.6;
    stops2.push(`var(--ink) ${x}% ${x + w}%`, `transparent ${x + w}% ${x + w + gap}%`);
    x += w + gap;
  }
  bc.style.background = `linear-gradient(90deg, ${stops2.join(',')})`;

  $('#pass').addEventListener('submit', e => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.name.value || 'Traveller').trim().split(' ')[0];
    const dest = toSelect.selectedOptions[0].textContent;
    form.classList.add('is-sent');
    $$('input, select, button', form).forEach(el => el.disabled = true);
    setTimeout(() => {
      $('#passThanks').textContent = dest === 'Surprise me'
        ? `Bon voyage, ${name}! A surprise is being drawn up — expect a letter from our crew within 24 hours.`
        : `Bon voyage, ${name}! Your ${dest} journey is being sketched — expect a letter from our crew within 24 hours.`;
    }, 900);
  });

  /* =========================================================
     MAGNETIC BUTTONS + HERO DRIFT
     ========================================================= */
  if (finePointer && hasGSAP) {
    $$('[data-magnetic]').forEach(btn => {
      const mx = gsap.quickTo(btn, 'x', { duration: .5, ease: 'elastic.out(1, .4)' });
      const my = gsap.quickTo(btn, 'y', { duration: .5, ease: 'elastic.out(1, .4)' });
      btn.addEventListener('pointermove', e => {
        const b = btn.getBoundingClientRect();
        mx((e.clientX - b.left - b.width / 2) * .3);
        my((e.clientY - b.top - b.height / 2) * .4);
      });
      btn.addEventListener('pointerleave', () => { mx(0); my(0); });
    });

    // hero headline drifts with the mouse
    const hx = gsap.quickTo('.hero__title', 'x', { duration: 1.2, ease: 'power3' });
    const hy = gsap.quickTo('.hero__title', 'y', { duration: 1.2, ease: 'power3' });
    $('#heroStage').addEventListener('pointermove', e => {
      const nx = e.clientX / innerWidth - .5, ny = e.clientY / innerHeight - .5;
      hx(nx * -18); hy(ny * -10);
    });
  }

})();
