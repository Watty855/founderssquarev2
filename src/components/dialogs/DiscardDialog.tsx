'use client'

import { useState, useEffect } from 'react'
import { Player } from '@/lib/types'
import { PropertyCard, ActionCard, CardInstance } from '@/lib/cardTypes'
import { propertyCards, actionCards } from '@/lib/cardData'
import { CompactCardView } from '@/components/game/CompactCardView'
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
  /** AI: auto-pick first N cards in hand order when the excess-hand dialog opens. */
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

  useEffect(() => {
    if (!open || !aiConfirmSelection || numToDiscard <= 0) return
    const hand = player.actionCards || []
    if (hand.length < numToDiscard) return
    const ids = hand.slice(0, numToDiscard).map((c) => c.instanceId)
    const t = window.setTimeout(() => onComplete(ids), 320)
    return () => window.clearTimeout(t)
  }, [open, aiConfirmSelection, numToDiscard, handKey, onComplete])

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
          <DialogTitle style={{ fontSize: 18, fontWeight: 400 }}>Discard Action Cards</DialogTitle>
          <DialogDescription style={{ fontSize: 13, color: '#8888a0', lineHeight: 1.4 }}>
            You have too many action cards. Select {numToDiscard} card{numToDiscard > 1 ? 's' : ''} to discard.
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
