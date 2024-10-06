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
