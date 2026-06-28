import {Loc as GameLoc} from '../game/loc';
import {ensureExhaustiveSwitch} from '../game/utils';
import type {Fact} from './Fact';
import type {Unit} from './Unit';
import {isDisproof, type Disproof} from './disproof';

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

export interface StepWithContext {
  fact: Fact;
  path: Disproof[];
}

export function collectStepsWithContext(
  fact: Fact,
  path: Disproof[] = [],
  seen = new Set<string>()
): StepWithContext[] {
  if (isDisproof(fact)) {
    const newPath = [...path, fact];
    const steps: StepWithContext[] = [];

    const key = JSON.stringify(fact.antecedents[0]);
    if (!seen.has(key)) {
      seen.add(key);
      steps.push({fact: fact.antecedents[0], path: newPath});
    }

    for (let i = 1; i < fact.antecedents.length; i++) {
      steps.push(...collectStepsWithContext(fact.antecedents[i], newPath, seen));
    }
    steps.push(...collectStepsWithContext(fact.consequent, newPath, seen));
    return steps;
  } else if (fact.type === 'Implication') {
    const steps: StepWithContext[] = [];
    for (const ant of fact.antecedents) {
      steps.push(...collectStepsWithContext(ant, path, seen));
    }
    steps.push(...collectStepsWithContext(fact.consequent, path, seen));
    return steps;
  } else {
    const key = JSON.stringify(fact);
    if (!seen.has(key)) {
      seen.add(key);
      return [{fact, path}];
    }
    return [];
  }
}

export function getVisibleFactsAtStep(
  rootDisproof: Disproof,
  previewStepIndex: number
): Fact[] {
  const stepsWithContext = collectStepsWithContext(rootDisproof);

  const nestedDisproofsInfo = new Map<
    Disproof,
    {startIndex: number; endIndex: number}
  >();

  for (let i = 0; i < stepsWithContext.length; i++) {
    const {path} = stepsWithContext[i];
    for (let j = 1; j < path.length; j++) {
      const d = path[j];
      if (!nestedDisproofsInfo.has(d)) {
        nestedDisproofsInfo.set(d, {startIndex: i, endIndex: i});
      } else {
        nestedDisproofsInfo.get(d)!.endIndex = i;
      }
    }
  }

  const completedDisproofs = new Set<Disproof>();
  for (const [d, info] of nestedDisproofsInfo.entries()) {
    if (previewStepIndex > info.endIndex) {
      completedDisproofs.add(d);
    }
  }

  const visibleFacts: Fact[] = [];
  const limit = Math.min(stepsWithContext.length - 1, previewStepIndex);
  for (let i = 0; i <= limit; i++) {
    const {fact, path} = stepsWithContext[i];
    let isHidden = false;
    for (const d of path) {
      if (completedDisproofs.has(d)) {
        isHidden = true;
        break;
      }
    }
    if (!isHidden) {
      visibleFacts.push(fact);
    }

    // Check if any completed disproof ended at index i, and insert its elimination fact
    for (const [d, info] of nestedDisproofsInfo.entries()) {
      if (info.endIndex === i && completedDisproofs.has(d)) {
        // Only insert if all parents of d are not completed
        const pathAtStart = stepsWithContext[info.startIndex].path;
        const dIndex = pathAtStart.indexOf(d);
        let parentCompleted = false;
        for (let j = 1; j < dIndex; j++) {
          if (completedDisproofs.has(pathAtStart[j])) {
            parentCompleted = true;
            break;
          }
        }
        if (!parentCompleted) {
          visibleFacts.push(d);
        }
      }
    }
  }

  return visibleFacts;
}
