import {CreateTrail, Redo, Undo} from './commands';
import {FAKE_HISTORY} from './fake-data';
import {Game} from './game';
import {Grid} from './grid';
import {Loc} from './loc';

const {objectContaining} = expect;

describe('Game', () => {
  it('restores a game from compatible history', () => {
    const puzzle = new Grid(); // a blank grid
    const game = new Game(puzzle, FAKE_HISTORY);
    expect(game.marks.getNum(Loc.of(1))).toEqual(4);
    expect(game.history).toEqual(FAKE_HISTORY.map(e => objectContaining(e)));
  });

  it('fails to restore a game from incompatible history', () => {
    const puzzle = new Grid();
    puzzle.set(Loc.of(1), 9);
    expect(() => new Game(puzzle, FAKE_HISTORY)).toThrow(
      /failed to execute SetNums/,
    );
  });

  it(`handles repeated undos of creating a trail`, () => {
    const game = new Game(new Grid());
    game.createTrail();
    expect(game.trails.order.length).toBe(1);
    game.undo();
    expect(game.trails.order.length).toBe(0);
    game.redo();
    expect(game.trails.order.length).toBe(1);
    game.undo();
    expect(game.trails.order.length).toBe(0);
    expect(game.history).toEqual([
      objectContaining({command: new CreateTrail()}),
      objectContaining({command: new Undo()}),
      objectContaining({command: new Redo()}),
      objectContaining({command: new Undo()}),
    ]);
  });

  it(`preserves the trailhead when copying a trail to an empty trail`, () => {
    const game = new Game(new Grid());
    game.createTrail();
    game.setNum(Loc.of(1), 2);
    game.setNum(Loc.of(0), 1);
    expect(game.trails.order[0].trailhead).toBe(Loc.of(1));
    game.createTrail();
    expect(game.trails.order).toEqual([
      objectContaining({id: 1}),
      objectContaining({id: 0}),
    ]);
    expect(game.trails.order[0].trailhead).toBeNull();
    game.copyFromTrail(game.trails.order[1]);
    expect(game.trails.order[0].trailhead).toBe(Loc.of(1));
    expect(game.trails.order[0].bytes).toEqual(game.trails.order[1].bytes);
  });
});
