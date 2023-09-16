//! Code that generates solved Sudoku grids, and Sudoku puzzles.

use once_cell::sync::Lazy;
use rand::distributions::WeightedIndex;
use rand::prelude::Distribution;
use std::fmt::Display;
use wasm_bindgen::prelude::*;

use crate::core::*;
use crate::date::LogicalDate;
use crate::permute::{ExternalGridPermutation, GridPermutation};
use crate::random::*;
use crate::solve::ledger::Ledger;
use crate::solve::*;
use crate::sym::{Axis, Diagonal, Sym};

/// Describes a Sudoku puzzle.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[wasm_bindgen]
pub struct PuzzleDesc {
  /// The actual puzzle grid.
  pub puzzle: Grid,
  /// If it was generated by this module, the options that went into that
  /// generation.
  pub gen_opts: Option<GenOpts>,
  /// How many solutions the puzzle has.
  pub num_solutions: i32,
}

/// Identifies a Sudoku puzzle generated by this module.  Each day has any
/// number of puzzles.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct PuzzleId {
  pub date: LogicalDate,
  pub counter: i32,
}

#[wasm_bindgen]
impl PuzzleId {
  #[wasm_bindgen(constructor)]
  pub fn new(date: LogicalDate, counter: i32) -> Self {
    Self { date, counter }
  }
}

/// The base solution for a given date.  All puzzles generated by this module
/// start with one of these.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct DailySolution {
  pub date: LogicalDate,
  pub solution: SolvedGrid,
}

/// Options for generating a puzzle.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[wasm_bindgen]
pub struct GenOpts {
  /// The common solution grid for the date being generated for.
  pub daily_solution: DailySolution,

  /// The counter identifying the puzzle for the given date.
  pub counter: i32,

  /// How the common solution was permuted to get this puzzle's solution.
  pub permutation: ExternalGridPermutation,

  /// The symmetry used to generate the puzzle.  Implied by the ID.
  ///
  /// Note that the puzzle may not be well described by this symmetry, if
  /// `broken` is true.
  pub sym: Sym,

  /// Whether the symmetry was broken, meaning that further clues were removed
  /// randomly after the initial generation.  Implied by the ID.
  pub broken: bool,

  /// Whether to permit more than one solution.  Note that even if this is
  /// true, the resulting puzzle may be proper; about 20% of generation
  /// attempts that are open to more than one solution still end up with just
  /// one.
  pub improper: bool,
}

impl GenOpts {
  /// Returns the ID of the generated puzzle.
  pub fn id(&self) -> PuzzleId {
    PuzzleId {
      date: self.daily_solution.date,
      counter: self.counter,
    }
  }
}

/// Generates the puzzle with the given ID.
pub fn generate_puzzle(id: PuzzleId) -> PuzzleDesc {
  daily_solution(id.date).gen(id.counter)
}

#[wasm_bindgen(js_name = "dailySolution")]
pub fn daily_solution(date: LogicalDate) -> DailySolution {
  let seed = date.to_string(); // yyyy-mm-dd
  let mut random = new_random(&seed);
  let solution = gen_solved_grid(&mut random);
  DailySolution { date, solution }
}

#[wasm_bindgen]
impl DailySolution {
  /// Generates one of this day's puzzles.
  pub fn gen(&self, counter: i32) -> PuzzleDesc {
    let id = PuzzleId {
      date: self.date,
      counter,
    };
    let seed = id.to_string();
    let mut random = new_random(&seed);
    let permutation = GridPermutation::random(&mut random);
    let solution = permutation.apply_to_solved(&self.solution);

    let sym = SYM_WEIGHTS[SYM_DIST.sample(&mut random)].0;
    let broken = random.gen_bool(BROKEN_SYMMETRY_PROB);
    let improper = random.gen_bool(IMPROPER_PROB);
    let summary = gen_puzzle(&solution, sym, broken, improper, &mut random);
    PuzzleDesc {
      puzzle: summary.puzzle,
      gen_opts: Some(GenOpts {
        daily_solution: *self,
        counter,
        permutation: *permutation.external(),
        sym,
        broken,
        improper,
      }),
      num_solutions: summary.num_solutions,
    }
  }
}

// -------------------------------
// The parameters of the Sudoku Insight generator.  Changing these would
// invalidate previously generated puzzles.
const BROKEN_SYMMETRY_PROB: f64 = 0.9;
const IMPROPER_PROB: f64 = 0.125;
const MAX_SOLUTIONS: i32 = 3;
const MAX_HOLES: i32 = 7;
static SYM_WEIGHTS: &[(Sym, i32)] = &[
  (Sym::Rotation180, 100),
  (Sym::Rotation90, 50),
  (Sym::Mirror(Axis::X), 50),
  (Sym::Mirror(Axis::Y), 50),
  (Sym::DoubleMirror, 25),
  (Sym::Diagonal(Diagonal::Main), 50),
  (Sym::Diagonal(Diagonal::Anti), 50),
  (Sym::DoubleDiagonal, 25),
  (Sym::FullyReflective, 10),
  (Sym::Blockwise(Diagonal::Main), 25),
  (Sym::Blockwise(Diagonal::Anti), 25),
  (Sym::None, 50),
];
static SYM_DIST: Lazy<WeightedIndex<i32>> =
  Lazy::new(|| WeightedIndex::new(SYM_WEIGHTS.iter().map(|item| item.1)).unwrap());
// -------------------------------

impl Display for PuzzleId {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}:{}", self.date, self.counter)
  }
}

/// Uses the given random number generator to make a SolvedGrid.
pub fn gen_solved_grid<R: Rng>(random: &mut R) -> SolvedGrid {
  let mut helper = GenHelper(random);
  let factory = SearcherFactory::new(&Grid::new());
  let mut searcher = factory.new_searcher(&mut helper);
  searcher.run(None);
  searcher.found.unwrap()
}

/// The guts of `generate_puzzle`.
pub fn gen_puzzle<R: Rng>(
  solution: &SolvedGrid,
  sym: Sym,
  broken: bool,
  improper: bool,
  random: &mut R,
) -> SolutionSummary {
  let puzzle = gen_simple_puzzle(solution, sym, random);
  let max_solutions;
  let max_holes;
  if improper {
    max_solutions = MAX_SOLUTIONS;
    max_holes = MAX_HOLES;
  } else {
    max_solutions = 1;
    max_holes = 0;
  }
  let mut summary = improve_puzzle(&puzzle, sym, random, max_solutions, max_holes);
  if broken && sym != Sym::None {
    summary = improve_puzzle(&summary.puzzle, Sym::None, random, max_solutions, max_holes);
  }
  summary
}

/// Constructs a puzzle that results in the given solution without any pivoting
/// in the solver, with clues that honor the given symmetry.  This is likely to
/// be an unsatisfyingly easy puzzle, especially for the larger symmetries.
///
/// # Panics
///
/// The given solution grid must be a solved Sudoku.
pub fn gen_simple_puzzle<R: Rng>(solution: &SolvedGrid, sym: Sym, random: &mut R) -> Grid {
  let mut ledger = Ledger::new(&Grid::new()).unwrap();
  let mut answer = Grid::new();
  let orbits = sym.shuffled_orbits(random);
  for orbit in orbits {
    // Copy over the whole orbit if any of its locations aren't already set.
    if orbit.iter().any(|loc| ledger.unset().contains(*loc)) {
      for loc in orbit {
        let clue = solution[*loc];
        answer[*loc] = Some(clue);
        ledger.assign_blindly(clue, *loc);
      }
      ledger.apply_implications().unwrap();
    }
  }
  answer
}

/// Subtracts clues from the given puzzle, honoring the given symmetry.
pub fn improve_puzzle<R: Rng>(
  puzzle: &Grid,
  sym: Sym,
  random: &mut R,
  max_solutions: i32,
  max_holes: i32,
) -> SolutionSummary {
  let mut puzzle = *puzzle;
  let orbits = sym.shuffled_orbits(random);
  let mut helper = DefaultHelper();
  let mut summary = solve(&puzzle, max_solutions, &mut helper);
  for orbit in orbits {
    let prev = puzzle;
    for loc in orbit {
      puzzle[*loc] = None;
    }
    let next_summary = solve(&puzzle, max_solutions, &mut helper);
    if (0..=max_solutions).contains(&next_summary.num_solutions)
      && next_summary.intersection.unwrap().len() + max_holes as usize >= 81
    {
      summary = next_summary;
    } else {
      puzzle = prev;
    }
  }
  summary
}

/// A `SearchHelper` that shuffles the numerals for each pivot point, thereby
/// randomizing the grid.
struct GenHelper<'a, R: Rng>(&'a mut R);

impl<'a, R: Rng> SearchHelper for GenHelper<'a, R> {
  fn choose_pivot_loc(&mut self, ledger: &Ledger, twos: &LocSet) -> Loc {
    let mut helper = JczHelper();
    helper.choose_pivot_loc(ledger, twos)
  }

  fn order_pivot_nums(&mut self, nums: &mut [Option<Num>]) {
    nums.shuffle(self.0);
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    cycle,
    permute::{FullPermutation, GroupElement, LocPermutation, Permutable},
  };

  use super::*;
  use std::str::FromStr;

  #[test]
  fn test_gen_solved_grid() {
    let mut random = new_random("test");
    let sg = gen_solved_grid(&mut random);
    let g = sg.grid(); // Let's ensure these unsafe conversions are legit
    assert_eq!(81, g.len());
    assert_eq!(GridState::Solved(&g), g.state());
    assert_eq!(
      g,
      Grid::from_str(
        r"
                5 7 2 | 9 8 1 | 6 4 3
                6 1 4 | 2 7 3 | 8 5 9
                8 9 3 | 4 5 6 | 1 7 2
                - - - + - - - + - - -
                3 8 6 | 7 9 4 | 5 2 1
                2 4 9 | 5 1 8 | 7 3 6
                7 5 1 | 3 6 2 | 4 9 8
                - - - + - - - + - - -
                1 2 5 | 6 4 9 | 3 8 7
                4 3 8 | 1 2 7 | 9 6 5
                9 6 7 | 8 3 5 | 2 1 4"
      )
      .unwrap()
    );
    random = new_random("test2");
    assert_ne!(sg, gen_solved_grid(&mut random));
    random = new_random("test");
    assert_eq!(sg, gen_solved_grid(&mut random));
  }

  #[test]
  fn test_gen_simple_puzzle() {
    let mut random = new_random("test");
    let g = gen_solved_grid(&mut random);
    let p = gen_simple_puzzle(&g, Sym::FullyReflective, &mut random);
    assert_eq!(
      p,
      Grid::from_str(
        r"
                . 7 2 | . 8 . | 6 4 .
                6 1 4 | 2 . 3 | 8 5 9
                8 9 . | 4 5 6 | . 7 2
                - - - + - - - + - - -
                . 8 6 | 7 9 4 | 5 2 .
                2 . 9 | 5 . 8 | 7 . 6
                . 5 1 | 3 6 2 | 4 9 .
                - - - + - - - + - - -
                1 2 . | 6 4 9 | . 8 7
                4 3 8 | 1 . 7 | 9 6 5
                . 6 7 | . 3 . | 2 1 ."
      )
      .unwrap()
    );
    let mut ledger = Ledger::new(&p).unwrap();
    ledger.apply_implications().unwrap();
    let s = ledger.to_grid();
    assert_eq!(s.state(), GridState::Solved(&s));

    let p = gen_simple_puzzle(&g, Sym::None, &mut random);
    assert_eq!(
      p,
      Grid::from_str(
        r"
                . 7 . | 9 . 1 | . . .
                6 . . | . 7 3 | . . 9
                8 . 3 | . . 6 | . 7 .
                - - - + - - - + - - -
                . . . | . . . | 5 2 .
                . 4 9 | . 1 . | . . .
                7 5 1 | . 6 . | 4 . .
                - - - + - - - + - - -
                1 . 5 | . . 9 | . 8 7
                4 . . | . . . | 9 6 .
                . . . | 8 . . | 2 . ."
      )
      .unwrap()
    );
    let mut ledger = Ledger::new(&p).unwrap();
    ledger.apply_implications().unwrap();
    let s = ledger.to_grid();
    assert_eq!(s.state(), GridState::Solved(&s));
  }

  #[test]
  fn test_generate_puzzle() {
    let id = PuzzleId {
      date: LogicalDate::from_ymd(1961, 9, 20),
      counter: 1,
    };
    let daily_solution = DailySolution {
      date: id.date,
      solution: Grid::from_str(
        r"
                6 2 9 | 5 3 1 | 4 7 8
                4 3 8 | 9 7 2 | 6 5 1
                7 5 1 | 4 6 8 | 3 2 9
                - - - + - - - + - - -
                2 8 4 | 1 9 3 | 7 6 5
                9 6 3 | 8 5 7 | 2 1 4
                1 7 5 | 2 4 6 | 9 8 3
                - - - + - - - + - - -
                5 1 7 | 3 2 9 | 8 4 6
                8 9 6 | 7 1 4 | 5 3 2
                3 4 2 | 6 8 5 | 1 9 7",
      )
      .unwrap()
      .solved_grid()
      .unwrap(),
    };
    assert_eq!(super::daily_solution(id.date), daily_solution);
    assert_eq!(
      generate_puzzle(id),
      PuzzleDesc {
        puzzle: Grid::from_str(
          r"
                    . . 6 | . . . | . . .
                    8 3 1 | 7 . . | 6 . .
                    . . . | 3 . 1 | . . .
                    - - - + - - - + - - -
                    . . . | . . . | . . 7
                    6 . . | 2 . . | 3 4 5
                    2 . 8 | . . . | . . 9
                    - - - + - - - + - - -
                    . . . | . . 2 | . . .
                    5 . . | 4 7 9 | . . .
                    7 . . | . . . | . . 8"
        )
        .unwrap(),
        gen_opts: Some(GenOpts {
          daily_solution,
          counter: id.counter,
          permutation: *GridPermutation {
            nums: cycle!(Num; 1, 5, 7).composed_with(&cycle!(Num; 2, 3, 9, 8, 4)),
            locs: LocPermutation {
              transpose: true,
              row_bands: cycle!(Band; 0, 2),
              col_bands: cycle!(Band; 0, 2, 1),
              rows_in_bands: [
                cycle!(BlkLine; 0, 1),
                cycle!(BlkLine; 1, 2),
                cycle!(BlkLine; 0, 1),
              ],
              cols_in_bands: [
                cycle!(BlkLine; 0, 2),
                cycle!(BlkLine; 0, 1),
                cycle!(BlkLine; 0, 2, 1),
              ],
            },
          }
          .external(),
          sym: Sym::Blockwise(Diagonal::Anti),
          broken: true,
          improper: false,
        }),
        num_solutions: 1,
      }
    );

    let id = PuzzleId { counter: 3, ..id };
    assert_eq!(
      generate_puzzle(id),
      PuzzleDesc {
        puzzle: Grid::from_str(
          r"
                    . 8 . | 7 . 3 | . 6 .
                    . . . | 1 . . | . . .
                    . 2 . | . 6 . | . 4 .
                    - - - + - - - + - - -
                    . . 6 | . . . | 4 7 .
                    3 . . | . 4 . | . . 8
                    . 1 . | . 3 . | . . .
                    - - - + - - - + - - -
                    . . 8 | . . . | 1 . .
                    . . . | 5 . 8 | . . 7
                    6 . . | . . . | . . 5"
        )
        .unwrap(),
        gen_opts: Some(GenOpts {
          daily_solution,
          counter: id.counter,
          permutation: *GridPermutation {
            nums: cycle!(Num; 3, 6).composed_with(&cycle!(Num; 4, 9, 8)),
            locs: LocPermutation {
              transpose: true,
              row_bands: cycle!(Band; 0, 1, 2),
              col_bands: cycle!(Band; 1, 2),
              rows_in_bands: [
                cycle!(BlkLine; 0, 1, 2),
                cycle!(BlkLine; 0, 1),
                cycle!(BlkLine; 1, 2),
              ],
              cols_in_bands: [
                cycle!(BlkLine; 1, 2),
                cycle!(BlkLine; 0, 2),
                cycle!(BlkLine; 1, 2),
              ],
            },
          }
          .external(),
          sym: Sym::Mirror(Axis::Y),
          broken: true,
          improper: false,
        }),
        num_solutions: 1,
      }
    );
  }
}
