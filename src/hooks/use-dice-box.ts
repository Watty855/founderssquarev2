'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type DiceBox from '@3d-dice/dice-box-threejs'

interface UseDiceBoxOptions {
  containerId: string
  open: boolean
  /**
   * Prefer CSS flat die (phones / WKWebView). Skips Three.js load entirely.
   * Desktop/tablet leave false for the 3D dice-box.
   */
  preferFlatDie?: boolean
}

/** 3D roll animations normally settle in ~2-3s; past this we assume the canvas hung. */
const ROLL_TIMEOUT_MS = 8000
const FLAT_ROLL_MS = 720

function randomDie(): number {
  return Math.floor(Math.random() * 6) + 1
}

export function useDiceBox({ containerId, open, preferFlatDie = false }: UseDiceBoxOptions) {
  const diceBoxRef = useRef<DiceBox | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [diceValue, setDiceValue] = useState<number | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [previewFace, setPreviewFace] = useState(1)
  const initializingRef = useRef(false)
  /** WebGL/asset init failed (e.g. WKWebView refused a context) — roll without the 3D animation so the game never stalls. */
  const fallbackModeRef = useRef(false)
  const flatModeRef = useRef(preferFlatDie)
  flatModeRef.current = preferFlatDie

  useEffect(() => {
    if (!open) {
      if (diceBoxRef.current) {
        diceBoxRef.current.clearDice()
        diceBoxRef.current = null
      }
      setDiceValue(null)
      setIsRolling(false)
      setIsReady(false)
      setPreviewFace(1)
      initializingRef.current = false
      fallbackModeRef.current = false
      return
    }

    // Phone / compact path: ready immediately, no WebGL.
    if (preferFlatDie) {
      fallbackModeRef.current = true
      setIsReady(true)
      initializingRef.current = false
      return
    }

    let cancelled = false

    const timer = setTimeout(async () => {
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
          await db.initialize()
        } catch {
          // Sound loading can fail (e.g. service worker caching 206 responses).
          // Clear the failed renderer, retry without sounds.
          console.warn('DiceBox init with sounds failed, retrying without sounds')
          const el = document.getElementById(containerId)
          if (el) el.innerHTML = ''
          db = new DiceBox(`#${containerId}`, { ...baseConfig, sounds: false })
          await db.initialize()
        }

        if (cancelled) {
          db.clearDice()
          return
        }

        diceBoxRef.current = db
        setIsReady(true)
      } catch (err) {
        // 3D renderer unavailable (WebGL context refused, assets missing, low memory).
        // Enter fallback mode so rolls still resolve and the game keeps moving.
        console.error('Failed to initialize DiceBox — using instant-roll fallback:', err)
        if (!cancelled) {
          fallbackModeRef.current = true
          setIsReady(true)
        }
      } finally {
        if (!cancelled) {
          initializingRef.current = false
        }
      }
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (diceBoxRef.current) {
        diceBoxRef.current.clearDice()
        diceBoxRef.current = null
      }
      setIsReady(false)
      initializingRef.current = false
      fallbackModeRef.current = false
    }
  }, [open, containerId, preferFlatDie])

  const roll = useCallback(async (): Promise<number> => {
    if (isRolling) return 0

    // Flat / fallback path — no 3D renderer.
    if (flatModeRef.current || !diceBoxRef.current || fallbackModeRef.current) {
      if (!flatModeRef.current && !fallbackModeRef.current && !diceBoxRef.current) return 0
      setIsRolling(true)
      setDiceValue(null)
      const tick = window.setInterval(() => {
        setPreviewFace(randomDie())
      }, 70)
      await new Promise((r) => setTimeout(r, flatModeRef.current ? FLAT_ROLL_MS : 650))
      window.clearInterval(tick)
      const value = randomDie()
      setPreviewFace(value)
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
        try {
          diceBoxRef.current?.clearDice()
        } catch {
          /* renderer already dead */
        }
        const value = randomDie()
        setDiceValue(value)
        setPreviewFace(value)
        setIsRolling(false)
        return value
      }
      const value = result.sets[0]?.rolls[0]?.value ?? 0
      setDiceValue(value)
      setPreviewFace(value)
      setIsRolling(false)
      return value
    } catch (err) {
      console.error('Dice roll failed — resolving with fallback value:', err)
      const value = randomDie()
      setDiceValue(value)
      setPreviewFace(value)
      setIsRolling(false)
      return value
    }
  }, [isRolling])

  const reset = useCallback(() => {
    if (diceBoxRef.current) {
      diceBoxRef.current.clearDice()
    }
    setDiceValue(null)
    setIsRolling(false)
    setPreviewFace(1)
  }, [])

  return {
    roll,
    isRolling,
    diceValue,
    reset,
    isReady,
    /** Face to show on the flat die while rolling / after settle. */
    previewFace,
    usingFlatDie: preferFlatDie || fallbackModeRef.current,
  }
}
