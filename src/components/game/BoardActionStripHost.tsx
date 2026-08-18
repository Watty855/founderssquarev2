'use client'

import { useMemo } from 'react'
import { RequiredActionBanner } from '@/components/game/RequiredActionBanner'
import { buildRequiredAction } from '@/lib/buildRequiredAction'
import { useGameTableStore } from '@/lib/gameTableStore'
import { usePlayUiStore } from '@/lib/playUiStore'

export function BoardActionStripHost() {
  const gs = useGameTableStore((s) => s)
  const ui = usePlayUiStore((s) => s)
  const action = useMemo(() => buildRequiredAction(gs, ui), [gs, ui])
  return <RequiredActionBanner layout="boardStrip" action={action} />
}
