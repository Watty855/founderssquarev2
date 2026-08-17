'use client'

import { useState, useEffect, useRef } from 'react'
import { Player } from '@/lib/types'
import { ActionCard, CardInstance } from '@/lib/cardTypes'
import { actionCards } from '@/lib/cardData'
import { CompactCardView } from '@/components/game/CompactCardView'
import { pickAiActionCardDiscardIds } from '@/lib/bot/simpleAiTurn'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DiscardDialogProps {
  open: boolean
  player: Player
  numToDiscard: number
  onComplete: (discardedInstanceIds: string[]) => void
  /** AI: auto-pick discard targets when the excess-hand dialog opens. */
  aiConfirmSelection?: boolean
}

export function DiscardDialog({
  open,
  player,
  numToDiscard,
  onComplete,
  aiConfirmSelection,
}: DiscardDialogProps) {
  const [selectedCards, setSelectedCards] = useState<string[]>([])

  const handKey = (player.actionCards || []).map((c) => c.instanceId).join('|')
  const playerRef = useRef(player)
  playerRef.current = player
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const resolvedKeyRef = useRef('')

  /**
   * Founderbot discard: resolve in one tick. Do not depend on `player` / `onComplete`
   * identity — GameApp re-renders cancelled this timeout before it fired (same class
   * of freeze as Income autoplay). Strict Mode: set the resolved key only when firing.
   */
  useEffect(() => {
    if (!open || !aiConfirmSelection || numToDiscard <= 0) {
      if (!open) resolvedKeyRef.current = ''
      return
    }
    const key = `${handKey}|${numToDiscard}`
    let cancelled = false
    const t = window.setTimeout(() => {
      if (cancelled) return
      if (resolvedKeyRef.current === key) return
      resolvedKeyRef.current = key
      onCompleteRef.current(pickAiActionCardDiscardIds(playerRef.current, numToDiscard))
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, aiConfirmSelection, numToDiscard, handKey])

  const allCards = [
    ...(player.actionCards || []).map(instance => {
      const card = actionCards.find(c => c.id === instance.cardId)
      return card ? { ...card, instance, cardType: 'action' as const } : null
    })
  ].filter(Boolean) as (ActionCard & { instance: CardInstance; cardType: 'action' })[]

  const toggleCard = (instanceId: string) => {
    setSelectedCards(prev => {
      if (prev.includes(instanceId)) {
        return prev.filter(id => id !== instanceId)
      } else if (prev.length < numToDiscard) {
        return [...prev, instanceId]
      }
      return prev
    })
  }

  const handleConfirm = () => {
    if (selectedCards.length === numToDiscard) {
      onComplete(selectedCards)
      setSelectedCards([])
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-4xl max-h-[80vh] overflow-y-auto [&>button:first-child]:hidden"
        style={{
          backgroundColor: '#141418',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <DialogHeader style={{ marginBottom: 4 }}>
          <DialogTitle style={{ fontSize: 18, fontWeight: 400 }}>End of Turn — Discard to 8</DialogTitle>
          <DialogDescription style={{ fontSize: 13, color: '#8888a0', lineHeight: 1.4 }}>
            All 3 actions are used. Action hands may go over 8 during a turn — select {numToDiscard}{' '}
            card{numToDiscard > 1 ? 's' : ''} to discard down to 8 before the next founder starts.
            ({selectedCards.length}/{numToDiscard} selected)
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-4 py-4">
          {allCards.map(card => (
            <div
              key={card.instance.instanceId}
              className={`cursor-pointer transition-all ${
                selectedCards.includes(card.instance.instanceId)
                  ? 'ring-4 ring-destructive scale-95'
                  : 'hover:scale-105'
              }`}
              onClick={() => toggleCard(card.instance.instanceId)}
            >
              <CompactCardView
                card={card}
                onClick={() => {}}
                selected={selectedCards.includes(card.instance.instanceId)}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={handleConfirm}
            disabled={selectedCards.length !== numToDiscard}
            className="btn-ps"
            style={{
              height: 42, borderRadius: 10, backgroundColor: '#0070cc', color: '#fff',
              fontSize: 14, fontWeight: 600, border: '2px solid transparent',
              cursor: selectedCards.length !== numToDiscard ? 'not-allowed' : 'pointer',
              opacity: selectedCards.length !== numToDiscard ? 0.5 : 1,
              padding: '0 24px',
            }}
          >
            Confirm Discard ({selectedCards.length}/{numToDiscard})
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
