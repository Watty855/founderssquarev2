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
import type { PendingEndGameDeclaration } from '@/lib/types'

type DeclareEndGameDialogProps = {
  open: boolean
  playerName: string
  pending: PendingEndGameDeclaration
  /** False on other devices — they wait. */
  canDecide: boolean
  onDeclare: () => void
  onContinue: () => void
}

export function DeclareEndGameDialog({
  open,
  playerName,
  pending,
  canDecide,
  onDeclare,
  onContinue,
}: DeclareEndGameDialogProps) {
  const extraTurns = pending.deferTurnsRemaining
  return (
    <AlertDialog open={open} onOpenChange={() => {}}>
      <AlertDialogContent
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {pending.lastChance ? 'Last chance to declare the endgame' : 'Declare the endgame?'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-left text-sm text-muted-foreground">
              <p>
                <strong className="text-foreground">{playerName}</strong> owns{' '}
                <strong className="text-foreground">{pending.clusterSize} adjacent properties</strong>.
              </p>
              {pending.lastChance ? (
                <p>
                  This is the fourth additional turn. Declaring gives every founder — including{' '}
                  {playerName} — one more turn, then scoring. If you do not declare, the game ends
                  immediately.
                </p>
              ) : (
                <>
                  <p>
                    Declare now and every founder, including {playerName}, gets one more turn before
                    final scoring.
                  </p>
                  <p>
                    Or continue playing. You can declare again at the end of a later turn
                    {extraTurns > 0
                      ? ` (up to ${extraTurns} additional turn${extraTurns === 1 ? '' : 's'}).`
                      : '.'}
                  </p>
                </>
              )}
              {!canDecide ? (
                <p className="font-medium text-foreground">Waiting for {playerName} to choose…</p>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {canDecide ? (
          <AlertDialogFooter>
            <AlertDialogCancel type="button" onClick={onContinue}>
              {pending.lastChance ? 'End game now' : 'Continue playing'}
            </AlertDialogCancel>
            <AlertDialogAction type="button" onClick={onDeclare}>
              Declare endgame
            </AlertDialogAction>
          </AlertDialogFooter>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  )
}
