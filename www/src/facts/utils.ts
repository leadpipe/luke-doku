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
    case 'ConflictLoc':
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

    case 'Fish':
      return 150;
    case 'EmptyRectangle':
    case 'Skyscraper':
    case 'TwoStringKite':
      return 160;
    default:
      ensureExhaustiveSwitch(base);
  }
}

export interface DisproofPathNode {
  disproof: Disproof;
  parent: DisproofPathNode | null;
}

export interface StepWithContext {
  fact: Fact;
  pathNode: DisproofPathNode | null;
  depth: number;
}

export function collectStepsWithContext(
  fact: Fact,
  pathNode: DisproofPathNode | null = null,
  seen = new Set<string>(),
  depth = 0,
): StepWithContext[] {
  if (isDisproof(fact)) {
    const newPathNode: DisproofPathNode = {disproof: fact, parent: pathNode};
    const steps: StepWithContext[] = [];

    const key = JSON.stringify(fact.antecedents[0]);
    if (!seen.has(key)) {
      seen.add(key);
      steps.push({
        fact: fact.antecedents[0],
        pathNode: newPathNode,
        depth: depth + 1,
      });
    }

    for (let i = 1; i < fact.antecedents.length; i++) {
      steps.push(
        ...collectStepsWithContext(
          fact.antecedents[i],
          newPathNode,
          seen,
          depth + 1,
        ),
      );
    }
    steps.push(
      ...collectStepsWithContext(fact.consequent, newPathNode, seen, depth),
    );
    return steps;
  } else if (fact.type === 'Implication') {
    const steps: StepWithContext[] = [];
    for (const ant of fact.antecedents) {
      steps.push(...collectStepsWithContext(ant, pathNode, seen, depth + 1));
    }
    steps.push(
      ...collectStepsWithContext(fact.consequent, pathNode, seen, depth),
    );
    return steps;
  } else {
    const key = JSON.stringify(fact);
    if (!seen.has(key)) {
      seen.add(key);
      return [{fact, pathNode, depth}];
    }
    return [];
  }
}

export function getVisibleFactsAtStep(
  stepsWithContext: StepWithContext[],
  previewStepIndex: number,
): Fact[] {
  const nestedDisproofsInfo = new Map<
    Disproof,
    {startIndex: number; endIndex: number}
  >();

  for (let i = 0; i < stepsWithContext.length; i++) {
    let node = stepsWithContext[i].pathNode;
    while (node !== null) {
      const d = node.disproof;
      if (!nestedDisproofsInfo.has(d)) {
        nestedDisproofsInfo.set(d, {startIndex: i, endIndex: i});
      } else {
        nestedDisproofsInfo.get(d)!.endIndex = i;
      }
      node = node.parent;
    }
  }

  const completedDisproofs = new Set<Disproof>();
  for (const [d, info] of nestedDisproofsInfo.entries()) {
    if (previewStepIndex > info.endIndex) {
      completedDisproofs.add(d);
    }
  }

  const completedDisproofsByEndIndex = new Map<number, Disproof[]>();
  for (const d of completedDisproofs) {
    const info = nestedDisproofsInfo.get(d)!;
    let list = completedDisproofsByEndIndex.get(info.endIndex);
    if (!list) {
      list = [];
      completedDisproofsByEndIndex.set(info.endIndex, list);
    }
    list.push(d);
  }

  const visibleFacts: Fact[] = [];
  const limit = Math.min(stepsWithContext.length - 1, previewStepIndex);
  for (let i = 0; i <= limit; i++) {
    const {fact, pathNode} = stepsWithContext[i];
    let isHidden = false;
    let node = pathNode;
    while (node !== null) {
      if (completedDisproofs.has(node.disproof)) {
        isHidden = true;
        break;
      }
      node = node.parent;
    }
    if (!isHidden) {
      visibleFacts.push(fact);
    }

    // Check if any completed disproof ended at index i, and insert its elimination fact
    const disproofsEndingHere = completedDisproofsByEndIndex.get(i);
    if (disproofsEndingHere) {
      for (const d of disproofsEndingHere) {
        const info = nestedDisproofsInfo.get(d)!;
        // Only insert if all parents of d are not completed
        let parentCompleted = false;
        let dNode = stepsWithContext[info.startIndex].pathNode;
        while (dNode !== null && dNode.disproof !== d) {
          dNode = dNode.parent;
        }
        if (dNode !== null && dNode.parent !== null) {
          let pNode: DisproofPathNode | null = dNode.parent;
          while (pNode !== null) {
            if (completedDisproofs.has(pNode.disproof)) {
              parentCompleted = true;
              break;
            }
            pNode = pNode.parent;
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
