/** d6 face → property-income payout as % of the player’s computed property income total (before Double Income and post-roll levies). */
export const INCOME_ROLL_PERCENT_BY_DIE_FACE: Readonly<Record<1 | 2 | 3 | 4 | 5 | 6, number>> = {
  1: 70,
  2: 80,
  3: 90,
  4: 100,
  5: 110,
  6: 120,
}

export type IncomeRollMood = 'tough' | 'steady' | 'boom'

export function incomePercentageForDie(face: number): number {
  const p = INCOME_ROLL_PERCENT_BY_DIE_FACE[face as keyof typeof INCOME_ROLL_PERCENT_BY_DIE_FACE]
  return p ?? 100
}

/** UI / flavor: 1 worst; 2–4 middle; 5–6 high. */
export function incomeRollMoodForDie(face: number): IncomeRollMood {
  if (face === 1) return 'tough'
  if (face >= 2 && face <= 4) return 'steady'
  if (face >= 5 && face <= 6) return 'boom'
  return 'steady'
}

/** Compact rule line for card footer / tooltips. */
export const INCOME_CARD_DICE_ROLL_RULE =
  '1: 70%, 2: 80%, 3: 90%, 4: 100%, 5: 110%, 6: 120%'

export const INCOME_CARD_ACTIONS_BODY =
  'Roll the die to set your property-income payout as a percentage of your calculated property income total. ' +
  '1: 70% (tough times). 2: 80%; 3: 90%; 4: 100% (steady growth). 5: 110%; 6: 120% (boom times). ' +
  'No influence cards or tenants count towards changing the die.'

/** One-line legend for the Income dialog. */
export const INCOME_DIE_LEGEND_COMPACT =
  '1: 70% · 2: 80% · 3: 90% · 4: 100% · 5: 110% · 6: 120%'
