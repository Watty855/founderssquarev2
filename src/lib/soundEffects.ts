/**
 * Founders Square v2 sound design.
 *
 *  - Construction: recorded SFX (public/assets/sfx/construction.m4a) when a structure is built
 *  - Calamity: recorded SFX (public/assets/sfx/calamity.m4a) after each city-wide calamity roll;
 *    volume and playback rate scale with the die face (1 quiet → 6 full intensity)
 *  - Cash register, crowd boo/cheer, anchor chain: synthesized with Web Audio
 *    (no binary assets for those, works offline in the Capacitor shell)
 */

/** Bundled build SFX — served from /public so Capacitor sync includes it offline. */
const CONSTRUCTION_SFX_URL = '/assets/sfx/construction.m4a'
const CALAMITY_SFX_URL = '/assets/sfx/calamity.m4a'

let audioContext: AudioContext | null = null
/** Reused HTMLAudioElement so rapid builds don't stack overlapping decoders. */
let constructionAudio: HTMLAudioElement | null = null
/** Reused so sequential calamity rolls restart instead of stacking. */
let calamityAudio: HTMLAudioElement | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioContext) audioContext = new AudioContext()
  if (audioContext.state === 'suspended') void audioContext.resume()
  return audioContext
}

function playConstructionSample(): boolean {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return false
  try {
    if (!constructionAudio) {
      constructionAudio = new Audio(CONSTRUCTION_SFX_URL)
      constructionAudio.preload = 'auto'
      constructionAudio.playbackRate = 1.1
    }
    constructionAudio.pause()
    constructionAudio.currentTime = 0
    constructionAudio.playbackRate = 1.1
    const playResult = constructionAudio.play()
    if (playResult && typeof playResult.catch === 'function') {
      void playResult.catch((err) => {
        console.warn('Construction SFX play failed:', err)
      })
    }
    return true
  } catch (err) {
    console.warn('Construction SFX unavailable:', err)
    return false
  }
}

/** White-noise buffer, lazily built once per context. */
let noiseBuffer: AudioBuffer | null = null
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer
  const length = ctx.sampleRate * 2
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  return noiseBuffer
}

function playNoise(
  ctx: AudioContext,
  opts: {
    start: number
    duration: number
    gain: number
    filterType?: BiquadFilterType
    frequency?: number
    q?: number
    gainCurve?: 'hit' | 'swell' | 'fade'
    playbackRate?: number
  }
) {
  const src = ctx.createBufferSource()
  src.buffer = getNoiseBuffer(ctx)
  src.loop = true
  if (opts.playbackRate) src.playbackRate.value = opts.playbackRate

  const filter = ctx.createBiquadFilter()
  filter.type = opts.filterType ?? 'lowpass'
  filter.frequency.value = opts.frequency ?? 1000
  filter.Q.value = opts.q ?? 1

  const g = ctx.createGain()
  const t = opts.start
  const d = opts.duration
  if (opts.gainCurve === 'swell') {
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain, t + d * 0.6)
    g.gain.exponentialRampToValueAtTime(0.0001, t + d)
  } else if (opts.gainCurve === 'fade') {
    g.gain.setValueAtTime(opts.gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + d)
  } else {
    // percussive hit
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(opts.gain, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + d)
  }

  src.connect(filter)
  filter.connect(g)
  g.connect(ctx.destination)
  src.start(t)
  src.stop(t + d + 0.05)
}

function playTone(
  ctx: AudioContext,
  opts: {
    start: number
    duration: number
    gain: number
    type?: OscillatorType
    from: number
    to?: number
    curve?: 'exp' | 'linear'
  }
) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(opts.from, opts.start)
  if (opts.to && opts.to !== opts.from) {
    if (opts.curve === 'linear') osc.frequency.linearRampToValueAtTime(opts.to, opts.start + opts.duration)
    else osc.frequency.exponentialRampToValueAtTime(opts.to, opts.start + opts.duration)
  }
  g.gain.setValueAtTime(opts.gain, opts.start)
  g.gain.exponentialRampToValueAtTime(0.0001, opts.start + opts.duration)
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start(opts.start)
  osc.stop(opts.start + opts.duration + 0.02)
}

/* ───────────────────────── Construction — recorded SFX ───────────────────────── */

export const playConstructionSound = () => {
  playConstructionSample()
}

/**
 * Calamity sting after a founder’s roll. Face 1 is a low rumble; face 6 is full
 * volume and a slightly faster playback — same clip, rising intensity.
 */
export function playCalamitySound(face: number) {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return
  const pip = Math.min(6, Math.max(1, Math.round(face)))
  const t = (pip - 1) / 5
  const volume = 0.28 + t * 0.72
  const playbackRate = 0.88 + t * 0.22
  try {
    if (!calamityAudio) {
      calamityAudio = new Audio(CALAMITY_SFX_URL)
      calamityAudio.preload = 'auto'
    }
    calamityAudio.pause()
    calamityAudio.currentTime = 0
    calamityAudio.volume = volume
    calamityAudio.playbackRate = playbackRate
    const playResult = calamityAudio.play()
    if (playResult && typeof playResult.catch === 'function') {
      void playResult.catch((err) => {
        console.warn('Calamity SFX play failed:', err)
      })
    }
  } catch (err) {
    console.warn('Calamity SFX unavailable:', err)
  }
}

/** Stop a lingering calamity sting so income/coin cues are never buried under it. */
function stopCalamitySound() {
  if (!calamityAudio) return
  try {
    calamityAudio.pause()
    calamityAudio.currentTime = 0
  } catch {
    /* ignore */
  }
}

/* ───────────────────────── Cash register — income earned ───────────────────────── */

export const playCashRegisterSound = () => {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  // Key clack
  playNoise(ctx, { start: now, duration: 0.04, gain: 0.18, filterType: 'highpass', frequency: 3000, gainCurve: 'hit' })
  // "Cha-ching" bell — two bright partials
  playTone(ctx, { start: now + 0.06, duration: 0.35, gain: 0.2, type: 'sine', from: 1567 })
  playTone(ctx, { start: now + 0.06, duration: 0.35, gain: 0.12, type: 'sine', from: 2349 })
  playTone(ctx, { start: now + 0.14, duration: 0.45, gain: 0.18, type: 'sine', from: 2093 })
  playTone(ctx, { start: now + 0.14, duration: 0.45, gain: 0.1, type: 'sine', from: 3136 })
  // Cash drawer rolling open + thunk
  playNoise(ctx, { start: now + 0.28, duration: 0.18, gain: 0.08, filterType: 'lowpass', frequency: 900, gainCurve: 'fade' })
  playTone(ctx, { start: now + 0.46, duration: 0.1, gain: 0.16, type: 'triangle', from: 120, to: 60 })
}

/* ───────────────────────── Crowd boo — taxation played ───────────────────────── */

export const playCrowdBooSound = () => {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  // Low rumbling crowd bed
  playNoise(ctx, { start: now, duration: 1.5, gain: 0.12, filterType: 'lowpass', frequency: 500, gainCurve: 'swell', playbackRate: 0.5 })

  // Layered descending "boo" voices
  const voices = [
    { from: 240, to: 150, delay: 0.0, gain: 0.085 },
    { from: 200, to: 120, delay: 0.12, gain: 0.075 },
    { from: 290, to: 175, delay: 0.22, gain: 0.06 },
    { from: 170, to: 105, delay: 0.35, gain: 0.07 },
  ]
  for (const v of voices) {
    const t = now + v.delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 800
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(v.from, t)
    osc.frequency.exponentialRampToValueAtTime(v.to, t + 1.0)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(v.gain, t + 0.18)
    g.gain.setValueAtTime(v.gain, t + 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.15)
    osc.connect(filter)
    filter.connect(g)
    g.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 1.2)
  }
}

/* ───────────────────────── Crowd cheer — winning roll ───────────────────────── */

export const playCrowdCheerSound = () => {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  // Bright crowd roar that swells fast and tails off
  playNoise(ctx, { start: now, duration: 1.6, gain: 0.16, filterType: 'bandpass', frequency: 1500, q: 0.7, gainCurve: 'swell', playbackRate: 0.9 })
  playNoise(ctx, { start: now + 0.05, duration: 1.4, gain: 0.1, filterType: 'highpass', frequency: 2500, gainCurve: 'swell' })

  // Rising whoop voices
  const whoops = [
    { from: 320, to: 620, delay: 0.05, gain: 0.06 },
    { from: 380, to: 740, delay: 0.16, gain: 0.05 },
    { from: 290, to: 560, delay: 0.3, gain: 0.055 },
  ]
  for (const w of whoops) {
    playTone(ctx, { start: now + w.delay, duration: 0.4, gain: w.gain, type: 'triangle', from: w.from, to: w.to })
  }

  // Celebratory ascending chime
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => {
    playTone(ctx, { start: now + 0.25 + i * 0.09, duration: 0.3, gain: 0.09, type: 'sine', from: f })
  })
}

/* ───────────────────────── Anchor chain drop — anchor tenet placed ───────────────────────── */

export const playAnchorDropSound = () => {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  // Rapid metallic chain links rattling out
  for (let i = 0; i < 10; i++) {
    const t = now + i * 0.07
    const f = 1800 + (i % 3) * 600 + Math.random() * 300
    playNoise(ctx, { start: t, duration: 0.035, gain: 0.1, filterType: 'bandpass', frequency: f, q: 6, gainCurve: 'hit' })
    playTone(ctx, { start: t, duration: 0.04, gain: 0.045, type: 'square', from: f * 0.5, to: f * 0.4 })
  }

  // Deep splash + hull thud as the anchor lands
  const landT = now + 0.74
  playNoise(ctx, { start: landT, duration: 0.5, gain: 0.16, filterType: 'lowpass', frequency: 600, gainCurve: 'fade', playbackRate: 0.7 })
  playTone(ctx, { start: landT, duration: 0.6, gain: 0.22, type: 'sine', from: 90, to: 38 })
  // Resonant bell ring of taut chain
  playTone(ctx, { start: landT + 0.08, duration: 0.7, gain: 0.07, type: 'triangle', from: 392, to: 380, curve: 'linear' })
}

/* ───────────────────────── Influence dwindling — anchor scandal / raid ───────────────────────── */

/** Fading chain rattle + descending tone when anchor influence is discontinued. */
export const playInfluenceDwindleSound = () => {
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  for (let i = 0; i < 6; i++) {
    const t = now + i * 0.11
    const f = 1400 - i * 120 + Math.random() * 80
    playNoise(ctx, {
      start: t,
      duration: 0.04,
      gain: 0.07 - i * 0.008,
      filterType: 'bandpass',
      frequency: f,
      q: 5,
      gainCurve: 'hit',
    })
    playTone(ctx, { start: t, duration: 0.05, gain: 0.035 - i * 0.004, type: 'triangle', from: f * 0.45, to: f * 0.3 })
  }

  playTone(ctx, { start: now + 0.35, duration: 0.9, gain: 0.12, type: 'sine', from: 220, to: 72 })
  playNoise(ctx, {
    start: now + 0.4,
    duration: 0.7,
    gain: 0.08,
    filterType: 'lowpass',
    frequency: 480,
    gainCurve: 'fade',
    playbackRate: 0.65,
  })
}

/* ───────────────────────── Legacy aliases (existing call sites) ───────────────────────── */

/** Cash register + coin clinks — only for receiving income, never for Calamity. */
export const playIncomeSound = () => {
  stopCalamitySound()
  playCashRegisterSound()
  playCoinSound()
}

export const playPropertyPlacementSound = () => playConstructionSound()

export const playCoinSound = () => {
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  for (let i = 0; i < 3; i++) {
    const startTime = now + i * 0.05
    const freq = 1000 + i * 200
    playTone(ctx, { start: startTime, duration: 0.08, gain: 0.15, type: 'sine', from: freq, to: freq * 0.8 })
  }
}
