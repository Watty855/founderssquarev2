import type { ReactNode } from 'react'
import { toast as sonnerToast } from 'sonner'
import type { ExternalToast } from 'sonner'

/** Must match `<Toaster id={FS_BOARD_TOASTER_ID} />` on the game board dock. */
export const FS_BOARD_TOASTER_ID = 'fs-board-dock' as const

function withBoard<D extends ExternalToast | undefined>(opts: D) {
  return { ...(opts ?? {}), toasterId: FS_BOARD_TOASTER_ID } as D & {
    toasterId: typeof FS_BOARD_TOASTER_ID
  }
}

export type FsToastOptions = ExternalToast & {
  /** Force an info/message toast through the v2 quiet policy (broadcast-worthy events only). */
  important?: boolean
}

/**
 * Same API as `sonner` `toast`, but notifications render in the board HUD toaster (not the global header toaster).
 *
 * v2 quiet policy: per-turn guidance (`info` / `message`) is suppressed unless marked
 * `important` — the action-required strip and board notices carry routine direction.
 * Errors, warnings, and action results (`success`) still surface.
 */
export const gameDockToast = Object.assign(
  (message: ReactNode, data?: ExternalToast) => sonnerToast(message, withBoard(data)),
  {
    success: (message: ReactNode, data?: ExternalToast) => sonnerToast.success(message, withBoard(data)),
    error: (message: ReactNode, data?: ExternalToast) => sonnerToast.error(message, withBoard(data)),
    info: (message: ReactNode, data?: FsToastOptions) => {
      if (!data?.important) return '' as string | number
      return sonnerToast.info(message, withBoard(data))
    },
    warning: (message: ReactNode, data?: ExternalToast) => sonnerToast.warning(message, withBoard(data)),
    message: (message: ReactNode, data?: FsToastOptions) => {
      if (!data?.important) return '' as string | number
      return sonnerToast.message(message, withBoard(data))
    },
    loading: (message: ReactNode, data?: ExternalToast) => sonnerToast.loading(message, withBoard(data)),
    promise: sonnerToast.promise,
    custom: sonnerToast.custom,
    dismiss: sonnerToast.dismiss,
  }
)
