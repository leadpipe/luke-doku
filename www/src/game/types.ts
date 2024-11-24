import * as wasm from 'luke-doku-rust';

declare const brandKey: unique symbol;
type Brand<B> = {[brandKey]: B};
export type Branded<T, B> = T & Brand<B>;

/**
 * ISO 8601 (yyyy-mm-dd) formatted date string.
 */
export type DateString = Branded<string, 'Date'>;

/**
 * Converts a logical or JavaScript date into an ISO 8601 date string.  Treats a
 * JS date as belonging to the local time zone.
 * @param date The date to convert, either a logical date or a JS Date object
 * @returns The corresponding ISO 8601 string
 */
export function dateString(date: wasm.LogicalDate | Date): DateString {
  if (date instanceof wasm.LogicalDate) return date.toString() as DateString;
  date = wasm.LogicalDate.fromDate(date);
  const answer = date.toString() as DateString;
  date.free();
  return answer;
}

/**
 * The canonical representation of a Sudoku puzzle as the flat string
 * representation of its clues: a row-major list of each location, with either
 * the numeral in the location or a period meaning the location is empty.
 */
export type CluesString = Branded<string, 'Clues'>;
