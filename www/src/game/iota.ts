/*
 * Array- and generator-based functions to produce sequences of integers
 * counting from 0.
 */

import {checkInt} from './ints';

/**
 * A generator that produces `n` integers starting at 0.
 *
 * @param n The exclusive upper bound.
 * @throws Error if `n` is not an integer.
 */
export function * iotaGenerator(n: number) {
  checkInt(n);
  for (let i = 0; i < n; ++i) {
    yield i;
  }
}

/**
 * Returns an array of `n` integers starting at 0.
 *
 * @param n The exclusive upper bound.
 * @returns An array of `n` integers starting at 0.
 * @throws Error if `n` is not an integer.
 */
export function iota(n: number): number[] {
  return [...iotaGenerator(n)];
}
