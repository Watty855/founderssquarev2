'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

/** Trailing write so play clicks are not blocked by JSON.stringify + localStorage. */
const PERSIST_DEBOUNCE_MS = 400

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
  const stateRef = useRef(state)
  stateRef.current = state
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const writePersist = useCallback(
    (value: T) => {
      if (!persist) return
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch (e) {
        console.warn('Failed to persist game state:', e)
      }
    },
    [key, persist]
  )

  const flushPersist = useCallback(() => {
    if (persistTimerRef.current != null) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    writePersist(stateRef.current)
  }, [writePersist])

  useEffect(() => {
    if (!persist) return
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    if (persistTimerRef.current != null) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null
      writePersist(stateRef.current)
    }, PERSIST_DEBOUNCE_MS)
  }, [key, state, persist, writePersist])

  useEffect(() => {
    if (!persist) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushPersist()
    }
    window.addEventListener('pagehide', flushPersist)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      flushPersist()
      window.removeEventListener('pagehide', flushPersist)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [persist, flushPersist])

  const setState = useCallback((valueOrUpdater: T | ((current: T) => T)) => {
    if (typeof valueOrUpdater === 'function') {
      setStateInternal((prev) => {
        const updater = valueOrUpdater as (current: T) => T
        return updater(prev)
      })
    } else {
      setStateInternal(valueOrUpdater)
    }
  }, [])

  return [state, setState]
}
