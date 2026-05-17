import {expect} from '@esm-bundle/chai';
import type {Fact} from './Fact';
import {describeFact, shorthandFact} from './format';

describe('Fact formatting utilities', () => {
  it('formats SingleLoc correctly', () => {
    const fact: Fact = {
      type: 'SingleLoc',
      num: 5,
      unit: {type: 'Row', id: 0},
      loc: 2,
    };
    expect(shorthandFact(fact)).to.equal('5 ➔ R1C3');
    expect(describeFact(fact)).to.equal(
      '5 ➔ R1C3: Only one location for 5 in Row 1 (R1C3)',
    );
  });

  it('formats SingleNum correctly', () => {
    const fact: Fact = {type: 'SingleNum', num: 5, loc: 2};
    expect(shorthandFact(fact)).to.equal('5 ➔ R1C3');
    expect(describeFact(fact)).to.equal(
      '5 ➔ R1C3: Only one possible number for R1C3 (5)',
    );
  });

  it('formats SpeculativeAssignment correctly', () => {
    const fact: Fact = {type: 'SpeculativeAssignment', num: 5, loc: 2};
    expect(shorthandFact(fact)).to.equal('5 ➔ R1C3?');
    expect(describeFact(fact)).to.equal(
      '5 ➔ R1C3?: Speculative assignment of 5 to R1C3',
    );
  });

  it('formats NoLoc correctly', () => {
    const fact: Fact = {type: 'NoLoc', num: 5, unit: {type: 'Row', id: 0}};
    expect(shorthandFact(fact)).to.equal('5 ∉ R1');
    expect(describeFact(fact)).to.equal(
      '5 ∉ R1: 5 cannot be placed anywhere in Row 1',
    );
  });

  it('formats NoNum correctly', () => {
    const fact: Fact = {type: 'NoNum', loc: 2};
    expect(shorthandFact(fact)).to.equal('∅ ➔ R1C3');
    expect(describeFact(fact)).to.equal(
      '∅ ➔ R1C3: R1C3 has no possible numbers',
    );
  });

  it('formats Conflict correctly', () => {
    const fact: Fact = {
      type: 'Conflict',
      num: 5,
      unit: {type: 'Row', id: 0},
      locs: [2, 4],
    };
    expect(shorthandFact(fact)).to.equal('⚡ 5 ∈ R1');
    expect(describeFact(fact)).to.equal(
      '⚡ 5 ∈ R1: Conflict! 5 appears in Row 1 at multiple locations: {R1C3, R1C5}',
    );
  });

  it('formats Overlap correctly', () => {
    const fact: Fact = {
      type: 'Overlap',
      num: 5,
      unit: {type: 'Row', id: 0},
      cross_unit: {type: 'Blk', id: 0},
    };
    expect(shorthandFact(fact)).to.equal('5 ∈ R1 x B1');
    expect(describeFact(fact)).to.equal(
      '5 ∈ R1 x B1: 5 in Row 1 is restricted to Block 1',
    );
  });

  it('formats Subset correctly without cross unit', () => {
    const fact: Fact = {
      type: 'Subset',
      nums: [1, 2],
      unit: {type: 'Row', id: 0},
      locs: [2, 4],
      cross_unit: null,
      is_naked: true,
    };
    expect(shorthandFact(fact)).to.equal('[1, 2] ⊂ R1');
    expect(describeFact(fact)).to.equal(
      '[1, 2] ⊂ R1: Naked subset of [1, 2] in Row 1 at {R1C3, R1C5}',
    );
  });

  it('formats Subset correctly with cross unit', () => {
    const fact: Fact = {
      type: 'Subset',
      nums: [1, 2],
      unit: {type: 'Row', id: 0},
      locs: [2, 4],
      cross_unit: {type: 'Blk', id: 0},
      is_naked: false,
    };
    expect(shorthandFact(fact)).to.equal('[1, 2] ⊂ R1');
    expect(describeFact(fact)).to.equal(
      '[1, 2] ⊂ R1: Hidden subset of [1, 2] in Row 1 at {R1C3, R1C5} (also restricted to Block 1)',
    );
  });

  it('formats Implication correctly', () => {
    const antecedent1: Fact = {type: 'SingleNum', num: 5, loc: 2};
    const antecedent2: Fact = {
      type: 'SingleLoc',
      num: 3,
      unit: {type: 'Col', id: 0},
      loc: 9,
    }; // Loc 9 is R2C1
    const consequent: Fact = {
      type: 'Conflict',
      num: 5,
      unit: {type: 'Row', id: 0},
      locs: [2, 4],
    };
    const fact: Fact = {
      type: 'Implication',
      antecedents: [antecedent1, antecedent2],
      consequent: consequent,
    };

    expect(shorthandFact(fact)).to.equal('5 ➔ R1C3 & 3 ➔ R2C1 ➔ ⚡ 5 ∈ R1');
    expect(describeFact(fact)).to.equal(
      '⚡ 5 ∈ R1: Conflict! 5 appears in Row 1 at multiple locations: {R1C3, R1C5}, because 5 ➔ R1C3: Only one possible number for R1C3 (5) and 3 ➔ R2C1: Only one location for 3 in Column 1 (R2C1)',
    );
  });
});
