// Functions for working with integers.

/**
 * Ensures that a given number is an integer.
 *
 * @param n The number to check.
 * @returns `n`, if it is an integer.
 * @throws Error if `n` is not an integer.
 */
export function checkInt(n: number): number {
  if (n !== Math.floor(n)) {
    throw new Error(`${n} is not an integer`);
  }
  return n;
}

/**
 * Ensures that a given number is an integer in a given range.
 *
 * @param n The number to check.
 * @param lo The lower bound, inclusive.
 * @param hi The upper bound, exclusive.
 * @returns `n`, if it is an integer in the given range.
 * @throws Error if `n` is not an integer or outside the given range.
 */
export function checkIntRange(n: number, lo: number, hi: number): number {
  checkInt(n);
  if (n < lo || n >= hi) {
    throw new Error(`${n} out of range ${lo}..${hi}`);
  }
  return n;
}
