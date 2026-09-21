'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FreezeAssetsPlayPrompt } from '@/components/game/FreezeAssetsPlayPrompt'

export function FreezeAssetsConfirmDialog({
  open,
  canPay,
  onPay,
  onBank,
  onCancel,
}: {
  open: boolean
  canPay: boolean
  onPay: () => void
  onBank: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent
        className="max-w-[420px] [&>button:first-child]:hidden"
        style={{
          backgroundColor: '#141418',
          border: '1px solid rgba(252, 211, 77, 0.22)',
          borderRadius: 16,
          padding: 24,
        }}
      >
        <DialogHeader style={{ marginBottom: 12 }}>
          <DialogTitle style={{ fontSize: 17, fontWeight: 600, color: '#fde68a' }}>
            Freeze Assets
          </DialogTitle>
          <DialogDescription className="sr-only">
            Pay to freeze all income for one round, bank the card, or cancel.
          </DialogDescription>
        </DialogHeader>
        <FreezeAssetsPlayPrompt canPay={canPay} onPay={onPay} onBank={onBank} onCancel={onCancel} />
      </DialogContent>
    </Dialog>
  )
}
