//! Defines `Asgmt` and `AsgmtSet` for managing the assignment of numerals to
//! locations in a Sudoku.

use super::bits::{Bits, Bits27, Bits3x27, Bits9x3x27, BitsArray};
use super::grid::Grid;
use super::masks::loc_to_zeroed_peers;
use super::set::Set;
use super::{loc::*, num::*, Invalid};
use crate::define_set_operators;

/// An assignment: combines a Sudoku location and a numeral to represent that
/// numeral written in that location.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct Asgmt {
  pub num: Num,
  pub loc: Loc,
}

impl Asgmt {
  /// Makes a new Asgmt.
  pub fn new(num: Num, loc: Loc) -> Self {
    Asgmt { loc, num }
  }

  /// Returns the assignments that are inconsistent with this one.  This is
  /// assignments that have the same location as this one, but a different
  /// numeral, and assignments that have the same numeral as this one in a
  /// "peer" location, that is, a different location in the same row, column, or
  /// block.
  pub fn to_eliminations(&self) -> AsgmtSet {
    let mut answer = AsgmtSet::new();
    for num in Num::all() {
      if num == self.num {
        answer.union_in_place(num, self.loc.peers())
      } else {
        answer.union_in_place(num, self.loc.as_set())
      }
    }
    answer
  }
}

/// A set of `Asgmt`s.  The backing Bits type is laid out as an array of 9
/// `Bits3x27`s, one for each numeral. Each of the nested Bits objects
/// corresponds to the 81 locations of the Sudoku grid, split into 27-location
/// row-bands.
/// 
/// Some of the operations on this type require that the set be valid, meaning
/// that all locations have at least one possible assignment.  If the set is
/// invalid, these operations will return an `Invalid` error.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct AsgmtSet(pub Bits9x3x27);

impl AsgmtSet {
  /// Makes a new empty AsgmtSet.
  pub fn new() -> Self {
    AsgmtSet(Bits9x3x27::ZERO)
  }

  /// Makes a new AsgmtSet containing all assignments.
  pub fn all() -> Self {
    AsgmtSet(Bits9x3x27::ONES)
  }

  /// Makes a new AsgmtSet containing all assignments that are consistent with
  /// the given grid.  Returns `Err(Invalid)` if the grid is invalid.
  pub fn from_grid(grid: &Grid) -> Result<Self, Invalid> {
    let mut answer = Self::all();
    for asgmt in grid.iter() {
      if !answer.contains(asgmt) {
        return Err(Invalid);
      }
      answer.apply(asgmt)
    }
    Ok(answer)
  }

  /// Converts this set into a grid, with any location having multiple
  /// assignments left blank.  Returns `Err(Invalid)` if any location has no
  /// possible assignments.
  /// 
  /// Note that this is not a precise inverse of `from_grid`.  The grid returned
  /// by this method may not be the same as the grid passed to `from_grid`, because
  /// this method will fill in any locations that have only one possible assignment.
  pub fn to_grid(&self) -> Result<Grid, Invalid> {
    let (singles, _) = self.singles_and_doubles()?;
    let mut answer = Grid::new();
    for num in Num::all() {
      for loc in (singles & self.num_locs(num)).iter() {
        answer[loc] = Some(num);
      }
    }
    Ok(answer)
  }

  /// Applies the given assignment to this set, by removing all assignments
  /// that are inconsistent with it.
  pub fn apply(&mut self, asgmt: Asgmt) {
    let zero_loc = !LocSet::singleton(asgmt.loc);
    // Remove possible assignments.  For this numeral, remove all the peer
    // locations.  For other numerals, remove this location.
    for num in Num::all() {
      if num == asgmt.num {
        self.intersect_in_place(num, loc_to_zeroed_peers(asgmt.loc))
      } else {
        self.intersect_in_place(num, zero_loc)
      }
    }
  }

  /// Finds all locations in this set that have either one or two assignments,
  /// and returns those two location sets as a tuple.  Returns an Invalid
  /// error if any locations have no possible assignments.
  pub fn singles_and_doubles(&self) -> Result<(LocSet, LocSet), Invalid> {
    // `minN` is locations with at least N assignments in this set.
    let mut min1 = Bits3x27::ZERO;
    let mut min2 = Bits3x27::ZERO;
    let mut min3 = Bits3x27::ZERO;
    for bits in *self.0.array() {
      min3 |= bits & min2;
      min2 |= bits & min1;
      min1 |= bits;
    }
    if min1 != Bits3x27::ONES {
      return Err(Invalid);
    }
    // Works like min1 & !min2, because min1 is a superset of min2.
    let exactly1 = LocSet(min1 ^ min2);
    let exactly2 = LocSet(min2 ^ min3);
    Ok((exactly1, exactly2))
  }

  /// Modifies this set in place to remove all assignments for the given
  /// numeral that are not in the given locations.
  pub fn intersect_in_place(&mut self, num: Num, locs: LocSet) {
    *self.num_plane(num) &= locs.0;
  }

  /// Modifies this set in place to add all assignments for the given
  /// numeral that are in the given locations.
  pub fn union_in_place(&mut self, num: Num, locs: LocSet) {
    *self.num_plane(num) |= locs.0;
  }

  /// Returns the locations that the given numeral could occupy.
  pub fn num_locs(&self, num: Num) -> LocSet {
    // Safe because numerals' indices are in 0..9.
    unsafe { LocSet(*self.0.array().get_unchecked(num.index())) }
  }

  /// Returns a pointer to the bit set that backs the locations for the given
  /// numeral.
  pub fn num_plane(&mut self, num: Num) -> &mut Bits3x27 {
    // Safe because numerals' indices are in 0..9.
    unsafe { self.0.mut_array().get_unchecked_mut(num.index()) }
  }

  /// Returns the bits corresponding to a given num and band.
  pub fn band_locs(&self, num: Num, band: Band) -> Bits27 {
    // Safe because Num's and Band's ranges match the sizes of Bits9x3x27.
    unsafe {
      *self
        .0
        .array()
        .get_unchecked(num.index())
        .array()
        .get_unchecked(band.index())
    }
  }

  /// Returns a pointer to the bits corresponding to a given num and band.
  pub fn band_locs_mut(&mut self, num: Num, band: Band) -> &mut Bits27 {
    // Safe because Num's and Band's ranges match the sizes of Bits9x3x27.
    unsafe {
      self
        .0
        .mut_array()
        .get_unchecked_mut(num.index())
        .mut_array()
        .get_unchecked_mut(band.index())
    }
  }
}

impl Default for AsgmtSet {
  fn default() -> Self {
    Self::new()
  }
}

impl<'a> Set<'a> for AsgmtSet {
  type Item = Asgmt;
  type Bits = Bits9x3x27;

  fn bits(&self) -> &Self::Bits {
    &self.0
  }

  fn mut_bits(&mut self) -> &mut Self::Bits {
    &mut self.0
  }

  fn to_bits_value(&self, item: Self::Item) -> i32 {
    (item.num.index() * 81 + item.loc.index()) as i32
  }

  fn from_bits_value(&self, value: i32) -> Self::Item {
    // Safe because Bits9x3x27 only returns values in 0..729.
    unsafe {
      Asgmt {
        loc: Loc::new_unchecked((value % 81) as i8),
        num: Num::new_unchecked((value / 81) as i8 + 1),
      }
    }
  }
}

define_set_operators!(AsgmtSet);

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn to_grid() {
    let s = ".1..5..8.4.89.62.1..6...7....5.3.9.....8.7.....1.4.3....4...1..2.93.16.7.7..6..2.";
    let g = s.parse::<Grid>().unwrap();
    let mut set = AsgmtSet::from_grid(&g).unwrap();
    for a in g.iter() {
      assert!(set.contains(a));
    }
    let s = ".1..5.48.4.89762.1..6...7....5.329.....8.7.....1.4.3....4...1..2.93816.7.73.6..2.";
    let g = s.parse::<Grid>().unwrap();
    assert_eq!(g, set.to_grid().unwrap());

    for loc in Loc::all() {
      if g[loc] == None {
        set.insert(Asgmt { loc, num: N1 });
        set.insert(Asgmt { loc, num: N2 });
      }
    }
    assert_eq!(g, set.to_grid().unwrap());
  }

  #[test]
  fn singles_and_doubles() {
    let s = ".1..5..8.4.89.62.1..6...7....5.3.9.....8.7.....1.4.3....4...1..2.93.16.7.7..6..2.";
    let g = s.parse::<Grid>().unwrap();
    let mut set = AsgmtSet::new();
    let mut locs = LocSet::new();
    for loc in Loc::all() {
      if let Some(num) = g[loc] {
        set.insert(Asgmt { loc, num });
        locs.insert(loc);
      } else {
        set.insert(Asgmt { loc, num: N1 });
        set.insert(Asgmt { loc, num: N2 });
      }
    }
    let (singles, doubles) = set.singles_and_doubles().unwrap();
    assert_eq!(singles, locs);
    assert_eq!(doubles, !locs);

    set.insert(Asgmt { loc: L11, num: N3 });
    let (singles, doubles) = set.singles_and_doubles().unwrap();
    assert_eq!(singles, locs);
    assert_ne!(doubles, !locs);
    assert_eq!(doubles.len() + 1, (!locs).len());
    assert!(!singles.contains(L11));
    assert!(!doubles.contains(L11));

    set.remove(Asgmt { loc: L12, num: N1 });
    assert!(set.singles_and_doubles().is_err());
  }
}
