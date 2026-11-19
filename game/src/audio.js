// Synthesised WebAudio sounds for Solmar Bay: engine hum, police siren,
// pickup blips and impact thuds. No audio files, no network.
// Everything is a no-op until the player first interacts (browser rule).
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.ready = false;
  }

  ensure() {
    if (this.ready) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      // Engine: sawtooth through a lowpass, gain follows speed.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      // Siren: sine that alternates tone, driven from update().
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'sine';
      this.sirenOsc.frequency.value = 780;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.ctx.destination);
      this.sirenOsc.start();
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  // norm: 0..1 speed fraction. on: whether the engine should be audible.
  setEngine(norm, on) {
    if (!this.ready) return;
    try {
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(55 + norm * 160, t, 0.08);
      this.engineGain.gain.setTargetAtTime(on ? 0.035 + norm * 0.05 : 0, t, 0.1);
    } catch { /* ignore */ }
  }

  setSiren(on) {
    if (!this.ready) return;
    this.sirenOn = on;
    try {
      this.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.15);
    } catch { /* ignore */ }
  }

  // Called every frame with the running clock so the siren can wail.
  update(time) {
    if (!this.ready || !this.sirenOn) return;
    try {
      const hi = Math.floor(time * 1.5) % 2 === 0;
      this.sirenOsc.frequency.setTargetAtTime(hi ? 950 : 680, this.ctx.currentTime, 0.05);
    } catch { /* ignore */ }
  }

  blip(freq = 880, dur = 0.12) {
    if (!this.ready) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.08, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start();
      o.stop(this.ctx.currentTime + dur);
    } catch { /* ignore */ }
  }

  coin() {
    this.blip(1320, 0.1);
    setTimeout(() => this.blip(1760, 0.16), 90);
  }

  thud() {
    if (!this.ready) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * 0.18);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = 0.25;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 320;
      src.connect(f);
      f.connect(g);
      g.connect(this.ctx.destination);
      src.start();
    } catch { /* ignore */ }
  }
}
