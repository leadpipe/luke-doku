//! Defines the Grid type, representing a Sudoku grid and the assignments of
//! numerals to locations within such a grid.

use std::fmt;
use std::ops::{Index, IndexMut};
use std::str::FromStr;
use wasm_bindgen::prelude::wasm_bindgen;

use super::*;

/// A Sudoku grid: a 9x9 array with each location holding an optional numeral
/// from 1 through 9. We model this as a map from `Loc` to `Option<Num>`, or as
/// a collection of `Asgmt`s.
#[derive(Clone, Copy, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[wasm_bindgen]
pub struct Grid([Option<Num>; 81]);

#[wasm_bindgen]
impl Grid {
  /// Makes an empty Grid.
  pub fn new() -> Grid {
    Grid([None; 81])
  }

  /// Constructs a Grid from a byte array.
  #[wasm_bindgen(js_name = "newFromBytes")]
  pub fn new_from_bytes(bytes: Box<[u8]>) -> Option<Grid> {
    if bytes.len() != 81 || bytes.iter().any(|&b| b > 9) {
      None
    } else {
      unsafe {
        // Safe because we've just checked the requirements for Grid.
        let p = (&bytes).as_ptr() as *const [Option<Num>; 81];
        Some(Grid(*p))
      }
    }
  }

  /// Constructs a Grid from a string, or throws.
  #[wasm_bindgen(js_name = "newFromString")]
  pub fn new_from_string(s: &str) -> Result<Grid, String> {
    Grid::from_str(s)
  }

  /// Converts the grid to a Uint8Array.
  pub fn bytes(&self) -> Box<[u8]> {
    unsafe {
      // Safe because Option<Num> is stored as a byte.
      let p = (&self.0).as_ptr() as *const [u8; 81];
      Box::new(*p)
    }
  }

  /// Duplicates this grid.
  pub fn clone(self) -> Grid {
    self
  }

  /// Empties the grid.
  pub fn clear(&mut self) {
    self.0.fill(None);
  }

  /// Index wrapper for wasm.
  pub fn get(&self, loc: Loc) -> Option<Num> {
    self[loc]
  }

  /// Index wrapper for wasm.
  pub fn set(&mut self, loc: Loc, num: Option<Num>) {
    self[loc] = num;
  }

  /// Returns the number of locations that have assigned numerals.
  pub fn len(&self) -> usize {
    self.0.iter().filter(|optional| optional.is_some()).count()
  }

  /// Returns the debug string (ASCII grid).
  #[wasm_bindgen(js_name = "toString")]
  pub fn to_debug_string(&self) -> String {
    format!("{:?}", self)
  }

  /// Returns the display string (81 characters).
  #[wasm_bindgen(js_name = "toFlatString")]
  pub fn to_flat_string(&self) -> String {
    format!("{}", self)
  }

  /// Tells whether this grid is a complete and valid Sudoku solution.
  #[wasm_bindgen(js_name = "isSolved")]
  pub fn is_solved(&self) -> bool {
    if let GridState::Solved(_g) = self.state() {
      true
    } else {
      false
    }
  }

  /// When this grid is complete but broken, returns a list of the broken
  /// locations' indices.
  #[wasm_bindgen(js_name = "brokenLocs")]
  pub fn broken_locs(&self) -> Option<Box<[u8]>> {
    if let GridState::Broken(locs) = self.state() {
      let bytes = locs.iter().map(|loc| loc.index() as u8).collect::<Vec<u8>>().into_boxed_slice();
      Some(bytes)
    } else {
      None
    }
  }
}

impl Grid {
  /// Iterates the assignments in this grid.
  pub fn iter(&self) -> impl Iterator<Item = Asgmt> {
    Loc::all()
      .zip(self.0)
      .filter_map(|(loc, optional)| optional.map(|num| Asgmt { loc, num }))
  }

  /// This grid's state: solved, incomplete, or broken.
  pub fn state(&self) -> GridState {
    let mut broken = LocSet::new();
    // Look for repeated numerals in every unit.
    for id in UnitId::all() {
      let mut where_seen: [Option<Loc>; 9] = [None; 9];
      for loc in id.locs().iter() {
        if let Some(num) = self[loc] {
          if let Some(first_loc) = where_seen[num.index()] {
            broken.insert(loc);
            broken.insert(first_loc);
          } else {
            where_seen[num.index()] = Some(loc);
          }
        }
      }
    }
    if broken.is_empty() {
      if self.len() == 81 {
        GridState::Solved(self)
      } else {
        GridState::Incomplete
      }
    } else {
      GridState::Broken(broken)
    }
  }

  /// Clears all cells that have different assignments from `other`.
  pub fn intersect(&mut self, other: &Grid) {
    for loc in Loc::all() {
      if self[loc] != other[loc] {
        self[loc] = None;
      }
    }
  }

  /// Converts this grid to a SolvedGrid when this grid is solved.
  pub fn solved_grid(&self) -> Option<SolvedGrid> {
    self.state().solved_grid()
  }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum GridState<'a> {
  Solved(&'a Grid),
  Incomplete,
  Broken(LocSet),
}

impl<'a> GridState<'a> {
  /// When the state is solved, returns a SolvedGrid; otherwise, returns None.
  pub fn solved_grid(&self) -> Option<SolvedGrid> {
    if let GridState::Solved(g) = self {
      // Safe because it's in fact a solved grid.
      unsafe { return Some(SolvedGrid::new(g)) }
    }
    None
  }
}

impl Default for Grid {
  fn default() -> Self {
    Self::new()
  }
}

impl Index<Loc> for Grid {
  type Output = Option<Num>;

  /// Allows `Grid`s to be indexed by `Loc`s.
  fn index(&self, loc: Loc) -> &Option<Num> {
    unsafe {
      // Safe because `loc.index()` is in 0..81.
      self.0.get_unchecked(loc.index())
    }
  }
}

impl IndexMut<Loc> for Grid {
  fn index_mut(&mut self, loc: Loc) -> &mut Option<Num> {
    unsafe {
      // Safe because `loc.index()` is in 0..81.
      self.0.get_unchecked_mut(loc.index())
    }
  }
}

impl fmt::Display for Grid {
  /// Prints this grid in row-major order, with `.` for unassigned squares.
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    for optional in self.0 {
      match optional {
        Some(num) => num.get().fmt(f)?,
        None => '.'.fmt(f)?,
      }
    }
    Ok(())
  }
}

impl fmt::Debug for Grid {
  /// Prints this grid as Ascii art.
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    let flat = self.to_string();
    let chars: Vec<_> = flat.split("").skip(1).collect();
    let ch = |n| chars[n as usize];
    let subrow = |n| [ch(n), ch(n + 1), ch(n + 2)].join(" ");
    let row = |n| [subrow(n), subrow(n + 3), subrow(n + 6)].join(" | ");
    let band = |n| [row(n), row(n + 9), row(n + 18)].join("\n");
    let grid = [band(0), band(27), band(54)].join("\n- - - + - - - + - - -\n");
    f.write_str(&grid)
  }
}

impl FromStr for Grid {
  type Err = String;

  /// Constructs a Grid from a string, which must contain exactly 81
  /// location characters, plus any number of other characters.
  ///
  /// A location character is `1` through `9`, signifying an assignment of
  /// that digit to the corresponding location, or `0` or `.`, signifying
  /// that the location is blank.
  ///
  /// This method ignores all other characters, which means that strings in
  /// both of Grid's Display and Debug forms are correctly parsed back into
  /// the original grid.
  fn from_str(s: &str) -> Result<Grid, String> {
    let mut i = 0;
    let mut grid = Grid::new();
    for c in s.chars() {
      if ('0'..='9').contains(&c) || c == '.' {
        if i >= Loc::COUNT {
          return Err(format!("More than 81 locations in {}", s));
        }
        if c != '0' && c != '.' {
          // 0 and . are placeholders meaning a blank square.
          let num = c.to_digit(10).unwrap() as i8;
          grid.0[i] = Some(unsafe { Num::new_unchecked(num) });
        }
        i += 1
      }
    }
    if i == Loc::COUNT {
      Ok(grid)
    } else {
      Err(format!("Fewer than 81 locations in {}", s))
    }
  }
}

/// A solved Sudoku grid: a 9x9 array with each location holding a numeral
/// from 1 through 9, and each row, column, and 3x3 block containing one copy of
/// every numeral.
#[derive(Clone, Copy, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[wasm_bindgen]
pub struct SolvedGrid([Num; 81]);

impl SolvedGrid {
  /// Makes a SolvedGrid from a Grid.
  ///
  /// # Safety
  ///
  /// Callers must ensure that the Grid's state is Solved.
  pub unsafe fn new(grid: &Grid) -> SolvedGrid {
    // Note we use the fact that Option<Num> and Num have the same single-byte
    // representation when there is actually a Num present.
    let p = (&grid.0).as_ptr() as *const [Num; 81];
    SolvedGrid(*p)
  }
}

#[wasm_bindgen]
impl SolvedGrid {
  /// Converts back to Grid.  This always works.
  pub fn grid(&self) -> Grid {
    unsafe {
      // Safe because Num always converts cleanly to Option<Num>.
      let p = (&self.0).as_ptr() as *const [Option<Num>; 81];
      Grid(*p)
    }
  }

  /// Converts to a Uint8Array.
  pub fn bytes(&self) -> Box<[u8]> {
    self.grid().bytes()
  }

  /// Index wrapper for wasm.
  pub fn get(&self, loc: Loc) -> Num {
    self[loc]
  }
}

impl From<&SolvedGrid> for Grid {
  fn from(value: &SolvedGrid) -> Grid {
    value.grid()
  }
}

impl TryFrom<&Grid> for SolvedGrid {
  type Error = &'static str;

  fn try_from(value: &Grid) -> Result<Self, Self::Error> {
    value.solved_grid().ok_or("Grid is not solved")
  }
}

impl Index<Loc> for SolvedGrid {
  type Output = Num;

  /// Allows `SolvedGrid`s to be indexed by `Loc`s.
  fn index(&self, loc: Loc) -> &Num {
    unsafe {
      // Safe because `loc.index()` is in 0..81.
      self.0.get_unchecked(loc.index())
    }
  }
}

impl<I> Index<I> for SolvedGrid
where
  I: std::slice::SliceIndex<[Num]>,
{
  type Output = I::Output;

  /// You can slice a solved grid.
  fn index(&self, index: I) -> &Self::Output {
    &self.0[index]
  }
}

impl fmt::Display for SolvedGrid {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    fmt::Display::fmt(&self.grid(), f)
  }
}

impl fmt::Debug for SolvedGrid {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    fmt::Debug::fmt(&self.grid(), f)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::str::FromStr;

  #[test]
  /// Ensures that Option<Num> occupies a single byte.
  fn sized_correctly() {
    use std::mem::size_of;
    assert_eq!(size_of::<Grid>(), Loc::COUNT);
    // Just to validate that size_of works as expected:
    assert_eq!(size_of::<Option<Loc>>(), 2);
  }

  #[test]
  fn clear() {
    let mut grid = Grid::new();
    assert_eq!(grid.len(), 0);
    grid[L55] = Some(N5);
    assert_eq!(grid.len(), 1);
    let grid2 = grid;
    grid.clear();
    assert_eq!(grid.len(), 0);
    assert_eq!(grid2.len(), 1);
  }

  #[test]
  fn order_and_equality() {
    let mut g1 = Grid::new();
    let mut g2 = Grid::new();
    assert_eq!(g1, g2);

    g1[L12] = Some(N5);
    g2[L12] = Some(N1);
    assert!(g2 < g1);
    assert!(g1 > g2);

    g2[L11] = Some(N2);
    assert!(g2 > g1);
    assert!(g1 < g2);

    g1 = g2;
    assert_eq!(g1, g2);
    assert_eq!(g2.len(), 2);
  }

  #[test]
  fn strings() {
    let s = ".1..5..8.4.89.62.1..6...7....5.3.9.....8.7.....1.4.3....4...1..2.93.16.7.7..6..2.";
    let g = s.parse::<Grid>().unwrap();
    assert_eq!(s, g.to_string());
    assert_eq!(s, format!("{}", g));
    let s2 = format!("{:?}", g);
    assert_ne!(s2, s);
    assert_eq!(
      s2, // Note: not a formatting oversight!
      r"
. 1 . | . 5 . | . 8 .
4 . 8 | 9 . 6 | 2 . 1
. . 6 | . . . | 7 . .
- - - + - - - + - - -
. . 5 | . 3 . | 9 . .
. . . | 8 . 7 | . . .
. . 1 | . 4 . | 3 . .
- - - + - - - + - - -
. . 4 | . . . | 1 . .
2 . 9 | 3 . 1 | 6 . 7
. 7 . | . 6 . | . 2 ."[1..]
    );
    let g2 = s2.parse::<Grid>().unwrap();
    assert_eq!(g, g2);
  }

  #[test]
  fn state() {
    let g = Grid::from_str(
      r"
            . . . | 8 . 9 | . . 6
            . 2 3 | . . . | . . .
            . . . | 6 . 8 | . . .
            - - - + - - - + - - -
            7 . . | . . 1 | . . 2
            . . . | 4 5 . | . . 9
            . . . | . . . | 6 . .
            - - - + - - - + - - -
            . . . | . 7 . | . . .
            . . 1 | . 4 6 | . . .
            . . 3 | . . . | . . .",
    )
    .unwrap();
    assert_eq!(
      GridState::Broken(L14.as_set() | L36.as_set() | L23.as_set() | L93.as_set()),
      g.state()
    );
    let g = Grid::from_str(
      r"
            . . . | 8 . 9 | . . 6
            . 2 3 | . . . | . . .
            . . . | 6 . 5 | . . .
            - - - + - - - + - - -
            7 . . | . . 1 | . . 2
            . . . | 4 5 . | . . 9
            . . . | . . . | 6 . .
            - - - + - - - + - - -
            . . . | . 7 . | . . .
            . . 1 | . 4 6 | . . .
            . . 4 | . . . | . . .",
    )
    .unwrap();
    assert_eq!(GridState::Incomplete, g.state());
    let g = Grid::from_str(
      "123456789456789123789123456234567891567891234891234567345678912678912345912345678",
    )
    .unwrap();
    assert_eq!(GridState::Solved(&g), g.state());
  }
}
