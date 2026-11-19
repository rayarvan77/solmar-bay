// Solmar Bay — synthesized sound. No audio files: every sound is built with
// the Web Audio API (oscillators, filtered noise, envelopes).
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOn = false;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.sirenHigh = false;
  }

  // Must be called from a user gesture (the Start button) so the browser
  // allows audio.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);

    // Engine hum: a sawtooth through a low-pass filter.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // speed01: 0 (idle/off) .. 1 (top speed). Called every frame while driving.
  setEngine(speed01, on) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speed01 * 0.10 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.1);
    this.engineFilter.frequency.setTargetAtTime(320 + speed01 * 900, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (on) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.05;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenHigh = true;
      this.sirenTimer = setInterval(() => {
        if (!this.sirenOsc) return;
        this.sirenHigh = !this.sirenHigh;
        this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 720 : 540, this.ctx.currentTime, 0.05);
      }, 380);
    } else {
      if (this.sirenTimer) clearInterval(this.sirenTimer);
      this.sirenTimer = null;
      if (this.sirenOsc) {
        try { this.sirenOsc.stop(); } catch (e) { /* already stopped */ }
        this.sirenOsc.disconnect();
        this.sirenOsc = null;
      }
    }
  }

  // Short beep: UI blips, pickups, mission updates.
  blip(freq = 880, dur = 0.09, type = 'square', vol = 0.12) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Two-note cash chime for mission rewards.
  cash() {
    this.blip(988, 0.12, 'sine', 0.16);
    setTimeout(() => this.blip(1319, 0.2, 'sine', 0.16), 110);
  }

  // Low thump for a punch landing.
  thud() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  // Gunshot: a burst of white noise through a high-pass filter.
  shot() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  // Crash crunch: low noise burst.
  crash(strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * 0.18);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.8;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.25 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.master);
    src.start(t);
  }
}
