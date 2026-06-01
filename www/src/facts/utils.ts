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
 * Orders facts primarily by total number of antecedents, then by type.
 * Type order follows:
 * Conflict, NoLoc, NoNum, Implication (nub is error),
 * SingleLoc, SingleNum, SpeculativeAssignment, Implication (nub is assignment),
 * Subset, Overlap, other Implications.
 */
export function compareFacts(a: Fact, b: Fact): number {
  const diffAntecedents = getTotalAntecedents(a) - getTotalAntecedents(b);
  if (diffAntecedents !== 0) {
    return diffAntecedents;
  }
  return getFactRank(a) - getFactRank(b);
}

export function getTotalAntecedents(fact: Fact): number {
  if (fact.type !== 'Implication') {
    return 0;
  }
  let total = fact.antecedents.length;
  for (const ant of fact.antecedents) {
    total += getTotalAntecedents(ant);
  }
  return total;
}

function getFactRank(fact: Fact): number {
  const base = nub(fact);
  switch (base.type) {
    case 'Conflict':
      return 10;
    case 'NoLoc':
      return 20;
    case 'NoNum':
      return 30;

    case 'SingleLoc':
      return 70;
    case 'SingleNum':
      return 80;
    case 'SpeculativeAssignment':
      return 90;

    case 'Subset':
      return 130;
    case 'Overlap':
      return 140;

    case 'Implication':
      return 1000; // Can't happen, nub never returns an Implication.

    default:
      ensureExhaustiveSwitch(base);
  }
}
