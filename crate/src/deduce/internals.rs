///! Defines low-level functions and lookup tables for the deduce module.
use crate::core::bits::*;
use crate::core::masks::*;
use crate::core::set::*;
use crate::core::*;
use crate::define_set_operators;
use seq_macro::seq;

use super::Fact;

pub fn find_overlaps(remaining_asgmts: &AsgmtSet, facts: &mut Vec<Fact>) {
  for num in Num::all() {
    let num_locs = remaining_asgmts.num_locs(num);
    for band in Band::all() {
      let band_locs = num_locs.band_locs(band);
      let blk_row_bits = band_locs_to_blk_rows(band_locs);
      let blk_col_bits = locs_to_blk_cols(num_locs, band);
      blk_row_bits_to_overlaps(blk_row_bits, num, band, facts);
      blk_col_bits_to_overlaps(blk_col_bits, num, band, facts);
    }
  }
}

pub fn find_hidden_singles(remaining_asgmts: &AsgmtSet, facts: &mut Vec<Fact>) {
  for num in Num::all() {
    let num_locs = remaining_asgmts.num_locs(num);
    let mut units_to_check = UnitSet::default();
    for band in Band::all() {
      let band_locs = num_locs.band_locs(band);
      let blk_row_bits = band_locs_to_blk_rows(band_locs);
      let blk_col_bits = locs_to_blk_cols(num_locs, band);
      units_to_check |=
        blk_line_bits_to_possible_hidden_single_units(blk_row_bits, blk_col_bits, band);
    }
    for unit in units_to_check.iter() {
      let unit_locs = num_locs & unit.locs();
      if unit_locs.len() == 1 {
        let loc = unit_locs.smallest_item().unwrap();
        facts.push(Fact::SingleLoc { num, unit, loc });
      }
    }
  }
}

pub fn find_naked_singles(remaining_asgmts: &AsgmtSet, facts: &mut Vec<Fact>) {
  let naked_singles = remaining_asgmts.naked_singles();
  for num in Num::all() {
    for loc in (remaining_asgmts.num_locs(num) & naked_singles).iter() {
      facts.push(Fact::SingleNum { loc, num });
    }
  }
}

/// Converts the bits from a column-band's locations into 9 bits, one bit for
/// each of its contained block-columns.  The resulting bit for each block-col
/// is 1 if any of its 3 locations' bits is 1 in the band, and 0 if none is.
fn locs_to_blk_cols(locs: LocSet, band: Band) -> Bits9 {
  Bits9::from_bits3s(
    col_band_locs_to_blk_cols(locs, band, BL1),
    col_band_locs_to_blk_cols(locs, band, BL2),
    col_band_locs_to_blk_cols(locs, band, BL3),
  )
}

/// Converts the bits from a column into 3 bits, one bit for each of its
/// contained block-columns.  The resulting bit for each block-col is 1 if any
/// of its 3 locations' bits is 1, and 0 if none is.
fn col_band_locs_to_blk_cols(locs: LocSet, band: Band, blk_line: BlkLine) -> Bits3 {
  Bits3::from_backing_int(
    blk_col_bit(locs, BAND1, band, blk_line)
      | blk_col_bit(locs, BAND2, band, blk_line) << 1
      | blk_col_bit(locs, BAND3, band, blk_line) << 2,
  )
}

fn blk_col_bit(locs: LocSet, row_band: Band, col_band: Band, blk_line: BlkLine) -> u8 {
  let blk_bits = locs.band_locs(row_band).backing_int() >> (col_band.index() * 3);
  let blk_col_bits = blk_bits | (blk_bits >> 9) | (blk_bits >> 18);
  (blk_col_bits >> blk_line.index()) as u8 & 1
}

/// Extracts the overlaps from a bitmap of block-rows, and stores them as facts
/// in the given vector.  The bitmap represents the block-rows of the given
/// row-band; the ones mean that at least one of the locations in the
/// corresponding block-row is assignable to the given numeral.  
fn blk_row_bits_to_overlaps(blk_row_bits: Bits9, num: Num, band: Band, facts: &mut Vec<Fact>) {
  for spec in blk_line_bits_to_overlap_specs(blk_row_bits).iter() {
    facts.push(spec.to_row_band_overlap(num, band));
  }
}

/// Extracts the overlaps from a bitmap of block-columns, and stores them as
/// facts in the given vector.  The bitmap represents the block-columns of the
/// given column-band; the ones mean that at least one of the locations in the
/// corresponding block-column is assignable to the given numeral.
fn blk_col_bits_to_overlaps(blk_col_bits: Bits9, num: Num, band: Band, facts: &mut Vec<Fact>) {
  for spec in blk_line_bits_to_overlap_specs(blk_col_bits).iter() {
    facts.push(spec.to_col_band_overlap(num, band));
  }
}

fn blk_line_bits_to_possible_hidden_single_units(
  blk_row_bits: Bits9,
  blk_col_bits: Bits9,
  band: Band,
) -> UnitSet {
  let mut units = UnitSet::default();
  for band_unit in blk_line_bits_to_band_units(blk_row_bits).iter() {
    match band_unit {
      0..=2 => {
        units.insert(unsafe {
          Blk::from_index_unchecked(band_unit as usize + 3 * band.index()).to_unit()
        });
      }
      3..=5 => {
        units.insert(unsafe {
          Row::from_index_unchecked(band_unit as usize - 3 + 3 * band.index()).to_unit()
        });
      }
      _ => unreachable!(),
    }
  }
  for band_unit in blk_line_bits_to_band_units(blk_col_bits).iter() {
    match band_unit {
      0..=2 => {
        // We skip adding the block, because if it is a hidden single, it will
        // show up in the row-band too.
      }
      3..=5 => {
        units.insert(unsafe {
          Col::from_index_unchecked(band_unit as usize - 3 + 3 * band.index()).to_unit()
        });
      }
      _ => unreachable!(),
    }
  }
  units
}

/// Looks up the implied overlaps from a bitmap of block-rows or block-columns.
fn blk_line_bits_to_overlap_specs(blk_line_bits: Bits9) -> BandOverlapSpecSet {
  // Safe because the backing int is in 0..512, and the array is 512 long.
  debug_assert_eq!(1 << Bits9::CAPACITY, OVERLAP_SPEC_SETS.len());
  unsafe { *OVERLAP_SPEC_SETS.get_unchecked(blk_line_bits.backing_int() as usize) }
}

seq!(B in 0..512 {
  // A lookup table of all possible single-band block-row (or block-column)
  // combinations, and their corresponding overlap specs.
  const OVERLAP_SPEC_SETS: [BandOverlapSpecSet; 512] = [
    #(
      blk_line_bits_to_overlap_specs_impl(Bits9::from_backing_int(B)),
    )*
  ];
});

/// Generates the overlap specs for a given bitmap of block-lines.
const fn blk_line_bits_to_overlap_specs_impl(bits: Bits9) -> BandOverlapSpecSet {
  let mut guts = 0;
  guts |= blk_line_bits_to_overlap_specs_impl_unrolled_blk(bits, 0);
  guts |= blk_line_bits_to_overlap_specs_impl_unrolled_blk(bits, 1);
  guts |= blk_line_bits_to_overlap_specs_impl_unrolled_blk(bits, 2);
  guts |= blk_line_bits_to_overlap_specs_impl_unrolled_line(bits, 0);
  guts |= blk_line_bits_to_overlap_specs_impl_unrolled_line(bits, 1);
  guts |= blk_line_bits_to_overlap_specs_impl_unrolled_line(bits, 2);
  BandOverlapSpecSet(Bits18::from_backing_int(guts))
}

/// One unrolled loop from `blk_line_bits_to_overlap_specs_impl`.
const fn blk_line_bits_to_overlap_specs_impl_unrolled_blk(bits: Bits9, blk: i32) -> u32 {
  let mut answer = 0;
  let bits = bits.backing_int();
  let blk_bits = 0o111 & (bits >> blk);
  if blk_bits.count_ones() == 1 {
    // The numeral is confined to just one block-line within this block, so we
    // have an overlap.
    let line = match blk_bits {
      0o001 => 0,
      0o010 => 1,
      0o100 => 2,
      _ => unreachable!(),
    };
    let line_bits = 0b111 & (bits >> (line * 3));
    // Only create a spec if the line has possible assignments outside of the
    // block.
    if line_bits.count_ones() > 1 {
      let spec = BandOverlapSpec {
        band_unit: blk,
        cross_unit: line,
      };
      answer = 1 << spec.to_index()
    }
  }
  answer
}

/// The other unrolled loop from `blk_line_bits_to_overlap_specs_impl`.
const fn blk_line_bits_to_overlap_specs_impl_unrolled_line(bits: Bits9, line: i32) -> u32 {
  let mut answer = 0;
  let bits = bits.backing_int();
  let line_bits = 0b111 & (bits >> (line * 3));
  if line_bits.count_ones() == 1 {
    // The numeral is confined to just one block-line within this line, so we
    // have an overlap.
    let blk = match line_bits {
      0b001 => 0,
      0b010 => 1,
      0b100 => 2,
      _ => unreachable!(),
    };
    let blk_bits = 0o111 & (bits >> blk);
    // Only create a spec if the block has possible assignments outside of the
    // line.
    if blk_bits.count_ones() > 1 {
      let spec = BandOverlapSpec {
        band_unit: line + 3,
        cross_unit: blk,
      };
      answer = 1 << spec.to_index();
    }
  }
  answer
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct BandOverlapSpec {
  /// The unit within a row- or column-band.  0..3 represents the block, and
  /// 3..6 represents the line; so 6 possibilities total.
  band_unit: i32,
  /// The unit that overlaps with the band unit: a line when the band unit is a
  /// block, or a block when the band unit is a line. This is always 0..3.
  cross_unit: i32,
}

impl BandOverlapSpec {
  const fn to_index(&self) -> i32 {
    self.band_unit * 3 + self.cross_unit
  }

  fn to_row_band_overlap(&self, num: Num, row_band: Band) -> Fact {
    match self.band_unit {
      0..=2 => Fact::Overlap {
        num,
        unit: unsafe {
          // Safe because band_unit is in 0..3, row_band is in 0..3, and
          // Blk::from_index_unchecked is safe for 0..9.
          debug_assert_eq!(3 * Band::COUNT, Blk::COUNT);
          Blk::from_index_unchecked(self.band_unit as usize + 3 * row_band.index())
        }
        .to_unit(),
        cross_unit: unsafe {
          // Safe because cross_unit is in 0..3, row_band is in 0..3, and
          // Row::from_index_unchecked is safe for 0..9.
          debug_assert_eq!(3 * Band::COUNT, Row::COUNT);
          Row::from_index_unchecked(self.cross_unit as usize + 3 * row_band.index())
        }
        .to_unit(),
      },
      3..=5 => Fact::Overlap {
        num,
        unit: unsafe {
          // Safe because band_unit is in 3..6, row_band is in 0..3, and
          // Row::from_index_unchecked is safe for 0..9.
          debug_assert_eq!(3 * Band::COUNT, Row::COUNT);
          Row::from_index_unchecked(self.band_unit as usize - 3 + 3 * row_band.index())
        }
        .to_unit(),
        cross_unit: unsafe {
          // Safe because cross_unit is in 0..3, row_band is in 0..3, and
          // Blk::from_index_unchecked is safe for 0..9.
          debug_assert_eq!(3 * Band::COUNT, Blk::COUNT);
          Blk::from_index_unchecked(self.cross_unit as usize + 3 * row_band.index())
        }
        .to_unit(),
      },
      _ => unreachable!(),
    }
  }

  fn to_col_band_overlap(&self, num: Num, col_band: Band) -> Fact {
    match self.band_unit {
      0..=2 => Fact::Overlap {
        num,
        unit: unsafe {
          // Safe because band_unit is in 0..3, col_band is in 0..3, and
          // Blk::from_index_unchecked is safe for 0..9.
          debug_assert_eq!(3 * Band::COUNT, Blk::COUNT);
          Blk::from_index_unchecked(3 * self.band_unit as usize + col_band.index())
        }
        .to_unit(),
        cross_unit: unsafe {
          // Safe because cross_unit is in 0..3, col_band is in 0..3, and
          // Col::from_index_unchecked is safe for 0..9.
          debug_assert_eq!(3 * Band::COUNT, Col::COUNT);
          Col::from_index_unchecked(self.cross_unit as usize + 3 * col_band.index())
        }
        .to_unit(),
      },
      3..=5 => Fact::Overlap {
        num,
        unit: unsafe {
          // Safe because band_unit is in 3..6, col_band is in 0..3, and
          // Col::from_index_unchecked is safe for 0..9.
          debug_assert_eq!(3 * Band::COUNT, Col::COUNT);
          Col::from_index_unchecked(self.band_unit as usize - 3 + 3 * col_band.index())
        }
        .to_unit(),
        cross_unit: unsafe {
          // Safe because cross_unit is in 0..3, col_band is in 0..3, and
          // Blk::from_index_unchecked is safe for 0..9.
          debug_assert_eq!(3 * Band::COUNT, Blk::COUNT);
          Blk::from_index_unchecked(3 * self.cross_unit as usize + col_band.index())
        }
        .to_unit(),
      },
      _ => unreachable!(),
    }
  }
}

/// A set of overlap specs.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct BandOverlapSpecSet(Bits18);

impl<'a> Set<'a> for BandOverlapSpecSet {
  type Item = BandOverlapSpec;
  type Bits = Bits18;

  fn bits(&self) -> &Self::Bits {
    &self.0
  }

  fn mut_bits(&mut self) -> &mut Self::Bits {
    &mut self.0
  }

  fn to_bits_value(&self, item: Self::Item) -> i32 {
    item.to_index()
  }

  fn from_bits_value(&self, value: i32) -> Self::Item {
    let band_unit = value / 3;
    let cross_unit = value % 3;
    BandOverlapSpec {
      band_unit,
      cross_unit,
    }
  }
}

define_set_operators!(BandOverlapSpecSet);

/// Looks up the band units (blocks and lines) that are possible hidden singles
/// for the given block-line bits.
fn blk_line_bits_to_band_units(bits: Bits9) -> IntSet<u8> {
  // Safe because the backing int is in 0..512, and the array is 512 long.
  debug_assert_eq!(1 << Bits9::CAPACITY, HIDDEN_SINGLES_UNITS.len());
  unsafe { *HIDDEN_SINGLES_UNITS.get_unchecked(bits.backing_int() as usize) }
}

seq!(B in 0..512 {
  // A lookup table of all possible single-band block-row (or block-column)
  // combinations, and their corresponding band-unit sets.  We represent a band
  // unit as an int in 0..6, where 0..3 are the blocks, and 3..6 are the lines.
  // And we use a u8 to back the IntSet, because we only need 6 bits.
  const HIDDEN_SINGLES_UNITS: [IntSet<u8>; 512] = [
    #(
      blk_line_bits_to_band_units_impl(Bits9::from_backing_int(B)),
    )*
  ];
});

/// Generates the overlap specs for a given bitmap of block-lines.
const fn blk_line_bits_to_band_units_impl(bits: Bits9) -> IntSet<u8> {
  let mut guts = 0;
  guts |= blk_line_bits_to_band_units_impl_unrolled_blk(bits, 0);
  guts |= blk_line_bits_to_band_units_impl_unrolled_blk(bits, 1);
  guts |= blk_line_bits_to_band_units_impl_unrolled_blk(bits, 2);
  guts |= blk_line_bits_to_band_units_impl_unrolled_line(bits, 0);
  guts |= blk_line_bits_to_band_units_impl_unrolled_line(bits, 1);
  guts |= blk_line_bits_to_band_units_impl_unrolled_line(bits, 2);
  IntSet(guts)
}

/// One unrolled loop from `blk_line_bits_to_band_units_impl`.
const fn blk_line_bits_to_band_units_impl_unrolled_blk(bits: Bits9, blk: i32) -> u8 {
  let mut answer = 0;
  let bits = bits.backing_int();
  let blk_bits = 0o111 & (bits >> blk);
  if blk_bits.count_ones() == 1 {
    // The numeral is confined to just one block-line within this block, so we
    // might have a hidden single.
    answer = 1 << blk;
  }
  answer
}

/// The other unrolled loop from `blk_line_bits_to_band_units_impl`.
const fn blk_line_bits_to_band_units_impl_unrolled_line(bits: Bits9, line: i32) -> u8 {
  let mut answer = 0;
  let bits = bits.backing_int();
  let line_bits = 0b111 & (bits >> (line * 3));
  if line_bits.count_ones() == 1 {
    // The numeral is confined to just one block-line within this line, so we
    // might have a hidden single.
    answer = 1 << (line + 3); // 3..6 are the lines.
  }
  answer
}

#[cfg(test)]
mod tests {
  use std::str::FromStr;

  use super::*;
  use crate::core::bits::Bits3x27;

  #[test]
  fn test_locs_to_blk_cols() {
    let locs = LocSet(Bits3x27::new([
      Bits27::from_backing_int(0o000_000_400),
      Bits27::from_backing_int(0o000_056_056),
      Bits27::from_backing_int(0o056_000_056),
    ]));
    assert_eq!(
      locs_to_blk_cols(locs, BAND1),
      Bits9::from_backing_int(0o660)
    );
    assert_eq!(
      locs_to_blk_cols(locs, BAND2),
      Bits9::from_backing_int(0o606)
    );
    assert_eq!(
      locs_to_blk_cols(locs, BAND3),
      Bits9::from_backing_int(0o100)
    );
  }

  #[test]
  fn test_band_locs_to_blk_rows() {
    let locs = Bits3x27::new([
      Bits27::from_backing_int(0o000_000_400),
      Bits27::from_backing_int(0o000_056_056),
      Bits27::from_backing_int(0o056_000_056),
    ]);
    assert_eq!(
      band_locs_to_blk_rows(locs.array()[0]),
      Bits9::from_backing_int(0o004)
    );
    assert_eq!(
      band_locs_to_blk_rows(locs.array()[1]),
      Bits9::from_backing_int(0o033)
    );
    assert_eq!(
      band_locs_to_blk_rows(locs.array()[2]),
      Bits9::from_backing_int(0o303)
    );
  }

  #[test]
  fn test_to_row_band_overlap_band() {
    let spec = BandOverlapSpec {
      band_unit: 1,
      cross_unit: 2,
    };
    assert_eq!(
      spec.to_row_band_overlap(N1, BAND2),
      Fact::Overlap {
        num: N1,
        unit: B5.to_unit(),
        cross_unit: R6.to_unit(),
      }
    );
  }

  #[test]
  fn test_to_row_band_overlap_row() {
    let spec = BandOverlapSpec {
      band_unit: 4,
      cross_unit: 1,
    };
    assert_eq!(
      spec.to_row_band_overlap(N2, BAND1),
      Fact::Overlap {
        num: N2,
        unit: R2.to_unit(),
        cross_unit: B2.to_unit(),
      }
    );
  }

  #[test]
  fn test_to_col_band_overlap_band() {
    let spec = BandOverlapSpec {
      band_unit: 0,
      cross_unit: 2,
    };
    assert_eq!(
      spec.to_col_band_overlap(N3, BAND2),
      Fact::Overlap {
        num: N3,
        unit: B2.to_unit(),
        cross_unit: C6.to_unit(),
      }
    );
  }

  #[test]
  fn test_to_col_band_overlap_col() {
    let spec = BandOverlapSpec {
      band_unit: 5,
      cross_unit: 0,
    };
    assert_eq!(
      spec.to_col_band_overlap(N4, BAND3),
      Fact::Overlap {
        num: N4,
        unit: C9.to_unit(),
        cross_unit: B3.to_unit(),
      }
    );
  }

  fn make_overlap(num: Num, unit: impl UnitTrait, cross_unit: impl UnitTrait) -> Fact {
    Fact::Overlap {
      num,
      unit: unit.to_unit(),
      cross_unit: cross_unit.to_unit(),
    }
  }

  #[test]
  fn test_find_overlaps() {
    let grid = Grid::from_str(
      r"
            . . 2 | 6 . . | . . .
            1 6 . | . 5 . | 9 . .
            5 . 3 | 4 . . | . . .
            - - - + - - - + - - -
            4 . . | . . . | . . 3
            . . . | 7 . . | . 2 .
            9 . . | . . . | 5 . 8
            - - - + - - - + - - -
            . . . | . . 4 | 1 . .
            6 . . | 2 . . | . 5 .
            . . . | 1 . 6 | 8 . .",
    )
    .unwrap();
    let asgmts = AsgmtSet::possibles_from_grid(&grid) - AsgmtSet::simple_from_grid(&grid);
    let mut facts = Vec::new();
    find_overlaps(&asgmts, &mut facts);
    assert_eq!(
      facts,
      vec![
        make_overlap(N2, B4, C2),
        make_overlap(N2, C1, B7),
        make_overlap(N2, B9, C9),
        make_overlap(N2, C7, B3),
        make_overlap(N5, B8, C4),
        make_overlap(N5, C6, B5),
        make_overlap(N5, B8, R7),
        make_overlap(N5, R9, B7),
        make_overlap(N9, B1, C2),
        make_overlap(N9, C3, B7),
      ]
    );
  }

  fn make_hidden_single(num: Num, unit: impl UnitTrait, loc: Loc) -> Fact {
    Fact::SingleLoc {
      num,
      unit: unit.to_unit(),
      loc,
    }
  }

  #[test]
  fn test_find_hidden_singles() {
    let grid = Grid::from_str(
      r"
            . . 2 | 6 . . | . . .
            1 6 . | . 5 . | 9 . .
            5 . 3 | 4 . . | . . .
            - - - + - - - + - - -
            4 . . | . . . | . . 3
            . . . | 7 . . | . 2 .
            9 . . | . . . | 5 . 8
            - - - + - - - + - - -
            . . . | . . 4 | 1 . .
            6 . . | 2 . . | . 5 .
            . . . | 1 . 6 | 8 . .",
    )
    .unwrap();
    let asgmts = AsgmtSet::possibles_from_grid(&grid) - AsgmtSet::simple_from_grid(&grid);
    let mut facts = Vec::new();
    find_hidden_singles(&asgmts, &mut facts);
    assert_eq!(
      facts,
      vec![
        make_hidden_single(N2, C7, L37),
        make_hidden_single(N5, B3, L19),
        make_hidden_single(N5, B8, L74),
        make_hidden_single(N5, R1, L19),
        make_hidden_single(N5, C9, L19),
      ]
    );
  }

  fn make_naked_single(loc: Loc, num: Num) -> Fact {
    Fact::SingleNum { loc, num }
  }

  #[test]
  fn test_find_naked_singles() {
    let grid = Grid::from_str(
      r"
            . . 2 | 6 . . | . . .
            1 6 . | . 5 . | 9 . .
            5 . 3 | 4 . . | . . .
            - - - + - - - + - - -
            4 . . | . . . | . . 3
            . . . | 7 . . | . 2 .
            9 . . | . . . | 5 . 8
            - - - + - - - + - - -
            . . . | . . 4 | 1 . .
            6 . . | 2 . . | . 5 .
            . . . | 1 . 6 | 8 . .",
    )
    .unwrap();
    let asgmts = AsgmtSet::possibles_from_grid(&grid) - AsgmtSet::simple_from_grid(&grid);
    let mut facts = Vec::new();
    find_naked_singles(&asgmts, &mut facts);
    assert_eq!(facts, vec![make_naked_single(L64, N3),]);
  }
}
