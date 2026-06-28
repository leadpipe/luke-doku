import type {Fact} from './Fact';

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
