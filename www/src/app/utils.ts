/**
 * Adds or removes an attribute from an HTML element according to a boolean flag.
 * @param element The element whose attribute to add or remove.
 * @param attrName The name of the boolean attribute.
 * @param value Whether to add or remove the attribute.
 */
export function setBooleanAttribute(
  element: HTMLElement,
  attrName: string,
  value: boolean,
) {
  if (value) {
    element.setAttribute(attrName, '');
  } else {
    element.removeAttribute(attrName);
  }
}

/**
 * Gets the compiler to ensure that a value being switched on (or tested using
 * if statements) has had all possible values eliminated.  So if you change your
 * code to allow another value, your call to this function will stop compiling.
 * @param value The value being exhaustively switched on.
 */
export function ensureExhaustiveSwitch(value: never): never {
  throw new Error(value);
}
