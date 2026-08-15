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

  it('formats basic Fish (X-Wing) correctly', () => {
    const fact: Fact = {
      type: 'Fish',
      num: 5,
      base_units: [{type: 'Row', id: 1}, {type: 'Row', id: 4}],
      cover_units: [{type: 'Col', id: 2}, {type: 'Col', id: 6}],
      finned_locs: [],
      elimination_locs: [20, 24], // R3C3, R3C7
    };
    expect(shorthandFact(fact)).to.equal('5 X-Wing: R2,R5 x C3,C7');
    expect(describeFact(fact)).to.equal(
      '5 X-Wing: R2,R5 x C3,C7: X-Wing for 5 in Rows 2, 5 (Columns 3, 7) eliminates 5 at {R3C3, R3C7}',
    );
  });

  it('formats Finned Fish (Swordfish) correctly', () => {
    const fact: Fact = {
      type: 'Fish',
      num: 5,
      base_units: [{type: 'Row', id: 1}, {type: 'Row', id: 4}, {type: 'Row', id: 7}],
      cover_units: [{type: 'Col', id: 0}, {type: 'Col', id: 3}, {type: 'Col', id: 6}],
      finned_locs: [12], // R2C4
      elimination_locs: [24], // R3C7
    };
    expect(shorthandFact(fact)).to.equal('5 Finned Swordfish: R2,R5,R8 x C1,C4,C7');
    expect(describeFact(fact)).to.equal(
      '5 Finned Swordfish: R2,R5,R8 x C1,C4,C7: Finned Swordfish for 5 in Rows 2, 5, 8 (Columns 1, 4, 7) with fin at {R2C4} eliminates 5 at {R3C7}',
    );
  });

  it('formats Empty Rectangle correctly', () => {
    const fact: Fact = {
      type: 'EmptyRectangle',
      num: 5,
      block: {type: 'Blk', id: 0},
      row: {type: 'Row', id: 0},
      col: {type: 'Col', id: 0},
      conjugate_pair: [27, 30], // R4C1, R4C4
      elimination_locs: [3], // R1C4
    };
    expect(shorthandFact(fact)).to.equal('5 ER: B1 (R1, C1) ➔ {R1C4}');
    expect(describeFact(fact)).to.equal(
      '5 ER: B1 (R1, C1) ➔ {R1C4}: Empty Rectangle for 5 in Block 1 with Row 1, Column 1 and conjugate pair {R4C1, R4C4} eliminates 5 at {R1C4}',
    );
  });

  it('formats Skyscraper correctly', () => {
    const fact: Fact = {
      type: 'Skyscraper',
      num: 5,
      base_units: [{type: 'Row', id: 1}, {type: 'Row', id: 5}],
      roof_locs: [11, 51], // R2C3, R6C7
      elimination_locs: [29], // R4C3
    };
    expect(shorthandFact(fact)).to.equal('5 Skyscraper: R2,R6 ➔ {R4C3}');
    expect(describeFact(fact)).to.equal(
      '5 Skyscraper: R2,R6 ➔ {R4C3}: Skyscraper for 5 in Rows 2, 6 with roofs {R2C3, R6C7} eliminates 5 at {R4C3}',
    );
  });

  it('formats 2-String Kite correctly', () => {
    const fact: Fact = {
      type: 'TwoStringKite',
      num: 5,
      block: {type: 'Blk', id: 0},
      row: {type: 'Row', id: 0},
      col: {type: 'Col', id: 0},
      string_ends: [7, 54], // R1C8, R7C1
      elimination_locs: [61], // R7C8
    };
    expect(shorthandFact(fact)).to.equal('5 Kite: B1 (R1, C1) ➔ {R7C8}');
    expect(describeFact(fact)).to.equal(
      '5 Kite: B1 (R1, C1) ➔ {R7C8}: 2-String Kite for 5 in Block 1 connecting Row 1 and Column 1 with ends {R1C8, R7C1} eliminates 5 at {R7C8}',
    );
  });
});
