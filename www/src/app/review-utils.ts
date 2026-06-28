import type {Fact} from '../facts/Fact';
import type {Disproof} from '../facts/disproof';
import {formatUnit} from '../facts/format';
import {nub} from '../facts/utils';
import {CommandTag, RecordedCommand} from '../game/command';
import {Loc} from '../game/loc';

export function computeInterestingIndices(
  history: readonly RecordedCommand[],
): number[] {
  if (history.length === 0) {
    return [0];
  }

  const indices = new Set<number>();
  indices.add(0);
  indices.add(history.length);

  const totalTime = history[history.length - 1].elapsedTimestamp;
  const avgTime = totalTime / history.length;

  const isTrailCommand = (tag: CommandTag | undefined) => {
    return (
      tag === CommandTag.CREATE_TRAIL ||
      tag === CommandTag.ACTIVATE_TRAIL ||
      tag === CommandTag.TOGGLE_TRAIL_VISIBILITY ||
      tag === CommandTag.TOGGLE_TRAILS_ACTIVE
      // Note we leave out ARCHIVE_TRAIL and COPY_FROM_TRAIL
    );
  };

  const isUndoRedo = (tag: CommandTag | undefined) => {
    return (
      tag === CommandTag.UNDO ||
      tag === CommandTag.REDO ||
      tag === CommandTag.UNDO_TO_START ||
      tag === CommandTag.REDO_TO_END
    );
  };

  for (let i = 0; i < history.length; i++) {
    const current = history[i];
    const prev = i > 0 ? history[i - 1] : undefined;
    const prevPrev = i > 1 ? history[i - 2] : undefined;

    // 1. Time gap > 5x average
    const delta = current.elapsedTimestamp - (prev ? prev.elapsedTimestamp : 0);
    if (delta >= 5 * avgTime) {
      indices.add(i);
    }

    const cmdTag = current.command.tag();
    const prevCmdTag = prev?.command.tag();
    const prevPrevCmdTag = prevPrev?.command.tag();

    // 2. Trail commands (first in a series, and COPY_FROM_TRAIL)
    if (isTrailCommand(cmdTag) && !isTrailCommand(prevCmdTag)) {
      indices.add(i);
    }
    if (prevCmdTag === CommandTag.COPY_FROM_TRAIL) {
      indices.add(i);
    }

    // 3. Undo/Redo commands (first in series, and after last in series if > 1)
    if (isUndoRedo(cmdTag) && !isUndoRedo(prevCmdTag)) {
      indices.add(i);
    }
    if (
      !isUndoRedo(cmdTag) &&
      isUndoRedo(prevCmdTag) &&
      isUndoRedo(prevPrevCmdTag)
    ) {
      indices.add(i);
    }

    // 4. Before Resume
    if (cmdTag === CommandTag.RESUME) {
      indices.add(i);
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

export function getEliminationConstraints(
  elims: Fact[],
): {loc: number; num: number}[][] {
  const result = [];
  for (const elim of elims) {
    if (
      elim.type === 'Implication' &&
      elim.antecedents.length > 0 &&
      elim.antecedents[0].type === 'SpeculativeAssignment'
    ) {
      const rootAsg = elim.antecedents[0];
      result.push([{loc: rootAsg.loc, num: rootAsg.num}]);
    }
  }
  return result;
}

export function formatDisproofDescription(fact: Disproof): string {
  const asg = fact.antecedents[0];
  const antecedentsStr = `Speculating ${asg.num} at ${Loc.of(asg.loc)}`;

  const finalNub = nub(fact);
  let consequentStr = '';
  switch (finalNub.type) {
    case 'Conflict':
      consequentStr = `leads to a conflict for ${finalNub.num} in ${formatUnit(finalNub.unit)}`;
      break;
    case 'NoLoc':
      consequentStr = `leads to no location for ${finalNub.num} in ${formatUnit(finalNub.unit)}`;
      break;
    case 'NoNum':
      consequentStr = `leads to no possible numbers at ${Loc.of(finalNub.loc)}`;
      break;
    default:
      consequentStr = `leads to a contradiction`;
      break;
  }

  return `${antecedentsStr} ${consequentStr}`;
}
