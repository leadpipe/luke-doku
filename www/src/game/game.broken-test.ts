// My testing setup won't work with rust code yet

import {FAKE_HISTORY} from './fake-data';
import {Game} from './game';
import {Grid} from './grid';
import {Loc} from './loc';

describe('Game', () => {
  it('restores a game from compatible history', () => {
    const puzzle = new Grid(); // a blank grid
    const game = new Game(puzzle, FAKE_HISTORY);
    expect(game.marks.getNums(Loc.of(1))).toEqual(new Set([4, 2, 3]));
  });

  it('fails to restore a game from incompatible history', () => {
    const puzzle = new Grid();
    puzzle.set(Loc.of(1), 9);
    expect(() => new Game(puzzle, FAKE_HISTORY)).toThrowError(
      /failed to execute xxxxxxx/,
    );
  });
});
