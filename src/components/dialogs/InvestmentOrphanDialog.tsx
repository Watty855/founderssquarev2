'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface InvestmentOrphanDialogProps {
  open: boolean
  cardName: string
  bankValue: number
  /** Explains why the card cannot be played as an action right now */
  reasonDescription: string
  onBank: () => void
  onCancel: () => void
}

export function InvestmentOrphanDialog({
  open,
  cardName,
  bankValue,
  reasonDescription,
  onBank,
  onCancel,
}: InvestmentOrphanDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent
        className="max-w-[420px] [&>button:first-child]:hidden"
        style={{
          backgroundColor: '#141418',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <DialogHeader style={{ marginBottom: 8 }}>
          <DialogTitle style={{ fontSize: 17, fontWeight: 500 }}>Cannot play {cardName}</DialogTitle>
          <DialogDescription style={{ fontSize: 13, color: '#a8a8b8', lineHeight: 1.55 }}>
            <span style={{ display: 'block', marginBottom: 8, color: '#c8c8d8' }}>
              No criteria are met to perform this action.
            </span>
            {reasonDescription}
          </DialogDescription>
        </DialogHeader>
        <p style={{ fontSize: 13, color: '#8888a0', marginBottom: 16 }}>
          Would you like to bank this card for ${bankValue}M, or cancel and keep it in your hand?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            onClick={onBank}
            className="btn-ps"
            style={{
              height: 42,
              borderRadius: 10,
              backgroundColor: '#0070cc',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              border: '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            Bank for ${bankValue}M
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              height: 40,
              borderRadius: 10,
              backgroundColor: 'transparent',
              color: '#f0f0f5',
              fontSize: 14,
              fontWeight: 500,
              border: '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
            }}
          >
            Cancel — keep card
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
