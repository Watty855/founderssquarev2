/** City tax assessments (Income Taxation / Property Taxation). Amounts are whole $M. */

export function roundTaxMillion(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.max(0, Math.round(amount))
}

/** 50% of the property-income pool, nearest $1M. */
export function incomeTaxLevyMillion(propertyIncomeBase: number): number {
  return roundTaxMillion(propertyIncomeBase * 0.5)
}

/** 10% of owned property value, nearest $1M, never more than cash on hand. */
export function propertyTaxLevyMillion(ownedValue: number, cashOnHand: number): number {
  const levy = roundTaxMillion(ownedValue * 0.1)
  if (!Number.isFinite(cashOnHand) || cashOnHand <= 0) return 0
  return Math.min(Math.floor(cashOnHand), levy)
}

export function pendingIncomeTaxCount(ids: number[] | undefined, playerId: number): number {
  if (!ids || ids.length === 0) return 0
  let n = 0
  for (const id of ids) if (id === playerId) n += 1
  return n
}

/** Remove a single pending assessment for this founder (stacked cards consume one per Income). */
export function consumeOnePendingIncomeTax(ids: number[] | undefined, playerId: number): number[] {
  const list = ids ? [...ids] : []
  const i = list.indexOf(playerId)
  if (i >= 0) list.splice(i, 1)
  return list
}

/** Each Income Taxation card adds one future assessment for every other founder. */
export function appendIncomeTaxAssessments(
  ids: number[] | undefined,
  otherPlayerIds: number[]
): number[] {
  return [...(ids ?? []), ...otherPlayerIds]
}
