import { describe, expect, it } from 'vitest'
import {
  appendIncomeTaxAssessments,
  consumeOnePendingIncomeTax,
  incomeTaxLevyMillion,
  pendingIncomeTaxCount,
  propertyTaxLevyMillion,
} from '@/lib/cityTax'

describe('city tax rounding', () => {
  it('rounds income tax (50%) to the nearest million', () => {
    expect(incomeTaxLevyMillion(0)).toBe(0)
    expect(incomeTaxLevyMillion(5)).toBe(3)
    expect(incomeTaxLevyMillion(8)).toBe(4)
  })

  it('rounds property tax (10%) to the nearest million and caps at cash', () => {
    expect(propertyTaxLevyMillion(14, 20)).toBe(1)
    expect(propertyTaxLevyMillion(15, 20)).toBe(2)
    expect(propertyTaxLevyMillion(80, 3)).toBe(3)
    expect(propertyTaxLevyMillion(4, 20)).toBe(0)
  })
})

describe('stacked income tax assessments', () => {
  it('adds one pending Income assessment per card for every other founder', () => {
    let pending: number[] = []
    pending = appendIncomeTaxAssessments(pending, [2, 3, 4])
    expect(pendingIncomeTaxCount(pending, 2)).toBe(1)
    pending = appendIncomeTaxAssessments(pending, [1, 3, 4])
    expect(pendingIncomeTaxCount(pending, 1)).toBe(1)
    expect(pendingIncomeTaxCount(pending, 2)).toBe(1)
    expect(pendingIncomeTaxCount(pending, 3)).toBe(2)
    expect(pendingIncomeTaxCount(pending, 4)).toBe(2)
  })

  it('consumes one assessment per Income resolution', () => {
    let pending = appendIncomeTaxAssessments([2, 3, 4], [1, 3, 4])
    pending = consumeOnePendingIncomeTax(pending, 3)
    expect(pendingIncomeTaxCount(pending, 3)).toBe(1)
    pending = consumeOnePendingIncomeTax(pending, 3)
    expect(pendingIncomeTaxCount(pending, 3)).toBe(0)
    expect(pendingIncomeTaxCount(pending, 4)).toBe(2)
  })
})
