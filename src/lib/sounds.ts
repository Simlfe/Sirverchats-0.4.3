// Web Audio API Synthesizer for high-quality, lightweight in-app sound effects.

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtxClass) {
      audioCtx = new AudioCtxClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx!;
}

// Automatically unlock AudioContext on user interaction to comply with browser autoplay policies
export function unlockAudioContext() {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('click', unlockAudioContext, { passive: true });
  window.addEventListener('touchstart', unlockAudioContext, { passive: true });
  window.addEventListener('keydown', unlockAudioContext, { passive: true });
}

/**
 * Synthesizes a beautiful electronic ascending chime for joining a voice channel
 */
export function playJoinSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Note 1: C5
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Note 2: E5 (staggered slightly)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.1); // E5
    gain2.gain.setValueAtTime(0.15, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.4);
  } catch (err) {
    console.warn('Could not play join sound:', err);
  }
}

/**
 * Synthesizes a descending chime for leaving a voice channel
 */
export function playLeaveSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Note 1: E5
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Note 2: C5 (staggered)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(523.25, now + 0.1); // C5
    gain2.gain.setValueAtTime(0.15, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.4);
  } catch (err) {
    console.warn('Could not play leave sound:', err);
  }
}

/**
 * Plays a sweet notification high-frequency bubble ping sound when mentioned or pinged in chat
 */
export function playPingSound() {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now); // A5 (sweet bell)
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12); // Sweep up rapidly for bubble feel

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  } catch (err) {
    console.warn('Could not play ping sound:', err);
  }
}

let ringtoneInterval: any = null;
let outgoingRingtoneInterval: any = null;
let ringtoneMuted = false;

export function setRingtoneMuted(muted: boolean) {
  ringtoneMuted = muted;
}

export function resetRingtoneMuted() {
  ringtoneMuted = false;
}

export function getIsRingtoneMuted(): boolean {
  return ringtoneMuted;
}

/**
 * Plays incoming call ringtone (melodic ascending double-chime)
 */
export function playRingtoneSound() {
  stopRingtoneSound();
  const ring = () => {
    if (ringtoneMuted) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // Note 1: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.14, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: A5 (880 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.15);
      gain2.gain.setValueAtTime(0.14, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.55);

      // Note 3: B5 (987.77 Hz)
      const osc3 = ctx.createOscillator();
      const gain3 = ctx.createGain();
      osc3.type = 'sine';
      osc3.frequency.setValueAtTime(987.77, now + 0.35);
      gain3.gain.setValueAtTime(0.12, now + 0.35);
      gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      osc3.connect(gain3);
      gain3.connect(ctx.destination);
      osc3.start(now + 0.35);
      osc3.stop(now + 0.85);
    } catch (e) {}
  };
  ring();
  ringtoneInterval = setInterval(ring, 2200);
}

export function stopRingtoneSound() {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
}

/**
 * Plays outgoing call ringback tone (soft dual-tone phone ring for the caller)
 */
export function playOutgoingRingtoneSound() {
  stopOutgoingRingtoneSound();
  const ring = () => {
    if (ringtoneMuted) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      // 440 Hz + 480 Hz standard ringback pulse
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.setValueAtTime(0.08, now + 1.2);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.35);
      osc2.stop(now + 1.35);
    } catch (e) {}
  };
  ring();
  outgoingRingtoneInterval = setInterval(ring, 3000);
}

export function stopOutgoingRingtoneSound() {
  if (outgoingRingtoneInterval) {
    clearInterval(outgoingRingtoneInterval);
    outgoingRingtoneInterval = null;
  }
}

export function stopAllRingtones() {
  stopRingtoneSound();
  stopOutgoingRingtoneSound();
}


