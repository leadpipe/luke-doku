//! Defines bit masks for use by the solver.

use crate::core::bits::*;
use crate::core::*;
use seq_macro::seq;

/// Given a location, returns the set of locations that is the complement of the
/// location's peers.
pub fn loc_to_zeroed_peers(loc: Loc) -> LocSet {
  // This is safe because Locs are guaranteed to be in 0..81.
  unsafe { *LOC_TO_ZEROED_PEERS.get_unchecked(loc.get() as usize) }
}

/// Converts the 27 bits from a row-band's locations into 9 bits, one bit for
/// each of its contained block-rows.  The resulting bit for each block-row is 1
/// if any of its 3 locations' bits is 1 in the band, and 0 if none is.
pub fn band_locs_to_blk_rows(locs: Bits27) -> Bits9 {
  let [r0, r1, r2] = locs.to_bits9s();
  Bits9::from_bits3s(or_triples(r0), or_triples(r1), or_triples(r2))
}

/// Converts the 27 bits from a row-band's locations into 9 bits, one bit for
/// each of its contained block-columns.  The resulting bit for each block-col
/// is 1 if any of its 3 locations' bits is 1 in the band, and 0 if none is.
pub fn band_locs_to_blk_cols(locs: Bits27) -> Bits9 {
  let bits = locs.backing_int();
  let bits = bits | (bits >> 9) | (bits >> 18);
  Bits9::from_backing_int(bits as _)
}

/// Combines the two masks indexed by block-line masks.  (A block-line mask has
/// 9 bits, one for each block-row or block-column within one row-band of the
/// Sudoku grid.  Each bit tells whether the numeral whose plane the row-band
/// inhabits could be assigned to a location in that block-line.)
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct BlkLineMasks {
  /// This mask zeroes out locations within the (row-)band that the block-line
  /// mask implies to be impossible.
  pub zeroed_band_locs: Bits27,

  /// This mask converts the block-line mask into the set of block rows that
  /// could only contain the numeral, where that can be determined.
  pub constrained_blk_rows: Bits9,
}

/// Converts 9 bits representing the 9 block-rows within a band into a pair of
/// masks.
pub fn blk_rows_to_masks(blk_rows: Bits9) -> BlkLineMasks {
  // This is safe because Bits9s are guaranteed to be in 0..512.
  unsafe { *BLK_ROWS_TO_MASKS.get_unchecked(blk_rows.backing_int() as usize) }
}

/// Converts 9 bits representing the 9 block-columns within a band into a bit
/// mask for band locations that will zero out locations (in the other bands)
/// that are implied to be impossible.
pub fn blk_cols_to_masks(blk_cols: Bits9) -> BlkLineMasks {
  // This is safe because Bits9s are guaranteed to be in 0..512.
  unsafe { *BLK_COLS_TO_MASKS.get_unchecked(blk_cols.backing_int() as usize) }
}

/// Converts bits representing block-rows within a band into a mask for
/// that band's locations that will zero out the unsolved ones.
pub fn solved_blk_rows_to_band_locs_mask(solved_band_locs: Bits9) -> Bits27 {
  let rows: Bits3 = or_triples(solved_band_locs);
  seq!(B in 0..8 {
      static ROWS_TO_BAND_MASK: [Bits27; 8] = [
          #( rows_to_band_mask(B), )*
      ];
  });
  // Safe because Bits3::COUNT == 8.
  unsafe { *ROWS_TO_BAND_MASK.get_unchecked(rows.backing_int() as usize) }
}

const fn rows_to_band_mask(rows: u32) -> Bits27 {
  Bits27::from_backing_int(
    0o_777 * (rows & 1) + 0o_777_000 * ((rows & 2) >> 1) + 0o_777_000_000 * ((rows & 4) >> 2),
  )
}

/// Converts 3 bits into a single bit: either zero or the
/// given non-zero bit.
const fn or_triple(bits: Bits3, nonzero_bit: u8) -> u8 {
  if bits.backing_int() == 0 {
    0
  } else {
    nonzero_bit
  }
}

/// The actual logic behind `or_triples`.
#[rustfmt::skip]
const fn or_triples_impl(bits: Bits9) -> Bits3 {
    let [bits0, bits1, bits2] = bits.to_bits3s();
    Bits3::from_backing_int(
        or_triple(bits0, 1 << 0) |
        or_triple(bits1, 1 << 1) |
        or_triple(bits2, 1 << 2),
    )
}

seq!(B in 0..512 {
    /// A lookup table that memoizes all possible values of `or_triples`.
    static OR_TRIPLES: [Bits3; 512] = [
        #(
            or_triples_impl(Bits9::from_backing_int(B)),
        )*
    ];
});

/// Converts 9 bits into 3 bits by or-ing together each triple of bits.
fn or_triples(bits: Bits9) -> Bits3 {
  // This is safe because Bits9s are guaranteed to be in 0..512.
  unsafe { *OR_TRIPLES.get_unchecked(bits.backing_int() as usize) }
}

/// Returns a bit mask that zeroes out the other locations in the block when the
/// given row has a single possible block-row.
const fn blk_rows_same_band_mask_for_row(blk_rows: Bits9, row: u16) -> u32 {
  let row_bits = (0b111 << (3 * row)) & blk_rows.backing_int();
  match row_bits.count_ones() {
    0 => 0,
    1 => match row_bits >> (3 * row) {
      0b001 => 0o_770_770_770 | (0o_007 << (9 * row)),
      0b010 => 0o_707_707_707 | (0o_070 << (9 * row)),
      0b100 => 0o_077_077_077 | (0o_700 << (9 * row)),
      _ => panic!("unreachable"),
    },
    _ => 0o_777_777_777,
  }
}

/// Returns a bit mask that zeroes out the other locations in the row when the
/// given block has a single possible block-row.
const fn blk_rows_same_band_mask_for_blk(blk_rows: Bits9, blk: u16) -> u32 {
  let blk_bits = (0o_111 << blk) & blk_rows.backing_int();
  match blk_bits.count_ones() {
    0 => 0,
    1 => match blk_bits >> blk {
      0o_001 => 0o_777_777_000 | (0o_000_000_007 << (3 * blk)),
      0o_010 => 0o_777_000_777 | (0o_000_007_000 << (3 * blk)),
      0o_100 => 0o_000_777_777 | (0o_007_000_000 << (3 * blk)),
      _ => panic!("unreachable"),
    },
    _ => 0o_777_777_777,
  }
}

/// Transforms the given bit mask to zero when a full unit is zero within it.
const fn clear_when_unit_empty(bits: u32, unit_mask: u32) -> u32 {
  if bits & unit_mask == 0 {
    0
  } else {
    bits
  }
}

/// Calculates which locations within a band are impossible given a block-row mask.
#[rustfmt::skip]
const fn blk_rows_to_zeroed_band_locs(blk_rows: Bits9) -> Bits27 {
    let bits =
        blk_rows_same_band_mask_for_row(blk_rows, 0) &
        blk_rows_same_band_mask_for_row(blk_rows, 1) &
        blk_rows_same_band_mask_for_row(blk_rows, 2) &
        blk_rows_same_band_mask_for_blk(blk_rows, 0) &
        blk_rows_same_band_mask_for_blk(blk_rows, 1) &
        blk_rows_same_band_mask_for_blk(blk_rows, 2);
    let bits =
        clear_when_unit_empty(bits, 0o_000_000_777) &
        clear_when_unit_empty(bits, 0o_000_777_000) &
        clear_when_unit_empty(bits, 0o_777_000_000) &
        clear_when_unit_empty(bits, 0o_007_007_007) &
        clear_when_unit_empty(bits, 0o_070_070_070) &
        clear_when_unit_empty(bits, 0o_700_700_700);
    Bits27::from_backing_int(bits)
}

const fn blk_rows_to_forced_row_bit(blk_rows: Bits9, row: u16) -> u16 {
  let row_bits = (0b111 << (3 * row)) & blk_rows.backing_int();
  if row_bits.count_ones() == 1 {
    row_bits
  } else {
    0
  }
}

const fn has_zero_unit(blk_lines: Bits9, m0: u16, m1: u16, m2: u16) -> bool {
  let bits = blk_lines.backing_int();
  bits & m0 == 0 || bits & m1 == 0 || bits & m2 == 0
}

/// Calculates which block-rows may contain assignments, when we can narrow
/// down the possibilities to one per block given the current mask.
#[rustfmt::skip]
const fn blk_rows_to_constrained_blk_rows(blk_rows: Bits9) -> Bits9 {
    let band_locs = blk_rows_to_zeroed_band_locs(blk_rows);
    let [r0, r1, r2] = band_locs.to_bits9s();
    let bits = Bits9::from_bits3s(or_triples_impl(r0), or_triples_impl(r1), or_triples_impl(r2));
    let blk_rows = Bits9::from_backing_int(bits.backing_int() & blk_rows.backing_int());
    Bits9::from_backing_int(
        blk_rows_to_forced_row_bit(blk_rows, 0) |
        blk_rows_to_forced_row_bit(blk_rows, 1) |
        blk_rows_to_forced_row_bit(blk_rows, 2))
}

/// The guts of `blk_rows_to_masks`.
const fn blk_rows_to_masks_impl(blk_rows: Bits9) -> BlkLineMasks {
  BlkLineMasks {
    zeroed_band_locs: blk_rows_to_zeroed_band_locs(blk_rows),
    constrained_blk_rows: blk_rows_to_constrained_blk_rows(blk_rows),
  }
}

seq!(B in 0..512 {
    /// A lookup table that memoizes all possible values of `blk_rows_to_masks`.
    static BLK_ROWS_TO_MASKS: [BlkLineMasks; 512] = [
        #(
            blk_rows_to_masks_impl(Bits9::from_backing_int(B)),
        )*
    ];
});

/// Returns a bit mask that zeroes out the other locations in the column (in the
/// other two bands) when the given block has a single possible block-column.
const fn blk_cols_diff_band_mask_for_blk(blk_cols: Bits9, blk: u16) -> u32 {
  let blk_bits = (0b111 << (3 * blk)) & blk_cols.backing_int();
  match blk_bits.count_ones() {
    0 => 0,
    1 => match blk_bits >> (3 * blk) {
      0b001 => 0o_777_777_777 ^ (0o_001_001_001 << (3 * blk)),
      0b010 => 0o_777_777_777 ^ (0o_002_002_002 << (3 * blk)),
      0b100 => 0o_777_777_777 ^ (0o_004_004_004 << (3 * blk)),
      _ => panic!("unreachable"),
    },
    _ => 0o_777_777_777,
  }
}

/// Calculates which locations within a band are impossible given a block-column mask.
#[rustfmt::skip]
const fn blk_cols_to_zeroed_band_locs(blk_cols: Bits9) -> Bits27 {
    let bits =
        blk_cols_diff_band_mask_for_blk(blk_cols, 0) &
        blk_cols_diff_band_mask_for_blk(blk_cols, 1) &
        blk_cols_diff_band_mask_for_blk(blk_cols, 2);
        let bits =
        clear_when_unit_empty(bits, 0o_007_007_007) &
        clear_when_unit_empty(bits, 0o_070_070_070) &
        clear_when_unit_empty(bits, 0o_700_700_700);
        Bits27::from_backing_int(bits)
}

const fn blk_cols_to_blk_bit(blk_cols: Bits9, blk: u16) -> u8 {
  let blk_bits = (0b111 << (3 * blk)) & blk_cols.backing_int();
  if blk_bits.count_ones() == 1 {
    1 << blk
  } else {
    0
  }
}

/// Calculates which block-rows may contain assignments, when we can narrow
/// down the possibilities to one per block given the block-column mask.
const fn blk_cols_to_constrained_blk_rows(blk_cols: Bits9) -> Bits9 {
  if has_zero_unit(blk_cols, 0o007, 0o070, 0o700) {
    return Bits9::ZERO;
  }
  let b0 = blk_cols_to_blk_bit(blk_cols, 0);
  let b1 = blk_cols_to_blk_bit(blk_cols, 1);
  let b2 = blk_cols_to_blk_bit(blk_cols, 2);
  let blks = Bits3::from_backing_int(b0 | b1 | b2);
  // This mask for blk-rows will zero out the blks that don't have a single
  // selected column.
  Bits9::from_bits3s(blks, blks, blks)
}

/// The guts of `blk_cols_to_masks`.
const fn blk_cols_to_masks_impl(blk_cols: Bits9) -> BlkLineMasks {
  BlkLineMasks {
    zeroed_band_locs: blk_cols_to_zeroed_band_locs(blk_cols),
    constrained_blk_rows: blk_cols_to_constrained_blk_rows(blk_cols),
  }
}

seq!(B in 0..512 {
    /// A lookup table that memoizes all possible values of `blk_cols_to_masks`.
    static BLK_COLS_TO_MASKS: [BlkLineMasks; 512] = [
        #(
            blk_cols_to_masks_impl(Bits9::from_backing_int(B)),
        )*
    ];
});

/// Calculates the inverse of the given location's peer set, for removing all
/// peers with an `&` operation.
const fn loc_to_zeroed_peers_impl(loc_id: i8) -> LocSet {
  // Safe because this is only called with IDs in 0..81.
  let loc = unsafe { Loc::new_unchecked(loc_id) };
  LocSet(loc.calc_peers().0.const_not())
}

seq!(L in 0..81 {
    /// A lookup table that memoizes `loc_to_zeroed_peers`.
    static LOC_TO_ZEROED_PEERS: [LocSet; 81] = [
        #(
            loc_to_zeroed_peers_impl(L),
        )*
    ];
});

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_or_triples() {
    assert_eq!(
      Bits3::from_backing_int(0),
      or_triples(Bits9::from_backing_int(0))
    );
    assert_eq!(
      Bits3::from_backing_int(0b010),
      or_triples(Bits9::from_backing_int(0o050))
    );
    assert_eq!(
      Bits3::from_backing_int(0b111),
      or_triples(Bits9::from_backing_int(0o174))
    );
  }

  #[test]
  fn test_blk_rows_to_masks() {
    assert_eq!(
      Bits27::from_backing_int(0o_707_070_700),
      blk_rows_to_masks(Bits9::from_backing_int(0o_125)).zeroed_band_locs
    );
    assert_eq!(
      Bits27::ZERO,
      blk_rows_to_masks(Bits9::from_backing_int(0o_115)).zeroed_band_locs
    );

    assert_eq!(
      Bits9::from_backing_int(0o_124),
      blk_rows_to_masks(Bits9::from_backing_int(0o_136)).constrained_blk_rows
    );
    assert_eq!(
      Bits9::ZERO,
      blk_rows_to_masks(Bits9::from_backing_int(0o_116)).constrained_blk_rows
    );
  }

  #[test]
  fn test_blk_cols_to_masks() {
    assert_eq!(
      Bits27::from_backing_int(0o_657_657_657),
      blk_cols_to_masks(Bits9::from_backing_int(0o_125)).zeroed_band_locs
    );
    assert_eq!(
      Bits27::ZERO,
      blk_cols_to_masks(Bits9::from_backing_int(0o_105)).zeroed_band_locs
    );

    assert_eq!(
      Bits9::from_backing_int(0o_444),
      blk_cols_to_masks(Bits9::from_backing_int(0o_136)).constrained_blk_rows
    );
    assert_eq!(
      Bits9::from_backing_int(0o_666),
      blk_cols_to_masks(Bits9::from_backing_int(0o_116)).constrained_blk_rows
    );
  }

  #[test]
  fn test_loc_to_zeroed_peers() {
    for loc in Loc::all() {
      let zp = loc_to_zeroed_peers(loc);
      assert_eq!(81 - 20, zp.len());
      assert!(zp.contains(loc));
      let p = loc.peers();
      assert_eq!(p, !zp);
      assert_eq!(zp, !p);
      assert_eq!(81, (zp | p).len());
      assert_eq!(0, (zp & p).len());
    }
  }
}
