import {expect} from '@esm-bundle/chai';
import {CreateTrail, Redo, Undo} from './commands';
import {FAKE_HISTORY} from './fake-data';
import {BaseGame, Game, PlayState, TEST_ONLY} from './game';
import {Grid} from './grid';
import {Loc} from './loc';
import {Sudoku} from './sudoku';


describe('Game', () => {
  function newSudoku(clues: Grid) {
    return new Sudoku(clues, [], []);
  }

  it('restores a game from compatible history', () => {
    const clues = new Grid(); // a blank grid
    const sudoku = newSudoku(clues);
    const game = new BaseGame(sudoku, FAKE_HISTORY);
    expect(game.marks.getNum(Loc.of(1))).to.deep.equal(4);
    game.history.forEach((entry: any, i: number) => {
      expect(entry).to.deep.include(FAKE_HISTORY[i]);
    });
  });

  it('fails to restore a game from incompatible history', () => {
    const clues = new Grid();
    clues.set(Loc.of(1), 9);
    const sudoku = newSudoku(clues);
    expect(() => new BaseGame(sudoku, FAKE_HISTORY)).to.throw(
      /failed to execute SetNums/,
    );
  });

  it(`handles repeated undos of creating a trail`, () => {
    const game = new BaseGame(newSudoku(new Grid()));
    game.createTrail();
    expect(game.trails.order.length).to.equal(1);
    game.undo();
    expect(game.trails.order.length).to.equal(0);
    game.redo();
    expect(game.trails.order.length).to.equal(1);
    game.undo();
    expect(game.trails.order.length).to.equal(0);
    expect(game.history.map((e: any) => e.command)).to.deep.equal([
      new CreateTrail(),
      new Undo(),
      new Redo(),
      new Undo(),
    ]);
  });

  it(`preserves the trailhead when copying a trail to an empty trail`, () => {
    const game = new BaseGame(newSudoku(new Grid()));
    game.createTrail();
    game.setNum(Loc.of(1), 2);
    game.setNum(Loc.of(0), 1);
    expect(game.trails.order[0].trailhead).to.equal(Loc.of(1));
    game.createTrail();
    expect(game.trails.order.map((t: any) => t.id)).to.deep.equal([1, 0]);
    expect(game.trails.order[0].trailhead).to.equal(null);
    game.copyFromTrail(game.trails.order[1]);
    expect(game.trails.order[0].trailhead).to.equal(Loc.of(1));
    expect(game.trails.order[0].bytes).to.deep.equal(
      game.trails.order[1].bytes,
    );
  });

  it(`can undo a trail move over an existing marks move`, () => {
    const game = new BaseGame(newSudoku(new Grid()));
    game.setNum(Loc.of(0), 1);
    game.createTrail();
    game.setNum(Loc.of(0), 2);
    expect(game.undo()).to.equal(true);
  });
});
