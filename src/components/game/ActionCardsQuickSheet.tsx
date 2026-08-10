'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ActionCardsQuickSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Bundled PDF + raster page (WebView-safe) of Founders_Square_Action_Cards.pdf */
const ACTION_CARDS_PDF_URL = '/Founders_Square_Action_Cards.pdf'
const ACTION_CARDS_SHEET_IMG = '/assets/action-cards-sheet.png'

export function ActionCardsQuickSheet({ open, onOpenChange }: ActionCardsQuickSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,52rem)] !max-w-[52rem] flex-col gap-3 overflow-hidden border border-white/12 bg-[#0a1628] p-3 text-[#e8e8f2] shadow-2xl sm:p-4">
        <DialogHeader className="shrink-0 space-y-1 pr-8 text-left">
          <DialogTitle className="text-lg font-semibold tracking-wide text-[#f4f4f8] sm:text-xl">
            Founders Square — Action Cards
          </DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed text-[#9b9bad]">
            Earn Income, Improve Building, and Against Opponents. Scroll to read the full sheet.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[#07101c]">
          {/*
            Render the PDF page as an image so Capacitor / iOS WebView always
            shows the sheet (inline PDF viewers are unreliable in WKWebView).
            The source PDF is also bundled for “Open PDF”.
          */}
          <img
            src={ACTION_CARDS_SHEET_IMG}
            alt="Founders Square Action Cards — Earn Income, Improve Building, Against Opponents"
            className="mx-auto block h-auto w-full max-w-full"
            draggable={false}
          />
        </div>

        <div className="flex shrink-0 justify-end">
          <a
            href={ACTION_CARDS_PDF_URL}
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
