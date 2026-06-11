'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface TaxDollarOfferDialogProps {
  open: boolean
  propertyName: string
  fullBuildCostMillion: number
  halfBuildCostMillion: number
  onUseTaxDollars: () => void
  onBuildFullPrice: () => void
}

export function TaxDollarOfferDialog({
  open,
  propertyName,
  fullBuildCostMillion,
  halfBuildCostMillion,
  onUseTaxDollars,
  onBuildFullPrice,
}: TaxDollarOfferDialogProps) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md border border-white/10 bg-[#141418] text-slate-100 sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-normal text-slate-100">
            Build with Tax Dollars?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-relaxed text-slate-400">
            You have <strong className="text-slate-200">Build with Tax Dollars</strong> in your hand. Would you like to
            build <strong className="text-slate-200">{propertyName}</strong> at half cost (
            <strong className="text-amber-200">${halfBuildCostMillion}M</strong> instead of ${fullBuildCostMillion}M)? The
            action card is discarded when the build completes. If you choose full price, you keep the card.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            className="mt-0 border-white/15 bg-transparent text-slate-300 hover:bg-white/5 hover:text-slate-100"
            onClick={onBuildFullPrice}
          >
            No — pay ${fullBuildCostMillion}M
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-amber-600 text-white hover:bg-amber-500"
            onClick={onUseTaxDollars}
          >
            Yes — half cost (${halfBuildCostMillion}M)
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
