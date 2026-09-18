export type PassType = 'full_season' | 'per_day';
export type PaymentMode = 'cash' | 'upi';

export interface PricingTier {
  minPersons: number;
  maxPersons: number | null; // null represents 10+
  fullSeasonRate: number;
  perDayRate: number;
}

export const PRICING_TIERS: PricingTier[] = [
  { minPersons: 1, maxPersons: 1, fullSeasonRate: 1800, perDayRate: 200 },
  { minPersons: 2, maxPersons: 2, fullSeasonRate: 1800, perDayRate: 180 },
  { minPersons: 3, maxPersons: 4, fullSeasonRate: 1700, perDayRate: 170 },
  { minPersons: 5, maxPersons: 9, fullSeasonRate: 1600, perDayRate: 160 },
  { minPersons: 10, maxPersons: null, fullSeasonRate: 1500, perDayRate: 150 },
];

export function getRatesForGroupSize(persons: number): { fullSeasonRate: number; perDayRate: number } {
  const safePersons = Math.max(1, persons);
  const tier = PRICING_TIERS.find(
    (t) => safePersons >= t.minPersons && (t.maxPersons === null || safePersons <= t.maxPersons)
  );

  if (!tier) {
    const fallback = PRICING_TIERS[PRICING_TIERS.length - 1];
    return { fullSeasonRate: fallback.fullSeasonRate, perDayRate: fallback.perDayRate };
  }

  return { fullSeasonRate: tier.fullSeasonRate, perDayRate: tier.perDayRate };
}

export function calculatePassTotal(
  passType: PassType,
  persons: number,
  selectedDatesCount: number = 0
): number {
  const { fullSeasonRate, perDayRate } = getRatesForGroupSize(persons);
  const safePersons = Math.max(1, persons);

  if (passType === 'full_season') {
    return fullSeasonRate * safePersons;
  } else {
    return perDayRate * safePersons * Math.max(1, selectedDatesCount);
  }
}

export const MOCK_GARBA_DATES = [
  { id: 'd1', label: 'Day 1 (Sep 22)' },
  { id: 'd2', label: 'Day 2 (Sep 23)' },
  { id: 'd3', label: 'Day 3 (Sep 24)' },
  { id: 'd4', label: 'Day 4 (Sep 25)' },
  { id: 'd5', label: 'Day 5 (Sep 26)' },
  { id: 'd6', label: 'Day 6 (Sep 27)' },
  { id: 'd7', label: 'Day 7 (Sep 28)' },
  { id: 'd8', label: 'Day 8 (Sep 29)' },
  { id: 'd9', label: 'Day 9 (Sep 30)' },
];