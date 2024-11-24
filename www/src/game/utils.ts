/**
 * Gets the compiler to ensure that a value being switched on (or tested using
 * if statements) has had all possible values eliminated.  So if you change your
 * code to allow another value, your call to this function will stop compiling.
 * @param value The value being exhaustively switched on.
 */

export function ensureExhaustiveSwitch(value: never): never {
  throw new Error(value);
}
