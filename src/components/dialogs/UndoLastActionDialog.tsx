'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface UndoLastActionDialogProps {
  open: boolean
  actionLabel: string
  detail?: string
  onConfirm: () => void
  onCancel: () => void
}

export function UndoLastActionDialog({
  open,
  actionLabel,
  detail,
  onConfirm,
  onCancel,
}: UndoLastActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent
        className="max-w-[400px] [&>button:first-child]:hidden"
        style={{
          backgroundColor: '#141418',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <DialogHeader style={{ marginBottom: 4 }}>
          <DialogTitle style={{ fontSize: 18, fontWeight: 400 }}>Undo last action?</DialogTitle>
          <DialogDescription style={{ fontSize: 13, color: '#8888a0', lineHeight: 1.4 }}>
            Reverse <strong style={{ color: '#f0f0f5' }}>{actionLabel}</strong>
            {detail ? (
              <>
                {' '}
                — {detail}
              </>
            ) : null}
            . Cards, cash, and board changes from that action will be restored.
          </DialogDescription>
        </DialogHeader>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              height: 42,
              borderRadius: 10,
              backgroundColor: 'transparent',
              color: '#f0f0f5',
              fontSize: 14,
              fontWeight: 500,
              border: '1px solid rgba(255,255,255,0.15)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-ps"
            style={{
              flex: 1,
              height: 42,
              borderRadius: 10,
              backgroundColor: '#c81b3a',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              border: '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            Undo
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** @deprecated Use UndoLastActionDialog */
export const UndoBuildDialog = UndoLastActionDialog
