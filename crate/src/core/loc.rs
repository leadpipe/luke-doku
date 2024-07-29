//! Defines the Loc type, which identifies the locations (or squares or cells)
//! of a Sudoku grid.

use super::bits::*;
use super::set::Set;
use super::units::*;
use crate::define_id_types;
use crate::define_set_operators;
use paste::paste;
use seq_macro::seq;
use serde::Serialize;
use std::fmt;
use wasm_bindgen::convert::FromWasmAbi;
use wasm_bindgen::convert::IntoWasmAbi;
use wasm_bindgen::describe::inform;
use wasm_bindgen::describe::WasmDescribe;
use wasm_bindgen::describe::I8;

define_id_types! {
    /// Identifies one of the 81 locations in a Sudoku grid.
    ///
    /// Sudokus are represented as length-81 arrays in row-major order.
    /// `Loc(0)` is the top left square of the grid, and `Loc(80)` is the
    /// bottom right.
    Loc: i8[81];

    /// Identifies a row or column of blocks in a Sudoku grid.
    #[derive(Debug)]
    Band: i8[3];

    /// Identifies a particular location within a row or column band.
    BandLoc: i8[27];
}

// Constant Loc values, L11 through L99.
seq!(R in 1..=9 {
    seq!(C in 1..=9 {
        paste! {
            #[allow(clippy::identity_op, clippy::erasing_op, clippy::eq_op)]
            pub const [<L R C>]: Loc = Loc((R - 1) * 9 + (C - 1));
        }
    });
});

impl Loc {
  /// Converts from row/col to Loc.
  pub const fn at(row: Row, col: Col) -> Loc {
    Loc(row.get() * 9 + col.get())
  }

  fn data(self) -> &'static Data {
    // Safe because the DATA array ranges over 0..81.
    unsafe { DATA.get_unchecked(self.index()) }
  }

  /// This location's row.
  pub fn row(self) -> Row {
    self.data().row
  }

  /// This location's column.
  pub fn col(self) -> Col {
    self.data().col
  }

  /// This location's block.
  pub fn blk(self) -> Blk {
    self.data().blk
  }

  /// This location's row band.
  pub fn row_band(self) -> Band {
    self.data().row_band
  }

  /// This location's position within its row band.
  pub fn row_band_loc(self) -> BandLoc {
    self.data().row_band_loc
  }

  /// This location's column band.
  pub fn col_band(self) -> Band {
    self.data().col_band
  }

  /// This location's position within its column band.
  pub fn col_band_loc(self) -> BandLoc {
    self.data().col_band_loc
  }

  /// This location's row within its block.
  pub fn blk_row(self) -> BlkLine {
    self.data().blk_row
  }

  /// This location's column within its block.
  pub fn blk_col(self) -> BlkLine {
    self.data().blk_col
  }

  /// This location's row.
  const fn const_row(self) -> Row {
    unsafe { Row::new_unchecked(self.0 / 9) }
  }

  /// This location's column.
  const fn const_col(self) -> Col {
    unsafe { Col::new_unchecked(self.0 % 9) }
  }

  /// This location's block.
  const fn const_blk(self) -> Blk {
    Blk::from_bands(self.const_row_band(), self.const_col_band())
  }

  /// This location's row band.
  const fn const_row_band(self) -> Band {
    Band(self.0 / 27)
  }

  /// This location's position within its row band.
  const fn const_row_band_loc(self) -> BandLoc {
    BandLoc(self.0 % 27)
  }

  /// This location's column band.
  const fn const_col_band(self) -> Band {
    Band(self.0 / 3 % 3)
  }

  /// This location's position within its column band.
  const fn const_col_band_loc(self) -> BandLoc {
    BandLoc(self.0 / 9 + self.0 / 3 % 3 * 3)
  }

  /// This location's row within its block.
  const fn const_blk_row(self) -> BlkLine {
    unsafe { BlkLine::new_unchecked(self.0 / 9 % 3) }
  }

  /// This location's column within its block.
  const fn const_blk_col(self) -> BlkLine {
    unsafe { BlkLine::new_unchecked(self.0 % 3) }
  }

  /// Returns the location on the opposite side of the center square.
  pub const fn opp(self) -> Loc {
    Loc(80 - self.0)
  }

  /// Returns the transpose of this location: the location on the other side
  /// of the main diagonal.
  pub fn t(self) -> Loc {
    self.data().transpose
  }

  /// The location at the same place as this one in a (possibly) different
  /// row-band.
  pub const fn with_row_band(self, row_band: Band) -> Self {
    Self::at(self.const_blk_row().row_in_band(row_band), self.const_col())
  }

  /// The location at the same place as this one in a (possibly) different
  /// column-band.
  pub const fn with_col_band(self, col_band: Band) -> Self {
    Self::at(self.const_row(), self.const_blk_col().col_in_band(col_band))
  }

  /// The location in the same block as this one in a (possibly) different
  /// block-row.
  pub const fn with_blk_row(self, blk_row: BlkLine) -> Self {
    Self::at(blk_row.row_in_band(self.const_row_band()), self.const_col())
  }

  /// The location in the same block as this one in a (possibly) different
  /// block-column.
  pub const fn with_blk_col(self, blk_col: BlkLine) -> Self {
    Self::at(self.const_row(), blk_col.col_in_band(self.const_col_band()))
  }

  /// This location's peer locations, meaning the locations that share this
  /// location's row, column, or block.
  pub fn peers(self) -> LocSet {
    // Safe because Locs' IDs are in 0..81.
    unsafe { *PEERS.get_unchecked(self.0 as usize) }
  }

  /// Calculates this location's peer set.
  pub const fn calc_peers(self) -> LocSet {
    let same_band = self.calc_band_peers();
    let diff_band = Bits27::from_backing_int(0o_001_001_001 << self.const_col().get());
    let bits = match self.const_row_band().get() {
      0 => Bits3x27::const_new([same_band, diff_band, diff_band]),
      1 => Bits3x27::const_new([diff_band, same_band, diff_band]),
      _ => Bits3x27::const_new([diff_band, diff_band, same_band]),
    };
    LocSet(bits)
  }

  /// Calculates this location's peer bits within its row-band.
  const fn calc_band_peers(self) -> Bits27 {
    let same_row = Bits9::from_backing_int(0o_777 ^ (1 << self.const_col().get()));
    let diff_row = Bits9::from_backing_int(7 << (3 * self.const_col_band().get()));
    match self.const_blk_row().get() {
      0 => Bits27::from_bits9s(same_row, diff_row, diff_row),
      1 => Bits27::from_bits9s(diff_row, same_row, diff_row),
      _ => Bits27::from_bits9s(diff_row, diff_row, same_row),
    }
  }

  /// Returns a singleton set containing just this location.
  pub fn as_set(self) -> LocSet {
    LocSet::singleton(self)
  }
}

impl fmt::Display for Loc {
  /// Prints this location as (r, c), where r and c are the ordinal numbers of
  /// the location's row and column.
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    write!(f, "({}, {})", self.row().ordinal(), self.col().ordinal())
  }
}

impl fmt::Debug for Loc {
  /// Prints this location as Lrc, where r and c are the ordinal numbers of
  /// the location's row and column.
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    write!(f, "L{}{}", self.row().ordinal(), self.col().ordinal())
  }
}

impl WasmDescribe for Loc {
  fn describe() {
    inform(I8)
  }
}

impl FromWasmAbi for Loc {
  type Abi = i32;

  unsafe fn from_abi(js: Self::Abi) -> Self {
    Self::new(js as i8).unwrap()
  }
}

impl IntoWasmAbi for Loc {
  type Abi = i32;

  fn into_abi(self) -> Self::Abi {
    self.0 as i32
  }
}

impl WasmDescribe for Band {
  fn describe() {
    inform(I8)
  }
}

impl FromWasmAbi for Band {
  type Abi = i32;

  unsafe fn from_abi(js: Self::Abi) -> Self {
    Self::new(js as i8).unwrap()
  }
}

impl IntoWasmAbi for Band {
  type Abi = i32;

  fn into_abi(self) -> Self::Abi {
    self.0 as i32
  }
}

/// A set of `Loc`s.
#[derive(Clone, Copy, Eq, Hash, PartialEq)]
pub struct LocSet(pub Bits3x27);

impl LocSet {
  /// Makes a new empty LocSet.
  pub const fn new() -> Self {
    LocSet(Bits3x27::ZERO)
  }

  /// Makes a new single-valued LocSet.
  pub fn singleton(loc: Loc) -> Self {
    LocSet(Bits3x27::singleton(loc.index() as i32))
  }

  /// Makes a new LocSet containing all locations.
  pub const fn all() -> Self {
    LocSet(Bits3x27::ONES)
  }

  /// Returns a reference to the bits that represent the given row-band in
  /// this set.
  pub fn band_locs(&self, band: Band) -> Bits27 {
    // Safe because Bands are in 0..3.
    unsafe { *self.0.array().get_unchecked(band.index()) }
  }

  /// Returns a reference to the bits that represent the given row-band in
  /// this set.
  pub fn band_locs_mut(&mut self, band: Band) -> &mut Bits27 {
    // Safe because Bands are in 0..3.
    unsafe { self.0.mut_array().get_unchecked_mut(band.index()) }
  }

  /// Finds the smallest location in the given row-band, if there's at least
  /// one there.
  pub fn smallest_in_row_band(&self, band: Band) -> Option<Loc> {
    let bits = self.band_locs(band);
    unsafe {
      // Safe because the value is in 0..27 and the band is in 0..3.
      bits
        .smallest_value()
        .map(|value| Loc::new_unchecked(27 * band.get() + value as i8))
    }
  }
}

impl<'a> Set<'a> for LocSet {
  type Item = Loc;
  type Bits = Bits3x27;

  fn bits(&self) -> &Self::Bits {
    &self.0
  }

  fn mut_bits(&mut self) -> &mut Self::Bits {
    &mut self.0
  }

  fn to_bits_value(&self, item: Self::Item) -> i32 {
    item.index() as i32
  }

  fn from_bits_value(&self, value: i32) -> Self::Item {
    // Safe because Bits3x27 only returns values in 0..81.
    unsafe { Loc::new_unchecked(value as i8) }
  }
}
define_set_operators!(LocSet);

impl fmt::Debug for LocSet {
  /// Prints this set as a list of locations.
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    write!(f, "LocSet(")?;
    let mut prev = false;
    for loc in self.iter() {
      if prev {
        write!(f, ", ")?;
      }
      write!(f, "{:?}", loc)?;
      prev = true;
    }
    write!(f, ")")
  }
}

impl Band {
  /// Returns the next band following this one, wrapping around.
  pub const fn next(self) -> Band {
    Self((self.0 + 1) % 3)
  }

  /// Returns the previous band before this one, wrapping around.
  pub const fn prev(self) -> Band {
    Self((self.0 + 2) % 3)
  }
}

/// Translates a bare int ID into a Loc, then calculates its peers.
const fn calc_peers(id: i8) -> LocSet {
  unsafe {
    // Safe because this is only called with IDs in 0..81.
    Loc::new_unchecked(id).calc_peers()
  }
}

seq!(L in 0..81 {
    /// Memoizes all locations' peer locations.
    static PEERS: [LocSet; 81] = [
        #(
            calc_peers(L),
        )*
    ];
});

struct Data {
  row: Row,
  col: Col,
  blk: Blk,
  row_band: Band,
  row_band_loc: BandLoc,
  col_band: Band,
  col_band_loc: BandLoc,
  blk_row: BlkLine,
  blk_col: BlkLine,
  transpose: Loc,
}

seq!(L in 0..81 {
    /// Memoizes ancillary information about locations.
    #[allow(clippy::identity_op, clippy::erasing_op, clippy::eq_op)]
    static DATA: [Data; 81] = [
        #(
            Data {
                // All of these are safe because of L's range.
                row: Loc(L).const_row(),
                col: Loc(L).const_col(),
                blk: Loc(L).const_blk(),
                row_band: Loc(L).const_row_band(),
                row_band_loc: Loc(L).const_row_band_loc(),
                col_band: Loc(L).const_col_band(),
                col_band_loc: Loc(L).const_col_band_loc(),
                blk_row: Loc(L).const_blk_row(),
                blk_col: Loc(L).const_blk_col(),
                transpose: Loc(L % 9 * 9 + L / 9),
            },
        )*
    ];
});

#[cfg(test)]
mod tests {
  use super::*;

  fn check_eq(set: LocSet, locs: &[Loc]) {
    let contents: Vec<_> = set.iter().collect();
    assert_eq!(contents[..], *locs);
  }

  #[test]
  fn basics() {
    let mut set = LocSet::new();
    assert!(set.insert(L11));
    assert!(set.insert(L12));
    assert!(set.insert(L13));
    check_eq(set, &[L11, L12, L13]);

    assert!(!set.remove(L21));
    assert!(set.remove(L12));
    check_eq(set, &[L11, L13]);
  }

  #[test]
  fn ops() {
    let mut set1 = L99.as_set();
    let mut set2 = L13.as_set();
    let mut set3 = set1 | set2;
    check_eq(set3, &[L13, L99]);
    assert_eq!(set1, set3 ^ set2);

    set1 |= L18.as_set();
    set2 ^= L19.as_set();
    check_eq(set1 & set2, &[]);
    set3 -= set2;
    check_eq(set3, &[L99]);
  }

  #[test]
  fn peers() {
    let mut count_locs = 0;
    for loc in Loc::all() {
      count_locs += 1;
      assert_eq!(20, loc.peers().len());
      let mut count_same_row = 0;
      let mut count_same_col = 0;
      let mut count_same_blk = 0;
      for peer in loc.peers().iter() {
        assert_ne!(loc, peer);
        // Ensure the unsafe code generates legit locations.
        assert_eq!(Loc::new(peer.get()), Some(peer));
        let same_row = loc.row() == peer.row();
        let same_col = loc.col() == peer.col();
        let same_blk = loc.blk() == peer.blk();
        assert!(same_row || same_col || same_blk);
        assert!(!(same_row && same_col && same_blk));
        if same_row {
          count_same_row += 1;
        }
        if same_col {
          count_same_col += 1;
        }
        if same_blk {
          count_same_blk += 1;
        }
      }
      assert_eq!(8, count_same_row);
      assert_eq!(8, count_same_col);
      assert_eq!(8, count_same_blk);
    }
    assert_eq!(81, count_locs);
  }
}
