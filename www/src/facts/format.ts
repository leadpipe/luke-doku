import {Loc as GameLoc} from '../game/loc';
import {ensureExhaustiveSwitch} from '../game/utils';
import type {Fact} from './Fact';
import type {LocSet} from './LocSet';
import type {Num} from './Num';
import type {NumSet} from './NumSet';
import type {Unit} from './Unit';
import {type Disproof, isDisproof} from './disproof';
import {nub} from './utils';

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

/** Returns the human-readable name of a Fish pattern based on base size and fins. */
export function getFishName(size: number, isFinned: boolean): string {
  let baseName = 'Fish';
  if (size === 2) baseName = 'X-Wing';
  else if (size === 3) baseName = 'Swordfish';
  else if (size === 4) baseName = 'Jellyfish';
  return isFinned ? `Finned ${baseName}` : baseName;
}

/** Formats a list of units in shorthand notation. Example: "R2,R5" */
export function formatUnitsShorthand(units: readonly Unit[]): string {
  return units.map(formatUnitShorthand).join(',');
}

/** Formats a list of units with full names. Example: "Rows 2, 5" or "Columns 3, 7" */
export function formatUnits(units: readonly Unit[]): string {
  if (units.length === 0) return '';
  const allRows = units.every(u => u.type === 'Row');
  const allCols = units.every(u => u.type === 'Col');
  const allBlks = units.every(u => u.type === 'Blk');
  if (allRows) {
    return `Rows ${units.map(u => u.id + 1).join(', ')}`;
  }
  if (allCols) {
    return `Columns ${units.map(u => u.id + 1).join(', ')}`;
  }
  if (allBlks) {
    return `Blocks ${units.map(u => u.id + 1).join(', ')}`;
  }
  return units.map(formatUnit).join(', ');
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

    case 'ConflictLoc':
      return `⚡ ${formatNums(fact.nums)} ➔ ${GameLoc.of(fact.loc).toString()}`;

    case 'Overlap':
      return `${formatNum(fact.num)} ∈ ${formatUnitShorthand(fact.unit)} x ${formatUnitShorthand(fact.cross_unit)}`;

    case 'Subset':
      return `${formatNums(fact.nums)} ⊂ ${formatUnitShorthand(fact.unit)}`;

    case 'Implication': {
      if (isDisproof(fact)) {
        return `!(${shorthandFact(fact.antecedents[0])} ➔ ${shorthandFact(nub(fact))})`;
      }
      const antecedents = fact.antecedents.map(shorthandFact).join(' & ');
      return `${antecedents} ➔ ${shorthandFact(fact.consequent)}`;
    }

    case 'Fish': {
      const isFinned = fact.finned_locs.length > 0;
      const fishName = getFishName(fact.base_units.length, isFinned);
      return `${formatNum(fact.num)} ${fishName}: ${formatUnitsShorthand(fact.base_units)} x ${formatUnitsShorthand(fact.cover_units)}`;
    }

    case 'EmptyRectangle':
      return `${formatNum(fact.num)} ER: ${formatUnitShorthand(fact.block)} (${formatUnitShorthand(fact.row)}, ${formatUnitShorthand(fact.col)}) ➔ ${formatLocs(fact.elimination_locs)}`;

    case 'Skyscraper':
      return `${formatNum(fact.num)} Skyscraper: ${formatUnitsShorthand(fact.base_units)} ➔ ${formatLocs(fact.elimination_locs)}`;

    case 'TwoStringKite': {
      const isDual = fact.rows.length > 1;
      const kiteName = isDual ? 'Dual Kite' : 'Kite';
      return `${formatNum(fact.num)} ${kiteName}: ${formatUnitShorthand(fact.block)} (${formatUnitsShorthand(fact.rows)}, ${formatUnitsShorthand(fact.cols)}) ➔ ${formatLocs(fact.elimination_locs)}`;
    }

    default:
      ensureExhaustiveSwitch(fact);
  }
}

const describeFactCache = new WeakMap<Fact, string>();

/** Translates a Fact into a full human-readable description incorporating shorthand. */
export function describeFact(fact: Fact): string {
  const cached = describeFactCache.get(fact);
  if (cached !== undefined) {
    return cached;
  }

  let result: string;
  if (fact.type === 'Implication') {
    if (isDisproof(fact)) {
      result = formatDisproofDescription(fact as Disproof);
    } else {
      const antecedentsDesc = fact.antecedents.map(describeFact).join(' and ');
      const consequentDesc = describeFact(fact.consequent);
      result = `${consequentDesc}, because ${antecedentsDesc}`;
    }
    describeFactCache.set(fact, result);
    return result;
  }

  const shorthand = shorthandFact(fact);

  switch (fact.type) {
    case 'SingleLoc':
      result = `${shorthand}: Only one location for ${formatNum(fact.num)} in ${formatUnit(fact.unit)} (${GameLoc.of(fact.loc).toString()})`;
      break;

    case 'SingleNum':
      result = `${shorthand}: Only one possible number for ${GameLoc.of(fact.loc).toString()} (${formatNum(fact.num)})`;
      break;

    case 'SpeculativeAssignment':
      result = `${shorthand}: Speculative assignment of ${formatNum(fact.num)} to ${GameLoc.of(fact.loc).toString()}`;
      break;

    case 'NoLoc':
      result = `${shorthand}: ${formatNum(fact.num)} cannot be placed anywhere in ${formatUnit(fact.unit)}`;
      break;

    case 'NoNum':
      result = `${shorthand}: ${GameLoc.of(fact.loc).toString()} has no possible numbers`;
      break;

    case 'Conflict':
      result = `${shorthand}: Conflict! ${formatNum(fact.num)} appears in ${formatUnit(fact.unit)} at multiple locations: ${formatLocs(fact.locs)}`;
      break;

    case 'ConflictLoc':
      result = `${shorthand}: Conflict! Multiple numbers assigned to ${GameLoc.of(fact.loc).toString()}: ${formatNums(fact.nums)}`;
      break;

    case 'Overlap':
      result = `${shorthand}: ${formatNum(fact.num)} in ${formatUnit(fact.unit)} is restricted to ${formatUnit(fact.cross_unit)}`;
      break;

    case 'Subset': {
      const subsetType = fact.is_naked ? 'Naked' : 'Hidden';
      const crossUnitStr =
        fact.cross_unit ?
          ` (also restricted to ${formatUnit(fact.cross_unit)})`
        : '';
      result = `${shorthand}: ${subsetType} subset of ${formatNums(fact.nums)} in ${formatUnit(fact.unit)} at ${formatLocs(fact.locs)}${crossUnitStr}`;
      break;
    }

    case 'Fish': {
      const isFinned = fact.finned_locs.length > 0;
      const fishName = getFishName(fact.base_units.length, isFinned);
      const finStr = isFinned ? ` with fin at ${formatLocs(fact.finned_locs)}` : '';
      result = `${shorthand}: ${fishName} for ${formatNum(fact.num)} in ${formatUnits(fact.base_units)} (${formatUnits(fact.cover_units)})${finStr} eliminates ${formatNum(fact.num)} at ${formatLocs(fact.elimination_locs)}`;
      break;
    }

    case 'EmptyRectangle':
      result = `${shorthand}: Empty Rectangle for ${formatNum(fact.num)} in ${formatUnit(fact.block)} with ${formatUnit(fact.row)}, ${formatUnit(fact.col)} and conjugate pair ${formatLocs(fact.conjugate_pair)} eliminates ${formatNum(fact.num)} at ${formatLocs(fact.elimination_locs)}`;
      break;

    case 'Skyscraper':
      result = `${shorthand}: Skyscraper for ${formatNum(fact.num)} in ${formatUnits(fact.base_units)} with roofs ${formatLocs(fact.roof_locs)} eliminates ${formatNum(fact.num)} at ${formatLocs(fact.elimination_locs)}`;
      break;

    case 'TwoStringKite': {
      const isDual = fact.rows.length > 1;
      const title = isDual ? 'Dual 2-String Kite' : '2-String Kite';
      const rowsStr =
        isDual ? formatUnits(fact.rows) : formatUnit(fact.rows[0]);
      const colsStr =
        isDual ? formatUnits(fact.cols) : formatUnit(fact.cols[0]);
      result = `${shorthand}: ${title} for ${formatNum(fact.num)} in ${formatUnit(fact.block)} connecting ${rowsStr} and ${colsStr} with ends ${formatLocs(fact.string_ends)} eliminates ${formatNum(fact.num)} at ${formatLocs(fact.elimination_locs)}`;
      break;
    }

    default:
      ensureExhaustiveSwitch(fact);
  }
  describeFactCache.set(fact, result);
  return result;
}

export function formatDisproofDescription(fact: Disproof): string {
  const asg = fact.antecedents[0];
  const antecedentsStr = `Speculating ${asg.num} at ${GameLoc.of(asg.loc)}`;

  const finalNub = nub(fact);
  let consequentStr = '';
  switch (finalNub.type) {
    case 'Conflict':
      consequentStr = `leads to a conflict for ${finalNub.num} in ${formatUnit(finalNub.unit)}`;
      break;
    case 'ConflictLoc':
      consequentStr = `leads to multiple numbers assigned to ${GameLoc.of(finalNub.loc)}`;
      break;
    case 'NoLoc':
      consequentStr = `leads to no location for ${finalNub.num} in ${formatUnit(finalNub.unit)}`;
      break;
    case 'NoNum':
      consequentStr = `leads to no possible numbers at ${GameLoc.of(finalNub.loc)}`;
      break;
    default:
      consequentStr = `leads to a contradiction`;
      break;
  }

  return `${antecedentsStr} ${consequentStr}`;
}
