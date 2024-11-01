//! Defines the Ledger struct that's at the heart of the row-band-based solver.

use super::masks::*;
use crate::core::bits::*;
use crate::core::*;

/// Tracks possible Sudoku assignments during solving.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct Ledger {
  /// The remaining possible assignments.
  asgmts: AsgmtSet,

  /// A copy of `asgmts` for tracking changes.
  old_asgmts: AsgmtSet,

  /// The locations that have not yet been assigned a numeral.
  unset: LocSet,
}

impl Ledger {
  /// Makes a preliminary Ledger with the given puzzle's assignments set but
  /// all other possibilities still open.  Returns `Err(Invalid)` if the
  /// puzzle's clues are inconsistent with the rules of Sudoku.
  pub fn new(clues: &Grid) -> Result<Ledger, Invalid> {
    let mut answer = Ledger {
      asgmts: AsgmtSet::all(),
      old_asgmts: AsgmtSet::all(),
      unset: LocSet::all(),
    };
    for asgmt in clues.iter() {
      if !answer.assign_from_new(asgmt) {
        return Err(Invalid);
      }
    }
    Ok(answer)
  }

  /// Renders the possible assignments as a grid, leaving unassigned any
  /// locations that don't have a unique possible numeral.
  pub fn to_grid(&self) -> Grid {
    self.asgmts.to_grid()
  }

  /// Tells whether this ledger is full.
  pub fn is_complete(&self) -> bool {
    self.unset.is_empty()
  }

  /// Tells whether this ledger admits the possibility of assigning the given
  /// numeral to the given location.
  pub fn is_possible(&self, num: Num, loc: Loc) -> bool {
    self.asgmts.contains(Asgmt { num, loc })
  }

  /// The still-unset locations.
  pub fn unset(&self) -> &LocSet {
    &self.unset
  }

  /// Cycles through the ledger eliminating impossible assignments and
  /// assigning locations with just one possible numeral until there's nothing
  /// left to apply.  Returns an error if it's an invalid Sudoku, or a set of
  /// locations that have just two possible assignments.
  pub fn apply_implications(&mut self) -> Result<LocSet, Invalid> {
    loop {
      self.eliminate_by_overlaps()?;
      let (mut ones, twos) = self.asgmts.ones_and_twos()?;
      ones &= self.unset;
      if ones.is_empty() {
        return Ok(twos);
      }
      self.eliminate_peers_in_same_band(ones);
    }
  }

  /// Assigns the given numeral to the given location, without following any
  /// implications of that assignment.  You'll need to call
  /// `apply_implications()` after this.
  pub fn assign_blindly(&mut self, num: Num, loc: Loc) {
    eliminate_peers_in_plane(self.asgmts.num_plane(num), loc);
  }

  /// Assigns the given numeral to the given location, then applies all
  /// following implied assignments.  Returns an error if it's an invalid
  /// Sudoku, or the set of locations that have just two possible assignments.
  pub fn assign_and_apply_implications(&mut self, num: Num, loc: Loc) -> Result<LocSet, Invalid> {
    self.assign_blindly(num, loc);
    // The above only eliminates the numeral from all the peers of the
    // location that live in the location's row-band.  The following pushes
    // through all other implications of those eliminations, including
    // eliminating the numeral from the remaining peers, and eliminating all
    // the other numerals from this location.
    self.apply_implications()
  }

  /// Helper for `new`.  Tells whether the assignment was consistent with the
  /// rules.
  fn assign_from_new(&mut self, asgmt: Asgmt) -> bool {
    // Mark the location as having been set.
    let zero_loc = !LocSet::singleton(asgmt.loc);
    self.unset &= zero_loc;
    // Remove possible assignments.  For this numeral, remove all the peer
    // locations.  For other numerals, remove this location.
    for num in Num::all() {
      if num == asgmt.num {
        *self.asgmts.num_plane(num) &= loc_to_zeroed_peers(asgmt.loc).0;
      } else {
        *self.asgmts.num_plane(num) &= zero_loc.0;
      }
    }
    // If the assignment isn't still possible, we have a problem.
    self.asgmts.contains(asgmt)
  }

  /// Removes impossible assignments from `self.asgmts` by finding overlaps:
  /// situations where the possible assignments for a numeral within a block
  /// or line are confined to where a block and line overlap, and therefore
  /// the numeral can't appear anywhere else in the other unit.  Overlaps are
  /// sometimes referred to as "locked candidates."
  fn eliminate_by_overlaps(&mut self) -> Result<(), Invalid> {
    let mut keep_going = true;
    while keep_going {
      keep_going = false;
      for num in Num::all() {
        for band in Band::all() {
          if self.asgmts.band_locs(num, band) != self.old_asgmts.band_locs(num, band) {
            keep_going = true;
            self.eliminate_by_overlaps_in_band(num, band)?;
          }
        }
      }
    }
    Ok(())
  }

  /// Eliminates (most of) the given locations' peers from the possible
  /// assignments.  Each given location must have a single possible numeral
  /// remaining.
  ///
  /// This method only updates a subset of the `self.asgmts` bits for each
  /// location, namely the bits corresponding to the location's row-band.  The
  /// peers in the other row-bands get eliminated by `eliminate_by_overlaps`.
  fn eliminate_peers_in_same_band(&mut self, locs: LocSet) {
    for num in Num::all() {
      let num_locs: &mut Bits3x27 = self.asgmts.num_plane(num);
      for loc in LocSet(*num_locs & locs.0).iter() {
        eliminate_peers_in_plane(num_locs, loc);
      }
    }
  }

  /// The guts of `eliminate_by_overlaps`.
  fn eliminate_by_overlaps_in_band(&mut self, num: Num, band: Band) -> Result<(), Invalid> {
    let band_locs: Bits27 = self.asgmts.band_locs(num, band);

    // This is a subtle and complex algorithm that uses a bunch of bit masks
    // and lookup tables to find overlaps and eliminate possible assignments
    // based on them.  First we eliminate stuff in this band, based on
    // block-rows.
    let blk_rows: Bits9 = band_locs_to_blk_rows(band_locs);
    let row_masks = blk_rows_to_masks(blk_rows);
    let band_locs = band_locs & row_masks.zeroed_band_locs;
    if band_locs == Bits27::ZERO {
      return Err(Invalid);
    }
    *self.old_asgmts.band_locs_mut(num, band) = band_locs;
    *self.asgmts.band_locs_mut(num, band) = band_locs;

    // Next we eliminate stuff in the neighboring bands, based on the
    // block-columns in this band.
    let blk_cols: Bits9 = band_locs_to_blk_cols(band_locs);
    let col_masks = blk_cols_to_masks(blk_cols);
    let zeroed_other_band_locs = col_masks.zeroed_band_locs;
    *self.asgmts.band_locs_mut(num, band.next()) &= zeroed_other_band_locs;
    *self.asgmts.band_locs_mut(num, band.prev()) &= zeroed_other_band_locs;

    // Any block-rows that are constrained in both dimensions must have a
    // single possible assignment remaining in that block and row.
    let solved_blk_rows = row_masks.constrained_blk_rows & col_masks.constrained_blk_rows;
    // This mask zeroes out all solved locations within this band.
    let remaining_band_locs = !(band_locs & solved_blk_rows_to_band_locs_mask(solved_blk_rows));

    // Remove all solved locations from our running tally of unset
    // locations.
    *self.unset.band_locs_mut(band) &= remaining_band_locs;

    // And remove them from the remaining possible assignments for other
    // numerals.
    for other_num in Num::all() {
      if other_num != num {
        *self.asgmts.band_locs_mut(other_num, band) &= remaining_band_locs;
      }
    }

    Ok(())
  }
}

/// Eliminates a location's peers within one plane of an AsgmtSet.
fn eliminate_peers_in_plane(plane: &mut Bits3x27, loc: Loc) {
  let band = loc.row_band().index();
  unsafe {
    // Safe because loc.row_band() is in 0..3.
    *plane.mut_array().get_unchecked_mut(band) &=
      *loc_to_zeroed_peers(loc).0.array().get_unchecked(band);
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::str::FromStr;

  #[test]
  fn test_ledger_no_pivots() {
    let g = Grid::from_str(
      r"
            . . 1 | . . . | . . 8
            . . . | . 5 7 | . 3 .
            . . . | . . 4 | 9 . .
            - - - + - - - + - - -
            . . . | 5 1 9 | . . .
            . 2 . | 3 . . | . . .
            . 7 6 | 2 . . | . . .
            - - - + - - - + - - -
            . . 3 | . . . | . 4 .
            . 6 4 | . . . | 5 . 1
            8 . . | . . . | . 9 6",
    )
    .unwrap();
    let mut ledger = Ledger::new(&g).unwrap();
    assert!(ledger.is_possible(N2, L97));

    ledger.apply_implications().unwrap();
    assert!(ledger.is_complete());
  }

  #[test]
  fn test_ledger_pivots() {
    let g = Grid::from_str(
      r"
            . 6 . | 5 . 4 | . 3 .
            1 . . | . 9 . | . . 8
            . . . | . . . | . . .
            - - - + - - - + - - -
            9 . . | . 5 . | . . 6
            . 4 . | 6 . 2 | . 7 .
            7 . . | . 4 . | . . 5
            - - - + - - - + - - -
            . . . | . . . | . . .
            4 . . | . 8 . | . . 1
            . 5 . | 2 . 3 | . 4 .",
    )
    .unwrap();
    let mut ledger = Ledger::new(&g).unwrap();
    assert!(ledger.is_possible(N2, L63));

    ledger.apply_implications().unwrap();
    assert!(!ledger.is_complete());
    assert_eq!(N6, ledger.to_grid()[L63].unwrap());
  }
}
