'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { FOUNDERS_SHORT_RULES } from '@/lib/foundersShortRules'

interface RulesQuickSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RulesQuickSheet({ open, onOpenChange }: RulesQuickSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(85vh,640px)] overflow-y-auto border border-white/12 bg-[#0e0e14] text-[#e8e8f2] shadow-2xl sm:max-w-lg">
        <DialogHeader className="space-y-1 pr-8 text-left">
          <DialogTitle className="text-[15px] font-semibold tracking-wide text-[#f4f4f8]">
            Founders Square — quick rules
          </DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed text-[#9b9bad]">
            Cards and the board show specifics when you play. Use this as a refresher; edit brevity in{' '}
            <code className="rounded bg-white/10 px-1 py-0.5 text-[10px]">lib/foundersShortRules.ts</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          {FOUNDERS_SHORT_RULES.map((section) => (
            <section key={section.title}>
              <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7dd3fc]/90">
                {section.title}
              </h3>
              <ul className="list-disc space-y-1.5 pl-4 text-[13px] text-[#d4d4de] marker:text-[#5ac8fa]/80">
                {section.lines.map((line, lineIdx) => (
                  <li key={`${section.title}-${lineIdx}`}>{line}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
