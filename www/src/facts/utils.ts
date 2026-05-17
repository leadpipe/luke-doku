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

/**
 * Orders facts primarily by type, following the order:
 * SingleLoc, SingleNum, SpeculativeAssignment, Implication (nub is assignment),
 * Conflict, NoLoc, NoNum, Implication (nub is error), Subset, Overlap, other Implications.
 */
export function compareFacts(a: Fact, b: Fact): number {
  return getFactRank(a) - getFactRank(b);
}

function getFactRank(fact: Fact): number {
  switch (fact.type) {
    case 'SingleLoc': return 10;
    case 'SingleNum': return 20;
    case 'SpeculativeAssignment': return 30;
    
    case 'Conflict': return 70;
    case 'NoLoc': return 80;
    case 'NoNum': return 90;
    
    case 'Subset': return 130;
    case 'Overlap': return 140;
    
    case 'Implication': {
      const base = nub(fact);
      switch (base.type) {
        case 'SingleLoc': return 40;
        case 'SingleNum': return 50;
        case 'SpeculativeAssignment': return 60;
        case 'Conflict': return 100;
        case 'NoLoc': return 110;
        case 'NoNum': return 120;
        default: return 150;
      }
    }
    default:
      ensureExhaustiveSwitch(fact);
      return 1000;
  }
}
