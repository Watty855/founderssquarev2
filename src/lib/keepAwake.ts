/**
 * Prevent the device screen from sleeping while a table is in progress.
 * Uses @capacitor-community/keep-awake on native; Screen Wake Lock API in browsers that support it.
 */

import { Capacitor } from '@capacitor/core'

let keptAwake = false

export async function enablePlayKeepAwake(): Promise<void> {
  if (keptAwake) return
  try {
    if (Capacitor.isNativePlatform()) {
      const { KeepAwake } = await import('@capacitor-community/keep-awake')
      const support = await KeepAwake.isSupported()
      if (!support.isSupported) return
      await KeepAwake.keepAwake()
      keptAwake = true
      return
    }
    // Web / TestFlight WKWebView may expose the Screen Wake Lock API.
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    if (nav.wakeLock) {
      await nav.wakeLock.request('screen')
      keptAwake = true
    }
  } catch {
    // Unsupported or denied — play continues without a wake lock.
  }
}

export async function disablePlayKeepAwake(): Promise<void> {
  if (!keptAwake) return
  try {
    if (Capacitor.isNativePlatform()) {
      const { KeepAwake } = await import('@capacitor-community/keep-awake')
      await KeepAwake.allowSleep()
    }
  } catch {
    /* ignore */
  } finally {
    keptAwake = false
  }
}
