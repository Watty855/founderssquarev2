/** Shared copy for confrontation board notices (attacker vs defender + outcome). */

export type ConfrontationKind =
  | 'City Council Freeze'
  | 'Hostile Takeover'
  | 'Scandal'
  | 'Police Raid on Mafia'
  | 'Remove Investors'
  | 'Investment'
  | 'Double Investment'

export type ConfrontationOutcome = 'success' | 'failure' | 'blocked' | 'pending'

export function confrontationNoticeTitle(
  kind: ConfrontationKind,
  attackerName: string,
  targetName: string
): string {
  return `${kind}: ${attackerName} vs ${targetName}`
}

export function confrontationOutcomeLabel(outcome: ConfrontationOutcome): string {
  switch (outcome) {
    case 'success':
      return 'SUCCESS'
    case 'failure':
      return 'FAILED'
    case 'blocked':
      return 'BLOCKED'
    case 'pending':
      return 'RESOLVING'
  }
}

export function confrontationNoticeDetail(
  outcome: ConfrontationOutcome,
  detail: string
): string {
  return `${confrontationOutcomeLabel(outcome)} — ${detail}`
}
