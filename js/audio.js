const SFX_ENVELOPES = {
  food: { freqStart: 880, freqEnd: 1200, durationMs: 90, waveform: "sine" },
  poison: { freqStart: 300, freqEnd: 120, durationMs: 180, waveform: "sawtooth" },
  powerup: { freqStart: 440, freqEnd: 880, durationMs: 160, waveform: "triangle" },
  collision: { freqStart: 220, freqEnd: 50, durationMs: 320, waveform: "square" },
  gameOver: { freqStart: 300, freqEnd: 90, durationMs: 550, waveform: "square" },
  click: { freqStart: 600, freqEnd: 600, durationMs: 30, waveform: "sine" }
};

class AudioManager {
  #ctx = null;
  #masterGain = null;
  #sfxGain = null;
  #musicGain = null;
  #musicNodes = [];
  #musicTimer = null;
  #settings = { musicOn: true, sfxOn: true };

  ensureContext() {
    if (this.#ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.#ctx = new Ctx();
    this.#masterGain = this.#ctx.createGain();
    this.#sfxGain = this.#ctx.createGain();
    this.#musicGain = this.#ctx.createGain();
    this.#sfxGain.connect(this.#masterGain);
    this.#musicGain.connect(this.#masterGain);
    this.#masterGain.connect(this.#ctx.destination);
    this.applySettings(this.#settings);
  }

  resume() {
    if (this.#ctx && this.#ctx.state === "suspended") this.#ctx.resume();
  }

  applySettings({ musicOn, sfxOn }) {
    this.#settings = { musicOn, sfxOn };
    if (!this.#sfxGain) return;
    this.#sfxGain.gain.value = sfxOn ? 0.5 : 0;
    this.#musicGain.gain.value = musicOn ? 0.06 : 0;
  }

  playSfx(type) {
    if (!this.#ctx) return;
    const env = SFX_ENVELOPES[type];
    if (!env) return;
    const now = this.#ctx.currentTime;
    const osc = this.#ctx.createOscillator();
    const gain = this.#ctx.createGain();
    osc.type = env.waveform;
    osc.frequency.setValueAtTime(env.freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(env.freqEnd, 1), now + env.durationMs / 1000);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + env.durationMs / 1000);
    osc.connect(gain).connect(this.#sfxGain);
    osc.start(now);
    osc.stop(now + env.durationMs / 1000);
  }

  playLevelComplete() {
    if (!this.#ctx) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      const start = this.#ctx.currentTime + i * 0.12;
      const osc = this.#ctx.createOscillator();
      const gain = this.#ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      osc.connect(gain).connect(this.#sfxGain);
      osc.start(start);
      osc.stop(start + 0.25);
    });
  }

  startMusic() {
    if (!this.#ctx || this.#musicNodes.length) return;
    const notes = [261.6, 329.6, 392.0, 329.6];
    let i = 0;
    const playNext = () => {
      if (!this.#ctx) return;
      const now = this.#ctx.currentTime;
      const osc = this.#ctx.createOscillator();
      const gain = this.#ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(notes[i % notes.length], now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.3);
      gain.gain.linearRampToValueAtTime(0, now + 1.4);
      osc.connect(gain).connect(this.#musicGain);
      osc.start(now);
      osc.stop(now + 1.5);
      i++;
    };
    playNext();
    this.#musicTimer = setInterval(playNext, 1500);
    this.#musicNodes.push(true);
  }

  stopMusic() {
    if (this.#musicTimer) clearInterval(this.#musicTimer);
    this.#musicTimer = null;
    this.#musicNodes = [];
  }
}

export const AudioSys = new AudioManager();
