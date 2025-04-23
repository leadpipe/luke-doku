//! Functions to permute a Sudoku grid into a different but equivalent one.

use std::{
  cmp::Ordering::*,
  fmt::{Debug, Display},
  mem::size_of,
  ops::Index,
};

use once_cell::sync::Lazy;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{
  core::{bits::*, *},
  random::*,
};

/// Describes a validity-preserving transformation of a Sudoku grid.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(C)]
pub struct GridPermutation {
  pub nums: NumPermutation,
  pub locs: LocPermutation,
}

const PERM_SIZE: usize = size_of::<GridPermutation>();

/// How we represent a grid permutation in JavaScript.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(C)]
#[wasm_bindgen]
pub struct ExternalGridPermutation([i8; PERM_SIZE]);

impl GridPermutation {
  /// Makes a random Sudoku permutation from the given Random.
  pub fn random<R: Rng>(random: &mut R) -> Self {
    Self {
      nums: NumPermutation::random(random),
      locs: LocPermutation::random(random),
    }
  }

  /// Converts to the external representation.
  pub fn external(&self) -> &ExternalGridPermutation {
    unsafe {
      let p: *const Self = self;
      &*(p as *const ExternalGridPermutation)
    }
  }

  /// Applies this permutation to the given grid.
  pub fn apply(&self, grid: &Grid) -> Grid {
    let mut answer = Grid::new();
    for loc in Loc::all() {
      if let Some(num) = grid[loc] {
        answer[self.locs.apply(loc)] = Some(self.nums.apply(num));
      }
    }
    answer
  }

  /// Applies this permutation to the given grid, altering its contents.
  pub fn apply_in_place(&self, grid: &mut Grid) {
    *grid = self.apply(grid);
  }

  /// Applies this permutation to a solved grid.
  pub fn apply_to_solved(&self, grid: &SolvedGrid) -> SolvedGrid {
    unsafe {
      // Safe because the result of the permutation must also be solved.
      SolvedGrid::new(&self.apply(&grid.grid()))
    }
  }

  /// Applies this permutation to the given solved grid, altering its
  /// contents.
  pub fn apply_to_solved_in_place(&self, grid: &mut SolvedGrid) {
    *grid = self.apply_to_solved(grid);
  }

  /// Finds a permutation that transforms the given grid to the smallest
  /// member of its equivalence class.  This can be used to tell whether two
  /// grids are equivalent.
  ///
  /// Some grids are symmetrical enough to have more than one such
  /// permutation.  This function will return an arbitrary one of them in that
  /// case.
  ///
  /// Also returns the minimal grid and the number of minimizing permutations.
  pub fn minimizing(grid: &SolvedGrid) -> (Self, SolvedGrid, usize) {
    let partials = band_minimizing(grid);
    let mut num_total = 1;
    let (answer, min) = partials
      .into_iter()
      .map(|perm| grid_minimizing(perm, grid))
      .min_by(|(_, g1), (_, g2)| {
        let ordering = g1.cmp(g2);
        match ordering {
          Less => {}
          Equal => num_total += 1,
          Greater => num_total = 1,
        }
        ordering
      })
      .unwrap();
    (answer, min, num_total)
  }
}

/// Implemented by types that can belong to a simple permutation array.
pub trait Permutable<const COUNT: usize>
where
  Self: Copy + Eq,
{
  /// The number of distinct values of this type.
  const COUNT: usize = COUNT;

  /// Returns all the distinct values of this type in an array, where the item
  /// at index i satisfies `identity()[i].index() == i`.
  fn identity() -> [Self; COUNT];

  /// Converts from an index to the corresponding value.
  ///
  /// # Safety
  ///
  /// Callers must ensure the index is in 0..COUNT.
  unsafe fn from_index_unchecked(i: usize) -> Self;

  /// Returns the index of this value within `identity()`.
  fn index(self) -> usize;

  /// Returns the ID of this value as an int, for use in FullPermutation's
  /// Display implementation.
  fn id(self) -> i32;

  /// Constructs a Permutable from its ID, for use in the cycle macro.
  fn from_id(id: i32) -> Option<Self>;
}

/// Implements Permutable for a given type, which must have $type::COUNT,
/// $type::index(), and $type::all() defined.
macro_rules! impl_permutable {
  ($type:ty) => {
    impl Permutable<{ <$type>::COUNT }> for $type {
      fn identity() -> [Self; <$type>::COUNT] {
        unsafe {
          let mut answer = [Self::from_index_unchecked(0); <$type>::COUNT];
          for i in 1..<$type>::COUNT {
            answer[i] = <$type>::from_index_unchecked(i);
          }
          answer
        }
      }
      unsafe fn from_index_unchecked(i: usize) -> Self {
        <$type>::from_index_unchecked(i)
      }
      fn index(self) -> usize {
        <$type>::index(self)
      }

      fn id(self) -> i32 {
        <$type>::get(self) as _
      }

      fn from_id(id: i32) -> Option<Self> {
        <$type>::new(id as _)
      }
    }
  };
}

impl_permutable!(Num);
impl_permutable!(Band);
impl_permutable!(BlkLine);

/// A permutation of all the values of a permutable type: maps every value to a
/// possibly different one.
#[derive(Clone, Copy, Eq, Hash, PartialEq)]
#[repr(C)]
pub struct FullPermutation<T, const N: usize>([T; N])
where
  T: Permutable<N>;

impl<T, const N: usize> FullPermutation<T, N>
where
  T: Permutable<N>,
{
  /// Ensures that the given array is a permutation, and absorbs it into a new
  /// FullPermutation (or returns None).
  pub fn new(array: [T; N]) -> Option<Self> {
    let mut seen = [false; N];
    for item in array {
      let j = item.index();
      if seen[j] {
        return None;
      }
      seen[j] = true;
    }
    Some(Self(array))
  }

  /// Makes a new random permutation.
  pub fn random<R: Rng>(random: &mut R) -> Self {
    let mut array = T::identity();
    array.shuffle(random);
    Self(array)
  }

  /// Applies this permutation to a given value.
  pub fn apply(&self, value: T) -> T {
    self.0[value.index()]
  }
}

impl<I, T, const N: usize> Index<I> for FullPermutation<T, N>
where
  I: std::slice::SliceIndex<[T]>,
  T: Permutable<N>,
{
  type Output = I::Output;

  fn index(&self, index: I) -> &Self::Output {
    &self.0[index]
  }
}

impl<T, const N: usize> std::fmt::Display for FullPermutation<T, N>
where
  T: Permutable<N>,
{
  /// Displays the permutation as a product of disjoint cycles.  Each cycle is
  /// shown as a list of IDs enclosed in parentheses.  When there are more
  /// than one cycle, they are printed consecutively.  The identity
  /// permutation, which has no cycles, is displayed as an empty pair of
  /// parentheses.
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    let mut seen = [false; N];
    let mut printed = false;
    for i in 0..N {
      if seen[i] {
        continue;
      }
      seen[i] = true;
      let mut next = self.0[i];
      if next.index() == i {
        continue;
      }
      // Safe because i is in 0..N
      let start = unsafe { T::from_index_unchecked(i) };
      write!(f, "({}", start.id())?;
      while next.index() != i {
        let j = next.index();
        assert!(!seen[j]); // Won't assert because this must be a valid permutation.
        seen[j] = true;
        write!(f, " {}", next.id())?;
        next = self.0[j];
      }
      write!(f, ")")?;
      printed = true;
    }
    if !printed {
      // If there are no cycles, print empty parens.
      write!(f, "()")?
    }
    Ok(())
  }
}

impl<T, const N: usize> Debug for FullPermutation<T, N>
where
  T: Permutable<N>,
{
  /// The debug form is the same as the normal display.
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    Display::fmt(&self, f)
  }
}

/// A type that implements this trait is an algebraic group.
pub trait GroupElement
where
  Self: Eq + Sized,
{
  /// The group operation.  Combines two elements to produce a third.
  fn composed_with(&self, other: &Self) -> Self;

  /// The group identity.  `g.composed_with(identity()) == g ==
  /// identity.composed_with(g)` for all `g` in the group.
  fn identity() -> Self;

  /// The group inverse.  `g.composed_with(g.inverse()) == identity() ==
  /// g.inverse().inverse()` for all `g` in the group.
  fn inverse(&self) -> Self;

  /// Composes self with other in place.
  fn compose(&mut self, other: &Self) {
    *self = self.composed_with(other);
  }

  /// Inverts self in place.
  fn invert(&mut self) {
    *self = self.inverse();
  }
}

impl<T, const N: usize> GroupElement for FullPermutation<T, N>
where
  T: Permutable<N>,
{
  fn composed_with(&self, other: &Self) -> Self {
    let mut answer = *self;
    for value in answer.0.iter_mut() {
      *value = other.apply(*value);
    }
    answer
  }
  fn identity() -> Self {
    Self(T::identity())
  }
  fn inverse(&self) -> Self {
    let mut answer = Self::identity();
    for index in 0..N {
      // Safe because index is within the permitted range.
      let value = unsafe { T::from_index_unchecked(index) };
      answer.0[self.0[index].index()] = value;
    }
    answer
  }
}

/// Creates a permutation of the given type consisting of a cycle, meaning that
/// the permutation will convert each element listed as an argument into the
/// following argument, with the final element yielding the first.
///
/// The two forms of the macro are (using `Num` as the example element type):
///
/// - `cycle!(Num)`
///   - This is just shorthand for `FullPermutation<Num,
///     {Num::COUNT}>::identity()`.
/// - `cycle!(Num; 1, 2, 7)
///   - This creates a full permutation of the given type, with the given
///     elements forming the indicated cycle, and all other elements being
///     stationary.
///
/// # Panics
///
/// The macro panics if any number that appears as an argument doesn't produce a
/// valid element via the `from_id()` method.  It also panics if the same
/// element appears more than once in the argument list.
///
/// # Examples
///
/// ```
/// # use luke_doku::{core::Num, cycle, permute::*};
/// assert_eq!(cycle!(Num; 1, 2, 3).apply(Num::new(1).unwrap()), Num::new(2).unwrap());
/// assert_eq!(cycle!(Num; 1, 2, 3).apply(Num::new(3).unwrap()), Num::new(1).unwrap());
/// ```
#[macro_export]
macro_rules! cycle {
    ($type:ty) => {
        <FullPermutation<$type, {<$type>::COUNT}>>::identity()
    };
    ($type:ty; $v1:expr, $($value:expr),+) => {
        {
            let mut array = <$type>::identity();
            let first = <$type>::new($v1).unwrap();
            let mut _prev = first;
            let mut _next;
            $(
                _next = <$type>::new($value).unwrap();
                array[_prev.index()] = _next;
                _prev = _next;
            )*
            array[_next.index()] = first;
            FullPermutation::new(array).unwrap()
        }
    };
}

/// A permutation of numerals.
pub type NumPermutation = FullPermutation<Num, 9>;
/// A permutation of block-lines.
pub type BlkLinePermutation = FullPermutation<BlkLine, 3>;
/// A permutation of bands.
pub type BandPermutation = FullPermutation<Band, 3>;

/// A permutation of Sudoku locations that preserves the validity of the grid.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
#[repr(C)]
pub struct LocPermutation {
  pub transpose: bool,
  pub row_bands: BandPermutation,
  pub col_bands: BandPermutation,
  pub rows_in_bands: [BlkLinePermutation; 3],
  pub cols_in_bands: [BlkLinePermutation; 3],
}

impl LocPermutation {
  pub fn random<R: Rng>(random: &mut R) -> Self {
    Self {
      transpose: random.random(),
      row_bands: BandPermutation::random(random),
      col_bands: BandPermutation::random(random),
      rows_in_bands: [
        BlkLinePermutation::random(random),
        BlkLinePermutation::random(random),
        BlkLinePermutation::random(random),
      ],
      cols_in_bands: [
        BlkLinePermutation::random(random),
        BlkLinePermutation::random(random),
        BlkLinePermutation::random(random),
      ],
    }
  }

  /// Applies this permutation to the given location.
  pub fn apply(&self, mut loc: Loc) -> Loc {
    if self.transpose {
      loc = loc.t();
    }
    loc = loc.with_row_band(self.row_bands.apply(loc.row_band()));
    loc = loc.with_col_band(self.col_bands.apply(loc.col_band()));
    loc = loc.with_blk_row(
      unsafe {
        // Safe because bands are in 0..3
        self.rows_in_bands.get_unchecked(loc.row_band().index())
      }
      .apply(loc.blk_row()),
    );
    loc = loc.with_blk_col(
      unsafe {
        // Safe because bands are in 0..3
        self.cols_in_bands.get_unchecked(loc.col_band().index())
      }
      .apply(loc.blk_col()),
    );
    loc
  }

  fn swap_rows_and_cols(&mut self) {
    let t = self.row_bands;
    self.row_bands = self.col_bands;
    self.col_bands = t;

    let t = self.rows_in_bands;
    self.rows_in_bands = self.cols_in_bands;
    self.cols_in_bands = t;
  }
}

impl GroupElement for LocPermutation {
  fn composed_with(&self, other: &Self) -> Self {
    let mut answer = *self;
    answer.transpose ^= other.transpose;
    if other.transpose {
      answer.swap_rows_and_cols();
    }
    answer.row_bands.compose(&other.row_bands);
    answer.col_bands.compose(&other.col_bands);
    let rows_in_bands = answer.rows_in_bands;
    let cols_in_bands = answer.cols_in_bands;
    for band in Band::all() {
      let i = band.index();
      let j = other.row_bands.apply(band).index();
      answer.rows_in_bands[j] = rows_in_bands[i].composed_with(&other.rows_in_bands[j]);
      let j = other.col_bands.apply(band).index();
      answer.cols_in_bands[j] = cols_in_bands[i].composed_with(&other.cols_in_bands[j]);
    }
    answer
  }

  fn identity() -> Self {
    Self {
      transpose: false,
      row_bands: BandPermutation::identity(),
      col_bands: BandPermutation::identity(),
      rows_in_bands: [
        BlkLinePermutation::identity(),
        BlkLinePermutation::identity(),
        BlkLinePermutation::identity(),
      ],
      cols_in_bands: [
        BlkLinePermutation::identity(),
        BlkLinePermutation::identity(),
        BlkLinePermutation::identity(),
      ],
    }
  }

  /// Returns the permutation that undoes this permutation.  That is,
  /// `self.composed_with(self.inverse()) == Self::identity()`.
  fn inverse(&self) -> Self {
    let mut answer = *self;
    let mut src = *self;
    if src.transpose {
      src.swap_rows_and_cols();
    }
    answer.row_bands = src.row_bands.inverse();
    answer.col_bands = src.col_bands.inverse();
    for band in Band::all() {
      let i = answer.row_bands.apply(band).index();
      answer.rows_in_bands[i] = src.rows_in_bands[band.index()].inverse();
      let i = answer.col_bands.apply(band).index();
      answer.cols_in_bands[i] = src.cols_in_bands[band.index()].inverse();
    }
    answer
  }
}

impl GroupElement for GridPermutation {
  /// Combines this permutation with another one.  Applying the result to a
  /// grid produces the same grid that would result from applying the other
  /// permutation to the result of applying this one to the input grid.
  fn composed_with(&self, other: &Self) -> Self {
    let mut answer = *self;
    answer.nums.compose(&other.nums);
    answer.locs.compose(&other.locs);
    answer
  }

  /// Returns the permutation that has no effect.
  fn identity() -> Self {
    Self {
      nums: NumPermutation::identity(),
      locs: LocPermutation::identity(),
    }
  }

  /// Returns the permutation that undoes this permutation.  That is,
  /// `self.composed_with(self.inverse()) == Self::identity()`.
  fn inverse(&self) -> Self {
    let mut answer = *self;
    answer.nums.invert();
    answer.locs.invert();
    answer
  }
}

static BAND_PERMS: Lazy<[BandPermutation; 3]> =
  Lazy::new(|| [cycle!(Band), cycle!(Band; 0, 1), cycle!(Band; 0, 2)]);
static LINE_PERMS: Lazy<[BlkLinePermutation; 6]> = Lazy::new(|| {
  [
    cycle!(BlkLine),
    cycle!(BlkLine; 0, 1),
    cycle!(BlkLine; 1, 2),
    cycle!(BlkLine; 2, 0),
    cycle!(BlkLine; 0, 1, 2),
    cycle!(BlkLine; 2, 1, 0),
  ]
});
/// We fix the first row as 1 through 9, and the first two cells of the second
/// row as 4 and 5.
const BAND_PREFIX_LENGTH: usize = 9 + 2;
/// So we use a buffer for just the rest of the first row-band to find the
/// minimal band.
const BAND_SUFFIX_LENGTH: usize = 27 - BAND_PREFIX_LENGTH;
type BandSuffix = [Num; BAND_SUFFIX_LENGTH];
const SUFFIX_LOCS: LocSet = LocSet(Bits3x27::const_new([
  Bits27::from_backing_int(0o_777_774_000),
  Bits27::ZERO,
  Bits27::ZERO,
]));

/// Looks for permutations that minimize the various bands (row- and
/// column-bands).  The resulting permutations (there can be more than one) all
/// result in the smallest possible first row-band.  They will be partial,
/// though, in that the other two row-bands are likely not to be minimal.
fn band_minimizing(grid: &SolvedGrid) -> Vec<GridPermutation> {
  let mut answer = vec![];
  let mut suffix: BandSuffix = [N9; BAND_SUFFIX_LENGTH];
  for &transpose in &[false, true] {
    for row_bands in *BAND_PERMS {
      for col_bands in *BAND_PERMS {
        for rows in *LINE_PERMS {
          for cols in *LINE_PERMS {
            // We check 648 (2 * 3 * 3 * 6 * 6) permutations, tweaking each to achieve
            // its smallest possible first row-band.

            // `transpose`, `row_bands`, and `col_bands` work to move each block to the
            // top left of the grid, from both orientations (transposed and not).
            // `rows` and `cols` try every permutation of rows and columns within the
            // top left block.
            let mut locs = LocPermutation {
              transpose,
              row_bands,
              col_bands,
              rows_in_bands: [rows, cycle!(BlkLine), cycle!(BlkLine)],
              cols_in_bands: [cols, cycle!(BlkLine), cycle!(BlkLine)],
            };

            add_band_minimizing(grid, &mut locs, &mut suffix, &mut answer);
          }
        }
      }
    }
  }
  answer
}

/// Tweaks the location permutation to see if it can produce a permutation for
/// the given grid where the first row-band's suffix is as small as or smaller
/// than any seen before.  If so, adds it to the list.
fn add_band_minimizing(
  grid: &SolvedGrid,
  locs: &mut LocPermutation,
  suffix: &mut BandSuffix,
  list: &mut Vec<GridPermutation>,
) {
  let inv_locs = locs.inverse();
  // We treat block 1 (top left) as fixed.  The first two cells of the second
  // row must end up with numerals 4 and 5.  If that's not possible with this
  // loc permutation, we'll give up on it and try another one.  (It's always
  // possible for at least 216 of the 648 perms we try -- at least 1 of the 3
  // possible pairs of numerals in this second row of block 1 must both appear in
  // the same block of the first row.)
  let mut r1_locs_by_num = [L11; 9];
  let mut add_r1_loc = |loc| r1_locs_by_num[grid[inv_locs.apply(loc)].index()] = loc;
  add_r1_loc(L14);
  add_r1_loc(L15);
  add_r1_loc(L16);
  add_r1_loc(L17);
  add_r1_loc(L18);
  add_r1_loc(L19);
  // Given a block 1 location, returns the row 1 location that contains the same
  // numeral.
  let b1_r1_loc = |loc| r1_locs_by_num[grid[inv_locs.apply(loc)].index()];

  // r1_locXX is the location within row 1 of the numeral at location XX.
  let r1_loc21 = b1_r1_loc(L21);
  let r1_loc22 = b1_r1_loc(L22);
  // If they aren't in the same block, it's not possible.  Get out.
  if r1_loc21.blk() != r1_loc22.blk() {
    return;
  }
  // If the suffix already starts with 6 (the lowest possible numeral), and the
  // numeral in L23 isn't in the same R1 block as the ones in L21 and L22, then
  // this permutation could not be minimal, so get out.
  let r1_loc23 = b1_r1_loc(L23);
  if suffix[0] == N6 && r1_loc23.blk() != r1_loc21.blk() {
    return;
  }

  // Tweak the permutation to get r1_loc21 and r1_loc22 into L14 and L15.
  if r1_loc21.blk().get() == 2 {
    locs.compose(&LocPermutation {
      col_bands: cycle!(Band; 1, 2),
      ..LocPermutation::identity()
    });
  }
  locs.cols_in_bands[1] = tweak_lines(r1_loc21.blk_col(), r1_loc22.blk_col());

  // And tweak it some more to get B3's columns lined up right.
  let r1_loc31 = b1_r1_loc(L31);
  let r1_loc32 = b1_r1_loc(L32);
  if r1_loc23.blk() == r1_loc21.blk() {
    // The 3 numerals in B3 of R1 are the same as the ones in R3 of B1.
    // Rearrange so the ones in R1 are in the same order as the ones in B1.
    locs.cols_in_bands[2] = tweak_lines(r1_loc31.blk_col(), r1_loc32.blk_col())
  } else {
    // The numeral in L23 appears in B3 of R1.  Make sure it's in L17, and
    // get the others from R3 in the same order in L18 and L19.
    let r1_loc = if r1_loc31.blk() == r1_loc21.blk() {
      r1_loc32
    } else {
      r1_loc31
    };
    locs.cols_in_bands[2] = tweak_lines(r1_loc23.blk_col(), r1_loc.blk_col())
  }

  // Now set up the num permutation, and see if this one is small enough to go in
  // the list.
  let inv_locs = locs.inverse();
  let inv_nums: Vec<Num> = R1
    .locs()
    .iter()
    .map(|loc| grid[inv_locs.apply(loc)])
    .collect();
  let inv_nums = FullPermutation(inv_nums.try_into().unwrap());
  let nums = inv_nums.inverse();
  let mut best = false;
  for (pnum, loc) in suffix.iter_mut().zip(SUFFIX_LOCS.iter()) {
    let num = nums.apply(grid[inv_locs.apply(loc)]);
    if !best {
      match num.cmp(pnum) {
        Greater => {
          // This permutation doesn't match or beat the best we've seen so far.  Get out.
          return;
        }
        Equal => {} // Still on track
        Less => {
          // Whoops, we're the best so far
          best = true;
          list.clear();
        }
      }
    }
    if best {
      *pnum = num;
    }
  }
  list.push(GridPermutation { nums, locs: *locs });
}

/// Returns a block-line permutation that puts `loc1` into the first line of
/// the block and `loc2` into the second line.
fn tweak_lines(bl1: BlkLine, bl2: BlkLine) -> BlkLinePermutation {
  let mut lines;
  if bl1.get() == 0 {
    lines = cycle!(BlkLine);
  } else {
    lines = cycle!(BlkLine; bl1.get(), 0);
  }
  if lines.apply(bl2).get() == 2 {
    lines.compose(&cycle!(BlkLine; 2, 1));
  }
  lines
}

/// Tweaks a partial permutation returned by `band_minimizing` to minimize the
/// other two row-bands too.
fn grid_minimizing(mut perm: GridPermutation, grid: &SolvedGrid) -> (GridPermutation, SolvedGrid) {
  let min = perm.apply_to_solved(grid);
  let mut rows: Vec<(Band, &[Num], Row)> = Row::all()
    .skip(3)
    .map(|row| {
      (
        row.band(),
        &min[(row.index() * 9)..(row.index() * 9 + 9)],
        row,
      )
    })
    .collect();
  rows.sort_unstable();

  // Tweak the rows in the 2nd and 3rd bands.
  perm.locs.rows_in_bands[1] = tweak_lines(rows[0].2.blk_row(), rows[1].2.blk_row());
  perm.locs.rows_in_bands[2] = tweak_lines(rows[3].2.blk_row(), rows[4].2.blk_row());

  // Then, if the smallest row ended up in the last band, swap the 2nd and 3rd
  // bands.
  if rows[0].1 > rows[3].1 {
    perm.locs.compose(&LocPermutation {
      row_bands: cycle!(Band; 1, 2),
      ..LocPermutation::identity()
    })
  }
  (perm, perm.apply_to_solved(grid))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::str::FromStr;

  fn symmetric_grid() -> Grid {
    grid(
      r"
            1 2 3 | 4 5 6 | 7 8 9
            4 5 6 | 7 8 9 | 1 2 3
            7 8 9 | 1 2 3 | 4 5 6
            - - - + - - - + - - -
            2 3 4 | 5 6 7 | 8 9 1
            5 6 7 | 8 9 1 | 2 3 4
            8 9 1 | 2 3 4 | 5 6 7
            - - - + - - - + - - -
            3 4 5 | 6 7 8 | 9 1 2
            6 7 8 | 9 1 2 | 3 4 5
            9 1 2 | 3 4 5 | 6 7 8",
    )
  }

  fn asymmetric_grid() -> Grid {
    grid(
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
            9 6 7 | 8 3 5 | 2 1 4",
    )
  }

  fn grid(s: &str) -> Grid {
    Grid::from_str(s).unwrap()
  }

  #[test]
  fn test_identity() {
    let g = symmetric_grid();
    assert_eq!(GridPermutation::identity().apply(&g), g);
  }

  #[test]
  fn test_random() {
    let mut random = new_random("test");
    let p = GridPermutation::random(&mut random);
    assert_eq!(
      p,
      GridPermutation {
        nums: cycle!(Num; 1, 7, 5, 6, 8, 4, 2, 9),
        locs: LocPermutation {
          transpose: false,
          row_bands: cycle!(Band; 0, 1, 2),
          col_bands: cycle!(Band; 0, 2, 1),
          rows_in_bands: [
            cycle!(BlkLine; 0, 2, 1),
            cycle!(BlkLine; 0, 2),
            cycle!(BlkLine; 0, 1, 2),
          ],
          cols_in_bands: [
            cycle!(BlkLine; 1, 2),
            cycle!(BlkLine; 0, 1, 2),
            cycle!(BlkLine; 1, 2),
          ],
        }
      }
    );
  }

  #[test]
  fn test_apply() {
    let g = symmetric_grid();
    let mut p = GridPermutation::identity();
    // Swap 1 and 2
    p.nums = cycle!(Num; 1, 2);
    assert_eq!(
      p.apply(&g),
      grid(
        r"
        2 1 3 | 4 5 6 | 7 8 9
        4 5 6 | 7 8 9 | 2 1 3
        7 8 9 | 2 1 3 | 4 5 6
        - - - + - - - + - - -
        1 3 4 | 5 6 7 | 8 9 2
        5 6 7 | 8 9 2 | 1 3 4
        8 9 2 | 1 3 4 | 5 6 7
        - - - + - - - + - - -
        3 4 5 | 6 7 8 | 9 2 1
        6 7 8 | 9 2 1 | 3 4 5
        9 2 1 | 3 4 5 | 6 7 8"
      )
    );

    p = GridPermutation::identity();
    p.locs.transpose = true;
    assert_eq!(
      p.apply(&g),
      grid(
        r"
        1 4 7 | 2 5 8 | 3 6 9
        2 5 8 | 3 6 9 | 4 7 1
        3 6 9 | 4 7 1 | 5 8 2
        - - - + - - - + - - -
        4 7 1 | 5 8 2 | 6 9 3
        5 8 2 | 6 9 3 | 7 1 4
        6 9 3 | 7 1 4 | 8 2 5
        - - - + - - - + - - -
        7 1 4 | 8 2 5 | 9 3 6
        8 2 5 | 9 3 6 | 1 4 7
        9 3 6 | 1 4 7 | 2 5 8"
      )
    );

    p = GridPermutation::identity();
    p.locs.row_bands = cycle!(Band; 0, 1);
    p.locs.col_bands = cycle!(Band; 1, 2);
    assert_eq!(
      p.apply(&g),
      grid(
        r"
        2 3 4 | 8 9 1 | 5 6 7
        5 6 7 | 2 3 4 | 8 9 1
        8 9 1 | 5 6 7 | 2 3 4
        - - - + - - - + - - -
        1 2 3 | 7 8 9 | 4 5 6
        4 5 6 | 1 2 3 | 7 8 9
        7 8 9 | 4 5 6 | 1 2 3
        - - - + - - - + - - -
        3 4 5 | 9 1 2 | 6 7 8
        6 7 8 | 3 4 5 | 9 1 2
        9 1 2 | 6 7 8 | 3 4 5"
      )
    );

    p = GridPermutation::identity();
    p.locs.rows_in_bands[0] = cycle!(BlkLine; 0, 1);
    p.locs.cols_in_bands[2] = cycle!(BlkLine; 0, 2, 1);
    assert_eq!(
      p.apply(&g),
      grid(
        r"
        4 5 6 | 7 8 9 | 2 3 1
        1 2 3 | 4 5 6 | 8 9 7
        7 8 9 | 1 2 3 | 5 6 4
        - - - + - - - + - - -
        2 3 4 | 5 6 7 | 9 1 8
        5 6 7 | 8 9 1 | 3 4 2
        8 9 1 | 2 3 4 | 6 7 5
        - - - + - - - + - - -
        3 4 5 | 6 7 8 | 1 2 9
        6 7 8 | 9 1 2 | 4 5 3
        9 1 2 | 3 4 5 | 7 8 6"
      )
    );
  }

  #[test]
  fn test_compose() {
    let mut random = new_random("test");
    let g = asymmetric_grid();
    assert_eq!(GridState::Solved(&g), g.state());
    for _i in 0..100 {
      let p1 = GridPermutation::random(&mut random);
      let p2 = GridPermutation::random(&mut random);
      let p12 = p1.composed_with(&p2);
      let p21 = p2.composed_with(&p1);
      assert_ne!(p12, p21);
      let g12 = p12.apply(&g);
      assert_ne!(g, g12);
      assert_eq!(GridState::Solved(&g12), g12.state());
      assert_eq!(g12, p2.apply(&p1.apply(&g)));
      let g21 = p21.apply(&g);
      assert_ne!(g, g21);
      assert_eq!(GridState::Solved(&g21), g21.state());
      assert_eq!(g21, p1.apply(&p2.apply(&g)));
      assert_ne!(g12, g21);
    }
  }

  #[test]
  fn test_inverse() {
    let mut random = new_random("test");
    let g = asymmetric_grid();
    for _i in 0..100 {
      let p = GridPermutation::random(&mut random);
      let i = p.inverse();
      assert_eq!(p, i.inverse());

      assert_eq!(p.composed_with(&i), GridPermutation::identity());
      assert_eq!(i.composed_with(&p), GridPermutation::identity());

      assert_eq!(g, p.apply(&i.apply(&g)));
      assert_eq!(g, i.apply(&p.apply(&g)));
    }
  }

  #[test]
  fn test_locs_inverse() {
    let p = LocPermutation {
      transpose: true,
      rows_in_bands: [
        cycle!(BlkLine; 0, 1, 2),
        cycle!(BlkLine; 0, 2),
        cycle!(BlkLine; 0, 1),
      ],
      row_bands: cycle!(Band; 0, 1, 2),
      cols_in_bands: [
        cycle!(BlkLine; 0, 2),
        cycle!(BlkLine),
        cycle!(BlkLine; 0, 2, 1),
      ],
      col_bands: cycle!(Band; 0, 2),
    };
    let i = LocPermutation {
      transpose: true,
      rows_in_bands: [
        cycle!(BlkLine; 0, 1, 2),
        cycle!(BlkLine),
        cycle!(BlkLine; 0, 2),
      ],
      row_bands: cycle!(Band; 0, 2),
      cols_in_bands: [
        cycle!(BlkLine; 0, 2),
        cycle!(BlkLine; 0, 1),
        cycle!(BlkLine; 0, 2, 1),
      ],
      col_bands: cycle!(Band; 0, 2, 1),
    };
    assert_eq!(i, p.inverse());
    assert_eq!(p, i.inverse());
    assert_eq!(LocPermutation::identity(), p.composed_with(&i));
    assert_eq!(LocPermutation::identity(), i.composed_with(&p));
  }

  #[test]
  fn test_cycle() {
    let c1 = cycle!(Num; 1, 3, 2);
    assert_eq!(c1.inverse(), cycle!(Num; 1, 2, 3));
    let c2 = cycle!(Num; 2, 4);
    assert_eq!(c2, c2.inverse());
    assert_eq!(c1.composed_with(&c2), cycle!(Num; 1, 3, 4, 2));
    assert_eq!(c2.composed_with(&c1), cycle!(Num; 2, 4, 1, 3));

    assert_eq!("(1 3 2)", format!("{}", cycle!(Num; 3, 2, 1)));
    assert_eq!(
      "(1 2 3)(4 5)(6 7 8 9)",
      format!(
        "{}",
        cycle!(Num; 9, 6, 7, 8)
          .composed_with(&cycle!(Num; 3, 1, 2).composed_with(&cycle!(Num; 5, 4)))
      )
    );
    assert_eq!("()", format!("{:?}", cycle!(Band)));
  }

  #[test]
  #[should_panic]
  fn test_cycle_panic_illegal_element() {
    cycle!(Band; 1, 2, 3);
  }

  #[test]
  #[should_panic]
  fn test_cycle_panic_duplicate_element() {
    cycle!(Band; 1, 2, 1);
  }

  #[test]
  fn test_minimizing() {
    fn test(grid: &Grid, perm: GridPermutation, min: &Grid, count: usize) {
      let solved = SolvedGrid::try_from(grid).unwrap();
      let actual = GridPermutation::minimizing(&solved);
      assert_eq!((perm, SolvedGrid::try_from(min).unwrap(), count), actual);
    }
    test(
      &symmetric_grid(),
      GridPermutation::identity(),
      &symmetric_grid(),
      54,
    );
    test(
      &asymmetric_grid(),
      GridPermutation {
        nums: cycle!(Num; 1, 6, 4, 2, 9, 8, 5, 3, 7),
        locs: LocPermutation {
          transpose: true,
          row_bands: cycle!(Band; 0, 1, 2),
          col_bands: cycle!(Band; 0, 1),
          rows_in_bands: [
            cycle!(BlkLine; 1, 2),
            cycle!(BlkLine; 0, 2, 1),
            cycle!(BlkLine; 1, 2),
          ],
          cols_in_bands: [cycle!(BlkLine; 0, 2, 1), cycle!(BlkLine), cycle!(BlkLine)],
        },
      },
      &grid(
        r"
                1 2 3 | 4 5 6 | 7 8 9
                4 5 6 | 7 8 9 | 1 3 2
                7 8 9 | 2 3 1 | 5 4 6
                - - - + - - - + - - -
                2 3 5 | 1 6 8 | 9 7 4
                8 6 4 | 9 2 7 | 3 5 1
                9 1 7 | 3 4 5 | 6 2 8
                - - - + - - - + - - -
                3 7 1 | 8 9 2 | 4 6 5
                5 9 2 | 6 7 4 | 8 1 3
                6 4 8 | 5 1 3 | 2 9 7",
      ),
      1,
    );
    let most_symmetric = grid(
      r"
            1 2 3 | 4 5 6 | 7 8 9
            4 5 6 | 7 8 9 | 1 2 3
            7 8 9 | 1 2 3 | 4 5 6
            - - - + - - - + - - -
            2 3 1 | 5 6 4 | 8 9 7
            5 6 4 | 8 9 7 | 2 3 1
            8 9 7 | 2 3 1 | 5 6 4
            - - - + - - - + - - -
            3 1 2 | 6 4 5 | 9 7 8
            6 4 5 | 9 7 8 | 3 1 2
            9 7 8 | 3 1 2 | 6 4 5
        ",
    );
    test(
      &most_symmetric,
      GridPermutation::identity(),
      &most_symmetric,
      648,
    );
  }
}
