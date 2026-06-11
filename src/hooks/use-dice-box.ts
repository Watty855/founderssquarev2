'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type DiceBox from '@3d-dice/dice-box-threejs'

interface UseDiceBoxOptions {
  containerId: string
  open: boolean
}

export function useDiceBox({ containerId, open }: UseDiceBoxOptions) {
  const diceBoxRef = useRef<DiceBox | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [diceValue, setDiceValue] = useState<number | null>(null)
  const [isReady, setIsReady] = useState(false)
  const initializingRef = useRef(false)

  useEffect(() => {
    if (!open) {
      if (diceBoxRef.current) {
        diceBoxRef.current.clearDice()
        diceBoxRef.current = null
      }
      setDiceValue(null)
      setIsRolling(false)
      setIsReady(false)
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
        console.error('Failed to initialize DiceBox:', err)
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
    }
  }, [open, containerId])

  const roll = useCallback(async (): Promise<number> => {
    if (!diceBoxRef.current || isRolling) return 0

    setIsRolling(true)
    setDiceValue(null)

    try {
      const result = await diceBoxRef.current.roll('1d6')
      const value = result.sets[0]?.rolls[0]?.value ?? 0
      setDiceValue(value)
      setIsRolling(false)
      return value
    } catch (err) {
      console.error('Dice roll failed:', err)
      setIsRolling(false)
      return 0
    }
  }, [isRolling])

  const reset = useCallback(() => {
    if (diceBoxRef.current) {
      diceBoxRef.current.clearDice()
    }
    setDiceValue(null)
    setIsRolling(false)
  }, [])

  return { roll, isRolling, diceValue, reset, isReady }
}
