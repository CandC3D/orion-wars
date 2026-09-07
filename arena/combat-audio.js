// Small synthesized tactical sound set. It adds no asset dependency and only
// creates an AudioContext after a user gesture.
export function createCombatAudio(host = globalThis) {
  let context = null;
  let enabled = true;
  const AudioContext = host.AudioContext || host.webkitAudioContext;

  function unlock() {
    if (!enabled || !AudioContext) return null;
    if (!context) context = new AudioContext();
    if (context.state === "suspended") context.resume();
    return context;
  }

  function tone(frequency, duration, type = "sine", gain = 0.035, slide = 1, delay = 0) {
    const audio = unlock();
    if (!audio) return;
    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * slide), start + duration);
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume).connect(audio.destination);
    oscillator.start(start); oscillator.stop(start + duration + 0.02);
  }

  function cue(name, delay = 0) {
    if (!enabled) return;
    if (name === "ui") tone(720, 0.07, "sine", 0.025, 1.35, delay);
    else if (name === "engage") { tone(220, 0.16, "triangle", 0.04, 1.8, delay); tone(440, 0.22, "sine", 0.025, 1.4, delay + 0.1); }
    else if (name === "beam") tone(760, 0.18, "sawtooth", 0.028, 0.28, delay);
    else if (name === "spinal") { tone(95, 0.46, "sawtooth", 0.06, 3.2, delay); tone(620, 0.32, "square", 0.018, 0.22, delay + 0.12); }
    else if (name === "launch") tone(150, 0.28, "triangle", 0.035, 2.7, delay);
    else if (name === "impact") { tone(72, 0.32, "square", 0.055, 0.5, delay); tone(180, 0.14, "sawtooth", 0.025, 0.35, delay); }
    else if (name === "intercept") tone(980, 0.09, "square", 0.018, 0.7, delay);
    else if (name === "victory") { tone(330, 0.18, "triangle", 0.035, 1.5, delay); tone(495, 0.28, "triangle", 0.035, 1.35, delay + 0.17); }
    else if (name === "defeat") { tone(180, 0.25, "sawtooth", 0.04, 0.7, delay); tone(120, 0.4, "triangle", 0.04, 0.65, delay + 0.18); }
  }

  return {
    cue,
    unlock,
    get enabled() { return enabled; },
    setEnabled(value) { enabled = !!value; if (enabled) unlock(); return enabled; }
  };
}
