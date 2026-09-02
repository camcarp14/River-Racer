/* ============================================================================
 * River Racer — audio.js
 * 100% procedural WebAudio. No assets, no network, no THREE dependency.
 * Attaches RR.Audio. Every public method is guarded and never throws.
 * ==========================================================================*/
(function () {
  'use strict';

  window.RR = window.RR || {};

  // --------------------------------------------------------------------------
  // Internal state
  // --------------------------------------------------------------------------
  var ctx = null;            // AudioContext
  var master = null;         // master GainNode
  var comp = null;           // master DynamicsCompressorNode
  var fxBus = null;          // one-shot bus
  var engineBus = null;      // engine bus
  var ambBus = null;         // ambience bus (wash / deck / traffic / hum / train)
  var masterLevel = 0.9;     // remembered even before init
  var engine = null;         // active engine rig
  var wantEngine = null;     // engine kind requested while muted — started on unmute
  var ambience = null;       // persistent lake/wind ambience rig
  var noiseBufs = {};        // cached noise AudioBuffers
  var music = {
    playing: false,
    mode: null,            // 'title' | 'race'
    wantMode: null,        // requested before the ctx existed — honored on init
    interval: null,
    step: 0,
    nextTime: 0,
    stepDur: 60 / 112 / 4, // 16th note; set per mode
    stepsTotal: 128,       // 8 bars of 16 steps
    level: 0.16,           // bus target; set per mode
    bus: null, padFilter: null, padGain: null,
    bassFilter: null, bassGain: null,
    hatFilter: null, hatGain: null,
    kickGain: null,
    sources: []
  };

  var TAU_FAST = 0.03, TAU_MED = 0.07, TAU_SLOW = 0.35;
  var EPS = 0.0001;

  // --- space (bridge / lock reverb send) -------------------------------------
  var sendGain = null, sendLP = null, convolver = null, wetGain = null;
  var IR_BRIDGE = null, IR_LOCK = null, irIsLock = false;
  var fbDelay = null, fbGain = null, fbLP = null, usingConvolver = true, lowFpsT = 0;
  // --- rivals (doppler) ------------------------------------------------------
  var rivalVoices = null;
  // --- sustained voices ------------------------------------------------------
  var scrapeVoice = null, gratingVoice = null;
  // --- ambience layers -------------------------------------------------------
  var amb = null, ambClock = { train: 14, gull: 6, thump: 1 };
  // --- mix levels ------------------------------------------------------------
  var musicLevel = 1, sfxLevel = 1;
  var musicLP = null, intensity = 0.3;
  var lastThrottle = 0;

  // --------------------------------------------------------------------------
  // Sound is OFF until the player asks for it.
  // Nothing here half-measures it with a zero gain: while muted no AudioContext is ever
  // constructed, so there is no graph, no scheduler and no autoplay prompt — the page is silent
  // in the strongest sense the platform offers. The choice is remembered, and localStorage is
  // wrapped because a file:// origin is allowed to refuse storage outright.
  // --------------------------------------------------------------------------
  var SOUND_KEY = 'rr_sound';
  var muted = true;
  try { if (localStorage.getItem(SOUND_KEY) === 'on') muted = false; } catch (e) { /* no storage */ }
  function persistMute() {
    try { localStorage.setItem(SOUND_KEY, muted ? 'off' : 'on'); } catch (e) { /* fine */ }
  }

  // --------------------------------------------------------------------------
  // Small helpers
  // --------------------------------------------------------------------------
  function clamp(v, lo, hi) {
    v = +v;
    if (!isFinite(v)) v = lo;
    return v < lo ? lo : (v > hi ? hi : v);
  }
  function clamp01(v) { return clamp(v, 0, 1); }
  function now() { return ctx.currentTime; }
  function setT(param, value, tau) {
    if (param) param.setTargetAtTime(value, ctx.currentTime, tau || TAU_MED);
  }
  function gain(v) {
    var g = ctx.createGain();
    g.gain.value = (v === undefined) ? 1 : v;
    return g;
  }
  // Gentle tanh saturation curve for WaveShaperNode
  function shaperCurve(k) {
    var n = 1024, curve = new Float32Array(n), norm = Math.tanh(k);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / norm;
    }
    return curve;
  }
  function makeShaper(k) {
    var ws = ctx.createWaveShaper();
    ws.curve = shaperCurve(k);
    ws.oversample = '2x';
    return ws;
  }
  function noiseBuffer(kind) {
    if (noiseBufs[kind]) return noiseBufs[kind];
    var len = Math.floor(ctx.sampleRate * 2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var i, w, last = 0;
    if (kind === 'brown') {
      for (i = 0; i < len; i++) {
        w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    } else { // white
      for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    noiseBufs[kind] = buf;
    return buf;
  }
  function noiseSource(kind) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(kind);
    src.loop = true;
    return src;
  }
  // One-shot cleanup: when the "anchor" source ends, disconnect everything.
  function cleanupOnEnd(anchor, nodes) {
    anchor.onended = function () {
      for (var i = 0; i < nodes.length; i++) {
        try { nodes[i].disconnect(); } catch (e) { /* ignore */ }
      }
      anchor.onended = null;
    };
  }
  // Simple attack/decay envelope on a gain param.
  function env(g, t0, attack, peak, dur) {
    g.gain.setValueAtTime(EPS, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(EPS, t0 + dur);
  }
  function panNode(pan) {
    if (typeof ctx.createStereoPanner === 'function') {
      var p = ctx.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1);
      return p;
    }
    return gain(1); // fallback: pass-through
  }

  // --------------------------------------------------------------------------
  // Engine definitions — distinct character per boat kind
  // --------------------------------------------------------------------------
  var ENGINES = {
    // Whiny high-rev 2-stroke: saw+square detuned, high base pitch, whine formant
    jetski: {
      base: 180,
      oscs: [
        { type: 'sawtooth', ratio: 1.00, detune: -8, gain: 0.45 },
        { type: 'square',   ratio: 1.00, detune:  8, gain: 0.28 },
        { type: 'sawtooth', ratio: 2.01, detune:  4, gain: 0.22 },
        { type: 'square',   ratio: 3.02, detune: -3, gain: 0.10 }
      ],
      sub: null,
      drive: 2.2,
      bpBase: 900, bpRange: 2600, bpQ: 1.1,
      lpBase: 7000,
      formant: { freq: 2400, q: 6, db: 9 },
      noise: { bp: 2800, q: 0.7, gain: 0.10 },
      am: { rate: 55, rateRpm: 40, depth: 0.10, depthRpm: -0.04 },
      idle: 0.10, full: 0.30
    },
    // Throaty V8 burble: low saw stack + sub osc + slow amplitude LFO rumble
    speedboat: {
      base: 62,
      oscs: [
        { type: 'sawtooth', ratio: 1.00, detune: -6, gain: 0.50 },
        { type: 'sawtooth', ratio: 1.00, detune:  6, gain: 0.50 },
        { type: 'sawtooth', ratio: 2.00, detune:  3, gain: 0.18 }
      ],
      sub: { ratio: 0.5, gain: 0.55 },
      drive: 3.2,
      bpBase: 380, bpRange: 950, bpQ: 0.9,
      lpBase: 3600,
      formant: null,
      noise: { bp: 800, q: 0.6, gain: 0.12 },
      am: { rate: 8, rateRpm: 6, depth: 0.22, depthRpm: -0.10 },
      idle: 0.12, full: 0.32
    },
    // Screaming high-RPM race engine: rich saw stack, aggressive bandpass sweep
    f1: {
      base: 130,
      oscs: [
        { type: 'sawtooth', ratio: 1.00, detune: -5, gain: 0.40 },
        { type: 'sawtooth', ratio: 1.00, detune:  5, gain: 0.40 },
        { type: 'sawtooth', ratio: 2.00, detune: -3, gain: 0.30 },
        { type: 'sawtooth', ratio: 3.00, detune:  3, gain: 0.18 },
        { type: 'square',   ratio: 1.50, detune:  0, gain: 0.12 }
      ],
      sub: null,
      drive: 2.6,
      bpBase: 500, bpRange: 5200, bpQ: 1.6,
      lpBase: 9000,
      formant: { freq: 3200, q: 4, db: 6 },
      noise: { bp: 3500, q: 0.8, gain: 0.07 },
      am: { rate: 90, rateRpm: 80, depth: 0.06, depthRpm: 0 },
      idle: 0.10, full: 0.30
    },
    // Vintage inboard putter: low pitch, strong ~20-40Hz amplitude modulation
    runabout: {
      base: 46,
      oscs: [
        { type: 'sawtooth', ratio: 1.00, detune: -4, gain: 0.50 },
        { type: 'triangle', ratio: 1.00, detune:  4, gain: 0.35 },
        { type: 'square',   ratio: 2.00, detune:  0, gain: 0.12 }
      ],
      sub: { ratio: 0.5, gain: 0.50 },
      drive: 3.8,
      bpBase: 260, bpRange: 650, bpQ: 0.8,
      lpBase: 2200,
      formant: null,
      noise: { bp: 500, q: 0.5, gain: 0.14 },
      am: { rate: 22, rateRpm: 15, depth: 0.55, depthRpm: -0.25 },
      idle: 0.13, full: 0.30
    },
    // Turbine scream: bright saw stack, tall whine formant, heavy jet-wash noise, no throaty sub
    podracer: {
      base: 150,
      oscs: [
        { type: 'sawtooth', ratio: 1.00, detune: -6, gain: 0.34 },
        { type: 'sawtooth', ratio: 2.00, detune:  5, gain: 0.30 },
        { type: 'sawtooth', ratio: 3.01, detune: -4, gain: 0.20 },
        { type: 'sine',     ratio: 4.02, detune:  0, gain: 0.16 },
        { type: 'square',   ratio: 1.50, detune:  3, gain: 0.10 }
      ],
      sub: null,
      drive: 2.0,
      bpBase: 900, bpRange: 6200, bpQ: 1.5,
      lpBase: 11000,
      formant: { freq: 4300, q: 5, db: 9 },
      noise: { bp: 5200, q: 0.5, gain: 0.17 },
      am: { rate: 120, rateRpm: 95, depth: 0.05, depthRpm: -0.02 },
      idle: 0.10, full: 0.30
    }
  };

  // --------------------------------------------------------------------------
  // Core lifecycle
  // --------------------------------------------------------------------------
  function doInit() {
    if (muted) return;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();

      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.16;

      master = gain(masterLevel);
      master.connect(comp);
      comp.connect(ctx.destination);

      engineBus = gain(0.24 * sfxLevel); // engines (incl. spray) sit well under music + SFX
      engineBus.connect(master);
      fxBus = gain(0.9 * sfxLevel);
      fxBus.connect(master);
      // The ambience layers used to hang straight off master, which put the water wash, the deck
      // grating, the traffic bed, the mains hum and the L train outside the SFX fader entirely.
      ambBus = gain(0.9 * sfxLevel);
      ambBus.connect(master);

      buildSpace();
      ensureAmbience();
      if (!idleTimer) idleTimer = setInterval(ambIdle, 200);
    }
    doResume();
    // music requested before the first user gesture (title screen at boot) starts now
    if (music.wantMode && !music.playing) {
      var wm = music.wantMode;
      music.wantMode = null;
      doSetMode(wm, true);
    }
  }

  function doResume() {
    if (muted) return;   // a stray pointerdown must never wake a context the player muted
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      var p = ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  }

  // Every sustained voice is driven by setTargetAtTime from doUpdate, and main.js's update()
  // returns early while paused, on the results screen and at the title. When the feed stops, an
  // exponential target simply HOLDS its last value: pause under a bascule and the deck-grating
  // layer, the traffic bed and three rival engines all ring on forever under the menu. Nothing
  // outside this file can be relied on to say "stop"; the watchdog notices the feed died.
  var lastFeed = -1, idleTimer = null, idleQuiet = false;
  function ambIdle() {
    if (!ctx || lastFeed < 0) return;
    if (ctx.currentTime - lastFeed < 0.4) { idleQuiet = false; return; }
    if (idleQuiet) return;                    // one ramp per idle period, not five a second
    idleQuiet = true;
    if (ambience) { setT(ambience.gain.gain, EPS, 0.30); setT(ambience.lp.frequency, 320, 0.30); }
    if (amb) {
      setT(amb.comb.gain.gain, EPS, 0.12);
      setT(amb.traffic.gain.gain, EPS, 0.30);
      setT(amb.hum.gain.gain, EPS, 0.40);
    }
    if (scrapeVoice) setT(scrapeVoice.gain.gain, EPS, 0.08);
    if (windVoice) setT(windVoice.gain.gain, EPS, 0.30);
    // The motor was the one voice this watchdog never covered: measured -38.6 dBFS before ESC and
    // -38.3 dBFS three seconds into the pause, i.e. the engine roars on under the menu at whatever
    // throttle you were carrying. e.exGain and e.sub are inside e.out, so one gain is enough, and
    // doUpdate re-targets it on the next feed — resume needs no code at all.
    if (engine) setT(engine.out.gain, EPS, 0.25);
    if (engine) setT(engine.sprayGain.gain, EPS, 0.12);
    if (rivalVoices) for (var i = 0; i < rivalVoices.length; i++) setT(rivalVoices[i].g.gain, EPS, 0.20);
    if (sendGain) setT(sendGain.gain, EPS, 0.25);
  }

  // --------------------------------------------------------------------------
  // Mute
  // --------------------------------------------------------------------------
  function doSetMuted(on) {
    on = !!on;
    if (on === muted) { persistMute(); return; }
    muted = on;
    persistMute();
    if (muted) {
      if (!ctx) return;
      setT(master.gain, EPS, 0.02);
      setTimeout(function () {
        if (muted && ctx && typeof ctx.suspend === 'function') {
          var p = ctx.suspend();
          if (p && typeof p.catch === 'function') p.catch(function () {});
        }
      }, 120);
      return;
    }
    var first = !ctx;
    doInit();                                   // builds the graph on the very first unmute
    if (!ctx) return;
    var t = now();
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(EPS, t);
    master.gain.linearRampToValueAtTime(masterLevel, t + 0.25);
    // a race that started while muted has no engine rig and no race loop — build them now
    if (!first && wantEngine && !engine) doStartEngine(wantEngine);
    if (music.wantMode && !music.playing) {
      var wm = music.wantMode; music.wantMode = null; doSetMode(wm, true);
    }
  }

  // --------------------------------------------------------------------------
  // Space — the bridge / lock reverb send.
  // Going under the DuSable should be a MOMENT: the whole mix gets a room, the engine thickens,
  // the world outside goes dull, and it opens back out. That transition is worth more than any
  // other audio work here, so it gets its own bus and its own procedural impulse responses.
  // --------------------------------------------------------------------------
  function buildIR(seconds, decay, preDelayMs, tapsMs) {
    var sr = ctx.sampleRate, n = Math.floor(sr * seconds), b = ctx.createBuffer(2, n, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = b.getChannelData(ch), i;
      for (i = 0; i < n; i++) { var t = i / sr; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / seconds, decay); }
      for (var k = 0; k < tapsMs.length; k++) {
        var idx = Math.floor(sr * (tapsMs[k] + ch * 0.7) / 1000);
        if (idx < n) d[idx] += (ch ? -0.55 : 0.62);
      }
      var pre = Math.floor(sr * preDelayMs / 1000);
      for (i = n - 1; i >= pre; i--) d[i] = d[i - pre];
      for (i = 0; i < pre; i++) d[i] = 0;
    }
    return b;
  }

  function buildSpace() {
    if (sendGain || !ctx) return;
    sendGain = gain(EPS);
    sendLP = ctx.createBiquadFilter();
    sendLP.type = 'lowpass'; sendLP.frequency.value = 3200; sendLP.Q.value = 0.4;
    wetGain = gain(0.55);
    sendGain.connect(sendLP);

    IR_BRIDGE = buildIR(1.15, 3.4, 6, [11, 23, 37]);   // 3.8 m and 7.9 m first reflections
    IR_LOCK = buildIR(2.40, 2.2, 14, [19, 41, 63, 88]);
    if (typeof ctx.createConvolver === 'function') {
      convolver = ctx.createConvolver();
      convolver.buffer = IR_BRIDGE;
      sendLP.connect(convolver);
      convolver.connect(wetGain);
    } else {
      buildFallbackTail();
      sendLP.connect(fbDelay);
      usingConvolver = false;
    }
    wetGain.connect(master);
    engineBus.connect(sendGain);
    fxBus.connect(sendGain);
  }

  // R13's insurance, shipped with the convolver rather than after it: 3-tap feedback delay,
  // ~80% of the effect for ~0% of the cost.
  function buildFallbackTail() {
    if (fbDelay) return;
    fbDelay = ctx.createDelay(0.4);
    fbDelay.delayTime.value = 0.047;
    fbGain = gain(0.42);
    fbLP = ctx.createBiquadFilter();
    fbLP.type = 'lowpass'; fbLP.frequency.value = 2600;
    fbDelay.connect(fbLP); fbLP.connect(fbGain); fbGain.connect(fbDelay);
    fbLP.connect(wetGain);
  }

  function setConvolver(on) {
    if (!ctx || !sendLP || on === usingConvolver) return;
    usingConvolver = on;
    try { sendLP.disconnect(); } catch (e) { /* ignore */ }
    if (on && convolver) sendLP.connect(convolver);
    else { buildFallbackTail(); sendLP.connect(fbDelay); }
  }

  function doSetSpace(rev, damp) {
    if (!ctx) return;
    if (!sendGain) buildSpace();
    rev = clamp01(rev); damp = clamp01(damp);
    setT(sendGain.gain, Math.max(EPS, rev * 0.65), 0.08);   // fast in: the bridge arrives WITH you
    setT(sendLP.frequency, 4200 - 2600 * damp, 0.15);
    setT(wetGain.gain, 0.55 + 0.35 * rev, 0.12);
    // the lock is a 2.4 s concrete box; the bridge underside is 1.15 s. Swap on the boundary.
    var wantLock = damp > 0.75 && rev > 0.6;
    if (convolver && wantLock !== irIsLock) {
      irIsLock = wantLock;
      try { convolver.buffer = wantLock ? IR_LOCK : IR_BRIDGE; } catch (e) { /* ignore */ }
    }
  }

  // --------------------------------------------------------------------------
  // Ambience — five layers, not one brown-noise bed.
  // --------------------------------------------------------------------------
  function ensureAmbience() {
    if (ambience || !ctx) return;
    // A. water wash
    var src = noiseSource('brown');
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 360; lp.Q.value = 0.5;
    var g = gain(EPS);
    src.connect(lp); lp.connect(g); g.connect(ambBus);
    src.start();
    ambience = { src: src, lp: lp, gain: g };

    amb = {};
    // C. bridge-deck grating. A Chicago open-grid steel deck sings ONE note (~322 Hz) under tyres.
    // The first build got that note from a 3.1 ms feedback comb — but the Web Audio spec clamps a
    // DelayNode inside a feedback cycle to a whole render quantum, so the loop actually ran at
    // ~6.2 ms and rang an octave LOW, at 161 Hz, with every harmonic of it present: twelve
    // partials marching past 1.8 kHz, +28 dB of high-frequency energy over the rest of the
    // ambience. That is the definition of a buzz, and it was never the note that was wanted.
    // Two resonant bandpasses give the same singing note with nothing stacked above it.
    var cs = noiseSource('white');
    var cb1 = ctx.createBiquadFilter(); cb1.type = 'bandpass'; cb1.frequency.value = 322; cb1.Q.value = 16;
    var cb2 = ctx.createBiquadFilter(); cb2.type = 'bandpass'; cb2.frequency.value = 644; cb2.Q.value = 14;
    var cRoar = ctx.createBiquadFilter(); cRoar.type = 'lowpass'; cRoar.frequency.value = 520; cRoar.Q.value = 0.5;
    var cg = gain(EPS);
    cs.connect(cb1); cb1.connect(gainTo(3.6, cg));
    cs.connect(cb2); cb2.connect(gainTo(1.2, cg));
    cs.connect(cRoar); cRoar.connect(gainTo(0.10, cg));   // a little tyre roar under the note
    cg.connect(ambBus);
    cs.start();
    amb.comb = { gain: cg };

    // D. traffic overhead: pink-ish bed, tyre thumps scheduled from the clock
    var ts = noiseSource('brown');
    var tlp = ctx.createBiquadFilter(); tlp.type = 'lowpass'; tlp.frequency.value = 900;
    var tg = gain(EPS);
    ts.connect(tlp); tlp.connect(tg); tg.connect(ambBus);
    ts.start();
    amb.traffic = { gain: tg };

    // E. city hum: the 60 Hz mains note of a dense grid, plus its octave. Two pure sines have
    // nothing for a +7 dB resonance at 210 Hz to grip, so that filter only ever risked ringing on
    // whatever else got routed here; +3 dB is enough to give the pair a little body.
    var hg = gain(EPS);
    var hpk = ctx.createBiquadFilter();
    hpk.type = 'peaking'; hpk.frequency.value = 210; hpk.Q.value = 1.4; hpk.gain.value = 3;
    hg.connect(hpk); hpk.connect(ambBus);
    [60, 120].forEach(function (f, i) {
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      var og = gain(i ? 0.4 : 1);
      o.connect(og); og.connect(hg); o.start();
    });
    amb.hum = { gain: hg };
  }

  // little helper: a fixed trim gain feeding `dest`, returned so it can be connected into
  function gainTo(v, dest) { var g = gain(v); g.connect(dest); return g; }

  // B. the L train: a bandpassed swell, a wheel squeal at the peak, and the crossing bell.
  function doTrainPass(pan) {
    if (!ready()) return;
    var t = now(), dur = 6.0;
    var p = panNode(pan == null ? (Math.random() * 1.6 - 0.8) : pan);
    p.connect(ambBus || master);
    var s = noiseSource('brown');
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 90; bp.Q.value = 0.7;
    bp.frequency.linearRampToValueAtTime(500, t + dur * 0.55);
    bp.frequency.linearRampToValueAtTime(120, t + dur);
    var g = gain(EPS);
    s.connect(bp); bp.connect(g); g.connect(p);
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.055, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(EPS, t + dur);
    s.start(t); s.stop(t + dur + 0.1);
    cleanupOnEnd(s, [s, bp, g]);
    doLScreech(0, t + dur * 0.5, p);
    // two-tone crossing bell
    for (var i = 0; i < 4; i++) chimeNote(t + dur * 0.28 + i * 0.28, i % 2 ? 554.37 : 659.26, 0.08, 0.26);
    setTimeout(function () { try { p.disconnect(); } catch (e) { /* ignore */ } }, (dur + 1.5) * 1000);
  }

  // Egg #23: the flange squeal of an L consist taking a curve on the elevated structure.
  function doLScreech(pan, atTime, dest) {
    if (!ready()) return;
    var t = atTime || now(), dur = 1.2;
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1400, t);
    o.frequency.exponentialRampToValueAtTime(2600, t + dur);
    var v = ctx.createOscillator(); v.type = 'sine'; v.frequency.value = 11;
    var vg = gain(40); v.connect(vg); vg.connect(o.frequency);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 12;
    var g = gain(0);
    var out = dest || panNode(clamp(pan || 0, -1, 1));
    if (!dest) out.connect(fxBus);
    o.connect(bp); bp.connect(g); g.connect(out);
    env(g, t, 0.05, 0.06, dur);
    o.start(t); v.start(t); o.stop(t + dur + 0.05); v.stop(t + dur + 0.05);
    cleanupOnEnd(o, dest ? [o, v, vg, bp, g] : [o, v, vg, bp, g, out]);
  }

  // --------------------------------------------------------------------------
  // Engine
  // --------------------------------------------------------------------------
  function doStartEngine(kind) {
    wantEngine = kind;          // remembered so unmuting mid-race still gets you an engine
    if (!ctx) doInit();
    if (!ctx) return;
    if (engine) doStopEngine();

    var def = ENGINES[kind] || ENGINES.speedboat;
    var t = now();
    var sources = [], nodes = [];

    // Pre-shaper mix
    var mix = gain(0.7); nodes.push(mix);

    // Oscillator stack
    var oscs = [];
    for (var i = 0; i < def.oscs.length; i++) {
      var od = def.oscs[i];
      var o = ctx.createOscillator();
      o.type = od.type;
      o.frequency.value = def.base * od.ratio;
      o.detune.value = od.detune;
      var og = gain(od.gain);
      o.connect(og); og.connect(mix);
      o.start(t);
      sources.push(o); nodes.push(og);
      oscs.push({ osc: o, ratio: od.ratio });
    }

    // Sub oscillator (sine an octave down) for the throaty kinds
    var sub = null;
    if (def.sub) {
      sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.value = def.base * def.sub.ratio;
      var sg = gain(def.sub.gain);
      sub.connect(sg); sg.connect(mix);
      sub.start(t);
      sources.push(sub); nodes.push(sg);
    }

    // Exhaust / mechanical hiss: filtered noise fed into the same drive chain
    var exSrc = noiseSource('white');
    var exBp = ctx.createBiquadFilter();
    exBp.type = 'bandpass';
    exBp.frequency.value = def.noise.bp;
    exBp.Q.value = def.noise.q;
    var exGain = gain(def.noise.gain * 0.5);
    exSrc.connect(exBp); exBp.connect(exGain); exGain.connect(mix);
    exSrc.start(t);
    sources.push(exSrc); nodes.push(exBp, exGain);

    // Drive -> (formant) -> bandpass -> lowpass -> AM stage -> output
    var shaper = makeShaper(def.drive); nodes.push(shaper);

    var afterShaper = shaper;
    var formant = null;
    if (def.formant) {
      formant = ctx.createBiquadFilter();
      formant.type = 'peaking';
      formant.frequency.value = def.formant.freq;
      formant.Q.value = def.formant.q;
      formant.gain.value = def.formant.db;
      nodes.push(formant);
    }

    var bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = def.bpBase + def.bpRange * 0.15;
    bp.Q.value = def.bpQ;
    nodes.push(bp);

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = def.lpBase * 0.5;
    lp.Q.value = 0.4;
    nodes.push(lp);

    // Amplitude modulation (burble / putt-putt / flutter)
    var amp = gain(1 - def.am.depth); nodes.push(amp);
    var lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = def.am.rate;
    var lfoGain = gain(def.am.depth);
    lfo.connect(lfoGain); lfoGain.connect(amp.gain);
    lfo.start(t);
    sources.push(lfo); nodes.push(lfoGain);

    // Output gain, faded in to avoid pops (engine bus is padded to 0.45)
    var out = gain(EPS); nodes.push(out);
    out.gain.setTargetAtTime(def.idle, t, 0.15);

    // Rev limiter — race hulls only. A 28 Hz square chopping the output gain is instantly
    // legible as "on the limiter", and it costs two nodes.
    var limGain = null;
    if (kind === 'f1' || kind === 'podracer') {
      var lim = ctx.createOscillator();
      lim.type = 'square'; lim.frequency.value = 28;
      limGain = gain(0);
      lim.connect(limGain); limGain.connect(out.gain);
      lim.start(t);
      sources.push(lim); nodes.push(limGain);
    }

    mix.connect(shaper);
    if (formant) { shaper.connect(formant); formant.connect(bp); }
    else { shaper.connect(bp); }
    bp.connect(lp); lp.connect(amp); amp.connect(out); out.connect(engineBus);

    // Water spray: bright filtered noise, driven by speed/turning in update()
    var spSrc = noiseSource('white');
    var spBp = ctx.createBiquadFilter();
    spBp.type = 'bandpass';
    spBp.frequency.value = 2600;
    spBp.Q.value = 0.5;
    var spGain = gain(EPS);
    spSrc.connect(spBp); spBp.connect(spGain); spGain.connect(engineBus);
    spSrc.start(t);
    sources.push(spSrc); nodes.push(spBp, spGain);

    engine = {
      def: def, kind: kind,
      oscs: oscs, sub: sub,
      exGain: exGain,
      bp: bp, lp: lp, formant: formant,
      amp: amp, lfo: lfo, lfoGain: lfoGain,
      out: out, limGain: limGain,
      sprayBp: spBp, sprayGain: spGain,
      sources: sources, nodes: nodes
    };
  }

  function doStopEngine() {
    var e = engine;
    engine = null;
    wantEngine = null;
    if (!e || !ctx) return;
    var t = now();
    e.out.gain.cancelScheduledValues(t);
    e.out.gain.setTargetAtTime(EPS, t, 0.06);
    e.sprayGain.gain.setTargetAtTime(EPS, t, 0.04);
    setTimeout(function () {
      var i;
      for (i = 0; i < e.sources.length; i++) {
        try { e.sources[i].stop(); } catch (err) { /* ignore */ }
        try { e.sources[i].disconnect(); } catch (err) { /* ignore */ }
      }
      for (i = 0; i < e.nodes.length; i++) {
        try { e.nodes[i].disconnect(); } catch (err) { /* ignore */ }
      }
    }, 350);
  }

  // --------------------------------------------------------------------------
  // Per-frame update
  // --------------------------------------------------------------------------
  function doUpdate(dt, s) {
    if (!ctx || !s) return;
    lastFeed = ctx.currentTime;   // the watchdog above silences the sustained voices if this stops

    var rpm = clamp01(s.rpm);
    var throttle = clamp01(s.throttle);
    var turning = clamp01(s.turning);
    var speedNorm = clamp01((+s.speed || 0) / 28); // ~28 m/s ≈ full tilt
    var airborne = !!s.airborne;
    var inLake = !!s.inLake;

    // A. water wash swells with speed and out on the open lake
    if (ambience) {
      var ambTarget = 0.010 + 0.035 * speedNorm + (inLake ? 0.035 : 0);
      setT(ambience.gain.gain, ambTarget, TAU_SLOW);
      setT(ambience.lp.frequency, 320 + 540 * speedNorm + (inLake ? 160 : 0), TAU_SLOW);
    }
    if (amb) {
      var duck = clamp01(s.duck);
      // C. the bridge deck sings only while you are under it
      setT(amb.comb.gain.gain, duck > 0.15 ? 0.06 * duck : EPS, 0.10);
      // D. traffic overhead, same trigger, one octave of the story lower
      setT(amb.traffic.gain.gain, duck > 0.10 ? 0.03 : EPS, 0.25);
      // E. the Loop's own mains hum — only in the canyon, never on the lake
      var inLoop = !inLake && s.x != null && s.x > -900 && s.x < 300;
      setT(amb.hum.gain.gain, inLoop ? 0.0035 : EPS, 0.6);
      if (duck > 0.10) {
        ambClock.thump -= dt;
        if (ambClock.thump <= 0) { ambClock.thump = 0.6 + Math.random() * 1.2; tyreThump(); }
      }
      ambClock.train -= dt;
      if (ambClock.train <= 0) { ambClock.train = 38 + Math.random() * 37; doTrainPass(); }
      ambClock.gull -= dt;
      if (ambClock.gull <= 0) {
        ambClock.gull = 7 + Math.random() * 13;
        if (inLake || s.nearLock) doSeagull();
      }
    }

    // throttle derivative → the overrun blow-off and the intake gulp
    if (dt > 0) {
      var dth = (throttle - lastThrottle) / Math.max(dt, 1e-3);
      lastThrottle = throttle;
      if (dth < -4 || dth > 6) doChuff(dth);
    }

    // convolver watchdog (R13): three consecutive seconds under 45 fps and the room goes cheap
    if (RR.Engine && RR.Engine.fps) {
      var f = RR.Engine.fps();
      if (f > 0 && f < 45) { lowFpsT += dt; if (lowFpsT > 3 && usingConvolver) setConvolver(false); }
      else { lowFpsT = 0; if (!usingConvolver && convolver && f > 55) setConvolver(true); }
    }

    updateMusicState(s);
    updateRivals(dt);

    var e = engine;
    if (!e) return;
    var def = e.def;

    // rpm -> pitch across ~1 octave; airborne prop flares pitch up ~15%
    var pitch = def.base * (1 + rpm) * (airborne ? 1.15 : 1);
    var i;
    for (i = 0; i < e.oscs.length; i++) {
      setT(e.oscs[i].osc.frequency, pitch * e.oscs[i].ratio, TAU_FAST);
    }
    if (e.sub) setT(e.sub.frequency, pitch * def.sub.ratio, TAU_FAST);

    // throttle -> loudness; rpm/throttle -> brightness (filter movement)
    var load = 0.72 * throttle + 0.28 * rpm;
    setT(e.out.gain, def.idle + (def.full - def.idle) * load, TAU_MED);
    setT(e.bp.frequency, def.bpBase + def.bpRange * Math.pow(rpm, 1.4), TAU_MED);
    setT(e.lp.frequency, def.lpBase * (0.35 + 0.40 * throttle + 0.25 * rpm), TAU_MED);
    setT(e.exGain.gain, def.noise.gain * (0.35 + 0.65 * throttle), TAU_MED);

    // Amplitude modulation character follows rpm (putter speeds up + smooths out)
    var amRate = def.am.rate + def.am.rateRpm * rpm;
    var amDepth = clamp(def.am.depth + def.am.depthRpm * rpm, 0, 0.9);
    setT(e.lfo.frequency, amRate, TAU_MED);
    setT(e.lfoGain.gain, amDepth, TAU_MED);
    setT(e.amp.gain, 1 - amDepth, TAU_MED);

    // Water spray: grows with speed and carving; cuts out entirely in the air
    var spray = airborne ? EPS : 0.16 * speedNorm * (0.5 + 0.5 * turning);
    setT(e.sprayGain.gain, Math.max(spray, EPS), airborne ? 0.03 : 0.12);
    setT(e.sprayBp.frequency, 2000 + 2600 * speedNorm, 0.2);

    if (e.limGain) setT(e.limGain.gain, 0.55 * clamp01((rpm - 1.02) / 0.10), 0.02);
  }

  function tyreThump() {
    if (!ctx) return;
    var t = now();
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer('brown');
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
    var g = gain(0);
    n.connect(lp); lp.connect(g); g.connect(ambBus || master);
    env(g, t, 0.004, 0.035, 0.06);
    n.start(t); n.stop(t + 0.09);
    cleanupOnEnd(n, [n, lp, g]);
  }

  // --------------------------------------------------------------------------
  // Hull slap / chuff / scrape / grating — the texture that stops the ride feeling like ice
  // --------------------------------------------------------------------------
  function doHullSlap(k, pan) {
    if (!ready()) return;
    k = clamp01(k);
    var t = now();
    var out = panNode(clamp(pan || 0, -0.6, 0.6));
    out.connect(fxBus);
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer('white');
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 220; bp.Q.value = 1.4;
    var ng = gain(0);
    n.connect(bp); bp.connect(ng); ng.connect(out);
    env(ng, t, 0.004, 0.06 + 0.22 * k, 0.09);
    n.start(t); n.stop(t + 0.14);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(78, t);
    o.frequency.exponentialRampToValueAtTime(41, t + 0.07);
    var og = gain(0);
    o.connect(og); og.connect(out);
    env(og, t, 0.004, 0.10 + 0.20 * k, 0.10);
    o.start(t); o.stop(t + 0.16);
    cleanupOnEnd(n, [n, bp, ng, o, og, out]);
  }

  function doChuff(d) {
    if (!ready()) return;
    var t = now();
    var blowOff = d < 0;
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer('white');
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = blowOff ? 1400 : 620;
    bp.Q.value = blowOff ? 1.6 : 0.9;
    var g = gain(0);
    n.connect(bp); bp.connect(g); g.connect(fxBus);
    var peak = blowOff ? (0.05 + 0.05 * Math.min(1, Math.abs(d) / 12)) : 0.05;
    env(g, t, 0.004, peak, blowOff ? 0.09 : 0.14);
    n.start(t); n.stop(t + 0.2);
    cleanupOnEnd(n, [n, bp, g]);
  }

  // concrete on gelcoat: one persistent voice, gain-targeted, with a slow LFO so it grinds
  function ensureScrape() {
    if (scrapeVoice || !ctx) return;
    var s = noiseSource('brown');
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3.2;
    var pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 3800; pk.Q.value = 1.1; pk.gain.value = 8;
    var g = gain(EPS);
    var lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 7;
    var lg = gain(180);
    lfo.connect(lg); lg.connect(bp.frequency);
    s.connect(bp); bp.connect(pk); pk.connect(g); g.connect(fxBus);
    s.start(); lfo.start();
    scrapeVoice = { gain: g };
  }
  function doScrape(on, k) {
    if (!ready()) return;
    ensureScrape();
    setT(scrapeVoice.gain.gain, on ? (0.045 + 0.09 * clamp01(k)) : EPS, 0.04);
  }

  // ambience layer C is already exactly this comb — drive it rather than build a second one
  function doGrating(k) {
    if (!ready() || !amb || !amb.comb) return;
    gratingVoice = amb.comb;
    setT(amb.comb.gain.gain, Math.max(EPS, 0.06 * clamp01(k)), 0.09);
  }

  // --------------------------------------------------------------------------
  // Rivals + doppler. f' = f * C / (C + vr); a head-on pass is a 36% pitch swing, and that swing
  // is what makes six boats feel like a race instead of a solo run against ghosts.
  // --------------------------------------------------------------------------
  var SPEED_OF_SOUND = 343;
  var rivalList = null;

  function ensureRivals() {
    if (rivalVoices || !ctx) return;
    rivalVoices = [];
    for (var i = 0; i < 3; i++) {
      var o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 90;
      var o2 = ctx.createOscillator(); o2.type = 'square'; o2.frequency.value = 180;
      var g2 = gain(0.18);
      // The player's own engine earns its tone from a shaper, a formant and two swept filters.
      // A rival got one 12 dB/oct pole over a raw saw+square, so three of them alongside you laid
      // a bare harmonic ladder to 3 kHz across the mix. A second pole makes it 24 dB/oct and the
      // ladder dies where it should.
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.6;
      var lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 1400; lp2.Q.value = 0.5;
      var pan = panNode(0);
      var g = gain(EPS);
      o1.connect(lp); o2.connect(g2); g2.connect(lp);
      lp.connect(lp2); lp2.connect(pan); pan.connect(g); g.connect(engineBus);
      o1.start(); o2.start();
      rivalVoices.push({ o1: o1, o2: o2, lp: lp, lp2: lp2, pan: pan, g: g });
    }
  }

  function doSetRivals(list) {
    if (!ctx) return;
    rivalList = list || null;
  }

  function updateRivals() {
    if (!rivalList) {
      if (rivalVoices) for (var j = 0; j < 3; j++) setT(rivalVoices[j].g.gain, EPS, 0.20);
      return;
    }
    ensureRivals();
    for (var i = 0; i < 3; i++) {
      var v = rivalVoices[i], r = rivalList[i];
      if (!r) { setT(v.g.gain, EPS, 0.15); continue; }
      var def = ENGINES[r.kind] || ENGINES.speedboat;
      var f = def.base * (1 + clamp01(r.rpm)) * (SPEED_OF_SOUND / (SPEED_OF_SOUND + clamp(r.closeRate, -120, 120)));
      setT(v.o1.frequency, f, TAU_FAST);
      setT(v.o2.frequency, f * 2, TAU_FAST);
      var near = 1 - Math.min(1, r.d / 90);
      setT(v.g.gain, Math.max(EPS, 0.19 * near * near), 0.10);
      var cut = 900 + 3100 * near;
      setT(v.lp.frequency, cut, 0.12);
      setT(v.lp2.frequency, cut, 0.12);
      if (v.pan.pan) setT(v.pan.pan, clamp(r.lat, -1, 1), 0.06);
    }
  }

  // --------------------------------------------------------------------------
  // Chicago hooks (C8)
  // --------------------------------------------------------------------------
  // A real horn is a strong fundamental with a few harmonics over it. A sawtooth carries every
  // harmonic to Nyquist, and driving that through a hard tanh added more — held for five seconds
  // it stopped reading as a horn and became a buzz sitting on top of the music. The fundamental
  // is now a triangle (odd harmonics, steep rolloff), the partials are voiced by hand, the shaper
  // is barely more than glue, and the lowpass opens over the attack the way a real bell does.
  function hornBlast(t, f, dur, peak) {
    var mix = gain(0);
    var ws = makeShaper(1.15);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(420, t);
    lp.frequency.linearRampToValueAtTime(900, t + 0.22);
    mix.connect(ws); ws.connect(lp); lp.connect(fxBus);
    var nodes = [mix, ws, lp], anchor = null;
    var VOICE = [0.42, 0.20, 0.11, 0.05];        // fundamental-dominant, not a saw spectrum
    for (var h = 1; h <= 4; h++) {
      var o = ctx.createOscillator();
      o.type = h === 1 ? 'triangle' : 'sine';
      o.frequency.value = f * h;
      o.detune.value = (h % 2 ? -7 : 7);
      var og = gain(VOICE[h - 1]);
      o.connect(og); og.connect(mix);
      o.start(t); o.stop(t + dur + 0.06);
      nodes.push(o, og); anchor = o;
    }
    mix.gain.setValueAtTime(EPS, t);
    mix.gain.linearRampToValueAtTime(peak, t + 0.14);
    mix.gain.setValueAtTime(peak, t + dur - 0.35);
    mix.gain.exponentialRampToValueAtTime(EPS, t + dur);
    if (anchor) cleanupOnEnd(anchor, nodes);
  }

  // The actual Inland Rules signal for a bridge opening: one prolonged blast plus one short.
  // The bridge answers 1.5 s later an octave down from the tender house. Not a generic klaxon.
  // Twenty-eight bridges on their own cycles used to be able to start a 13-second sequence each,
  // and overlapping sequences fused into one continuous drone. One bridge at a time, and the
  // whole exchange now fits in 7 s instead of 13.3.
  var hornUntil = 0;
  function doBridgeHorn() {
    if (!ready()) return;
    var t = now();
    if (t < hornUntil) return;
    hornUntil = t + 8.5;
    hornBlast(t, 180, 3.4, 0.17);              // prolonged blast: I am asking for the bridge
    hornBlast(t + 3.8, 180, 0.8, 0.15);        // one short
    hornBlast(t + 5.0, 90, 1.9, 0.12);         // the tender house answers, an octave down
  }

  // Egg #37: six seconds of the title groove bleeding out of a warehouse door.
  function doHouseBleed() {
    if (!ready()) return;
    var t = now(), dur = 6.0;
    var out = gain(0);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 1.1;
    out.connect(lp); lp.connect(fxBus);
    out.gain.setValueAtTime(EPS, t);
    out.gain.linearRampToValueAtTime(0.5, t + 1.2);
    out.gain.setValueAtTime(0.5, t + dur - 1.6);
    out.gain.linearRampToValueAtTime(EPS, t + dur);
    var beat = 60 / 124 / 2;
    var nodes = [out, lp], anchor = null;
    for (var i = 0; i * beat < dur; i++) {
      var tt = t + i * beat;
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(150, tt);
      o.frequency.exponentialRampToValueAtTime(48, tt + 0.09);
      var g = gain(0);
      o.connect(g); g.connect(out);
      env(g, tt, 0.004, i % 2 ? 0.20 : 0.42, 0.20);
      o.start(tt); o.stop(tt + 0.26);
      nodes.push(o, g); anchor = o;
    }
    if (anchor) cleanupOnEnd(anchor, nodes);
  }

  // boost gate: a rising E6 → B6, brighter than the checkpoint chime so they never confuse
  function doBoostGate() {
    if (!ready()) return;
    var t = now();
    chimeNote(t, 1318.51, 0.20, 0.16);
    chimeNote(t + 0.08, 1975.53, 0.22, 0.34);
  }

  // The finish beat asks for wind and got silence: feel.js:106/130 has called wind(1,400) then
  // wind(0,900) since the finale was written, so the "city lets you go" moment landed as an abrupt
  // drop to near-nothing. One voice — brown noise, 900 Hz pole — on the ambience bus, two ramps.
  var windVoice = null;
  function doWind(level, ms) {
    if (!ready()) return;
    if (!windVoice) {
      var src = noiseSource('brown');
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.6;
      var g = gain(EPS);
      src.connect(lp); lp.connect(g); g.connect(ambBus || master);
      src.start();
      windVoice = { src: src, lp: lp, gain: g };
    }
    // 0.09 sits just over the water wash's own 0.045 ceiling: a swell, not a gale
    var lv = Math.max(clamp01(level) * 0.09, EPS);
    var t = now(), dur = Math.max(0.05, (ms == null ? 500 : ms) / 1000);
    var gp = windVoice.gain.gain;
    gp.cancelScheduledValues(t);
    gp.setValueAtTime(Math.max(gp.value, EPS), t);
    gp.linearRampToValueAtTime(lv, t + dur);
  }

  // --------------------------------------------------------------------------
  // Boost, passes and rival finishes — the events that had no voice at all
  // --------------------------------------------------------------------------
  // SHIFT on a dry tank was indistinguishable from a broken key (measured: 1.5 s of SHIFT at
  // energy 0.05 produced zero Audio and zero HUD calls). A dry click — a hard, short, dead knock,
  // deliberately unmusical so it can never be mistaken for a chime that paid you something.
  function doBoostDenied() {
    if (!ready()) return;
    var t = now();
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer('white');
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.6;
    var g = gain(0);
    n.connect(bp); bp.connect(g); g.connect(fxBus);
    env(g, t, 0.002, 0.11, 0.045);
    n.start(t); n.stop(t + 0.08);
    cleanupOnEnd(n, [n, bp, g]);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(210, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.05);
    var og = gain(0);
    o.connect(og); og.connect(fxBus);
    env(og, t, 0.002, 0.10, 0.06);
    o.start(t); o.stop(t + 0.1);
    cleanupOnEnd(o, [o, og]);
  }

  // Ignition: a 180 ms filtered-noise whoosh on the ENGINE bus, so it arrives from the motor and
  // not from the UI. No camera kick with it — the measured FOV punch already carries the light-up,
  // and a shake on every SHIFT tap fights the nausea ceiling at camera.js:409-411.
  function doBoostIgnite() {
    if (!ready()) return;
    var t = now(), dur = 0.18;
    var n = noiseSource('white');
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(2800, t + dur);
    var g = gain(0);
    n.connect(bp); bp.connect(g); g.connect(engineBus || fxBus);
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.035);
    g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    n.start(t); n.stop(t + dur + 0.05);
    cleanupOnEnd(n, [n, bp, g]);
  }

  // A place changing hands is the most emotionally loaded event in a racing game and it was a
  // number flip. Two notes: up for one gained, down for one lost.
  function doPassTick(up) {
    if (!ready()) return;
    var t = now();
    if (up) { chimeNote(t, 784.0, 0.14, 0.09); chimeNote(t + 0.075, 1174.66, 0.15, 0.16); }
    else { chimeNote(t, 784.0, 0.13, 0.09); chimeNote(t + 0.075, 523.25, 0.14, 0.18); }
  }

  // A rival crossing the line ahead of you: the same horn as a bridge, heard from the far side of
  // the basin — quiet, dark, and two blasts so it reads as a finish and not as traffic.
  function doRivalFinish() {
    if (!ready()) return;
    var t = now();
    hornBlast(t, 146.83, 1.05, 0.045);
    hornBlast(t + 1.15, 146.83, 0.75, 0.032);
  }

  // --------------------------------------------------------------------------
  // One-shots
  // --------------------------------------------------------------------------
  function ready() {
    if (!ctx) doInit();
    return !!ctx;
  }

  function doCountdownBeep(final_) {
    if (!ready()) return;
    var t = now();
    // countdown handshake: duck the bed and pull the kick, then put the drop on the NEXT BAR so
    // the airhorn lands on a downbeat instead of wherever the countdown happened to finish.
    if (music.playing && music.bus) {
      if (!final_) {
        setT(music.bus.gain, music.level * 0.35, 0.06);
        mstate.kickMute = Infinity;
      } else {
        music.bus.gain.cancelScheduledValues(t);
        music.bus.gain.setValueAtTime(Math.max(music.bus.gain.value, EPS), t);
        music.bus.gain.linearRampToValueAtTime(music.level, t + 0.12);
        mstate.kickMute = music.nextTime + (16 - (music.step % 16)) * music.stepDur;
      }
    }
    var f = final_ ? 1318.5 : 880;
    var dur = final_ ? 0.5 : 0.14;
    var o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    var o2 = ctx.createOscillator(); o2.type = 'triangle';
    o2.frequency.value = f; o2.detune.value = 6;
    var g = gain(0);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200;
    o1.connect(g); o2.connect(g); g.connect(lp); lp.connect(fxBus);
    env(g, t, 0.006, final_ ? 0.30 : 0.24, dur);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    cleanupOnEnd(o1, [o1, o2, g, lp]);
  }

  function doAirhorn() {
    if (!ready()) return;
    var t = now();
    var dur = 0.8;
    var freqs = [440, 587.33];
    var mix = gain(0.55);
    // A two-tone air horn is a bright saw stack by nature, but at k=2.5 into a static 2.4 kHz pole
    // this was the loudest event in the game by 6 dB — and it fires at the start, at the finish,
    // and at every rising bascule, sometimes on top of the bridge horn and the gulls. Softer
    // drive, and the pole opens over the attack the way real pressure does.
    var ws = makeShaper(1.7);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(1100, t);
    lp.frequency.linearRampToValueAtTime(2100, t + 0.09);
    var out = gain(0);
    mix.connect(ws); ws.connect(lp); lp.connect(out); out.connect(fxBus);

    var nodes = [mix, ws, lp, out], anchor = null;
    for (var i = 0; i < freqs.length; i++) {
      for (var d = -6; d <= 6; d += 12) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.detune.value = d;
        // slight pitch scoop up on the attack, like pressure building
        o.frequency.setValueAtTime(freqs[i] * 0.94, t);
        o.frequency.linearRampToValueAtTime(freqs[i], t + 0.06);
        var og = gain(0.35);
        o.connect(og); og.connect(mix);
        o.start(t); o.stop(t + dur + 0.05);
        nodes.push(o, og);
        anchor = o;
      }
    }
    out.gain.setValueAtTime(EPS, t);
    out.gain.linearRampToValueAtTime(0.36, t + 0.025);
    out.gain.setValueAtTime(0.36, t + dur - 0.18);
    out.gain.exponentialRampToValueAtTime(EPS, t + dur);
    if (anchor) cleanupOnEnd(anchor, nodes);
  }

  function chimeNote(t, f, peak, dur) {
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    var h = ctx.createOscillator(); h.type = 'sine'; h.frequency.value = f * 2;
    var g = gain(0), hg = gain(0.18);
    o.connect(g); h.connect(hg); hg.connect(g); g.connect(fxBus);
    env(g, t, 0.008, peak, dur);
    o.start(t); h.start(t);
    o.stop(t + dur + 0.05); h.stop(t + dur + 0.05);
    cleanupOnEnd(o, [o, h, g, hg]);
  }

  function doCheckpoint() {
    if (!ready()) return;
    var t = now();
    chimeNote(t, 987.77, 0.22, 0.20);         // B5
    chimeNote(t + 0.09, 1318.51, 0.22, 0.30);  // E6
  }

  function doSplash(intensity) {
    if (!ready()) return;
    var t = now();
    var k = clamp01(intensity === undefined ? 0.7 : intensity);
    var dur = 0.28 + 0.40 * k;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer('white');
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(2200 + 3000 * k, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + dur);
    var g = gain(0);
    src.connect(lp); lp.connect(g); g.connect(fxBus);
    env(g, t, 0.012, 0.10 + 0.30 * k, dur);
    src.start(t); src.stop(t + dur + 0.05);
    cleanupOnEnd(src, [src, lp, g]);
  }

  function doThud(intensity) {
    if (!ready()) return;
    var t = now();
    var k = clamp01(intensity === undefined ? 0.7 : intensity);
    // Low sine knock with a fast downward pitch bend
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(105 + 40 * k, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
    var og = gain(0);
    o.connect(og); og.connect(fxBus);
    env(og, t, 0.004, 0.16 + 0.34 * k, 0.24);
    o.start(t); o.stop(t + 0.3);
    cleanupOnEnd(o, [o, og]);
    // Splintery noise transient
    var n = ctx.createBufferSource(); n.buffer = noiseBuffer('white');
    var nlp = ctx.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = 900;
    var ng = gain(0);
    n.connect(nlp); nlp.connect(ng); ng.connect(fxBus);
    env(ng, t, 0.003, 0.06 + 0.14 * k, 0.09);
    n.start(t); n.stop(t + 0.12);
    cleanupOnEnd(n, [n, nlp, ng]);
  }

  function doUiMove() {
    if (!ready()) return;
    chimeNote(now(), 620, 0.10, 0.06);
  }

  function doUiSelect() {
    if (!ready()) return;
    var t = now();
    chimeNote(t, 660, 0.13, 0.08);
    chimeNote(t + 0.07, 990, 0.13, 0.12);
  }

  function fanfareNote(t, f, dur, peak) {
    var mix = gain(0);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    mix.connect(lp); lp.connect(fxBus);
    var nodes = [mix, lp], anchor = null;
    var parts = [
      { type: 'triangle', detune: -5, g: 0.5 },
      { type: 'triangle', detune: 5, g: 0.5 },
      { type: 'sawtooth', detune: 0, g: 0.12 }
    ];
    for (var i = 0; i < parts.length; i++) {
      var o = ctx.createOscillator();
      o.type = parts[i].type; o.frequency.value = f; o.detune.value = parts[i].detune;
      var og = gain(parts[i].g);
      o.connect(og); og.connect(mix);
      o.start(t); o.stop(t + dur + 0.05);
      nodes.push(o, og);
      anchor = o;
    }
    env(mix, t, 0.012, peak, dur);
    if (anchor) cleanupOnEnd(anchor, nodes);
  }

  function doFinishFanfare(won) {
    if (!ready()) return;
    var t = now();
    var notes, chord;
    if (won) {
      notes = [523.25, 659.26, 783.99, 1046.5];   // C5 E5 G5 C6 — major
      chord = [523.25, 659.26, 783.99];           // C major
    } else {
      notes = [659.26, 622.25, 523.25, 440.0];    // E5 Eb5 C5 A4 — minor slump
      chord = [440.0, 523.25, 659.26];            // A minor
    }
    var times = [0, 0.15, 0.30, 0.50];
    for (var i = 0; i < 4; i++) {
      fanfareNote(t + times[i], notes[i], i === 3 ? 0.85 : 0.22, i === 3 ? 0.22 : 0.18);
    }
    for (var c = 0; c < chord.length; c++) {
      fanfareNote(t + times[3], chord[c] * 0.5, 0.9, 0.06);
    }
  }

  function gullChirp(t, f0, f1, dur, dest) {
    var o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    // Vibrato — the warble that makes it read as a gull
    var v = ctx.createOscillator(); v.type = 'sine'; v.frequency.value = 34;
    var vg = gain(70);
    v.connect(vg); vg.connect(o.frequency);
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = (f0 + f1) * 0.5; bp.Q.value = 1.2;
    var g = gain(0);
    o.connect(bp); bp.connect(g); g.connect(dest);
    env(g, t, 0.02, 0.10, dur);
    o.start(t); v.start(t);
    o.stop(t + dur + 0.05); v.stop(t + dur + 0.05);
    cleanupOnEnd(o, [o, v, vg, bp, g]);
  }

  function doSeagull() {
    if (!ready()) return;
    var t = now();
    var pan = panNode(Math.random() * 1.4 - 0.7);
    pan.connect(fxBus);
    var jitter = 0.92 + Math.random() * 0.16;
    gullChirp(t, 1700 * jitter, 1080 * jitter, 0.26, pan);
    gullChirp(t + 0.30, 1480 * jitter, 940 * jitter, 0.30, pan);
    setTimeout(function () {
      try { pan.disconnect(); } catch (e) { /* ignore */ }
    }, 1200);
  }

  // --------------------------------------------------------------------------
  // Music — one lookahead scheduler, two ORIGINAL loops (never both):
  //  'title' — warm Chicago-house groove, 112 BPM, F-major soul changes
  //            (I–vi–IV–V voiced as maj9/m9/9), gospel piano stabs, walking
  //            sub bass, soft four-on-floor kick, offbeat hats, airy swells.
  //  'race'  — driving hype loop, 126 BPM, A minor, hard kick + 808 sub
  //            bassline, sparse dark brass stabs, energetic hats.
  // All material composed for this game; no existing song is quoted.
  // --------------------------------------------------------------------------
  // 124, not 126: classic Chicago house sits 120–128 and the Warehouse tempo was ~122–126.
  // 126 is a shade hot for a groove you hear for four minutes; 124 breathes.
  var TITLE_BPM = 112, RACE_BPM = 124;

  // Title: chord voicings (Hz) and per-bar walking bass (quarter notes)
  var T_CH = {
    F:  [174.61, 220.00, 261.63, 329.63, 392.00], // Fmaj9  (F A C E G)
    Dm: [174.61, 220.00, 261.63, 329.63],         // Dm9 rootless (F A C E)
    Bb: [233.08, 293.66, 349.23, 440.00],         // Bbmaj9 (Bb D F A)
    C9: [261.63, 329.63, 392.00, 466.16]          // C9    (C E G Bb)
  };
  var TITLE_BARS = [
    { chord: T_CH.F,  walk: [87.31, 110.00, 130.81, 110.00] }, // F2 A2 C3 A2
    { chord: T_CH.F,  walk: [87.31,  98.00,  82.41,  73.42] }, // walk down to Dm
    { chord: T_CH.Dm, walk: [73.42,  87.31, 110.00,  87.31] }, // D2 F2 A2 F2
    { chord: T_CH.Dm, walk: [73.42,  65.41,  61.74,  58.27] }, // chromatic to Bb
    { chord: T_CH.Bb, walk: [58.27,  73.42,  87.31,  73.42] }, // Bb1 D2 F2 D2
    { chord: T_CH.Bb, walk: [58.27,  61.74,  65.41,  61.74] }, // creep up to C
    { chord: T_CH.C9, walk: [65.41,  82.41,  98.00,  82.41] }, // C2 E2 G2 E2
    { chord: T_CH.C9, walk: [65.41,  98.00,  87.31,  82.41] }  // turn back home
  ];
  var T_STAB_A = [2, 6, 10, 14]; // straight offbeat 8ths
  var T_STAB_B = [2, 6, 10, 13]; // syncopated; 13 anticipates the next chord

  // Race: the deep-house i – iv – VI – v, two bars each, all m9/maj9 stacks — the Marshall
  // Jefferson / Larry Heard piano voicing. A progression, not a loop of one chord.
  var R_CH = {
    Am9:   [220.00, 261.63, 329.63, 493.88], // A3 C4 E4 B4
    Dm9:   [174.61, 220.00, 261.63, 329.63], // F3 A3 C4 E4
    Fmaj9: [220.00, 261.63, 329.63, 392.00], // A3 C4 E4 G4
    Em7:   [196.00, 246.94, 293.66, 329.63]  // G3 B3 D4 E4
  };
  var RACE_BARS = [
    { root: 55.00, chord: R_CH.Am9 },   { root: 55.00, chord: R_CH.Am9 },
    { root: 73.42, chord: R_CH.Dm9 },   { root: 73.42, chord: R_CH.Dm9 },
    { root: 43.65, chord: R_CH.Fmaj9 }, { root: 43.65, chord: R_CH.Fmaj9 },
    { root: 41.20, chord: R_CH.Em7 },   { root: 41.20, chord: R_CH.Em7 }
  ];
  var R_808 = [0, 3, 6, 8, 11, 14]; // syncopated sub pattern (6/14 jump octave)
  var R_PIANO = [2, 6, 10, 14];
  var R_ACID = [0, 3, 6, 7, 10, 13];

  // Arrangement gates. L2's is the best idea in the whole soundtrack: the moment the hull breaks
  // free and the bow drops, the piano enters — physics and music resolve on the same frame.
  var mstate = { planeF: 0, boostHeat: 0, progress: 0, lead: false, kickMute: 0 };

  function trackSource(src) {
    music.sources.push(src);
    src.onended = function () {
      var idx = music.sources.indexOf(src);
      if (idx >= 0) music.sources.splice(idx, 1);
      src.onended = null;
    };
  }

  function killSources(list) {
    for (var i = 0; i < list.length; i++) {
      try { list[i].onended = null; list[i].stop(); } catch (e) { /* ignore */ }
      try { list[i].disconnect(); } catch (e) { /* ignore */ }
    }
  }

  function ensureMusicBuses() {
    if (music.bus) return;
    music.bus = gain(EPS);
    // one lowpass on the whole music bus, swept 620 Hz → 12.4 kHz by race intensity. Running 6th
    // and forty seconds back the mix is dark and defeated; leading into the last gate it opens all
    // the way up. Nobody notices the mechanism; everybody feels the race.
    musicLP = ctx.createBiquadFilter();
    musicLP.type = 'lowpass'; musicLP.Q.value = 0.7; musicLP.frequency.value = 12400;
    music.out = gain(musicLevel);
    music.bus.connect(musicLP); musicLP.connect(music.out); music.out.connect(master);

    music.padFilter = ctx.createBiquadFilter();
    music.padFilter.type = 'lowpass';
    music.padFilter.frequency.value = 2200;
    music.padFilter.Q.value = 0.4;
    music.padGain = gain(0.55);
    music.padFilter.connect(music.padGain);
    music.padGain.connect(music.bus);

    music.bassFilter = ctx.createBiquadFilter();
    music.bassFilter.type = 'lowpass';
    music.bassFilter.frequency.value = 700;
    music.bassGain = gain(0.8);
    music.bassFilter.connect(music.bassGain);
    music.bassGain.connect(music.bus);

    music.hatFilter = ctx.createBiquadFilter();
    music.hatFilter.type = 'highpass';
    music.hatFilter.frequency.value = 7800;
    music.hatGain = gain(0.5);
    music.hatFilter.connect(music.hatGain);
    music.hatGain.connect(music.bus);

    music.kickGain = gain(0.8);
    music.kickGain.connect(music.bus);
  }

  // Per-mode tempo / mix / tone. Called with the bus near-silent.
  function applyMode(mode) {
    if (mode === 'race') {
      music.stepDur = 60 / RACE_BPM / 4;
      music.level = 0.45;                      // the race soundtrack LEADS; engines sit under it
      music.padFilter.frequency.value = 1000;  // darker stabs
      music.padGain.gain.value = 0.6;
      music.bassFilter.frequency.value = 380;  // pure 808 sub
      music.bassGain.gain.value = 0.9;
      music.hatGain.gain.value = 0.65;
      music.kickGain.gain.value = 1.0;
    } else {
      music.stepDur = 60 / TITLE_BPM / 4;
      music.level = 0.40;
      music.padFilter.frequency.value = 2200;  // warm piano brightness
      music.padGain.gain.value = 0.55;
      music.bassFilter.frequency.value = 700;
      music.bassGain.gain.value = 0.8;
      music.hatGain.gain.value = 0.5;
      music.kickGain.gain.value = 0.8;
    }
    music.stepsTotal = 128; // both loops: 8 bars of 16 steps
  }

  // Airy pad swell: slow-attack detuned triangles through the pad lowpass
  function swellPad(freqs, t, dur, lvl) {
    for (var i = 0; i < freqs.length; i++) {
      for (var d = -5; d <= 5; d += 10) {
        var o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = freqs[i];
        o.detune.value = d;
        var g = gain(0);
        o.connect(g); g.connect(music.padFilter);
        g.gain.setValueAtTime(EPS, t);
        g.gain.linearRampToValueAtTime(lvl, t + dur * 0.45);
        g.gain.linearRampToValueAtTime(EPS, t + dur);
        o.start(t); o.stop(t + dur + 0.1);
        trackSource(o);
        cleanupOnEnd(o, [o, g]);
      }
    }
  }

  // Chord stab: detuned saw/triangle stack, fast attack, exp decay.
  // brass=false → gospel piano flavor; brass=true → dark race brass.
  function stabChord(freqs, t, dur, lvl, brass) {
    for (var i = 0; i < freqs.length; i++) {
      var o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.value = freqs[i];
      o1.detune.value = brass ? -9 : -6;
      var o2 = ctx.createOscillator();
      o2.type = brass ? 'sawtooth' : 'triangle';
      o2.frequency.value = freqs[i];
      o2.detune.value = brass ? 9 : 5;
      var g1 = gain(brass ? 0.5 : 0.30), g2 = gain(brass ? 0.5 : 0.75);
      var g = gain(0);
      o1.connect(g1); o2.connect(g2); g1.connect(g); g2.connect(g);
      g.connect(music.padFilter);
      g.gain.setValueAtTime(EPS, t);
      g.gain.linearRampToValueAtTime(lvl, t + 0.005);
      g.gain.exponentialRampToValueAtTime(EPS, t + dur);
      o1.start(t); o2.start(t);
      o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
      trackSource(o1);
      cleanupOnEnd(o1, [o1, o2, g1, g2, g]);
    }
  }

  // Round walking bass (title): triangle + sine an octave blend
  function bassNote(f, t, dur, lvl) {
    var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
    var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f;
    var g = gain(0);
    var g2 = gain(0.6);
    o1.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(music.bassFilter);
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(lvl, t + 0.03);
    g.gain.setValueAtTime(lvl * 0.8, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(EPS, t + dur);
    o1.start(t); o2.start(t);
    o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    trackSource(o1);
    cleanupOnEnd(o1, [o1, o2, g, g2]);
  }

  // 808-style sub (race): sine with a quick pitch drop and long-ish decay
  function bass808(f, t, dur, lvl) {
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    var g = gain(0);
    o.connect(g); g.connect(music.bassFilter);
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(lvl, t + 0.006);
    g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
    trackSource(o);
    cleanupOnEnd(o, [o, g]);
  }

  // Four-on-the-floor kick: sine drop. hard=true for the race loop.
  function kick(t, hard) {
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(hard ? 165 : 120, t);
    o.frequency.exponentialRampToValueAtTime(hard ? 50 : 44, t + 0.085);
    var g = gain(0);
    o.connect(g); g.connect(music.kickGain);
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(hard ? 0.85 : 0.5, t + 0.004);
    g.gain.exponentialRampToValueAtTime(EPS, t + (hard ? 0.24 : 0.18));
    o.start(t); o.stop(t + 0.3);
    trackSource(o);
    cleanupOnEnd(o, [o, g]);
  }

  function hatTick(t, accent, dec) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer('white');
    src.playbackRate.value = 1.4;
    var g = gain(0);
    src.connect(g); g.connect(music.hatFilter);
    var peak = accent ? 0.055 : 0.025;
    var d = dec || 0.055;
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(EPS, t + d);
    src.start(t); src.stop(t + d + 0.03);
    trackSource(src);
    cleanupOnEnd(src, [src, g]);
  }

  function scheduleTitleStep(step, t) {
    var bar = (step / 16) | 0, s = step % 16;
    var B = TITLE_BARS[bar];
    // Soft four-on-the-floor + walking bass quarters
    if (s % 4 === 0) {
      kick(t, false);
      bassNote(B.walk[s / 4], t, music.stepDur * 3.4, 0.24);
    }
    // Gospel piano stabs on the offbeats; odd bars anticipate the next chord
    var pat = (bar % 2) ? T_STAB_B : T_STAB_A;
    if (pat.indexOf(s) >= 0) {
      var ch = (s === 13) ? TITLE_BARS[(bar + 1) % 8].chord : B.chord;
      stabChord(ch, t, 0.24, 0.11, false);
    }
    // Airy swell twice per loop (bars 0 and 4), a bar and a half long
    if (s === 0 && (bar === 0 || bar === 4)) {
      swellPad(B.chord, t, 24 * music.stepDur, 0.035);
    }
    // Offbeat-accented hats on 8ths
    if (s % 2 === 0) hatTick(t, s % 4 === 2, s % 4 === 2 ? 0.09 : 0.05);
  }

  // House without a backbeat clap sounds unfinished. Three bursts 11 ms apart is the trick.
  function clap(t) {
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 1600; bp.Q.value = 1.1;
    var out = gain(1);
    bp.connect(out); out.connect(music.bus || master);
    if (sendGain) out.connect(sendGain);        // the tail is what sells it
    var offs = [0, 0.011, 0.021], decs = [0.09, 0.09, 0.16];
    var nodes = [bp, out], anchor = null;
    for (var i = 0; i < 3; i++) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuffer('white');
      var g = gain(0);
      src.connect(g); g.connect(bp);
      env(g, t + offs[i], 0.002, 0.11, decs[i]);
      src.start(t + offs[i]); src.stop(t + offs[i] + decs[i] + 0.03);
      nodes.push(src, g); anchor = src;
    }
    if (anchor) { trackSource(anchor); cleanupOnEnd(anchor, nodes); }
  }

  // TB-303 in twelve lines: one saw, a resonant lowpass, a per-note sweep. Boost only.
  // The original was ONE biquad at Q 9.5 — 12 dB/oct, so every harmonic of the saw above the
  // cutoff survived while a very narrow resonant peak screamed on top of them. A real 303 filter
  // is a multi-pole ladder: resonance on the first pole, a second pole to actually take the top
  // off. Two biquads sharing the sweep, resonance on the first only.
  function acidNote(f, t, dur, cutoff) {
    var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4.2;
    var lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.Q.value = 0.6;
    var top = cutoff * 1.5, bot = Math.max(80, cutoff);
    lp.frequency.setValueAtTime(top, t);
    lp.frequency.exponentialRampToValueAtTime(bot, t + 0.09);
    lp2.frequency.setValueAtTime(top, t);
    lp2.frequency.exponentialRampToValueAtTime(bot, t + 0.09);
    var g = gain(0);
    o.connect(lp); lp.connect(lp2); lp2.connect(g); g.connect(music.bus);
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.006);
    g.gain.exponentialRampToValueAtTime(EPS, t + dur);
    o.start(t); o.stop(t + dur + 0.04);
    trackSource(o);
    cleanupOnEnd(o, [o, lp, lp2, g]);
  }

  function scheduleRaceStep(step, t) {
    var bar = (step / 16) | 0, s = step % 16;
    var B = RACE_BARS[bar];
    // L0 — hard four-on-the-floor + the syncopated 808 sub (6/14 jump the octave)
    if (s % 4 === 0 && !(mstate.kickMute && t < mstate.kickMute)) kick(t, true);
    if (R_808.indexOf(s) >= 0) {
      var f = (s === 6 || s === 14) ? B.root * 2 : B.root;
      bass808(f, t, 0.32, s % 8 === 0 ? 0.55 : 0.42);
    }
    // L1 — offbeat hats, accented, plus the backbeat clap on 2 and 4
    if (s % 2 === 0) hatTick(t, s % 4 === 2, s % 4 === 2 ? 0.11 : 0.05);
    else if ((bar === 3 || bar === 7) && s >= 11) hatTick(t, false, 0.04);
    if (s === 4 || s === 12) clap(t);
    // L2 — piano stabs, gated on the hull getting up on plane
    if (mstate.planeF > 0.6) {
      if (R_PIANO.indexOf(s) >= 0) stabChord(B.chord, t, 0.22, 0.10, false);
      else if (s === 15 && bar % 2 === 0) stabChord(RACE_BARS[(bar + 1) % 8].chord, t, 0.14, 0.07, false);
    }
    // L3 — the acid line only exists while you are boosting
    if (mstate.boostHeat > 0.35 && R_ACID.indexOf(s) >= 0) {
      acidNote(B.root * 2, t, 0.16, 240 + 2300 * clamp01(mstate.boostHeat));
    }
    // L4 — the organ swell, for the last quarter of the race or while you are on the podium
    if (s === 0 && (bar === 0 || bar === 4) && (mstate.progress > 0.78 || mstate.lead)) {
      swellPad(B.chord, t, 24 * music.stepDur, 0.030);
    }
  }

  function scheduleStep(step, t) {
    if (music.mode === 'race') scheduleRaceStep(step, t);
    else scheduleTitleStep(step, t);
  }

  function schedulerTick() {
    if (!ctx || !music.playing) return;
    // Stall guard. 2.5 s was too patient: the lookahead is only 0.35 s, so any hitch between the
    // two (first-race shader compile, GC, a brief tab switch) left every note stamped in the past
    // with its envelope already finished — measured, the music bus read -120 dBFS in 5 of 6
    // windows under 1-3 s frames. 0.5 s resyncs instead, and `missed` keeps the bar grid so the
    // countdown-to-downbeat handshake still lands on its downbeat. The lookahead stays at 0.35 s:
    // scheduleRaceStep reads boostHeat/kickMute at schedule time, so a longer one lags the mix.
    if (music.nextTime < ctx.currentTime - 0.5) {
      var missed = Math.ceil((ctx.currentTime - music.nextTime) / music.stepDur);
      music.step = (music.step + missed) % music.stepsTotal;
      music.nextTime = ctx.currentTime + 0.05;
    }
    var ahead = ctx.currentTime + 0.35; // schedule 350ms ahead (survives slow frames)
    while (music.nextTime < ahead) {
      scheduleStep(music.step, music.nextTime);
      music.nextTime += music.stepDur;
      music.step = (music.step + 1) % music.stepsTotal;
    }
  }

  // Shared start/stop for both loops. Idempotent; switching stops the other.
  function doSetMode(mode, on) {
    if (!on) {
      if (music.wantMode === mode) music.wantMode = null;
      if (!music.playing || music.mode !== mode) return; // off is a no-op unless this loop plays
      music.playing = false;
      if (music.interval) { clearInterval(music.interval); music.interval = null; }
      if (!ctx || !music.bus) { music.sources.length = 0; return; }
      var t2 = now();
      music.bus.gain.cancelScheduledValues(t2);
      music.bus.gain.setValueAtTime(Math.max(music.bus.gain.value, EPS), t2);
      music.bus.gain.linearRampToValueAtTime(EPS, t2 + 0.8); // fade out
      setTimeout(function () {
        if (music.playing) return; // restarted during the fade
        var list = music.sources.slice();
        music.sources.length = 0;
        killSources(list);
      }, 900);
      return;
    }
    if (!ready()) { music.wantMode = mode; return; }   // remember: init will start us
    ensureMusicBuses();
    if (music.playing && music.mode === mode) return; // idempotent
    var t = now(), startAt = t + 0.06;
    music.bus.gain.cancelScheduledValues(t);
    music.bus.gain.setValueAtTime(Math.max(music.bus.gain.value, EPS), t);
    if (music.playing) {
      // Hot-switch: duck the bus, retire the other loop's scheduled notes
      if (music.interval) { clearInterval(music.interval); music.interval = null; }
      music.playing = false;
      music.bus.gain.linearRampToValueAtTime(EPS, t + 0.08);
      music.bus.gain.setValueAtTime(EPS, t + 0.09);
      var old = music.sources.slice();
      music.sources.length = 0;
      setTimeout(function () { killSources(old); }, 130);
      startAt = t + 0.14;
    }
    music.mode = mode;
    applyMode(mode);
    music.playing = true;
    music.step = 0;
    music.nextTime = startAt;
    music.bus.gain.linearRampToValueAtTime(music.level, startAt + 0.7); // fade in
    schedulerTick();
    music.interval = setInterval(schedulerTick, 100);
  }

  function doSetMusic(on) { doSetMode('title', !!on); }
  function doSetRaceMusic(on) { doSetMode('race', !!on); }

  // race state → arrangement gates + the master filter sweep
  function updateMusicState(s) {
    if (!s) return;
    mstate.planeF = clamp01(s.planeF);
    mstate.boostHeat = clamp01(s.boostHeat);
    mstate.progress = clamp01(s.progress);
    mstate.lead = !!s.lead;
    var n = Math.max(2, s.nBoats || 6);
    var posF = 1 - (clamp(s.racePos || 1, 1, n) - 1) / (n - 1);
    intensity = clamp(0.30 + 0.30 * clamp01((+s.speed || 0) / Math.max(1, s.top || 40))
                      + 0.20 * posF + 0.20 * mstate.progress, 0, 1);
    if (musicLP && music.mode === 'race') setT(musicLP.frequency, 620 * Math.pow(20, intensity), 0.70);
  }
  function doSetMusicIntensity(x) {
    intensity = clamp01(x);
    if (musicLP) setT(musicLP.frequency, 620 * Math.pow(20, intensity), 0.70);
  }

  function doSetMusicLevel(v) {
    musicLevel = clamp01(v);
    if (music.out) setT(music.out.gain, musicLevel, TAU_FAST);
  }
  function doSetSfxLevel(v) {
    sfxLevel = clamp01(v);
    if (fxBus) setT(fxBus.gain, 0.9 * sfxLevel, TAU_FAST);
    if (engineBus) setT(engineBus.gain, 0.24 * sfxLevel, TAU_FAST);
    if (ambBus) setT(ambBus.gain, 0.9 * sfxLevel, TAU_FAST);
  }

  // --------------------------------------------------------------------------
  // Public API — every method wrapped so it can never throw
  // --------------------------------------------------------------------------
  function safe(fn) {
    return function () {
      try { return fn.apply(null, arguments); } catch (e) { /* never throw */ }
    };
  }

  RR.Audio = {
    init: safe(doInit),
    resume: safe(doResume),
    // sound gate — see doSetMuted. `muted()` is plain (never throws) so UI can read it inline.
    muted: function () { return muted; },
    setMuted: safe(doSetMuted),
    toggleMuted: safe(function () { doSetMuted(!muted); return !muted; }),
    setMaster: safe(function (v) {
      masterLevel = clamp01(v);
      if (ctx && master) setT(master.gain, masterLevel, TAU_FAST);
    }),
    startEngine: safe(doStartEngine),
    stopEngine: safe(doStopEngine),
    update: safe(doUpdate),
    countdownBeep: safe(doCountdownBeep),
    airhorn: safe(doAirhorn),
    checkpoint: safe(doCheckpoint),
    splash: safe(doSplash),
    thud: safe(doThud),
    uiMove: safe(doUiMove),
    uiSelect: safe(doUiSelect),
    finishFanfare: safe(doFinishFanfare),
    seagull: safe(doSeagull),
    setMusic: safe(doSetMusic),
    setRaceMusic: safe(doSetRaceMusic),
    // FEEL §5.1
    setSpace: safe(doSetSpace),
    setRivals: safe(doSetRivals),
    hullSlap: safe(doHullSlap),
    chuff: safe(doChuff),
    scrape: safe(doScrape),
    grating: safe(doGrating),
    trainPass: safe(doTrainPass),
    setMusicIntensity: safe(doSetMusicIntensity),
    setMusicLevel: safe(doSetMusicLevel),
    setSfxLevel: safe(doSetSfxLevel),
    // CHICAGO §5.4 + eggs #23 / #37 (C8) and the boost-gate chime
    bridgeHorn: safe(doBridgeHorn),
    lScreech: safe(function (pan) { doLScreech(pan); }),
    houseBleed: safe(doHouseBleed),
    boostGate: safe(doBoostGate),
    // FEEDBACK: the events that had no voice — boost denied / lit, a place changing hands, a rival
    // crossing the line, and the wind feel.js asks for at the finish.
    boostDenied: safe(doBoostDenied),
    boostIgnite: safe(doBoostIgnite),
    passTick: safe(doPassTick),
    rivalFinish: safe(doRivalFinish),
    wind: safe(doWind)
  };
})();
