'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type DiceBox from '@3d-dice/dice-box-threejs'

interface UseDiceBoxOptions {
  containerId: string
  open: boolean
}

/** 3D rolls should settle quickly; at 3s we assume the canvas hung and fall back instantly. */
const ROLL_TIMEOUT_MS = 3000

/**
 * WebGL + asset init normally finishes well under a second. WKWebView can stall
 * `initialize()` forever (service-worker 206 audio, killed GPU process, context cap)
 * without rejecting — past this we switch to the instant-roll fallback so the roll
 * button can never stay stuck on "Loading...".
 */
const INIT_TIMEOUT_MS = 2000

function randomDie(): number {
  return Math.floor(Math.random() * 6) + 1
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      }
    )
  })
}

/** clearDice() throws if the renderer's context is already dead — never let that escape into React. */
function safeClearDice(db: DiceBox | null) {
  if (!db) return
  try {
    db.clearDice()
  } catch {
    /* renderer already dead */
  }
}

/**
 * iOS Safari caps live WebGL contexts and silently kills the oldest; each dialog open
 * creates a fresh context, so long games hit the cap and dice init starts hanging.
 * Explicitly losing the context on teardown returns it to the pool immediately
 * instead of waiting on GC.
 */
function forceLoseCanvasContext(canvas: HTMLCanvasElement) {
  try {
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl')) as WebGLRenderingContext | null
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    /* context already lost */
  }
}

function releaseContainerCanvases(containerId: string) {
  const container = document.getElementById(containerId)
  if (!container) return
  for (const canvas of Array.from(container.querySelectorAll('canvas'))) {
    forceLoseCanvasContext(canvas)
  }
}

export function useDiceBox({ containerId, open }: UseDiceBoxOptions) {
  const diceBoxRef = useRef<DiceBox | null>(null)
  /** Canvas created by the current DiceBox — kept so teardown can lose its context even after unmount. */
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [diceValue, setDiceValue] = useState<number | null>(null)
  const [isReady, setIsReady] = useState(false)
  const initializingRef = useRef(false)
  /** WebGL/asset init failed or hung (e.g. WKWebView refused a context) — roll without the 3D animation so the game never stalls. */
  const fallbackModeRef = useRef(false)

  const teardownRenderer = useCallback(() => {
    safeClearDice(diceBoxRef.current)
    diceBoxRef.current = null
    if (canvasRef.current) {
      forceLoseCanvasContext(canvasRef.current)
      canvasRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) {
      teardownRenderer()
      setDiceValue(null)
      setIsRolling(false)
      setIsReady(false)
      initializingRef.current = false
      fallbackModeRef.current = false
      return
    }

    let cancelled = false
    let frame2 = 0

    const startInit = async () => {
      const container = document.getElementById(containerId)
      if (!container || cancelled || initializingRef.current) return

      initializingRef.current = true

      try {
        const { default: DiceBox } = await import('@3d-dice/dice-box-threejs')

        if (cancelled) return

        const baseConfig = {
          assetPath: '/assets/dice-box/',
          volume: 60,
          sound_dieMaterial: 'plastic',
          theme_colorset: 'white',
          theme_material: 'plastic',
          theme_surface: 'default',
          shadows: true,
          gravity_multiplier: 400,
          light_intensity: 0.7,
          strength: 1,
        }

        let db: InstanceType<typeof DiceBox>

        try {
          db = new DiceBox(`#${containerId}`, { ...baseConfig, sounds: true })
          await withTimeout(db.initialize(), INIT_TIMEOUT_MS, 'DiceBox init (sounds)')
        } catch {
          // Sound loading can fail or hang (e.g. service worker caching 206 responses).
          // Release the failed renderer's context, clear the container, retry without sounds.
          console.warn('DiceBox init with sounds failed, retrying without sounds')
          releaseContainerCanvases(containerId)
          const el = document.getElementById(containerId)
          if (el) el.innerHTML = ''
          db = new DiceBox(`#${containerId}`, { ...baseConfig, sounds: false })
          await withTimeout(db.initialize(), INIT_TIMEOUT_MS, 'DiceBox init (no sounds)')
        }

        if (cancelled) {
          safeClearDice(db)
          releaseContainerCanvases(containerId)
          return
        }

        diceBoxRef.current = db
        canvasRef.current = container.querySelector('canvas')
        setIsReady(true)
      } catch (err) {
        // 3D renderer unavailable or hung (WebGL context refused, assets missing,
        // low memory, init timeout). Release anything half-built, then enter
        // fallback mode so rolls still resolve and the game keeps moving.
        console.error('Failed to initialize DiceBox — using instant-roll fallback:', err)
        releaseContainerCanvases(containerId)
        if (!cancelled) {
          fallbackModeRef.current = true
          setIsReady(true)
        }
      } finally {
        if (!cancelled) {
          initializingRef.current = false
        }
      }
    }

    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        void startInit()
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(frame1)
      if (frame2) cancelAnimationFrame(frame2)
      teardownRenderer()
      setIsReady(false)
      initializingRef.current = false
      fallbackModeRef.current = false
    }
  }, [open, containerId, teardownRenderer])

  const roll = useCallback(async (): Promise<number> => {
    if (isRolling) return 0

    // No 3D renderer — resolve with a short pause so the result still reads as a roll.
    // Never return 0: callers treat non-1–6 as "no roll", which freezes AI confrontation cards.
    if (!diceBoxRef.current || fallbackModeRef.current) {
      setIsRolling(true)
      setDiceValue(null)
      await new Promise((r) => setTimeout(r, 650))
      const value = randomDie()
      setDiceValue(value)
      setIsRolling(false)
      return value
    }

    setIsRolling(true)
    setDiceValue(null)

    try {
      // Race the animation against a watchdog: a throttled/paused canvas must not freeze the game.
      const result = await Promise.race([
        diceBoxRef.current.roll('1d6'),
        new Promise<null>((r) => setTimeout(() => r(null), ROLL_TIMEOUT_MS)),
      ])
      if (result === null) {
        console.warn('Dice roll animation timed out — resolving with fallback value')
        fallbackModeRef.current = true
        safeClearDice(diceBoxRef.current)
        const value = randomDie()
        setDiceValue(value)
        setIsRolling(false)
        return value
      }
      const value = result.sets[0]?.rolls[0]?.value ?? 0
      setDiceValue(value)
      setIsRolling(false)
      return value
    } catch (err) {
      console.error('Dice roll failed — resolving with fallback value:', err)
      const value = randomDie()
      setDiceValue(value)
      setIsRolling(false)
      return value
    }
  }, [isRolling])

  const reset = useCallback(() => {
    safeClearDice(diceBoxRef.current)
    setDiceValue(null)
    setIsRolling(false)
  }, [])

  return { roll, isRolling, diceValue, reset, isReady }
}
