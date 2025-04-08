//! Defines types related to the Sudoku "units": the regions of the grid that
//! must contain every numeral in a solution.

use super::bits::*;
use super::loc::*;
use crate::define_id_types;
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
    /// Identifies one of the 9 rows in a Sudoku grid.
    ///
    /// Rows are numbered top to bottom.
    Row: i8[9];

    /// Identifies one of the 9 columns in a Sudoku grid.
    ///
    /// Columns are numbered left to right.
    Col: i8[9];

    /// Identifies one of the 9 3x3 blocks in a Sudoku grid.
    ///
    /// Blocks are numbered in row-major order.
    Blk: i8[9];

    /// Identifies one of the 27 "units" (row/col/block) of a Sudoku grid.
    ///
    /// The units of a Sudoku (not to be confused with Rust's unit type) are
    /// all the subregions of the grid that must contain all 9 numerals in a
    /// valid solution.
    UnitId: i8[27];

    /// Identifies one of the mini-rows or -columns within a block.
    ///
    /// Block rows and columns are ordered in the same directions as full rows and columns.
    #[derive(Debug)]
    BlkLine: i8[3];
}

/// One of a row, column, or block.
#[derive(Clone, Copy, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum Unit {
  Row(Row),
  Col(Col),
  Blk(Blk),
}

pub trait UnitTrait {
  /// Tells which generic unit this is.
  fn unit_id(self) -> UnitId;

  /// Converts this unit to the generic Unit type.
  fn to_unit(self) -> Unit;

  /// The locations that this unit comprises.
  fn locs(self) -> LocSet;
}

impl Row {
  /// Tells which row band this row inhabits.
  pub const fn band(self) -> Band {
    // Safe because Rows are in 0..9.
    unsafe { Band::new_unchecked(self.0 / 3) }
  }

  /// Tells which row this is within its band.
  pub const fn blk_row(self) -> BlkLine {
    BlkLine(self.0 % 3)
  }

  /// Returns the opposite row.
  pub const fn opp(self) -> Row {
    Row(8 - self.0)
  }

  /// Returns the transposition of this row.
  pub const fn t(self) -> Col {
    Col(self.0)
  }
}

impl Col {
  /// Tells which column band this column inhabits.
  pub const fn band(self) -> Band {
    // Safe because Cols are in 0..9.
    unsafe { Band::new_unchecked(self.0 / 3) }
  }

  /// Tells which column this is within its band.
  pub const fn blk_col(self) -> BlkLine {
    BlkLine(self.0 % 3)
  }

  /// Returns the opposite column.
  pub const fn opp(self) -> Col {
    Col(8 - self.0)
  }

  /// Returns the transposition of this column.
  pub const fn t(self) -> Row {
    Row(self.0)
  }
}

impl Blk {
  /// Locates a block by its bands.
  pub const fn from_bands(row_band: Band, col_band: Band) -> Self {
    Self(row_band.get() * 3 + col_band.get())
  }

  /// Tells which row band this block inhabits.
  pub const fn row_band(self) -> Band {
    // Safe because Blks are in 0..9.
    unsafe { Band::new_unchecked(self.0 / 3) }
  }

  /// Tells which column band this block inhabits.
  pub const fn col_band(self) -> Band {
    // Safe because Blks are in 0..9.
    unsafe { Band::new_unchecked(self.0 % 3) }
  }

  /// Returns the indicated row that overlaps with this block.
  pub const fn row(self, blk_row: BlkLine) -> Row {
    Row(self.row_band().get() * 3 + blk_row.get())
  }

  /// Returns the indicated column that overlaps with this block.
  pub const fn col(self, blk_col: BlkLine) -> Col {
    Col(self.col_band().get() * 3 + blk_col.get())
  }

  /// Returns the location within this block that's at the intersection of the
  /// given block-row and block-column.
  pub const fn loc_at(self, blk_row: BlkLine, blk_col: BlkLine) -> Loc {
    Loc::at(self.row(blk_row), self.col(blk_col))
  }

  /// Returns the opposite block.
  pub const fn opp(self) -> Blk {
    Self(8 - self.0)
  }

  /// Returns the transposition of this block.
  pub const fn t(self) -> Blk {
    Self::from_bands(self.col_band(), self.row_band())
  }
}

// Constant unit values: R1 through R9 (rows, top to bottom); C1 through C9
// (columns, left to right); and B1 through B9 (blocks, top left going in
// row-major order).
seq!(N in 1..=9 {
    paste! {
        #[allow(clippy::eq_op)]
        pub const [<R N>]: Row = Row(N - 1);
        #[allow(clippy::eq_op)]
        pub const [<C N>]: Col = Col(N - 1);
        #[allow(clippy::eq_op)]
        pub const [<B N>]: Blk = Blk(N - 1);
    }
});

impl UnitId {
  pub const fn from_row(row: Row) -> Self {
    Self(row.get())
  }

  pub const fn from_col(col: Col) -> Self {
    Self(9 + col.get())
  }

  pub const fn from_blk(blk: Blk) -> Self {
    Self(18 + blk.get())
  }
}

impl BlkLine {
  pub const fn row_in_band(self, band: Band) -> Row {
    Row(3 * band.get() + self.0)
  }

  pub const fn col_in_band(self, band: Band) -> Col {
    Col(3 * band.get() + self.0)
  }
}

impl UnitTrait for Unit {
  fn unit_id(self) -> UnitId {
    match self {
      Self::Row(row) => UnitId::from_row(row),
      Self::Col(col) => UnitId::from_col(col),
      Self::Blk(blk) => UnitId::from_blk(blk),
    }
  }

  fn to_unit(self) -> Unit {
    self
  }

  fn locs(self) -> LocSet {
    match self {
      Self::Row(row) => row.locs(),
      Self::Col(col) => col.locs(),
      Self::Blk(blk) => blk.locs(),
    }
  }
}

impl UnitTrait for Row {
  fn unit_id(self) -> UnitId {
    UnitId::from_row(self)
  }

  fn to_unit(self) -> Unit {
    Unit::Row(self)
  }

  fn locs(self) -> LocSet {
    let mut bits = Bits3x27::ZERO;
    bits.mut_array()[self.band().index()] =
      Bits27::from_backing_int(0o_777 << (9 * self.blk_row().get()));
    LocSet(bits)
  }
}

impl UnitTrait for Col {
  fn unit_id(self) -> UnitId {
    UnitId::from_col(self)
  }

  fn to_unit(self) -> Unit {
    Unit::Col(self)
  }

  fn locs(self) -> LocSet {
    let band_bits = Bits27::from_backing_int(0o_001001001 << self.get());
    LocSet(Bits3x27::new([band_bits; 3]))
  }
}

impl UnitTrait for Blk {
  fn unit_id(self) -> UnitId {
    UnitId::from_blk(self)
  }

  fn to_unit(self) -> Unit {
    Unit::Blk(self)
  }

  fn locs(self) -> LocSet {
    let mut bits = Bits3x27::ZERO;
    bits.mut_array()[self.row_band().index()] =
      Bits27::from_backing_int(0o_007007007 << (3 * self.col_band().get()));
    LocSet(bits)
  }
}

impl UnitTrait for UnitId {
  fn unit_id(self) -> UnitId {
    self
  }

  fn to_unit(self) -> Unit {
    match self.get() {
      0..=8 => unsafe {
        // Safe because it's in 0..9.
        Unit::Row(Row::new_unchecked(self.get()))
      },
      9..=17 => unsafe {
        // Safe because the result is in 0..9.
        Unit::Col(Col::new_unchecked(self.get() - 9))
      },
      _ => unsafe {
        // Safe because self.get() is in 0..27.
        Unit::Blk(Blk::new_unchecked(self.get() - 18))
      },
    }
  }

  fn locs(self) -> LocSet {
    self.to_unit().locs()
  }
}

impl fmt::Display for Row {
  /// Prints this row as Rn, where n is the ordinal number of the row.
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    write!(f, "R{}", self.ordinal())
  }
}

impl fmt::Display for Col {
  /// Prints this column as Cn, where n is the ordinal number of the column.
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    write!(f, "C{}", self.ordinal())
  }
}

impl fmt::Display for Blk {
  /// Prints this block as Bn, where n is the ordinal number of the block.
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    write!(f, "B{}", self.ordinal())
  }
}

impl WasmDescribe for BlkLine {
  fn describe() {
    inform(I8)
  }
}

impl FromWasmAbi for BlkLine {
  type Abi = i32;

  unsafe fn from_abi(js: Self::Abi) -> Self {
    Self::new(js as i8).unwrap()
  }
}

impl IntoWasmAbi for BlkLine {
  type Abi = i32;

  fn into_abi(self) -> Self::Abi {
    self.0 as i32
  }
}

#[cfg(test)]
mod tests {
  use super::super::*;
  use super::*;

  #[test]
  fn test_unit_locs() {
    for loc in Loc::all() {
      assert!(loc.row().locs().contains(loc));
      assert!(loc.col().locs().contains(loc));
      assert!(loc.blk().locs().contains(loc));
      assert_eq!(loc.as_set(), loc.row().locs() & loc.col().locs());
      assert!(loc.row().locs() < loc.peers() | loc.as_set());
      assert!(loc.col().locs() < loc.peers() | loc.as_set());
      assert!(loc.blk().locs() < loc.peers() | loc.as_set());
      assert_eq!(
        loc.peers(),
        (loc.row().locs() | loc.col().locs() | loc.blk().locs()) - loc.as_set()
      );
    }
  }
}
