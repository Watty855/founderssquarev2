'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export function useGameState<T>(
  key: string,
  initialValue: T,
  options?: { persist?: boolean }
): [T, (valueOrUpdater: T | ((current: T) => T)) => void] {
  const persist = options?.persist !== false
  const [state, setStateInternal] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : initialValue
    } catch {
      return initialValue
    }
  })

  const isInitialMount = useRef(true)

  useEffect(() => {
    if (!persist) return
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    try {
      localStorage.setItem(key, JSON.stringify(state))
    } catch (e) {
      console.warn('Failed to persist game state:', e)
    }
  }, [key, state, persist])

  const setState = useCallback((valueOrUpdater: T | ((current: T) => T)) => {
    if (typeof valueOrUpdater === 'function') {
      setStateInternal(prev => {
        const updater = valueOrUpdater as (current: T) => T
        return updater(prev)
      })
    } else {
      setStateInternal(valueOrUpdater)
    }
  }, [])

  return [state, setState]
}
