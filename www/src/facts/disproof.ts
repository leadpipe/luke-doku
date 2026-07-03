import type {Fact} from './Fact';

export type SpeculativeAssignmentFact = Extract<
  Fact,
  {type: 'SpeculativeAssignment'}
>;

export type DirectErrorFact = Extract<
  Fact,
  {type: 'Conflict' | 'NoLoc' | 'NoNum'}
>;

export type ErrorFact =
  | DirectErrorFact
  | {
      type: 'Implication';
      antecedents: Fact[];
      consequent: ErrorFact;
    };

export type Disproof = {
  type: 'Implication';
  antecedents: [SpeculativeAssignmentFact, ...Fact[]];
  consequent: ErrorFact;
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
