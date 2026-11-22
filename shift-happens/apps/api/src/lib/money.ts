/**
 * Integer minor-unit money helpers.
 *
 * Every amount that crosses a business decision (balances, tax, tips,
 * refunds, tender totals) is converted to integer cents first. PostgreSQL
 * `Decimal` columns and client JSON numbers both arrive as either strings,
 * numbers or Decimal-like objects, so the conversion is deliberately
 * defensive. No binary floating point arithmetic is performed on money.
 */

export const CENTS_PER_UNIT = 100;
/** `Restaurant.taxRate` is a percent (8.00 => 8%), so one percent is 100bp. */
export const BASIS_POINTS_PER_PERCENT = 100;
export const BASIS_POINTS_PER_UNIT = 10_000;

function decimalText(value: unknown): string {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'string') return value.trim() || '0';
  if (typeof value === 'bigint') return value.toString();
  // Prisma/Decimal.js instances expose toString(); this keeps the exact
  // decimal text instead of going through Number().
  if (typeof value === 'object' && typeof (value as { toString?: unknown }).toString === 'function') {
    return String(value);
  }
  return String(value);
}

/**
 * Convert an amount in major units (dollars) to integer cents, rounding half
 * away from zero at the third decimal place.
 */
export function toMinor(value: unknown): number {
  const text = decimalText(value);
  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) {
      throw new Error(`Invalid money value: ${text}`);
    }
    return Math.round(numeric * CENTS_PER_UNIT);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const whole = Number(match[2] || '0');
  const fraction = (match[3] ?? '').padEnd(3, '0');
  const cents = whole * CENTS_PER_UNIT + Number(fraction.slice(0, 2));
  const roundUp = Number(fraction[2] ?? '0') >= 5;
  return sign * (cents + (roundUp ? 1 : 0));
}

/** Render integer cents as a fixed 2dp decimal string (safe for Prisma). */
export function fromMinor(cents: number): string {
  const rounded = Math.round(cents);
  const sign = rounded < 0 ? '-' : '';
  const absolute = Math.abs(rounded);
  return `${sign}${Math.floor(absolute / CENTS_PER_UNIT)}.${String(
    absolute % CENTS_PER_UNIT,
  ).padStart(2, '0')}`;
}

/** Major-unit number for JSON responses (display only; never for math). */
export function minorToNumber(cents: number): number {
  return Math.round(cents) / CENTS_PER_UNIT;
}

export function sumMinor(values: Iterable<unknown>): number {
  let total = 0;
  for (const value of values) total += toMinor(value);
  return total;
}

/** Integer `value * numerator / denominator`, rounded half up. */
export function mulDivRound(value: number, numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((value * numerator) / denominator);
}

/**
 * Turn a percent value (8.00 => 8%) into integer basis points (800bp).
 */
export function percentToBasisPoints(percent: unknown): number {
  return toMinor(percent);
}

/** Percentage of an integer minor amount (e.g. auto-gratuity). */
export function percentOfMinor(amountMinor: number, percent: unknown): number {
  return mulDivRound(amountMinor, percentToBasisPoints(percent), BASIS_POINTS_PER_UNIT);
}

export interface TaxBreakdown {
  /** Net-of-tax subtotal in minor units. */
  subtotalMinor: number;
  taxMinor: number;
  /** Gross amount the guest pays before tip. */
  grossMinor: number;
}

/**
 * Split a gross item subtotal into net subtotal + tax according to the
 * restaurant configuration. `taxInclusive` means menu prices already include
 * tax, so the stored subtotal is reduced by the embedded tax and the
 * invariant `subtotal + tax = gross` always holds.
 */
export function applyTax(
  grossSubtotalMinor: number,
  taxRatePercent: unknown,
  taxInclusive: boolean,
): TaxBreakdown {
  const basisPoints = percentToBasisPoints(taxRatePercent);
  if (basisPoints <= 0) {
    return { subtotalMinor: grossSubtotalMinor, taxMinor: 0, grossMinor: grossSubtotalMinor };
  }

  const taxMinor = taxInclusive
    ? mulDivRound(grossSubtotalMinor, basisPoints, BASIS_POINTS_PER_UNIT + basisPoints)
    : mulDivRound(grossSubtotalMinor, basisPoints, BASIS_POINTS_PER_UNIT);

  return {
    subtotalMinor: taxInclusive
      ? grossSubtotalMinor - taxMinor
      : grossSubtotalMinor,
    taxMinor,
    grossMinor: grossSubtotalMinor,
  };
}

export function formatMinor(cents: number): string {
  return `$${fromMinor(cents)}`;
}
