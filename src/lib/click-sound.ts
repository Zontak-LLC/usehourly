/**
 * The stopwatch's click (2026-10-23): a short, soft mechanical sound made by the browser (Web Audio, no sound file),
 * plus a tiny vibration on phones that support it. "start" is a bright click, "stop" a deeper clunk, "save" two soft
 * notes. It stays quiet on purpose, and fails silently anywhere audio is not allowed.
 */

type Kind = "start" | "stop" | "save";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** A click: a very short burst of noise through a band-pass filter, like a spring-loaded button. */
function tick(a: AudioContext, at: number, pitch: number, volume: number) {
  const length = Math.floor(a.sampleRate * 0.012);
  const buffer = a.createBuffer(1, length, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const source = a.createBufferSource();
  source.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = pitch;
  filter.Q.value = 4;
  const gain = a.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(a.destination);
  source.start(at);
}

/** A soft tone that fades out (the "saved" chime). */
function tone(a: AudioContext, at: number, frequency: number, volume: number) {
  const osc = a.createOscillator();
  osc.type = "sine";
  osc.frequency.value = frequency;
  const gain = a.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
  osc.connect(gain).connect(a.destination);
  osc.start(at);
  osc.stop(at + 0.26);
}

export function playClick(kind: Kind) {
  try {
    navigator.vibrate?.(kind === "save" ? [8, 40, 8] : 10);
  } catch {
    // no vibration here
  }
  const a = audio();
  if (!a) return;
  const t = a.currentTime + 0.005;
  if (kind === "start") {
    tick(a, t, 3200, 0.35);
    tick(a, t + 0.035, 2400, 0.18);
  } else if (kind === "stop") {
    tick(a, t, 1500, 0.4);
    tick(a, t + 0.03, 900, 0.22);
  } else {
    tone(a, t, 880, 0.05);
    tone(a, t + 0.09, 1320, 0.04);
  }
}
