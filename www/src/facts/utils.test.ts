import {expect} from '@esm-bundle/chai';
import {Loc as GameLoc} from '../game/loc';
import type {Fact} from './Fact';
import {
  collectStepsWithContext,
  doesFactEliminate,
  getVisibleFactsAtStep,
  nub,
  unitContains,
} from './utils';

describe('Fact utils', () => {
  describe('nub', () => {
    it('returns the same fact if it is not an Implication', () => {
      const fact: Fact = {
        type: 'SingleLoc',
        num: 5,
        unit: {type: 'Row', id: 0},
        loc: 2,
      };
      expect(nub(fact)).to.equal(fact);
    });

    it('unwraps a single Implication', () => {
      const consequent: Fact = {type: 'SingleNum', num: 5, loc: 2};
      const fact: Fact = {
        type: 'Implication',
        antecedents: [],
        consequent,
      };
      expect(nub(fact)).to.equal(consequent);
    });

    it('unwraps nested Implications', () => {
      const ultimateConsequent: Fact = {type: 'SingleNum', num: 5, loc: 2};
      const nested: Fact = {
        type: 'Implication',
        antecedents: [],
        consequent: ultimateConsequent,
      };
      const fact: Fact = {
        type: 'Implication',
        antecedents: [],
        consequent: nested,
      };
      expect(nub(fact)).to.equal(ultimateConsequent);
    });
  });

  describe('unitContains', () => {
    it('checks Row containment correctly', () => {
      const loc = GameLoc.of(1, 4); // Row 1 (2nd row), Col 4
      expect(unitContains({type: 'Row', id: 1}, loc)).to.be.true;
      expect(unitContains({type: 'Row', id: 2}, loc)).to.be.false;
    });

    it('checks Col containment correctly', () => {
      const loc = GameLoc.of(1, 4); // Row 1, Col 4
      expect(unitContains({type: 'Col', id: 4}, loc)).to.be.true;
      expect(unitContains({type: 'Col', id: 5}, loc)).to.be.false;
    });

    it('checks Blk containment correctly', () => {
      // Block layout:
      // 0 1 2
      // 3 4 5
      // 6 7 8
      const loc0 = GameLoc.of(0, 0); // Block 0
      const loc1 = GameLoc.of(1, 4); // Block 1
      const loc4 = GameLoc.of(4, 4); // Block 4
      const loc8 = GameLoc.of(8, 8); // Block 8

      expect(unitContains({type: 'Blk', id: 0}, loc0)).to.be.true;
      expect(unitContains({type: 'Blk', id: 1}, loc0)).to.be.false;

      expect(unitContains({type: 'Blk', id: 1}, loc1)).to.be.true;
      expect(unitContains({type: 'Blk', id: 4}, loc1)).to.be.false;

      expect(unitContains({type: 'Blk', id: 4}, loc4)).to.be.true;
      expect(unitContains({type: 'Blk', id: 5}, loc4)).to.be.false;

      expect(unitContains({type: 'Blk', id: 8}, loc8)).to.be.true;
      expect(unitContains({type: 'Blk', id: 7}, loc8)).to.be.false;
    });
  });

  describe('nested disproof helpers', () => {
    const A: Fact = {type: 'SpeculativeAssignment', loc: 0, num: 1};
    const fact1: Fact = {type: 'SingleNum', loc: 10, num: 2};
    const B: Fact = {type: 'SpeculativeAssignment', loc: 1, num: 3};
    const E_B: Fact = {
      type: 'Conflict',
      num: 3,
      unit: {type: 'Row', id: 0},
      locs: [1, 2],
    };
    const D_1: Fact = {type: 'Implication', antecedents: [B], consequent: E_B};
    const fact2: Fact = {type: 'SingleNum', loc: 20, num: 4};
    const E_A: Fact = {
      type: 'Conflict',
      num: 1,
      unit: {type: 'Row', id: 0},
      locs: [0, 9],
    };

    // rootDisproof P_A
    const P_A: Fact = {
      type: 'Implication',
      antecedents: [A],
      consequent: {
        type: 'Implication',
        antecedents: [fact1, D_1, fact2],
        consequent: E_A,
      },
    };

    it('collects steps with context correctly', () => {
      const steps = collectStepsWithContext(P_A);
      expect(steps.map(s => s.fact)).to.deep.equal([
        A,
        fact1,
        B,
        E_B,
        fact2,
        E_A,
      ]);
      
      const getPathArray = (node: any) => {
        const arr = [];
        let curr = node;
        while (curr) {
          arr.unshift(curr.disproof);
          curr = curr.parent;
        }
        return arr;
      };

      expect(getPathArray(steps[0].pathNode)).to.deep.equal([P_A]);
      expect(getPathArray(steps[1].pathNode)).to.deep.equal([P_A]);
      expect(getPathArray(steps[2].pathNode)).to.deep.equal([P_A, D_1]);
      expect(getPathArray(steps[3].pathNode)).to.deep.equal([P_A, D_1]);
      expect(getPathArray(steps[4].pathNode)).to.deep.equal([P_A]);
      expect(getPathArray(steps[5].pathNode)).to.deep.equal([P_A]);
    });

    it('computes visible facts at each step index correctly', () => {
      const stepsWithContext = collectStepsWithContext(P_A);

      // Step 0: [A]
      expect(getVisibleFactsAtStep(stepsWithContext, 0)).to.deep.equal([A]);
      // Step 1: [A, fact1]
      expect(getVisibleFactsAtStep(stepsWithContext, 1)).to.deep.equal([A, fact1]);
      // Step 2: [A, fact1, B] (D_1 active)
      expect(getVisibleFactsAtStep(stepsWithContext, 2)).to.deep.equal([A, fact1, B]);
      // Step 3: [A, fact1, B, E_B] (D_1 reached consequent error)
      expect(getVisibleFactsAtStep(stepsWithContext, 3)).to.deep.equal([
        A,
        fact1,
        B,
        E_B,
      ]);
      // Step 4: [A, fact1, D_1, fact2] (stepped beyond D_1's error, D_1 shown as elimination, B/E_B hidden)
      expect(getVisibleFactsAtStep(stepsWithContext, 4)).to.deep.equal([
        A,
        fact1,
        D_1,
        fact2,
      ]);
      // Step 5: [A, fact1, D_1, fact2, E_A]
      expect(getVisibleFactsAtStep(stepsWithContext, 5)).to.deep.equal([
        A,
        fact1,
        D_1,
        fact2,
        E_A,
      ]);
    });
  });

  describe('doesFactEliminate', () => {
    it('handles SingleLoc, SingleNum, and SpeculativeAssignment', () => {
      const fact: Fact = {type: 'SingleNum', loc: 7, num: 8}; // R1C8 = 8
      // Eliminates other numbers at R1C8
      expect(doesFactEliminate(fact, GameLoc.of(0, 7), 7)).to.be.true;
      expect(doesFactEliminate(fact, GameLoc.of(0, 7), 8)).to.be.false;
      // Eliminates 8 at peers of R1C8 (e.g. R1C2, R2C9)
      expect(doesFactEliminate(fact, GameLoc.of(0, 1), 8)).to.be.true;
      expect(doesFactEliminate(fact, GameLoc.of(1, 8), 8)).to.be.true;
      expect(doesFactEliminate(fact, GameLoc.of(0, 1), 7)).to.be.false;
    });

    it('handles Overlap', () => {
      const fact: Fact = {
        type: 'Overlap',
        num: 7,
        unit: {type: 'Row', id: 0},
        cross_unit: {type: 'Blk', id: 2},
      };
      // Eliminates 7 in Blk 2 outside Row 0 (e.g. R2C9)
      expect(doesFactEliminate(fact, GameLoc.of(1, 8), 7)).to.be.true;
      // Does not eliminate 7 in Row 0 inside Blk 2 (e.g. R1C8)
      expect(doesFactEliminate(fact, GameLoc.of(0, 7), 7)).to.be.false;
      // Does not eliminate other numbers
      expect(doesFactEliminate(fact, GameLoc.of(1, 8), 5)).to.be.false;
    });

    it('handles Subset', () => {
      const fact: Fact = {
        type: 'Subset',
        nums: [2, 7],
        unit: {type: 'Row', id: 0},
        locs: [1, 7], // R1C2, R1C8
        cross_unit: null,
        is_naked: true,
      };
      // Eliminates 2 and 7 outside {R1C2, R1C8} in Row 0
      expect(doesFactEliminate(fact, GameLoc.of(0, 6), 7)).to.be.true;
      expect(doesFactEliminate(fact, GameLoc.of(0, 7), 7)).to.be.false;
      // Eliminates other numbers inside {R1C2, R1C8}
      expect(doesFactEliminate(fact, GameLoc.of(0, 7), 5)).to.be.true;
      expect(doesFactEliminate(fact, GameLoc.of(0, 6), 5)).to.be.false;

      // Also handles undefined cross_unit from serde-wasm-bindgen
      const wasmFact = {...fact, cross_unit: undefined as unknown as null};
      expect(doesFactEliminate(wasmFact, GameLoc.of(0, 6), 7)).to.be.true;
      expect(doesFactEliminate(wasmFact, GameLoc.of(0, 7), 7)).to.be.false;
    });

    it('handles advanced elimination facts and completed disproofs', () => {
      const kite: Fact = {
        type: 'TwoStringKite',
        num: 7,
        block: {type: 'Blk', id: 2},
        rows: [{type: 'Row', id: 0}],
        cols: [{type: 'Col', id: 8}],
        string_ends: [1, 80],
        elimination_locs: [73], // R9C2
      };
      expect(doesFactEliminate(kite, GameLoc.of(8, 1), 7)).to.be.true;
      expect(doesFactEliminate(kite, GameLoc.of(8, 1), 5)).to.be.false;
      expect(doesFactEliminate(kite, GameLoc.of(0, 7), 7)).to.be.false;

      const disproof: Fact = {
        type: 'Implication',
        antecedents: [{type: 'SpeculativeAssignment', loc: 6, num: 7}],
        consequent: {
          type: 'Conflict',
          num: 7,
          unit: {type: 'Row', id: 0},
          locs: [6, 7],
        },
      };
      expect(doesFactEliminate(disproof, GameLoc.of(0, 6), 7)).to.be.true;
      expect(doesFactEliminate(disproof, GameLoc.of(0, 7), 7)).to.be.false;
    });
  });
});
