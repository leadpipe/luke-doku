import {Loc as GameLoc} from '../game/loc';
import {ensureExhaustiveSwitch} from '../game/utils';
import type {Fact} from './Fact';
import type {Loc} from './Loc';
import type {LocSet} from './LocSet';
import type {Num} from './Num';
import type {NumSet} from './NumSet';
import type {Unit} from './Unit';

/** Formats a set of locations. Example: "{R1C3, R1C5}" */
export function formatLocs(locs: LocSet): string {
  if (locs.length === 0) return '{}';
  return `{${locs.map(l => GameLoc.of(l).toString()).join(', ')}}`;
}

/** Formats a numeral (Num is 1-based 1..9). Example: "5" */
export function formatNum(num: Num): string {
  return num.toString();
}

/** Formats a set of numerals using square brackets. Example: "[1, 2]" */
export function formatNums(nums: NumSet): string {
  if (nums.length === 0) return '[]';
  return `[${nums.map(formatNum).join(', ')}]`;
}

/** Formats a unit (Block, Row, Column, 1-based). Example: "R1", "C2", "B3" */
export function formatUnitShorthand(unit: Unit): string {
  const typeStr =
    unit.type === 'Blk' ? 'B'
    : unit.type === 'Row' ? 'R'
    : 'C';
  return `${typeStr}${unit.id + 1}`;
}

/** Formats a unit (Block, Row, Column, 1-based). Example: "Row 1" */
export function formatUnit(unit: Unit): string {
  const typeStr =
    unit.type === 'Blk' ? 'Block'
    : unit.type === 'Row' ? 'Row'
    : 'Column';
  return `${typeStr} ${unit.id + 1}`;
}

/** Translates a Fact into a mathematical shorthand notation. */
export function shorthandFact(fact: Fact): string {
  switch (fact.type) {
    case 'SingleLoc':
    case 'SingleNum':
      return `${formatNum(fact.num)} ➔ ${GameLoc.of(fact.loc).toString()}`;

    case 'SpeculativeAssignment':
      return `${formatNum(fact.num)} ➔ ${GameLoc.of(fact.loc).toString()}?`;

    case 'NoLoc':
      return `${formatNum(fact.num)} ∉ ${formatUnitShorthand(fact.unit)}`;

    case 'NoNum':
      return `∅ ➔ ${GameLoc.of(fact.loc).toString()}`;

    case 'Conflict':
      return `⚡ ${formatNum(fact.num)} ∈ ${formatUnitShorthand(fact.unit)}`;

    case 'Overlap':
      return `${formatNum(fact.num)} ∈ ${formatUnitShorthand(fact.unit)} x ${formatUnitShorthand(fact.cross_unit)}`;

    case 'Subset':
      return `${formatNums(fact.nums)} ⊂ ${formatUnitShorthand(fact.unit)}`;

    case 'Implication':
      const antecedents = fact.antecedents.map(shorthandFact).join(' & ');
      return `${antecedents} ➔ ${shorthandFact(fact.consequent)}`;

    default:
      ensureExhaustiveSwitch(fact);
  }
}

/** Translates a Fact into a full human-readable description incorporating shorthand. */
export function describeFact(fact: Fact): string {
  const shorthand = shorthandFact(fact);

  switch (fact.type) {
    case 'SingleLoc':
      return `${shorthand}: Only one location for ${formatNum(fact.num)} in ${formatUnit(fact.unit)} (${GameLoc.of(fact.loc).toString()})`;

    case 'SingleNum':
      return `${shorthand}: Only one possible number for ${GameLoc.of(fact.loc).toString()} (${formatNum(fact.num)})`;

    case 'SpeculativeAssignment':
      return `${shorthand}: Speculative assignment of ${formatNum(fact.num)} to ${GameLoc.of(fact.loc).toString()}`;

    case 'NoLoc':
      return `${shorthand}: ${formatNum(fact.num)} cannot be placed anywhere in ${formatUnit(fact.unit)}`;

    case 'NoNum':
      return `${shorthand}: ${GameLoc.of(fact.loc).toString()} has no possible numbers`;

    case 'Conflict':
      return `${shorthand}: Conflict! ${formatNum(fact.num)} appears in ${formatUnit(fact.unit)} at multiple locations: ${formatLocs(fact.locs)}`;

    case 'Overlap':
      return `${shorthand}: ${formatNum(fact.num)} in ${formatUnit(fact.unit)} is restricted to ${formatUnit(fact.cross_unit)}`;

    case 'Subset':
      const subsetType = fact.is_naked ? 'Naked' : 'Hidden';
      const crossUnitStr =
        fact.cross_unit ?
          ` (also restricted to ${formatUnit(fact.cross_unit)})`
        : '';
      return `${shorthand}: ${subsetType} subset of ${formatNums(fact.nums)} in ${formatUnit(fact.unit)} at ${formatLocs(fact.locs)}${crossUnitStr}`;

    case 'Implication':
      const antecedentsDesc = fact.antecedents.map(describeFact).join(' and ');
      const consequentDesc = describeFact(fact.consequent);
      return `${consequentDesc}, because ${antecedentsDesc}`;

    default:
      ensureExhaustiveSwitch(fact);
  }
}
