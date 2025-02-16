//! Defines the Sudoku Insight solve function.

use crate::core::*;
use crate::random::*;

pub mod ledger;
mod masks;

use ledger::*;

pub struct SolutionSummary {
  pub clues: Grid,

  /// Whether there were more solutions than the maximum number we would allow.
  /// When this is true, the `solutions` vector will have one more solution than
  /// the maximum number we specified.
  pub too_many_solutions: bool,

  /// The possible solutions to the puzzle.  When `too_many_solutions` is true,
  /// this may be a subset of the puzzle's solutions; when it is false, this is
  /// the complete set of solutions.
  pub solutions: Vec<SolvedGrid>,
}

/// Solves the given puzzle.
pub fn solve(clues: &Grid, max_solutions: i32, helper: &mut dyn SearchHelper) -> SolutionSummary {
  let factory = SearcherFactory::new(clues);
  let mut searcher = factory.new_searcher(helper);
  let mut summary = SolutionSummary {
    clues: *clues,
    too_many_solutions: false,
    solutions: searcher.found.map_or_else(|| Vec::new(), |s| vec![s]),
  };
  let max = 0.max(max_solutions) as usize;
  while summary.solutions.len() <= max {
    searcher.run(None);
    if let Some(solution) = searcher.found {
      summary.solutions.push(solution)
    } else {
      break;
    }
  }
  summary.too_many_solutions = summary.solutions.len() > max;
  summary
}

impl SolutionSummary {
  /// Counts the number of holes in the intersection of all of the solutions.
  pub fn num_holes(&self) -> i32 {
    if self.solutions.len() < 2 {
      return 0
    }
    let mut intersection = self.solutions[0].grid();
    for s in self.solutions.iter().skip(1) {
      intersection.intersect(&s.grid());
    }
    81 - intersection.len() as i32
  }
}

/// Callbacks for searching the Sudoku solution space.
pub trait SearchHelper {
  /// Decides on a location to search through.
  fn choose_pivot_loc(&mut self, ledger: &Ledger, twos: &LocSet) -> Loc;

  /// Optionally puts the given numerals into a different order.
  fn order_pivot_nums(&mut self, nums: &mut [Option<Num>]);
}

/// A fast and deterministic `SearchHelper` implementation, due to Emerentius.
pub struct DefaultHelper();

impl SearchHelper for DefaultHelper {
  fn choose_pivot_loc(&mut self, ledger: &Ledger, twos: &LocSet) -> Loc {
    // Replicates Emerentius's algorithm: takes anything from twos, or the best of 3
    // unset locations.
    if let Some(loc) = twos.smallest_item() {
      return loc;
    }
    let unset = ledger.unset();
    Band::all()
      .flat_map(|band| unset.smallest_in_row_band(band))
      .map(|loc| {
        let possible_count = Num::all()
          .filter(|num| ledger.is_possible(*num, loc))
          .count();
        (possible_count, loc)
      })
      .min()
      .unwrap() // Safe because this is never called with empty `unset`.
      .1
  }

  fn order_pivot_nums(&mut self, _nums: &mut [Option<Num>]) {}
}

/// A deterministic `SearchHelper` implementation that mimics JCZSolve's
/// approach.
pub struct JczHelper();

impl SearchHelper for JczHelper {
  fn choose_pivot_loc(&mut self, ledger: &Ledger, twos: &LocSet) -> Loc {
    // Takes anything from twos, or anything from unset.
    if let Some(loc) = twos.smallest_item() {
      return loc;
    }
    // Safe because this is never called with empty `unset`.
    ledger.unset().smallest_item().unwrap()
  }

  fn order_pivot_nums(&mut self, _nums: &mut [Option<Num>]) {}
}

/// A `SearchHelper` that picks pivot points at random.  It still prefers
/// locations in `twos` when there are any.
///
/// Does not touch the order of pivot numerals.
pub struct RandomPivotHelper<'a, R: Rng>(&'a mut R);

impl<'a, R: Rng> SearchHelper for RandomPivotHelper<'a, R> {
  fn choose_pivot_loc(&mut self, ledger: &Ledger, twos: &LocSet) -> Loc {
    // Takes anything from twos, or anything from unset.
    if !twos.is_empty() {
      let n: i32 = self.0.random_range(0..twos.len());
      // Safe because we're within twos's range.
      return twos.item_at(n).unwrap();
    }
    // Safe because this is never called with empty `unset`, and we stay in its
    // range.
    let n: i32 = self.0.random_range(0..ledger.unset().len());
    ledger.unset().item_at(n).unwrap()
  }

  fn order_pivot_nums(&mut self, _nums: &mut [Option<Num>]) {}
}

pub struct SearcherFactory {
  ledger: Option<Ledger>,
  twos: LocSet,
}

impl SearcherFactory {
  pub fn new(clues: &Grid) -> Self {
    let result = Ledger::new(clues);
    if let Ok(mut ledger) = result {
      let result = ledger.apply_implications();
      if let Ok(twos) = result {
        return SearcherFactory {
          ledger: Some(ledger),
          twos,
        };
      }
    }
    SearcherFactory {
      ledger: None,
      twos: LocSet::new(),
    }
  }

  pub fn new_searcher<'a>(&'a self, helper: &'a mut dyn SearchHelper) -> Searcher {
    Searcher::new(&self.ledger, &self.twos, helper)
  }
}

pub struct Searcher<'a> {
  pub found: Option<SolvedGrid>,
  pub total_pivots: i32,
  pub max_depth: i32,
  stack: Vec<StackItem>,
  helper: &'a mut dyn SearchHelper,
}

struct StackItem {
  ledger: Ledger,

  /// An unassigned location we'll try all possible numerals in.
  pivot_loc: Loc,

  /// The numerals to try assigning to the pivot location.  `count` is the
  /// total number, and `next` is the index of the next one to try.
  nums: [Option<Num>; 9],
  count: i8,
  next: i8,
}

impl<'a> Searcher<'a> {
  /// Searches for the next solved Sudoku grid, through at most `max_pivots`
  /// pivot points (or all remaining pivot points if `max_pivots` is
  /// `None`). Returns the number of pivot points traversed.
  pub fn run(&mut self, max_pivots: Option<i32>) -> i32 {
    self.found = None;
    let mut count = 0;
    while !self.stack.is_empty() && (max_pivots == None || count < max_pivots.unwrap()) {
      count += 1;
      let item = self.stack.last_mut().unwrap();
      let (num, last) = item.next_num();
      if last {
        // For the final numeral, we modify the item's ledger in place, instead of
        // copying.
        let result = item
          .ledger
          .assign_and_apply_implications(num, item.pivot_loc);
        if let Ok(twos) = result {
          let pivoted = !item.ledger.is_complete();
          if pivoted {
            // We even reuse the item for the following pivot.
            item.pivot_loc = self.helper.choose_pivot_loc(&item.ledger, &twos);
            item.fill_nums();
            self
              .helper
              .order_pivot_nums(&mut item.nums[..item.count as usize]);
          } else {
            self.found = Self::solution(&item.ledger);
            self.stack.pop();
            break;
          }
        } else {
          self.stack.pop();
        }
      } else {
        // There are other numerals after this one, we must modify a copy of the item's
        // ledger so they'll all start from the same place.
        let mut ledger = item.ledger;
        let result = ledger.assign_and_apply_implications(num, item.pivot_loc);
        if let Ok(twos) = result {
          let pivoted = self.pivot(&ledger, &twos);
          if !pivoted {
            self.found = Self::solution(&ledger);
            break;
          }
        }
      }
    }
    self.total_pivots += count;
    count
  }

  fn new(ledger: &Option<Ledger>, twos: &LocSet, helper: &'a mut dyn SearchHelper) -> Self {
    let mut answer = Searcher {
      found: None,
      total_pivots: 0,
      max_depth: 0,
      stack: Vec::with_capacity(10),
      helper,
    };
    if let Some(ledger) = ledger {
      let pivoted = answer.pivot(ledger, twos);
      if !pivoted {
        // We must be done.
        answer.found = Self::solution(ledger);
      }
    }
    answer
  }

  /// Chooses a pivot location and pushes it and its possible numerals onto
  /// the stack; returns false if there are no remaining unset locations.
  fn pivot(&mut self, ledger: &Ledger, twos: &LocSet) -> bool {
    if ledger.is_complete() {
      return false;
    }

    self.stack.push(StackItem {
      ledger: *ledger,
      pivot_loc: self.helper.choose_pivot_loc(ledger, twos),
      nums: [None; 9],
      count: 0,
      next: 0,
    });
    self.max_depth = std::cmp::max(self.max_depth, self.stack.len() as _);
    let item = self.stack.last_mut().unwrap();
    item.fill_nums();
    self
      .helper
      .order_pivot_nums(&mut item.nums[..item.count as usize]);
    true
  }

  fn solution(ledger: &Ledger) -> Option<SolvedGrid> {
    Some(unsafe {
      // Safe because this method is only called when the ledger is complete.
      SolvedGrid::new(&ledger.to_grid())
    })
  }
}

impl StackItem {
  /// Returns the next numeral to assign to this item's locations.
  fn next_num(&mut self) -> (Num, bool) {
    let num = self.nums[self.next as usize].unwrap();
    self.next += 1;
    (num, self.next >= self.count)
  }

  /// Finds all the numerals available for the pivot location and adds them to
  /// `nums`.
  fn fill_nums(&mut self) {
    self.count = 0;
    self.next = 0;
    for num in Num::all() {
      if self.ledger.is_possible(num, self.pivot_loc) {
        unsafe {
          // Safe because there can't be more than 9 numerals in the `nums` array.
          *self.nums.get_unchecked_mut(self.count as usize) = Some(num);
          self.count += 1;
        }
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use paste::paste;
  use std::cmp::max;
  use std::str::FromStr;

  const MAX_SOLUTIONS: i32 = 12;

  macro_rules! solve_test {
    ($name:ident, $clues:expr, $count:expr) => {
      paste! {
          #[test]
          fn [<test_solve_ $name>]() {
              let clues = Grid::from_str($clues).unwrap();
              match clues.state() {
                  GridState::Broken(_) => assert!($count < 0),
                  GridState::Incomplete => assert!($count >= 0),
                  GridState::Solved(_) => panic!("unreachable"),
              }
              let mut helper = DefaultHelper();
              let summary = solve(&clues, MAX_SOLUTIONS, &mut helper);
              assert_eq!(max(0, $count), summary.solutions.len() as i32);
              assert_eq!(summary.too_many_solutions, $count > MAX_SOLUTIONS);
              for s in summary.solutions {
                let mut s = s.grid();
                s.intersect(&clues);
                assert_eq!(s, clues);
              }
          }
      }
    };
  }

  solve_test!(
    broken,
    "...8.9..6.23.........6.8...7....1..2...45...9......6......7......1.46.....3......",
    -1
  );
  solve_test!(
    no_solution_1,
    "1....6....59.....82....8....45...3....3...7....6..3.54...325..6........17389.....",
    0
  );
  solve_test!(
    no_solution_2_slow,
    "..9..87....65..3...............3..69.........23..7...............8..36....41..2..",
    0
  );
  solve_test!(
    unique_solution,
    ".6.5.4.3.1...9...8.........9...5...6.4.6.2.7.7...4...5.........4...8...1.5.2.3.4.",
    1
  );
  solve_test!(
    unique_solution_no_pivots,
    ".9..74....2....6.375...........9..545.3.4.......58.....45....8....1.2.3.......92.",
    1
  );
  solve_test!(
    multiple_solutions,
    ".3....91.8.6.....2...8.4...5.2..7..........7.9..4.65.....7.3...3.8.....1.97...8..",
    9
  );
  solve_test!(
    many_solutions,
    ".....6....59.....82....8....45........3........6..3.54...325..6..................",
    MAX_SOLUTIONS + 1
  );
}
