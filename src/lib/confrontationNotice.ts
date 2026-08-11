/** Shared copy for confrontation board notices (attacker vs defender + outcome). */

export type ConfrontationKind =
  | 'City Council Freeze'
  | 'Hostile Takeover'
  | 'Scandal'
  | 'Police Raid on Mafia'
  | 'Remove Investors'
  | 'Investment'
  | 'Double Investment'

export type ConfrontationOutcome = 'success' | 'failure' | 'blocked' | 'pending' | 'attempting'

/** Outcome titles: "Hostile Takeover: Alice vs Bob" */
export function confrontationNoticeTitle(
  kind: ConfrontationKind,
  attackerName: string,
  targetName: string
): string {
  return `${kind}: ${attackerName} vs ${targetName}`
}

/**
 * Dramatic attempt banner when a vs-player action is laid / targeted.
 * Example: "Alice is attempting a Hostile Takeover against Bob"
 */
export function confrontationAttemptTitle(
  kind: ConfrontationKind,
  attackerName: string,
  targetName: string
): string {
  const article = /^[AEIOUaeiou]/.test(kind) ? 'an' : 'a'
  return `${attackerName} is attempting ${article} ${kind} against ${targetName}`
}

/**
 * Investment / Double Investment banner — completed play, not an "attempt".
 * Example: "Johnny invests in Dan's Ski & See"
 */
export function investmentNoticeTitle(
  investorName: string,
  ownerName: string,
  propertyName: string
): string {
  const ownerPossessive = ownerName.endsWith('s') ? `${ownerName}'` : `${ownerName}'s`
  return `${investorName} invests in ${ownerPossessive} ${propertyName}`
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
    case 'attempting':
      return 'ATTEMPTING'
  }
}

export function confrontationNoticeDetail(
  outcome: ConfrontationOutcome,
  detail: string
): string {
  return `${confrontationOutcomeLabel(outcome)} — ${detail}`
}
