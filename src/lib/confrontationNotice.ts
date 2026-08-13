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

function ownerPossessiveName(ownerName: string): string {
  return ownerName.endsWith('s') || ownerName.endsWith('S') ? `${ownerName}'` : `${ownerName}'s`
}

/** Possessive form for banner copy ("Alice's", "James'"). */
export function playerPossessiveName(name: string): string {
  return ownerPossessiveName(name)
}

/**
 * Attacker / solo action die queued.
 * Example: "Hostile Takeover — Alice's roll"
 */
export function attackRollRequiredTitle(kind: string, playerName: string): string {
  return `${kind} — ${playerPossessiveName(playerName)} roll`
}

/**
 * Defender counter die queued after a successful attack.
 * Example: "Hostile Takeover — Bob's defense roll required"
 */
export function defenseRollRequiredTitle(kind: string, playerName: string): string {
  return `${kind} — ${playerPossessiveName(playerName)} defense roll required`
}

/**
 * Hostile Takeover attempt — includes the target property.
 * Example: "Alice attempts Hostile Takeover of Bob's Firehouse 01"
 */
export function hostileTakeoverAttemptTitle(
  attackerName: string,
  ownerName: string,
  propertyName: string
): string {
  return `${attackerName} attempts Hostile Takeover of ${ownerPossessiveName(ownerName)} ${propertyName}`
}

/** Attacker die succeeded (5+ after influence) — defender may still block with a 6. */
export function hostileTakeoverAttackerSuccessTitle(): string {
  return 'Hostile Takeover is successful.'
}

/** Defender rolled a 6 — ownership stays with the defending founder. */
export function hostileTakeoverDefenseSuccessTitle(): string {
  return 'Hostile Takeover defense is successful.'
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
