/**
 * Compact list price as $XK / $YM with exact decimal digits (no rounding).
 * Trailing zeros after the decimal are stripped.
 *
 * Examples:
 *   1_999_999.99 → $1.99999999M
 *   1_999_000    → $1.999M
 *   695_000      → $695K
 *   695_500.5    → $695.5005K
 */
export function formatExactCompactPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0";

  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const plain = toPlainDecimal(abs);

  if (abs < 1_000) {
    return `${sign}$${trimTrailingZeros(plain)}`;
  }

  const shift = abs >= 1_000_000 ? 6 : 3;
  const suffix = abs >= 1_000_000 ? "M" : "K";
  return `${sign}$${trimTrailingZeros(shiftDecimalLeft(plain, shift))}${suffix}`;
}

function toPlainDecimal(n: number): string {
  if (Number.isInteger(n)) return String(n);
  const raw = n.toString();
  if (!/[eE]/.test(raw)) return raw;

  // Expand scientific notation without rounding.
  const normalized = raw.toLowerCase();
  const [coeff, expRaw = "0"] = normalized.split("e");
  const exp = Number(expRaw);
  const neg = coeff.startsWith("-");
  const digits = (neg ? coeff.slice(1) : coeff).replace(".", "");
  const dot = coeff.includes(".") ? coeff.split(".")[1]!.length : 0;
  const pointAt = digits.length - dot + exp;

  if (pointAt <= 0) return `${neg ? "-" : ""}0.${"0".repeat(-pointAt)}${digits}`;
  if (pointAt >= digits.length) {
    return `${neg ? "-" : ""}${digits}${"0".repeat(pointAt - digits.length)}`;
  }
  return `${neg ? "-" : ""}${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`;
}

/** Move the decimal point `places` digits left (÷ 10^places) on a plain decimal string. */
function shiftDecimalLeft(value: string, places: number): string {
  const neg = value.startsWith("-");
  const raw = neg ? value.slice(1) : value;
  const [intPart, fracPart = ""] = raw.split(".");
  const allDigits = `${intPart}${fracPart}`;
  const newPos = intPart.length - places;

  let out: string;
  if (newPos <= 0) {
    out = `0.${"0".repeat(-newPos)}${allDigits}`;
  } else if (newPos >= allDigits.length) {
    out = `${allDigits}${"0".repeat(newPos - allDigits.length)}`;
  } else {
    out = `${allDigits.slice(0, newPos)}.${allDigits.slice(newPos)}`;
  }
  return neg ? `-${out}` : out;
}

function trimTrailingZeros(value: string): string {
  if (!value.includes(".")) return value;
  return value.replace(/\.?0+$/, "");
}
