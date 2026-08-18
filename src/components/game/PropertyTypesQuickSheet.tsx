'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface PropertyTypesQuickSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const PROPERTY_TYPES_SHEET_IMG = '/assets/property-types-sheet.png?v=20260818'

export function PropertyTypesQuickSheet({ open, onOpenChange }: PropertyTypesQuickSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,52rem)] !max-w-[52rem] flex-col gap-3 overflow-hidden border border-white/12 bg-[#0a1628] p-3 text-[#e8e8f2] shadow-2xl sm:p-4">
        <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
          <DialogTitle className="text-lg font-semibold tracking-wide text-[#f4f4f8] sm:text-xl">
            Founders Square — Property Types
          </DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed text-[#9b9bad]">
            Build cost, income, bank, and end-game value by property type. Scroll to read the full sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[#07101c]">
          <img
            src={PROPERTY_TYPES_SHEET_IMG}
            alt="Founders Square Property Types — Residential, Commercial, Service, Industrial, Civic"
            className="mx-auto block h-auto w-full max-w-full"
            draggable={false}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
