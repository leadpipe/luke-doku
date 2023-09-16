use luke_doku::{core::*, permute::GridPermutation, solve::*};

/// Finds the lexicographically minimal solved Sudoku grid.
fn main() {
  let mut helper = MinimizingSearchHelper;
  let factory = SearcherFactory::new(&Grid::new());
  let mut searcher = factory.new_searcher(&mut helper);
  searcher.run(None);
  let min = searcher.found.unwrap();
  let (_, orbit, count) = GridPermutation::minimizing(&min);
  assert_eq!(min, orbit);
  println!(
    "Lexicographically smallest Sudoku grid ({}-way symmetry):\n{:?}",
    count, min
  );
}

/// A SearchHelper that always picks the lexicographically first available
/// location, and leaves the numerals to try in that location in numerical
/// order.
struct MinimizingSearchHelper;

impl SearchHelper for MinimizingSearchHelper {
  fn choose_pivot_loc(&mut self, ledger: &ledger::Ledger, _twos: &LocSet) -> Loc {
    // The solver never calls this with an empty `unset`.
    ledger.unset().smallest_item().unwrap()
  }

  fn order_pivot_nums(&mut self, _nums: &mut [Option<Num>]) {
    // Do nothing: they're already ordered from least to greatest.
  }
}
