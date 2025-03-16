//! Code that generates solved Sudoku grids, and Sudoku puzzles.

use once_cell::sync::Lazy;
use rand::distr::weighted::WeightedIndex;
use rand::prelude::Distribution;
use std::fmt::Display;
use wasm_bindgen::{
  convert::IntoWasmAbi,
  describe::{inform, WasmDescribe, I8},
  prelude::wasm_bindgen,
};

use crate::core::*;
use crate::date::LogicalDate;
use crate::permute::{ExternalGridPermutation, GridPermutation};
use crate::random::*;
use crate::solve::ledger::Ledger;
use crate::solve::*;
use crate::sym::{Axis, Diagonal, Sym};

/// Describes a Sudoku puzzle.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
#[wasm_bindgen(getter_with_clone)]
pub struct Puzzle {
  /// The puzzle's clues.
  pub clues: Grid,
  /// If it was generated by this module, the options that went into that
  /// generation.
  pub gen_opts: Option<GenOpts>,
  /// All the solutions to the puzzle.
  pub solutions: Vec<SolvedGrid>,
}

/// Possible results of testing a set of clues to see if it works as a puzzle.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(C)]
pub enum PuzzleProspect {
  /// The set of clues doesn't work, there are no solutions.
  NoSolutions,
  /// The set of clues works: it produces solutions consistent with luke-doku's
  /// rules.
  Viable,
  /// The set of clues is incomplete: it produces too many solutions or
  /// a set of solutions with too many holes.
  NotEnoughClues,
}

impl WasmDescribe for PuzzleProspect {
  fn describe() {
    inform(I8)
  }
}

impl IntoWasmAbi for PuzzleProspect {
  type Abi = i32;

  fn into_abi(self) -> Self::Abi {
    self as _
  }
}

#[wasm_bindgen]
impl Puzzle {
  /// Attempts to make a puzzle by solving it, given its clues.
  pub fn new(clues: &Grid) -> Option<Self> {
    let mut helper = DefaultHelper();
    let summary = solve(&clues, MAX_SOLUTIONS, &mut helper);
    if summary.too_many_solutions || summary.solutions.len() == 0 {
      return None;
    }
    Some(Self {
      clues: summary.clues,
      gen_opts: None,
      solutions: summary.solutions,
    })
  }

  /// Tests a set of clues for whether they form a viable puzzle, according to
  /// luke-doku's parameters.
  pub fn test(clues: &Grid) -> PuzzleProspect {
    let mut helper = DefaultHelper();
    let summary = solve(&clues, MAX_SOLUTIONS, &mut helper);
    if summary.solutions.len() == 0 {
      return PuzzleProspect::NoSolutions;
    }
    if summary.too_many_solutions || summary.num_holes() > MAX_HOLES {
      return PuzzleProspect::NotEnoughClues;
    }
    PuzzleProspect::Viable
  }

  #[wasm_bindgen(js_name = "solutionsCount")]
  pub fn solutions_count(&self) -> i32 {
    self.solutions.len() as _
  }
}

/// Identifies a Sudoku puzzle generated by this module.  Each day has any
/// number of puzzles.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct PuzzleId {
  pub date: LogicalDate,
  pub counter: i32,
  pub generator_version: i32,
}

#[wasm_bindgen]
impl PuzzleId {
  #[wasm_bindgen(constructor)]
  pub fn new(date: LogicalDate, counter: i32, generator_version: i32) -> Self {
    Self {
      date,
      counter,
      generator_version,
    }
  }
}

/// The base solution for a given date.  All puzzles generated by this module
/// start with one of these.
#[wasm_bindgen]
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct DailySolution {
  pub date: LogicalDate,
  pub generator_version: i32,
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
      generator_version: self.daily_solution.generator_version,
    }
  }
}

/// Generates the puzzle with the given ID.
pub fn generate_puzzle(id: PuzzleId) -> Result<Puzzle, String> {
  daily_solution(&id.date).generate(id.counter)
}

#[wasm_bindgen(js_name = "dailySolution")]
pub fn daily_solution(date: &LogicalDate) -> DailySolution {
  let seed = date.to_string(); // yyyy-mm-dd
  let mut random = new_random(&seed);
  let solution = gen_solved_grid(&mut random);
  DailySolution {
    date: *date,
    generator_version: GENERATOR_VERSION,
    solution,
  }
}

#[wasm_bindgen(js_name = "generatorVersion")]
pub fn generator_version() -> i32 {
  GENERATOR_VERSION
}

#[wasm_bindgen]
impl DailySolution {
  /// Generates one of this day's puzzles.
  pub fn generate(&self, counter: i32) -> Result<Puzzle, String> {
    if self.generator_version != GENERATOR_VERSION {
      return Err(format!(
        "This solution was generated with version {} of the generator, but this is version {}.",
        self.generator_version, GENERATOR_VERSION
      ));
    }
    let id = PuzzleId {
      date: self.date,
      counter,
      generator_version: GENERATOR_VERSION,
    };
    let seed = id.to_string();
    let mut random = new_random(&seed);
    let permutation = GridPermutation::random(&mut random);
    let solution = permutation.apply_to_solved(&self.solution);

    let sym = SYM_WEIGHTS[SYM_DIST.sample(&mut random)].0;
    let broken = random.random_bool(BROKEN_SYMMETRY_PROB);
    let improper = random.random_bool(IMPROPER_PROB);
    let summary = gen_puzzle(&solution, sym, broken, improper, &mut random);
    Ok(Puzzle {
      clues: summary.clues,
      gen_opts: Some(GenOpts {
        daily_solution: *self,
        counter,
        permutation: *permutation.external(),
        sym,
        broken,
        improper,
      }),
      solutions: summary.solutions,
    })
  }
}

/// The version of the Luke-doku puzzle generator.  This must change whenever
/// any of the parameters listed below change, or when the Rust `rand` crate has
/// a breaking change to the parts of it we use.
pub const GENERATOR_VERSION: i32 = 1;

// -------------------------------
// The parameters of the Luke-doku generator.  Changing any of these requires
// bumping GENERATOR_VERSION.
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
  let clues = gen_simple_puzzle(solution, sym, random);
  let max_solutions;
  let max_holes;
  if improper {
    max_solutions = MAX_SOLUTIONS;
    max_holes = MAX_HOLES;
  } else {
    max_solutions = 1;
    max_holes = 0;
  }
  let mut summary = improve_puzzle(&clues, sym, random, max_solutions, max_holes);
  if broken && sym != Sym::None {
    summary = improve_puzzle(&summary.clues, Sym::None, random, max_solutions, max_holes);
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

/// Subtracts clues from the given grid, honoring the given symmetry.
pub fn improve_puzzle<R: Rng>(
  clues: &Grid,
  sym: Sym,
  random: &mut R,
  max_solutions: i32,
  max_holes: i32,
) -> SolutionSummary {
  let mut clues = *clues;
  let orbits = sym.shuffled_orbits(random);
  let mut helper = DefaultHelper();
  let mut summary = solve(&clues, max_solutions, &mut helper);
  for orbit in orbits {
    let prev = clues;
    for loc in orbit {
      clues[*loc] = None;
    }
    let next_summary = solve(&clues, max_solutions, &mut helper);
    if (0..=max_solutions).contains(&(next_summary.solutions.len() as i32))
      && next_summary.num_holes() <= max_holes
    {
      summary = next_summary;
    } else {
      clues = prev;
    }
  }
  summary
}

/// A `SearchHelper` that shuffles the numerals for each pivot point, thereby
/// randomizing the grid.
struct GenHelper<'a, R: Rng>(&'a mut R);

impl<'a, R: Rng> SearchHelper for GenHelper<'a, R> {
  fn choose_pivot_loc(&mut self, ledger: &Ledger, doubles: &LocSet) -> Loc {
    let mut helper = JczHelper();
    helper.choose_pivot_loc(ledger, doubles)
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
                7 6 2 | 5 4 9 | 3 1 8
                5 1 9 | 6 3 8 | 2 7 4
                4 8 3 | 1 7 2 | 5 9 6
                - - - + - - - + - - -
                6 2 5 | 3 9 7 | 8 4 1
                3 9 8 | 4 1 5 | 6 2 7
                1 4 7 | 2 8 6 | 9 3 5
                - - - + - - - + - - -
                8 5 4 | 9 2 1 | 7 6 3
                2 3 6 | 7 5 4 | 1 8 9
                9 7 1 | 8 6 3 | 4 5 2"
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
                7 . 2 | 5 . 9 | 3 . 8
                . 1 . | 6 . 8 | . 7 .
                4 . 3 | . 7 . | 5 . 6
                - - - + - - - + - - -
                6 2 . | . 9 . | . 4 1
                . . 8 | 4 . 5 | 6 . .
                1 4 . | . 8 . | . 3 5
                - - - + - - - + - - -
                8 . 4 | . 2 . | 7 . 3
                . 3 . | 7 . 4 | . 8 .
                9 . 1 | 8 . 3 | 4 . 2"
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
                . . . | . 4 9 | . . 8
                5 . . | . 3 8 | . 7 .
                . 8 . | . . 2 | . 9 6
                - - - + - - - + - - -
                6 2 5 | . 9 7 | . . .
                . . . | . 1 5 | . 2 .
                . . . | . . 6 | . 3 .
                - - - + - - - + - - -
                8 5 . | . . 1 | 7 . .
                . . 6 | 7 . . | . 8 9
                . . . | . . . | 4 5 ."
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
      generator_version: GENERATOR_VERSION,
    };
    let daily_solution = DailySolution {
      date: id.date,
      generator_version: GENERATOR_VERSION,
      solution: Grid::from_str(
        r"
                9 1 6 | 7 3 2 | 5 8 4
                4 3 5 | 8 1 6 | 2 9 7
                8 2 7 | 5 9 4 | 6 3 1
                - - - + - - - + - - -
                1 6 2 | 3 4 7 | 8 5 9
                3 9 4 | 2 8 5 | 1 7 6
                5 7 8 | 1 6 9 | 4 2 3
                - - - + - - - + - - -
                7 5 3 | 4 2 1 | 9 6 8
                2 4 9 | 6 7 8 | 3 1 5
                6 8 1 | 9 5 3 | 7 4 2",
      )
      .unwrap()
      .solved_grid()
      .unwrap(),
    };
    assert_eq!(super::daily_solution(&id.date), daily_solution);
    assert_eq!(
      generate_puzzle(id),
      Ok(Puzzle {
        clues: Grid::from_str(
          r"
                    8 . . | . 6 . | . 4 .
                    1 . 7 | . . . | . . .
                    . . 2 | . . . | 6 3 .
                    - - - + - - - + - - -
                    . . . | 2 3 . | . . .
                    4 9 . | . . 5 | . 7 .
                    . . . | 6 4 . | . . .
                    - - - + - - - + - - -
                    . . 3 | . . . | 8 . .
                    . . . | . . . | 4 . .
                    5 . . | . 1 . | . . 2"
        )
        .unwrap(),
        gen_opts: Some(GenOpts {
          daily_solution,
          counter: id.counter,
          permutation: *GridPermutation {
            nums: cycle!(Num; 1, 3, 2, 7, 6, 4, 5),
            locs: LocPermutation {
              transpose: true,
              row_bands: cycle!(Band; 0, 1, 2),
              col_bands: cycle!(Band; 0, 2, 1),
              rows_in_bands: [
                cycle!(BlkLine),
                cycle!(BlkLine; 0, 2),
                cycle!(BlkLine; 1, 2),
              ],
              cols_in_bands: [
                cycle!(BlkLine),
                cycle!(BlkLine; 1, 2),
                cycle!(BlkLine; 0, 2, 1),
              ],
            },
          }
          .external(),
          sym: Sym::Rotation90,
          broken: true,
          improper: false,
        }),
        solutions: vec![Grid::from_str(
          r"
            8 3 5 | 9 6 2 | 7 4 1
            1 6 7 | 4 5 3 | 9 2 8
            9 4 2 | 8 7 1 | 6 3 5
            - - - + - - - + - - -
            7 5 8 | 2 3 9 | 1 6 4
            4 9 6 | 1 8 5 | 2 7 3
            3 2 1 | 6 4 7 | 5 8 9
            - - - + - - - + - - -
            2 7 3 | 5 9 4 | 8 1 6
            6 1 9 | 3 2 8 | 4 5 7
            5 8 4 | 7 1 6 | 3 9 2
          "
        )
        .unwrap()
        .solved_grid()
        .unwrap()],
      })
    );

    let id = PuzzleId { counter: 3, ..id };
    assert_eq!(
      generate_puzzle(id),
      Ok(Puzzle {
        clues: Grid::from_str(
          r"
                    3 . 9 | . . . | . . 1
                    . 4 . | . . . | . . .
                    . . . | 1 . . | 5 . 8
                    - - - + - - - + - - -
                    . . 6 | 3 . 5 | . . .
                    . . . | . 4 . | . 9 .
                    1 . 5 | 2 . . | 8 . .
                    - - - + - - - + - - -
                    . . . | . 1 . | . . 2
                    . 6 . | . . . | . . .
                    2 . . | 4 . . | 3 . ."
        )
        .unwrap(),
        gen_opts: Some(GenOpts {
          daily_solution,
          counter: id.counter,
          permutation: *GridPermutation {
            nums: cycle!(Num; 1, 3, 8, 9, 2, 5, 4, 6, 7),
            locs: LocPermutation {
              transpose: true,
              row_bands: cycle!(Band; 0, 1),
              col_bands: cycle!(Band; 0, 1, 2),
              rows_in_bands: [
                cycle!(BlkLine; 0, 2),
                cycle!(BlkLine; 0, 2, 1),
                cycle!(BlkLine; 0, 2),
              ],
              cols_in_bands: [
                cycle!(BlkLine; 1, 2),
                cycle!(BlkLine),
                cycle!(BlkLine; 0, 2, 1),
              ],
            },
          }
          .external(),
          sym: Sym::Blockwise(Diagonal::Main),
          broken: true,
          improper: false,
        }),
        solutions: vec![Grid::from_str(
          r"
            3 8 9 | 5 7 6 | 4 2 1
            5 4 1 | 8 3 2 | 9 7 6
            6 2 7 | 1 9 4 | 5 3 8
            - - - + - - - + - - -
            4 9 6 | 3 8 5 | 2 1 7
            8 3 2 | 7 4 1 | 6 9 5
            1 7 5 | 2 6 9 | 8 4 3
            - - - + - - - + - - -
            9 5 4 | 6 1 3 | 7 8 2
            7 6 3 | 9 2 8 | 1 5 4
            2 1 8 | 4 5 7 | 3 6 9
          "
        )
        .unwrap()
        .solved_grid()
        .unwrap()],
      })
    );
  }

  #[test]
  fn test_generate_puzzle_error() {
    let solution = daily_solution(&LogicalDate::from_ymd(1961, 9, 20));
    let solution: DailySolution = DailySolution {
      generator_version: 0,
      ..solution
    };
    assert_eq!(
      solution.generate(1),
      Err(
        "This solution was generated with version 0 of the generator, but this is version 1."
          .to_string(),
      )
    );
  }
}
