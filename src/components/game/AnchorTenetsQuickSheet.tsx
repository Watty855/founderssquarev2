'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AnchorTenetsQuickSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type AnchorSummary = {
  code: string
  name: string
  tagline: string
  influence: string
  income: string
  endgame: string
}

const CIVIC_ANCHORS: AnchorSummary[] = [
  {
    code: 'CAT',
    name: 'Church Affiliation',
    tagline: 'Faith reaches every corner.',
    influence: '+1 (G) on T and R',
    income: '+1 (B)',
    endgame: '$6M',
  },
  {
    code: 'FAT',
    name: 'Farm Bureau',
    tagline: 'Rules the Farmland, from root to rail.',
    influence: '+1 in Farmland on T, R, and IR',
    income: '+1 (B)',
    endgame: '$2M',
  },
  {
    code: 'PAT',
    name: 'Port Authority',
    tagline: 'Commands the Railway District.',
    influence: '+1 in Railway on T, R, and IR',
    income: '+1 (B)',
    endgame: '$2M',
  },
  {
    code: 'AAT',
    name: 'Arts Council',
    tagline: 'Curates the River Parkway.',
    influence: '+1 in River Parkway on T, R, and IR',
    income: '+1 (B)',
    endgame: '$2M',
  },
  {
    code: 'IAT',
    name: 'Influencers',
    tagline: 'Owns the narrative.',
    influence: '+1 (G) on S',
    income: '+1 (B)',
    endgame: '$0M',
  },
  {
    code: 'TAT',
    name: 'Tourism Office',
    tagline: 'Draws the crowds to Mountain Cove.',
    influence: '+1 in Mountain Cove on T, R, and IR',
    income: '+1 (B)',
    endgame: '$2M',
  },
]

const SHADOW_ANCHORS: AnchorSummary[] = [
  {
    code: 'MAT',
    name: 'Mafia',
    tagline: 'Skims the till.',
    influence: '+1 (G) on T, R, and IR',
    income: '+1 (B) and takes $1M/income from rivals (B)',
    endgame: '$0M',
  },
  {
    code: 'NAT',
    name: 'News Outlet',
    tagline: 'Breaks the story.',
    influence: '+1 (G) on S',
    income: '+1 (B)',
    endgame: '$0M',
  },
  {
    code: 'RAT',
    name: 'Regulation Bureau',
    tagline: 'Writes the rules rivals live by.',
    influence: '+1 (G) on T, R, and IR; rivals −1 (B) on T and IR',
    income: '+1 (B); rivals −1 (B)',
    endgame: '$0M',
  },
  {
    code: 'UAT',
    name: 'Union',
    tagline: "Organizes the district it's played in.",
    influence: '+1 in that district on T, R, and IR',
    income: '+1 (B); rivals −1 (B)',
    endgame: '$0M',
  },
]

function AnchorRows({ anchors }: { anchors: AnchorSummary[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <div className="hidden grid-cols-[minmax(12rem,1.35fr)_minmax(12rem,1.45fr)_minmax(12rem,1.35fr)_5rem] gap-3 border-b border-white/10 bg-white/[0.05] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 md:grid">
        <span>Anchor Tenet</span>
        <span>Influence</span>
        <span>Income</span>
        <span className="text-right">Endgame</span>
      </div>
      {anchors.map((anchor) => (
        <article
          key={anchor.code}
          className="grid gap-3 border-b border-white/[0.08] px-4 py-3 last:border-b-0 md:grid-cols-[minmax(12rem,1.35fr)_minmax(12rem,1.45fr)_minmax(12rem,1.35fr)_5rem]"
        >
          <div>
            <div className="flex items-baseline gap-2">
              <span className="rounded bg-sky-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-sky-200">
                {anchor.code}
              </span>
              <strong className="text-[13px] text-slate-100">{anchor.name}</strong>
            </div>
            <p className="m-0 mt-1 text-[11px] italic leading-relaxed text-slate-400">{anchor.tagline}</p>
          </div>
          <div>
            <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-500 md:hidden">
              Influence
            </span>
            <span className="text-[12px] leading-relaxed text-slate-200">{anchor.influence}</span>
          </div>
          <div>
            <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-500 md:hidden">
              Income
            </span>
            <span className="text-[12px] leading-relaxed text-slate-200">{anchor.income}</span>
          </div>
          <div className="md:text-right">
            <span className="mb-0.5 block text-[9px] font-bold uppercase tracking-wider text-slate-500 md:hidden">
              Endgame
            </span>
            <strong className="text-[13px] text-amber-200">{anchor.endgame}</strong>
          </div>
        </article>
      ))}
    </div>
  )
}

export function AnchorTenetsQuickSheet({ open, onOpenChange }: AnchorTenetsQuickSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(96vw,72rem)] !max-w-[72rem] overflow-y-auto border border-white/12 bg-[#0e0e14] text-[#e8e8f2] shadow-2xl">
        <DialogHeader className="space-y-1 pr-8 text-left">
          <DialogTitle className="text-xl font-semibold tracking-wide text-[#f4f4f8]">
            ⚓ Founders Square — Anchor Tenets
          </DialogTitle>
          <DialogDescription className="text-left text-xs leading-relaxed text-[#9b9bad]">
            A quick reference for Influence, Income, and Endgame Value.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ['1 · Influence', 'Tilts rolls for or against you wherever its reach extends.'],
            ['2 · Income', 'Adds or subtracts value from income rolls for properties sharing its block.'],
            ['3 · Endgame Value', 'What the Anchor Tenet is worth when the game ends.'],
          ].map(([title, detail]) => (
            <section key={title} className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <h3 className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-200">{title}</h3>
              <p className="m-0 mt-1 text-[12px] leading-relaxed text-slate-300">{detail}</p>
            </section>
          ))}
        </div>

        <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-[12px] leading-relaxed text-amber-50/90">
          <strong>Civic Bonus:</strong> Owning a Civic property (City Hall, Courthouse, or Police) adds +1
          Influence (B) on Freeze (F) and Police Raid (P) rolls.
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] leading-relaxed text-slate-400">
          <span><strong className="text-slate-200">G</strong> Game Board / citywide</span>
          <span><strong className="text-slate-200">B</strong> Block / local only</span>
          <span><strong className="text-slate-200">T</strong> Takeover</span>
          <span><strong className="text-slate-200">F</strong> City Council Freeze</span>
          <span><strong className="text-slate-200">IR</strong> Investor Removal</span>
          <span><strong className="text-slate-200">R</strong> Rezoning</span>
          <span><strong className="text-slate-200">S</strong> Scandal</span>
          <span><strong className="text-slate-200">P</strong> Police Raid on Mafia</span>
        </div>

        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-300">
            Civic Anchors — power that pays out
          </h3>
          <AnchorRows anchors={CIVIC_ANCHORS} />
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-violet-300">
            Shadow Anchors — leverage over rivals
          </h3>
          <AnchorRows anchors={SHADOW_ANCHORS} />
        </section>

        <p className="m-0 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-[11px] font-semibold text-slate-300">
          Only one Anchor Tenet may claim each qualifying center — first built, first served.
        </p>
      </DialogContent>
    </Dialog>
  )
}
