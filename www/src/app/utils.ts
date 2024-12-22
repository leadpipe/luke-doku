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
 * Searches up the DOM tree, starting from the target of the given event, for a
 * data item with the given name.
 * @param event The event whose target lives within an element containing a data
 * item
 * @param name The name of the data item
 * @returns The value of the named data item, or null if it is not found
 */
export function findDataString(event: Event, name: string): string | null {
  const target = event.target as HTMLElement;
  for (let el: HTMLElement | null = target; el; el = el.parentElement) {
    const answer = el.dataset[name];
    if (answer != null) return answer;
  }
  return null;
}

/**
 * Converts a number of milliseconds into a string showing minutes and seconds,
 * or hours, minutes, and seconds.
 * @param elapsedMs Elapsed time in milliseconds
 * @returns elapsed time in text form
 */
export function elapsedTimeString(elapsedMs: number): string {
  const elapsedSec = Math.ceil(elapsedMs / 1000);
  const elapsedMin = Math.floor(elapsedSec / 60);
  const hrs = Math.floor(elapsedMin / 60);
  const sec = elapsedSec % 60;
  const min = elapsedMin % 60;
  return hrs ?
      `${hrs}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${min}:${String(sec).padStart(2, '0')}`;
}
