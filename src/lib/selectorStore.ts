'use client'

import { useRef, useSyncExternalStore } from 'react'

export function createSelectorStore<S>(initial: S) {
  let state = initial
  const listeners = new Set<() => void>()

  function emit() {
    listeners.forEach((l) => l())
  }

  function getSnapshot(): S {
    return state
  }

  function subscribe(onStoreChange: () => void): () => void {
    listeners.add(onStoreChange)
    return () => {
      listeners.delete(onStoreChange)
    }
  }

  function setState(next: S) {
    if (next === state) return
    state = next
    emit()
  }

  function useStore<T>(select: (s: S) => T): T {
    const selectRef = useRef(select)
    selectRef.current = select
    const cacheRef = useRef<T>(select(state))
    return useSyncExternalStore(
      subscribe,
      () => {
        const next = selectRef.current(state)
        if (Object.is(cacheRef.current, next)) return cacheRef.current
        cacheRef.current = next
        return next
      },
      () => selectRef.current(state)
    )
  }

  return { getSnapshot, subscribe, setState, useStore }
}
