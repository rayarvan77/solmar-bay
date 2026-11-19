// Solmar Bay — all sound is synthesized with WebAudio. No audio files.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.muted = false;
  }

  // Must be called from a user gesture at least once.
  ensure() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch (e) {
      return false;
    }
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _tone(freq, dur, type, vol, when) {
    if (!this.ctx) return;
    const t0 = when || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  gunshot() {
    if (!this.ensure()) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.18);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 1800;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start();
    this._tone(160, 0.08, 'square', 0.12);
  }

  punch() {
    if (!this.ensure()) return;
    this._tone(90, 0.1, 'triangle', 0.3);
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.06);
    const gain = this.ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(gain); gain.connect(this.master);
    src.start();
  }

  chime() {
    if (!this.ensure()) return;
    this._tone(660, 0.12, 'sine', 0.22);
    this._tone(880, 0.18, 'sine', 0.22, this.ctx.currentTime + 0.1);
    this._tone(1320, 0.25, 'sine', 0.18, this.ctx.currentTime + 0.2);
  }

  crash() {
    if (!this.ensure()) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.3);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 700;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start();
  }

  pickup() {
    if (!this.ensure()) return;
    this._tone(523, 0.1, 'sine', 0.2);
    this._tone(784, 0.16, 'sine', 0.2, this.ctx.currentTime + 0.08);
  }

  // Continuous engine hum whose pitch follows speed (0..1).
  startEngine() {
    if (!this.ensure()) return;
    if (this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  setEngine(speed01, driving) {
    if (!this.engineOsc || !this.ctx) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speed01 * 0.09 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, t, 0.08);
  }

  // Classic two-tone police siren.
  setSiren(on) {
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (!this.ensure()) return;
    if (on) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'square';
      this.sirenOsc.frequency.value = 700;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start(); lfo.start();
      this._sirenLfo = lfo;
    } else if (this.sirenOsc) {
      try { this.sirenOsc.stop(); this._sirenLfo.stop(); } catch (e) {}
      this.sirenOsc = null; this._sirenLfo = null;
    }
  }

  // Looping bassline: Am – F – C – G roots, one note per beat.
  startMusic() {
    if (!this.ensure() || this.musicTimer) return;
    const roots = [55, 43.65, 65.41, 49];
    this.musicStep = 0;
    this.musicTimer = window.setInterval(() => {
      if (this.muted || !this.ctx) return;
      const bar = Math.floor(this.musicStep / 4) % 4;
      const beat = this.musicStep % 4;
      const root = roots[bar];
      const freq = beat === 3 ? root * 1.5 : root;
      this._tone(freq, 0.42, 'triangle', 0.14);
      if (beat === 0) this._tone(root * 2, 0.2, 'sine', 0.06);
      this.musicStep++;
    }, 340);
  }

  stopMusic() {
    if (this.musicTimer) { window.clearInterval(this.musicTimer); this.musicTimer = null; }
  }
}
