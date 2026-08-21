'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface RulesQuickSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Bundled PDF + raster page (WebView-safe) of Founders_Square_Quick_Rules.pdf */
const QUICK_RULES_PDF_URL = '/Founders_Square_Quick_Rules.pdf'
const QUICK_RULES_SHEET_IMG = '/assets/quick-rules-sheet.png?v=20260821'

export function RulesQuickSheet({ open, onOpenChange }: RulesQuickSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,52rem)] !max-w-[52rem] flex-col gap-3 overflow-hidden border border-white/12 bg-[#0a1628] p-3 text-[#e8e8f2] shadow-2xl sm:p-4">
        <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
          <DialogTitle className="text-lg font-semibold tracking-wide text-[#f4f4f8] sm:text-xl">
            Founders Square — Quick Rules
          </DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed text-[#9b9bad]">
            A refresher, not the rulebook — cards and the board show full specifics when you play.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[#07101c]">
          <img
            src={QUICK_RULES_SHEET_IMG}
            alt="Founders Square Quick Rules — Goal, Your Turn, Anchor Tenets, Against Opponents, Calamity, Bonuses, End Game"
            className="mx-auto block h-auto w-full max-w-full"
            draggable={false}
          />
        </div>

        <div className="flex shrink-0 justify-end">
          <a
            href={QUICK_RULES_PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-sky-300/90 underline-offset-2 hover:text-sky-200 hover:underline"
          >
            Open PDF
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}
