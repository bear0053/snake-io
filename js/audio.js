const SFX_ENVELOPES = {
  food: { freqStart: 880, freqEnd: 1200, durationMs: 90, waveform: "sine" },
  poison: { freqStart: 300, freqEnd: 120, durationMs: 180, waveform: "sawtooth" },
  powerup: { freqStart: 440, freqEnd: 880, durationMs: 160, waveform: "triangle" },
  collision: { freqStart: 220, freqEnd: 50, durationMs: 320, waveform: "square" },
  gameOver: { freqStart: 300, freqEnd: 90, durationMs: 550, waveform: "square" },
  click: { freqStart: 600, freqEnd: 600, durationMs: 30, waveform: "sine" }
};

// One short looping motif per theme/screen, tuned to fit the mood: tempo (noteDurationMs),
// timbre (waveform), register (note frequencies), and an optional low "bassRatio" layer for
// the more intense themes. Keyed directly by level.theme so gameplay music always matches
// whatever world the player is currently in; "menu" covers all non-gameplay screens.
const MUSIC_THEMES = {
  menu: { notes: [392.0, 440.0, 523.25, 440.0], waveform: "sine", noteDurationMs: 1800, gainPeak: 0.35 },
  garden: { notes: [261.63, 329.63, 392.0, 329.63], waveform: "triangle", noteDurationMs: 1500, gainPeak: 0.45 },
  desert: { notes: [293.66, 349.23, 293.66, 246.94], waveform: "sine", noteDurationMs: 2100, gainPeak: 0.35 },
  snowy: { notes: [523.25, 659.25, 783.99, 659.25], waveform: "sine", noteDurationMs: 2400, gainPeak: 0.3 },
  jungle: { notes: [220.0, 261.63, 220.0, 196.0, 261.63, 293.66], waveform: "square", noteDurationMs: 900, gainPeak: 0.3, bassRatio: 0.5 },
  lava: { notes: [146.83, 155.56, 146.83, 174.61], waveform: "sawtooth", noteDurationMs: 750, gainPeak: 0.4, bassRatio: 0.5 },
  cyber: { notes: [349.23, 415.3, 466.16, 415.3, 523.25, 415.3, 466.16, 349.23], waveform: "square", noteDurationMs: 260, gainPeak: 0.28 }
};

const MUSIC_GAIN_SCALE = 0.3; // ceiling so max slider volume still sits comfortably behind SFX

class AudioManager {
  #ctx = null;
  #masterGain = null;
  #sfxGain = null;
  #musicGain = null;
  #musicTimer = null;
  #currentMusicTheme = null;
  #settings = { musicOn: true, sfxOn: true, musicVolume: 0.6 };

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

  applySettings({ musicOn, sfxOn, musicVolume }) {
    this.#settings = { musicOn, sfxOn, musicVolume: musicVolume ?? this.#settings.musicVolume ?? 0.6 };
    if (!this.#sfxGain) return;
    this.#sfxGain.gain.value = sfxOn ? 0.5 : 0;
    this.#musicGain.gain.value = musicOn ? this.#settings.musicVolume * MUSIC_GAIN_SCALE : 0;
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

  startMusic(themeId = "menu") {
    if (!this.#ctx) return;
    if (this.#currentMusicTheme === themeId && this.#musicTimer) return; // already playing this theme
    this.stopMusic();
    this.#currentMusicTheme = themeId;

    const theme = MUSIC_THEMES[themeId] ?? MUSIC_THEMES.menu;
    let i = 0;
    const noteSeconds = theme.noteDurationMs / 1000;

    const playNext = () => {
      if (!this.#ctx) return;
      const now = this.#ctx.currentTime;
      const freq = theme.notes[i % theme.notes.length];

      const osc = this.#ctx.createOscillator();
      const gain = this.#ctx.createGain();
      osc.type = theme.waveform;
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(theme.gainPeak, now + noteSeconds * 0.15);
      gain.gain.linearRampToValueAtTime(0, now + noteSeconds * 0.92);
      osc.connect(gain).connect(this.#musicGain);
      osc.start(now);
      osc.stop(now + noteSeconds);

      if (theme.bassRatio) {
        const bassOsc = this.#ctx.createOscillator();
        const bassGain = this.#ctx.createGain();
        bassOsc.type = "sine";
        bassOsc.frequency.setValueAtTime(freq * theme.bassRatio, now);
        bassGain.gain.setValueAtTime(0, now);
        bassGain.gain.linearRampToValueAtTime(theme.gainPeak * 0.7, now + noteSeconds * 0.15);
        bassGain.gain.linearRampToValueAtTime(0, now + noteSeconds * 0.92);
        bassOsc.connect(bassGain).connect(this.#musicGain);
        bassOsc.start(now);
        bassOsc.stop(now + noteSeconds);
      }

      i++;
    };

    playNext();
    this.#musicTimer = setInterval(playNext, theme.noteDurationMs);
  }

  stopMusic() {
    if (this.#musicTimer) clearInterval(this.#musicTimer);
    this.#musicTimer = null;
    this.#currentMusicTheme = null;
  }
}

export const AudioSys = new AudioManager();
