import {Loc as GameLoc} from '../game/loc';
import {ensureExhaustiveSwitch} from '../game/utils';
import type {Fact} from './Fact';
import type {Unit} from './Unit';

/**
 * Returns the ultimate consequent of the given fact.
 * Unwraps Implications until it finds a non-Implication fact.
 */
export function nub(fact: Fact): Fact {
  let current = fact;
  while (current.type === 'Implication') {
    current = current.consequent;
  }
  return current;
}

/**
 * Tells whether the given unit contains the given location.
 */
export function unitContains(unit: Unit, loc: GameLoc): boolean {
  switch (unit.type) {
    case 'Row':
      return loc.row === unit.id;
    case 'Col':
      return loc.col === unit.id;
    case 'Blk': {
      const blkRow = Math.floor(loc.row / 3);
      const blkCol = Math.floor(loc.col / 3);
      const locBlk = blkRow * 3 + blkCol;
      return locBlk === unit.id;
    }
    default:
      ensureExhaustiveSwitch(unit);
  }
}
