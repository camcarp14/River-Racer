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
  var masterLevel = 0.9;     // remembered even before init
  var engine = null;         // active engine rig
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
    }
  };

  // --------------------------------------------------------------------------
  // Core lifecycle
  // --------------------------------------------------------------------------
  function doInit() {
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

      engineBus = gain(0.24); // engines (incl. spray) sit well under music + SFX
      engineBus.connect(master);
      fxBus = gain(0.9);
      fxBus.connect(master);

      ensureAmbience();
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
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      var p = ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  }

  // --------------------------------------------------------------------------
  // Ambience: filtered brown noise (wind / lake wash), swells with speed+inLake
  // --------------------------------------------------------------------------
  function ensureAmbience() {
    if (ambience || !ctx) return;
    var src = noiseSource('brown');
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 360;
    lp.Q.value = 0.5;
    var g = gain(EPS);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start();
    ambience = { src: src, lp: lp, gain: g };
  }

  // --------------------------------------------------------------------------
  // Engine
  // --------------------------------------------------------------------------
  function doStartEngine(kind) {
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
      out: out,
      sprayBp: spBp, sprayGain: spGain,
      sources: sources, nodes: nodes
    };
  }

  function doStopEngine() {
    var e = engine;
    engine = null;
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

    var rpm = clamp01(s.rpm);
    var throttle = clamp01(s.throttle);
    var turning = clamp01(s.turning);
    var speedNorm = clamp01((+s.speed || 0) / 28); // ~28 m/s ≈ full tilt
    var airborne = !!s.airborne;
    var inLake = !!s.inLake;

    // Ambience swells with speed and out on the open lake
    if (ambience) {
      var ambTarget = 0.010 + 0.030 * speedNorm + (inLake ? 0.035 : 0);
      setT(ambience.gain.gain, ambTarget, TAU_SLOW);
      setT(ambience.lp.frequency, 320 + 380 * speedNorm + (inLake ? 160 : 0), TAU_SLOW);
    }

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
    var ws = makeShaper(2.5);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 2400; lp.Q.value = 0.7;
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
    out.gain.linearRampToValueAtTime(0.5, t + 0.025);
    out.gain.setValueAtTime(0.5, t + dur - 0.18);
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
  var TITLE_BPM = 112, RACE_BPM = 126;

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

  // Race: minor stab voicings, 808 roots, sparse stab placements
  var R_CH = {
    Am: [220.00, 261.63, 329.63], // A3 C4 E4
    F:  [174.61, 220.00, 261.63], // F3 A3 C4
    G:  [196.00, 246.94, 293.66], // G3 B3 D4
    E:  [164.81, 207.65, 246.94]  // E3 G#3 B3 — V turnaround tension
  };
  var RACE_BARS = [
    { root: 55.00, chord: R_CH.Am, stabs: [4] },
    { root: 55.00, chord: R_CH.Am, stabs: [] },
    { root: 55.00, chord: R_CH.Am, stabs: [4, 11] },
    { root: 55.00, chord: R_CH.Am, stabs: [] },
    { root: 43.65, chord: R_CH.F,  stabs: [4] },
    { root: 43.65, chord: R_CH.F,  stabs: [11] },
    { root: 49.00, chord: R_CH.G,  stabs: [4] },
    { root: 41.20, chord: R_CH.E,  stabs: [8, 10, 12] } // turnaround fill
  ];
  var R_808 = [0, 3, 6, 8, 11, 14]; // syncopated sub pattern (6/14 jump octave)

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
    music.bus.connect(master);

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

  function scheduleRaceStep(step, t) {
    var bar = (step / 16) | 0, s = step % 16;
    var B = RACE_BARS[bar];
    // Hard four-on-the-floor
    if (s % 4 === 0) kick(t, true);
    // Syncopated 808 subs; steps 6/14 jump the octave
    if (R_808.indexOf(s) >= 0) {
      var f = (s === 6 || s === 14) ? B.root * 2 : B.root;
      bass808(f, t, 0.32, s % 8 === 0 ? 0.55 : 0.42);
    }
    // Sparse dark brass stabs
    if (B.stabs.indexOf(s) >= 0) stabChord(B.chord, t, 0.16, 0.14, true);
    // Energetic hats: offbeat 8ths accented, 16th fills on bars 3 and 7
    if (s % 2 === 0) hatTick(t, s % 4 === 2, s % 4 === 2 ? 0.11 : 0.05);
    else if ((bar === 3 || bar === 7) && s >= 11) hatTick(t, false, 0.04);
  }

  function scheduleStep(step, t) {
    if (music.mode === 'race') scheduleRaceStep(step, t);
    else scheduleTitleStep(step, t);
  }

  function schedulerTick() {
    if (!ctx || !music.playing) return;
    // suspend guard: ONLY after a genuinely long gap (backgrounded tab) skip ahead instead
    // of flooding past-due notes. Ordinary main-thread stalls ride on the wide lookahead.
    if (music.nextTime < ctx.currentTime - 2.5) {
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
    setRaceMusic: safe(doSetRaceMusic)
  };
})();
