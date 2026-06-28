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
 * Flattens an Implication into a sequence of antecedents and the ultimate consequent.
 */
export function flattenImplication(fact: Fact): {
  antecedents: Fact[];
  nub: Fact;
} {
  if (fact.type !== 'Implication') {
    return {antecedents: [], nub: fact};
  }

  const antecedents: Fact[] = [];
  const seen = new Set<string>();

  function collect(f: Fact) {
    if (f.type === 'Implication') {
      for (const ant of f.antecedents) {
        collect(ant);
      }
      collect(f.consequent);
    } else {
      const key = JSON.stringify(f);
      if (!seen.has(key)) {
        seen.add(key);
        antecedents.push(f);
      }
    }
  }

  for (const ant of fact.antecedents) {
    collect(ant);
  }

  let current = fact.consequent;
  while (current.type === 'Implication') {
    for (const ant of current.antecedents) {
      collect(ant);
    }
    current = current.consequent;
  }

  return {antecedents, nub: current};
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
  return flattenImplication(fact).antecedents.length + 1;
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

export type SpeculativeAssignmentFact = Extract<
  Fact,
  {type: 'SpeculativeAssignment'}
>;

export type Disproof = {
  type: 'Implication';
  antecedents: [SpeculativeAssignmentFact, ...Fact[]];
  consequent: Fact;
};

/**
 * Tells whether the given fact is a disproof (an Implication where the first
 * antecedent is a SpeculativeAssignment).
 */
export function isDisproof(fact: Fact): fact is Disproof {
  return (
    fact.type === 'Implication' &&
    fact.antecedents.length > 0 &&
    fact.antecedents[0].type === 'SpeculativeAssignment'
  );
}
