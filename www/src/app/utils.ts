import {html, type HTMLTemplateResult} from 'lit';
import * as wasm from 'luke-doku-rust';
import {CompletionState} from '../game/command';
import type {Game} from '../game/game';
import type {PuzzleId, Sudoku} from '../game/sudoku';
import {dateString} from '../game/types';
import {CORRECT_COLOR, ERROR_COLOR} from './styles';

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

export function pluralize(noun: string, number: number): string {
  return number === 1 ? noun : `${noun}s`;
}

export function renderCount(count: number, countingWhat: string): string {
  return `${count} ${pluralize(countingWhat, count)}`;
}

export function renderCompletedGameDescription(
  game: Game,
): Array<string | HTMLTemplateResult> {
  const parts: Array<string | HTMLTemplateResult> = [];
  let showSolutionsCount = true;
  switch (game.completionState) {
    case CompletionState.SOLVED:
      parts.push(
        html`<div>Solved in ${elapsedTimeString(game.elapsedMs)}</div>`,
      );
      if (!game.solutionsCountGuess) {
        showSolutionsCount = false;
      }
      break;
    case CompletionState.QUIT:
      parts.push(
        html`<div>Gave up after ${elapsedTimeString(game.elapsedMs)}</div>`,
      );
      break;
  }
  if (showSolutionsCount) {
    const guess = game.solutionsCountGuess;
    const actual = game.sudoku.solutions.length;
    parts.push(
      html`<div>
        ${guess ?
          guess === actual ?
            html`<mat-icon
              name="check"
              style="color: ${CORRECT_COLOR}"
            ></mat-icon>`
          : html`<mat-icon
              name="close"
              style="color: ${ERROR_COLOR}"
            ></mat-icon>`
        : ''}
        ${renderCount(actual, 'solution')}
        ${guess && guess !== actual ? html` (guessed ${guess})` : ''}
      </div>`,
    );
  }
  return parts;
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

const generatorVersion = wasm.generatorVersion();
function titleWithVersion(title: string, id: PuzzleId): string {
  return id.generatorVersion === generatorVersion ?
      title
    : `${title} (generator #${id.generatorVersion})`;
}

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
    const title = id.counter === 1 ? `Puzzle of the day` : `#${id.counter}`;
    return titleWithVersion(title, id);
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
  const title =
    relative ? `${dayName}'s #${id.counter}` : `#${id.counter} of ${dayName}`;
  return titleWithVersion(title, id);
}

/**
 * Centers a dialog over an element.  Written by Gemini.
 * @param dialog The dialog to center
 * @param element The element to center over
 */
export function centerDialog(dialog: HTMLElement, element: HTMLElement) {
  const dialogRect = dialog.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  const dialogTop =
    elementRect.top + (elementRect.height - dialogRect.height) / 2;
  const dialogLeft =
    elementRect.left + (elementRect.width - dialogRect.width) / 2;

  dialog.style.top = `${dialogTop}px`;
  dialog.style.left = `${dialogLeft}px`;
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
