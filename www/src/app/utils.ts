import {html} from 'lit';
import * as wasm from 'luke-doku-rust';
import type {Sudoku} from '../game/sudoku';
import {dateString} from '../game/types';

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

/** The app is auto-reloaded every day, so this is always actually today. */
export const today = wasm.LogicalDate.fromDate(new Date());
/** Today in string form (YYYY-MM-DD). */
export const todayString = dateString(today);

/**
 * Constructs a title for a given Sudoku, based on its Luke-doku ID if it has
 * one, or on its source if it came from elsewhere.
 * @param sudoku The puzzle
 * @param assumeToday If true, leave "today" out of the result — it is assumed
 * @returns The title for the puzzle
 */
export function renderPuzzleTitle(sudoku: Sudoku, assumeToday: boolean) {
  const {id} = sudoku;
  if (!id) {
    return sudoku.source ?
        html`Puzzle from <q>${sudoku.source}</q>`
      : `External puzzle`;
  }
  const puzzleDate = wasm.LogicalDate.fromString(id.date);
  const days = today.daysSince(puzzleDate);
  if (days === 0 && assumeToday) {
    return id.counter === 1 ? `Puzzle of the day` : `#${id.counter}`;
  }
  let dayName;
  let relative = true;
  switch (days) {
    case 0:
      dayName = 'Today';
      break;
    case 1:
      dayName = 'Yesterday';
      break;
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
      dayName = weekdayName(puzzleDate);
      break;
    default:
      dayName = `${weekdayName(puzzleDate)}, ${puzzleDate.day()} ${monthName(puzzleDate)}`;
      relative = false;
      if (puzzleDate.year() !== today.year()) {
        dayName = `${dayName} ${puzzleDate.year()}`;
      }
  }
  return relative ?
      `${dayName}'s #${id.counter}`
    : `#${id.counter} of ${dayName}`;
}

function weekdayName(date: wasm.LogicalDate): string {
  switch (date.weekday()) {
    case 0:
      return 'Monday';
    case 1:
      return 'Tuesday';
    case 2:
      return 'Wednesday';
    case 3:
      return 'Thursday';
    case 4:
      return 'Friday';
    case 5:
      return 'Saturday';
    default:
      return 'Sunday';
  }
}

function monthName(date: wasm.LogicalDate): string {
  switch (date.month()) {
    case 1:
      return 'Jan';
    case 2:
      return 'Feb';
    case 3:
      return 'Mar';
    case 4:
      return 'Apr';
    case 5:
      return 'May';
    case 6:
      return 'Jun';
    case 7:
      return 'Jul';
    case 8:
      return 'Aug';
    case 9:
      return 'Sep';
    case 10:
      return 'Oct';
    case 11:
      return 'Nov';
    default:
      return 'Dec';
  }
}
