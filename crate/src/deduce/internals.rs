///! Defines low-level functions and lookup tables for the deduce module.
use itertools::Itertools;
use seq_macro::seq;
use std::collections::HashMap;
use std::fmt;
use std::ops::Index;
use std::ops::IndexMut;

use crate::core::bits::*;
use crate::core::masks::*;
use crate::core::set::*;
use crate::core::*;
use crate::define_set_operators;

use super::Fact;

pub struct Collector {
  pub remaining_asgmts: AsgmtSet,
  pub actual_asgmts: AsgmtSet,
  pub sukaku_map: SukakuMap,
  pub facts: Vec<Fact>,
  pub found: HashMap<Fact, ()>,
}

/// The ways that the collector can handle errors during deduction.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ErrorMode {
  /// Used when the caller knows that there can't be any errors.
  Ignore,
  /// Used when the caller wants to stop deduction on the first error.
  ShortCircuit,
  /// Used when the caller wants to collect all errors and continue deduction.
  Collect,
}

impl Collector {
  pub fn new(remaining_asgmts: AsgmtSet, actual_asgmts: AsgmtSet, sukaku_map: SukakuMap) -> Self {
    Self {
      remaining_asgmts,
      actual_asgmts,
      sukaku_map,
      facts: Vec::new(),
      found: HashMap::new(),
    }
  }

  pub fn add_fact(&mut self, fact: Fact) {
    self
      .found
      .entry(fact)
      .or_insert_with_key(|fact| self.facts.push(fact.clone()));
  }

  /// Collects all facts from the current state of the collector, using the
  /// given error mode to determine how to handle errors.
  pub fn collect(&mut self, error_mode: ErrorMode) -> Result<(), Invalid> {
    let mut antecedents: Vec<Fact> = vec![];
    let mut antecedent_eliminations: Vec<AsgmtSet> = vec![];
    let mut remaining_asgmts = self.remaining_asgmts;
    let mut sukaku_map = self.sukaku_map;
    let mut set_state = SetState::new();
    loop {
      let start = self.facts.len();
      if error_mode != ErrorMode::Ignore {
        find_errors(self, error_mode == ErrorMode::ShortCircuit)?;
      }
      let eliminations_start = self.facts.len();
      find_overlaps(self);
      find_locked_sets(self, &mut set_state);
      let eliminations_end = self.facts.len();
      find_hidden_singles(self);
      find_naked_singles(self);

      let eliminations: Vec<AsgmtSet> = self.facts[eliminations_start..eliminations_end]
        .iter()
        .map(|fact| fact.as_eliminations())
        .collect();

      if !antecedents.is_empty() {
        for fact in self.facts[start..].iter_mut() {
          *fact = Fact::Implication {
            antecedents: narrow_antecedents(
              &fact,
              antecedents.as_slice(),
              &antecedent_eliminations,
              remaining_asgmts,
              sukaku_map,
            ),
            consequent: Box::new(fact.clone()),
          };
        }
      }
      if eliminations_start == eliminations_end {
        break;
      }
      antecedents = self.facts[eliminations_start..eliminations_end].to_vec();
      antecedent_eliminations = eliminations.clone();
      remaining_asgmts = self.remaining_asgmts;
      sukaku_map = self.sukaku_map;
      let all_eliminated_asgmts = eliminations.iter().fold(AsgmtSet::new(), |acc, x| acc | *x);
      self.remaining_asgmts -= all_eliminated_asgmts;
      self.sukaku_map.eliminate(&all_eliminated_asgmts);
    }
    Ok(())
  }

  pub fn collect_singles(&mut self) {
    find_hidden_singles(self);
    find_naked_singles(self);
  }
}

fn narrow_antecedents(
  consequent: &Fact,
  antecedents: &[Fact],
  antecedent_eliminations: &[AsgmtSet],
  remaining_asgmts: AsgmtSet,
  sukaku_map: SukakuMap,
) -> Vec<Fact> {
  let mut result = Vec::new();
  let mut result_eliminations = AsgmtSet::new();
  let uses_sukaku_map = consequent.uses_sukaku_map();
  for index in (0..antecedents.len()).rev() {
    let antecedent = &antecedents[index];
    if consequent.might_be_revealed_by_eliminations(&antecedent_eliminations[index]) {
      let prior_antecedents_eliminations = antecedent_eliminations[0..index]
        .iter()
        .fold(result_eliminations, |acc, x| acc | *x);
      let remaining_asgmts = remaining_asgmts - prior_antecedents_eliminations;
      let mut sukaku_map = sukaku_map;
      if uses_sukaku_map {
        sukaku_map.eliminate(&prior_antecedents_eliminations);
      }
      if !consequent.is_implied_by(&remaining_asgmts, &sukaku_map) {
        // The consequent requires this antecedent.
        result.push(antecedent.clone());
        result_eliminations |= antecedent_eliminations[index];
      }
    }
  }
  result.reverse();
  assert!(!result.is_empty(), "Antecedents can't be empty");
  result
}

impl Fact {
  fn might_be_revealed_by_eliminations(&self, eliminations: &AsgmtSet) -> bool {
    match self {
      Fact::SingleLoc { num, unit, .. }
      | Fact::NoLoc { num, unit }
      | Fact::Overlap { num, unit, .. } => {
        return !(eliminations.num_locs(*num) & unit.locs()).is_empty();
      }
      Fact::SingleNum { loc, .. } | Fact::NoNum { loc } => {
        for num in Num::all() {
          if eliminations.num_locs(num).contains(*loc) {
            return true;
          }
        }
      }
      Fact::LockedSet {
        nums,
        unit,
        locs,
        is_naked,
        ..
      } => {
        // For naked sets, we check if the _other_ numerals are eliminated from _these_ locations.
        // For hidden sets, we check if _these_ numerals are eliminated from the _other_ locations.
        let nums_to_check = if *is_naked { !*nums } else { *nums };
        let locs_to_check = if *is_naked {
          *locs
        } else {
          unit.locs() - *locs
        };
        for num in nums_to_check.iter() {
          if !(eliminations.num_locs(num) & locs_to_check).is_empty() {
            return true;
          }
        }
      }
      Fact::Implication { antecedents, .. } => {
        // An implication might be revealed if any of the antecedents are
        // revealed.
        for antecedent in antecedents.iter() {
          if antecedent.might_be_revealed_by_eliminations(eliminations) {
            return true;
          }
        }
      }
      Fact::SpeculativeAssignment { .. } | Fact::Conflict { .. } => (),
    }
    false
  }

  fn uses_sukaku_map(&self) -> bool {
    match self {
      Fact::SingleNum { .. } | Fact::NoNum { .. } => true,
      Fact::LockedSet { is_naked, .. } => *is_naked,
      _ => false,
    }
  }

  fn is_implied_by(&self, remaining_asgmts: &AsgmtSet, sukaku_map: &SukakuMap) -> bool {
    match self {
      Fact::SingleLoc { num, unit, loc } => {
        (remaining_asgmts.num_locs(*num) & unit.locs()) == loc.as_set()
      }
      Fact::SingleNum { loc, num } => sukaku_map[*loc] == num.as_set(),
      Fact::SpeculativeAssignment { .. } => false,
      Fact::NoLoc { num, unit } => (remaining_asgmts.num_locs(*num) & unit.locs()).is_empty(),
      Fact::NoNum { loc } => sukaku_map[*loc].is_empty(),
      Fact::Conflict { .. } => {
        // Conflicts are only implied by actual assignments.
        false
      }
      Fact::Overlap {
        num,
        unit,
        cross_unit,
      } => ((remaining_asgmts.num_locs(*num) & unit.locs()) - cross_unit.locs()).is_empty(),
      Fact::LockedSet {
        nums,
        unit,
        locs,
        is_naked,
        ..
      } => {
        if *is_naked {
          for loc in locs.iter() {
            if !(sukaku_map[loc] <= *nums) {
              return false;
            }
          }
        } else {
          for num in nums.iter() {
            if !((remaining_asgmts.num_locs(num) & unit.locs()) <= *locs) {
              return false;
            }
          }
        }
        true
      }
      Fact::Implication { antecedents, .. } => {
        // An implication is implied if all of its antecedents are implied.
        for antecedent in antecedents.iter() {
          if !antecedent.is_implied_by(remaining_asgmts, sukaku_map) {
            return false;
          }
        }
        true
      }
    }
  }
}

fn find_errors(collector: &mut Collector, short_circuit: bool) -> Result<(), Invalid> {
  let possible_asgmts = collector.remaining_asgmts | collector.actual_asgmts;
  for unit in Unit::all() {
    let unit_locs = unit.locs();
    for num in Num::all() {
      let actual_locs = collector.actual_asgmts.num_locs(num) & unit_locs;
      if actual_locs.len() > 1 {
        if short_circuit {
          return Err(Invalid);
        }
        collector.add_fact(Fact::Conflict {
          num,
          unit,
          locs: actual_locs,
        });
      }
      let possible_locs = possible_asgmts.num_locs(num) & unit_locs;
      if possible_locs.is_empty() {
        if short_circuit {
          return Err(Invalid);
        }
        collector.add_fact(Fact::NoLoc { num, unit });
      }
    }
  }
  for loc in (!collector.actual_asgmts.naked_singles()).iter() {
    if collector.sukaku_map[loc].is_empty() {
      if short_circuit {
        return Err(Invalid);
      }
      collector.add_fact(Fact::NoNum { loc });
    }
  }
  Ok(())
}

fn find_overlaps(collector: &mut Collector) {
  // Note: this mimics the logic in `collect` but only for overlaps.
  let mut remaining_asgmts = collector.remaining_asgmts;
  let mut prev_remaining_asgmts = collector.remaining_asgmts;
  for num in Num::all() {
    let mut antecedents: Vec<Fact> = vec![];
    let mut antecedent_eliminations: Vec<AsgmtSet> = vec![];
    loop {
      let start = collector.facts.len();
      let num_locs = remaining_asgmts.num_locs(num);
      for band in Band::all() {
        let band_locs = num_locs.band_locs(band);
        let blk_row_bits = band_locs_to_blk_rows(band_locs);
        let blk_col_bits = locs_to_blk_cols(num_locs, band);
        blk_row_bits_to_overlaps(blk_row_bits, num, band, collector);
        blk_col_bits_to_overlaps(blk_col_bits, num, band, collector);
      }
      let eliminations: Vec<AsgmtSet> = collector.facts[start..]
        .iter()
        .map(|fact| fact.as_eliminations())
        .collect();
      if !antecedents.is_empty() {
        for fact in collector.facts[start..].iter_mut() {
          *fact = Fact::Implication {
            antecedents: narrow_antecedents(
              &fact,
              antecedents.as_slice(),
              &antecedent_eliminations,
              prev_remaining_asgmts,
              collector.sukaku_map,
            ),
            consequent: Box::new(fact.clone()),
          };
        }
      }
      if start == collector.facts.len() {
        break;
      }
      antecedents = collector.facts[start..].to_vec();
      antecedent_eliminations = eliminations.clone();
      prev_remaining_asgmts = remaining_asgmts;
      for asgmts in eliminations.iter() {
        remaining_asgmts -= *asgmts;
      }
    }
  }
}

pub const MAX_SET_SIZE: i32 = 4;

fn find_locked_sets(collector: &mut Collector, set_state: &mut SetState) {
  for size in 2..=MAX_SET_SIZE {
    for unit_id in UnitId::all() {
      find_hidden_sets(collector, set_state, unit_id.to_unit(), size);
    }
  }
  for size in 2..=MAX_SET_SIZE {
    for unit_id in UnitId::all() {
      find_naked_sets(collector, set_state, unit_id.to_unit(), size);
    }
  }
}

fn find_hidden_singles(collector: &mut Collector) {
  for num in Num::all() {
    let num_locs = collector.remaining_asgmts.num_locs(num);
    let mut units_to_check = UnitSet::default();
    for band in Band::all() {
      let band_locs = num_locs.band_locs(band);
      let blk_row_bits = band_locs_to_blk_rows(band_locs);
      let blk_col_bits = locs_to_blk_cols(num_locs, band);
      units_to_check |=
        blk_line_bits_to_possible_hidden_single_units(blk_row_bits, blk_col_bits, band);
    }
    let mut locs_found = LocSet::default();
    for unit in units_to_check.iter() {
      let unit_locs = num_locs & unit.locs();
      if unit_locs.len() == 1 {
        let loc = unit_locs.smallest_item().unwrap();
        if locs_found.contains(loc) {
          continue;
        }
        locs_found.insert(loc);
        collector.add_fact(Fact::SingleLoc { num, unit, loc });
      }
    }
  }
}

fn find_naked_singles(collector: &mut Collector) {
  for loc in Loc::all() {
    let nums = collector.sukaku_map[loc];
    if nums.len() != 1 {
      continue;
    }
    for num in nums.iter() {
      collector.add_fact(Fact::SingleNum { loc, num });
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
fn blk_row_bits_to_overlaps(blk_row_bits: Bits9, num: Num, band: Band, collector: &mut Collector) {
  for spec in blk_line_bits_to_overlap_specs(blk_row_bits).iter() {
    collector.add_fact(spec.to_row_band_overlap(num, band));
  }
}

/// Extracts the overlaps from a bitmap of block-columns, and stores them as
/// facts in the given vector.  The bitmap represents the block-columns of the
/// given column-band; the ones mean that at least one of the locations in the
/// corresponding block-column is assignable to the given numeral.
fn blk_col_bits_to_overlaps(blk_col_bits: Bits9, num: Num, band: Band, collector: &mut Collector) {
  for spec in blk_line_bits_to_overlap_specs(blk_col_bits).iter() {
    collector.add_fact(spec.to_col_band_overlap(num, band));
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

impl Default for BandOverlapSpecSet {
  fn default() -> Self {
    Self(Bits18::default())
  }
}

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

/// Manages the state of the deduction process for locked sets by tracking which
/// numerals and locations have been allocated to sets in each unit.
struct SetState {
  nums: HashMap<Unit, NumSet>,
  locs: HashMap<Unit, LocSet>,
}

impl SetState {
  fn new() -> Self {
    Self {
      nums: HashMap::new(),
      locs: HashMap::new(),
    }
  }

  fn get_nums(&mut self, unit: Unit) -> NumSet {
    *self.nums.entry(unit).or_default()
  }

  fn get_locs(&mut self, unit: Unit) -> LocSet {
    *self.locs.entry(unit).or_default()
  }

  fn add(&mut self, unit: Unit, nums: NumSet, locs: LocSet) {
    *self.nums.entry(unit).or_default() |= nums;
    *self.locs.entry(unit).or_default() |= locs;
  }
}

/// A map of locations to sets of numerals.  Mimics a Sukaku puzzle, like a
/// fully marked up Sudoku, with each location containing the numerals that are
/// possible for that location.  This is the same information that is
/// represented in the `AsgmtSet`, but indexed the other way around.
#[derive(Clone, Copy, Eq, Hash, PartialEq)]
pub struct SukakuMap([NumSet; 81]);

impl SukakuMap {
  pub fn from_grid(grid: &Grid) -> Self {
    let mut answer = Self([NumSet::all(); 81]);
    for asgmt in grid.iter() {
      answer.apply(asgmt);
    }
    answer
  }

  pub fn apply(&mut self, asgmt: Asgmt) {
    self[asgmt.loc] = NumSet::new(); // Leave the location empty.
    for peer in asgmt.loc.peers().iter() {
      self.eliminate_one(peer, asgmt.num);
    }
  }

  pub fn eliminate(&mut self, eliminations: &AsgmtSet) {
    for asgmt in eliminations.iter() {
      self.eliminate_one(asgmt.loc, asgmt.num);
    }
  }

  pub fn eliminate_one(&mut self, loc: Loc, num: Num) {
    self[loc].remove(num);
  }
}

impl Index<Loc> for SukakuMap {
  type Output = NumSet;
  fn index(&self, loc: Loc) -> &NumSet {
    unsafe {
      // Safe because `loc.index()` is in 0..81.
      debug_assert_eq!(Loc::COUNT, 81);
      self.0.get_unchecked(loc.index())
    }
  }
}

impl IndexMut<Loc> for SukakuMap {
  fn index_mut(&mut self, loc: Loc) -> &mut NumSet {
    unsafe {
      // Safe because `loc.index()` is in 0..81.
      debug_assert_eq!(Loc::COUNT, 81);
      self.0.get_unchecked_mut(loc.index())
    }
  }
}

impl fmt::Debug for SukakuMap {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    writeln!(f, "SukakuMap {{")?;
    for row_band in Band::all() {
      for blk_row in BlkLine::all() {
        for col_band in Band::all() {
          let blk = Blk::from_bands(row_band, col_band);
          for blk_col in BlkLine::all() {
            let loc = blk.loc_at(blk_row, blk_col);
            let nums = self[loc];
            if nums.is_empty() {
              write!(f, " .        ")?;
            } else {
              let mut nums_str = String::new();
              for num in nums.iter() {
                nums_str.push_str(&num.to_string());
              }
              write!(f, " {:9}", nums_str)?;
            }
          }
          if col_band != BAND3 {
            write!(f, " |")?;
          } else {
            writeln!(f)?;
          }
        }
      }
      if row_band != BAND3 {
        writeln!(f, "{:->32}{:->32}{:->32}", "+", "+", "")?;
      }
    }
    writeln!(f, "}}")?;
    Ok(())
  }
}

fn find_hidden_sets(collector: &mut Collector, set_state: &mut SetState, unit: Unit, size: i32) {
  let unit_locs = unit.locs();
  let mut nums_in_sets = set_state.get_nums(unit);
  let mut nums_to_check = NumSet::default();
  let mut unset_count = 0;
  for num in Num::all() {
    let possible_size = (collector.remaining_asgmts.num_locs(num) & unit_locs).len();
    if possible_size > 1 {
      unset_count += 1;
      if possible_size <= size && !nums_in_sets.contains(num) {
        nums_to_check.insert(num);
      }
    }
  }
  if nums_to_check.len() >= size && unset_count > size {
    'outer: for combination in nums_to_check.iter().combinations(size as usize) {
      let mut locs = LocSet::default();
      let mut nums = NumSet::default();
      for num in combination.iter() {
        if nums_in_sets.contains(*num) {
          continue 'outer;
        }
        locs |= collector.remaining_asgmts.num_locs(*num) & unit_locs;
        nums.insert(*num);
      }
      if locs.len() == size {
        let cross_unit = find_overlapping_unit(unit, locs);
        collector.add_fact(Fact::LockedSet {
          nums,
          unit,
          locs,
          cross_unit,
          is_naked: false,
        });
        set_state.add(unit, nums, locs);
        nums_in_sets |= nums;
        if let Some(unit) = cross_unit {
          set_state.add(unit, nums, locs);
        }
      }
    }
  }
}

fn find_naked_sets(collector: &mut Collector, set_state: &mut SetState, unit: Unit, size: i32) {
  let unit_locs = unit.locs();
  let mut locs_in_sets = set_state.get_locs(unit);
  let mut locs_to_check = LocSet::default();
  let mut unset_count = 0;
  for loc in unit_locs.iter() {
    let possible_size = collector.sukaku_map[loc].len();
    if possible_size > 1 {
      unset_count += 1;
      if possible_size <= size && !locs_in_sets.contains(loc) {
        locs_to_check.insert(loc);
      }
    }
  }
  if locs_to_check.len() >= size && unset_count > size {
    'outer: for combination in locs_to_check.iter().combinations(size as usize) {
      let mut locs = LocSet::default();
      let mut nums = NumSet::default();
      for loc in combination.iter() {
        if locs_in_sets.contains(*loc) {
          continue 'outer;
        }
        locs.insert(*loc);
        nums |= collector.sukaku_map[*loc];
      }
      if nums.len() == size {
        let cross_unit = find_overlapping_unit(unit, locs);
        collector.add_fact(Fact::LockedSet {
          nums,
          unit,
          locs,
          cross_unit,
          is_naked: true,
        });
        set_state.add(unit, nums, locs);
        locs_in_sets |= locs;
        if let Some(unit) = cross_unit {
          set_state.add(unit, nums, locs);
        }
      }
    }
  }
}

fn find_overlapping_unit(unit: Unit, locs: LocSet) -> Option<Unit> {
  let mut overlapping_unit = None;
  match unit {
    Unit::Blk(blk) => {
      let band_locs = locs.band_locs(blk.row_band());
      let blk_row_bits = band_locs_to_blk_rows(band_locs).backing_int();
      if blk_row_bits.count_ones() == 1 {
        let blk_line = match blk_row_bits >> blk.col_band().index() {
          0o001 => BL1,
          0o010 => BL2,
          0o100 => BL3,
          _ => unreachable!(),
        };
        overlapping_unit = Some(blk.row(blk_line).to_unit());
      } else {
        let blk_col_bits = locs_to_blk_cols(locs, blk.col_band()).backing_int();
        if blk_col_bits.count_ones() == 1 {
          let blk_line = match blk_col_bits >> blk.row_band().index() {
            0o001 => BL1,
            0o010 => BL2,
            0o100 => BL3,
            _ => unreachable!(),
          };
          overlapping_unit = Some(blk.col(blk_line).to_unit());
        }
      }
    }
    Unit::Row(row) => {
      let band_locs = locs.band_locs(row.band());
      let blk_row_bits = band_locs_to_blk_rows(band_locs).backing_int();
      if blk_row_bits.count_ones() == 1 {
        let col_band = match blk_row_bits >> (3 * row.blk_row().index()) {
          0b001 => BAND1,
          0b010 => BAND2,
          0b100 => BAND3,
          _ => unreachable!(),
        };
        overlapping_unit = Some(Blk::from_bands(row.band(), col_band).to_unit());
      }
    }
    Unit::Col(col) => {
      let blk_col_bits = locs_to_blk_cols(locs, col.band()).backing_int();
      if blk_col_bits.count_ones() == 1 {
        let row_band = match blk_col_bits >> (3 * col.blk_col().index()) {
          0b001 => BAND1,
          0b010 => BAND2,
          0b100 => BAND3,
          _ => unreachable!(),
        };
        overlapping_unit = Some(Blk::from_bands(row_band, col.band()).to_unit());
      }
    }
  };
  overlapping_unit
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    loc_set, num_set,
    permute::{GridPermutation, GroupElement, LocPermutation, NumPermutation},
  };
  use std::str::FromStr;

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

  fn make_collector(grid: &Grid) -> Collector {
    let actual_asgmts = AsgmtSet::simple_from_grid(&grid);
    let remaining_asgmts = AsgmtSet::possibles_from_grid(&grid) - actual_asgmts;
    let sukaku_map = SukakuMap::from_grid(&grid);
    Collector::new(remaining_asgmts, actual_asgmts, sukaku_map)
  }

  #[test]
  fn test_find_errors() {
    let grid = Grid::from_str(
      r"
            . . . | 8 . 9 | . . 6
            1 2 3 | . . . | . . .
            . . . | 6 . 8 | . . .
            - - - + - - - + - - -
            7 . . | . . 1 | . . 2
            . . . | 4 5 . | . . 9
            . . . | . . . | 6 . .
            - - - + - - - + - - -
            . . . | . 7 . | . . .
            . . 1 | . 4 6 | . . .
            . . 3 | . . . | . . .
        ",
    )
    .unwrap();
    let mut collector = make_collector(&grid);
    find_errors(&mut collector, false).unwrap();
    assert_eq!(
      collector.facts,
      vec![
        Fact::NoLoc {
          num: N6,
          unit: B1.to_unit()
        },
        Fact::NoLoc {
          num: N8,
          unit: B1.to_unit()
        },
        Fact::Conflict {
          num: N8,
          unit: B2.to_unit(),
          locs: loc_set![L14, L36]
        },
        Fact::NoLoc {
          num: N6,
          unit: R2.to_unit()
        },
        Fact::Conflict {
          num: N3,
          unit: C3.to_unit(),
          locs: loc_set![L23, L93]
        },
        Fact::NoNum { loc: L25 }
      ]
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
            . . . | 6 . 2 | . . .
            1 . . | . . . | . . .
            . . . | 4 . 8 | . . .
            - - - + - - - + - - -
            . 3 . | 2 . 6 | . . .
            . . . | . . . | . . .
            . 7 . | 8 . 4 | . . .
            - - - + - - - + - - -
            . 9 . | . . . | . . .
            . . . | . . . | . . .
            . 2 . | . . . | . . .",
    )
    .unwrap();
    let mut collector = make_collector(&grid);
    find_overlaps(&mut collector);
    let o1 = make_overlap(N1, B2, C5);
    let o2 = make_implication(vec![o1.clone()], make_overlap(N1, B5, R5));
    let o3 = make_implication(vec![o2.clone()], make_overlap(N1, B4, C3));
    let o4 = make_implication(vec![o2.clone()], make_overlap(N1, C2, B7));
    let o5 = make_implication(vec![o3.clone()], make_overlap(N1, B7, R8));
    assert_eq!(collector.facts, vec![o1, o2, o3, o4, o5,]);
  }

  fn make_locked_set(
    nums: NumSet,
    unit: impl UnitTrait,
    locs: LocSet,
    cross_unit: Option<impl UnitTrait>,
    is_naked: bool,
  ) -> Fact {
    Fact::LockedSet {
      nums,
      unit: unit.to_unit(),
      locs,
      cross_unit: cross_unit.map(|u| u.to_unit()),
      is_naked,
    }
  }

  #[test]
  fn test_find_locked_sets() {
    let grid = Grid::from_str(
      r"
         . 1 4 | . 9 . | . 5 .
         . . . | 6 . . | . . 1
         2 9 6 | 5 1 4 | 7 8 3
        -------+-------+-------
         . 4 . | . 5 1 | 3 6 .
         8 . 1 | 3 . 2 | . 7 .
         . . 3 | . 7 . | . 1 .
        -------+-------+-------
         . . 5 | . . . | 1 . 7
         . . 9 | 1 . 5 | . . .
         1 3 . | . . . | 5 . .
        ",
    )
    .unwrap();
    let mut collector = make_collector(&grid);
    let mut set_state = SetState::new();
    find_locked_sets(&mut collector, &mut set_state);
    assert_eq!(
      collector.facts,
      vec![
        make_locked_set(num_set! {N4, N9}, B3, loc_set! {L27, L28}, Some(R2), false),
        make_locked_set(
          num_set! {N3, N7, N8},
          R1,
          loc_set! {L11, L14, L16},
          None::<Blk>,
          false
        ),
        make_locked_set(num_set! {N2, N6}, B3, loc_set! {L17, L19}, Some(R1), true),
        make_locked_set(
          num_set! {N3, N5, N7, N8},
          R2,
          loc_set! {L21, L22, L23, L26},
          None::<Blk>,
          true
        )
      ]
    );

    let mut transpose = LocPermutation::identity();
    transpose.transpose = true;
    let grid = GridPermutation {
      nums: NumPermutation::identity(),
      locs: transpose,
    }
    .apply(&grid);
    let mut collector = make_collector(&grid);
    let mut set_state = SetState::new();
    find_locked_sets(&mut collector, &mut set_state);
    assert_eq!(
      collector.facts,
      vec![
        make_locked_set(num_set! {N4, N9}, B7, loc_set! {L72, L82}, Some(C2), false),
        make_locked_set(
          num_set! {N3, N7, N8},
          C1,
          loc_set! {L11, L41, L61},
          None::<Blk>,
          false
        ),
        make_locked_set(num_set! {N2, N6}, B7, loc_set! {L71, L91}, Some(C1), true),
        make_locked_set(
          num_set! {N3, N5, N7, N8},
          C2,
          loc_set! {L12, L22, L32, L62},
          None::<Blk>,
          true
        )
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
    let mut collector = make_collector(&grid);
    find_hidden_singles(&mut collector);
    assert_eq!(
      collector.facts,
      vec![
        make_hidden_single(N2, C7, L37),
        make_hidden_single(N5, B3, L19),
        make_hidden_single(N5, B8, L74),
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
    let mut collector = make_collector(&grid);
    find_naked_singles(&mut collector);
    assert_eq!(collector.facts, vec![make_naked_single(L64, N3),]);
  }

  fn make_implication(antecedents: Vec<Fact>, consequent: Fact) -> Fact {
    Fact::Implication {
      antecedents,
      consequent: Box::new(consequent),
    }
  }

  #[test]
  fn test_collector() {
    let grid = Grid::from_str(
      r"
            . . . | 6 . 2 | . . .
            1 . . | . . . | . . .
            . . . | 4 . 8 | . . .
            - - - + - - - + - - -
            . 3 . | 5 . 6 | . . .
            . . . | . . . | . . .
            . 7 . | 8 . 9 | . . .
            - - - + - - - + - - -
            . 9 . | . . . | . . .
            . . . | . . . | . . .
            . 2 . | . . . | . . .",
    )
    .unwrap();
    let mut collector = make_collector(&grid);
    collector.collect(ErrorMode::Ignore).unwrap();
    let o1 = make_overlap(N1, B2, C5);
    let o2 = make_implication(vec![o1.clone()], make_overlap(N1, B5, R5));
    let o3 = make_implication(vec![o2.clone()], make_overlap(N1, B4, C3));
    let o4 = make_implication(vec![o2.clone()], make_overlap(N1, C2, B7));
    let o5 = make_implication(vec![o3.clone()], make_overlap(N1, B7, R8));
    let set = make_implication(
      vec![o2.clone()],
      make_locked_set(
        num_set! {N4, N5, N6, N8},
        C2,
        loc_set! {L12, L22, L32, L52},
        None::<Blk>,
        true,
      ),
    );
    assert_eq!(
      collector.facts,
      vec![
        o1.clone(),
        o2.clone(),
        o3.clone(),
        o4.clone(),
        o5.clone(),
        set.clone(),
        make_implication(vec![o3.clone()], make_hidden_single(N1, B7, L82)),
        make_implication(vec![set.clone()], make_naked_single(L82, N1)),
      ],
    )
  }

  #[test]
  fn test_collector_errors() {
    let grid = Grid::from_str(
      r"
            . . . | 6 . 2 | . . .
            1 . . | . . . | . . .
            . . . | 4 . 8 | . . .
            - - - + - - - + - - -
            . 3 . | 5 . 5 | . . .
            . . . | . . . | . . .
            . 7 . | 8 . 9 | . . .
            - - - + - - - + - - -
            . 9 . | . . . | . . .
            . . . | . . . | . . .
            . 2 . | . . . | . . .",
    )
    .unwrap();
    let mut collector = make_collector(&grid);
    collector.collect(ErrorMode::Collect).unwrap();
    let mut nub_counts: HashMap<String, i32> = HashMap::new();
    for fact in collector.facts.iter() {
      let fact = fact.nub();
      let name = match fact {
        Fact::SingleLoc { .. } => "SingleLoc",
        Fact::SingleNum { .. } => "SingleNum",
        Fact::SpeculativeAssignment { .. } => "SpeculativeAssignment",
        Fact::NoLoc { .. } => "NoLoc",
        Fact::NoNum { .. } => "NoNum",
        Fact::Conflict { .. } => "Conflict",
        Fact::Overlap { .. } => "Overlap",
        Fact::LockedSet { .. } => "LockedSet",
        Fact::Implication { .. } => "Implication",
      };
      *nub_counts.entry(name.to_string()).or_insert(0) += 1;
    }
    let mut nub_counts = nub_counts
      .iter()
      .map(|(k, v)| format!("{}: {}", k, v))
      .collect::<Vec<_>>();
    nub_counts.sort();
    assert_eq!(
      nub_counts,
      vec![
        "Conflict: 2",
        "LockedSet: 2",
        "NoLoc: 3",
        "Overlap: 7",
        "SingleLoc: 1",
        "SingleNum: 3",
      ]
    )
  }

  #[test]
  fn test_collector_errors_short_circuit() {
    let grid = Grid::from_str(
      r"
            . . . | 6 . 2 | . . .
            1 . . | . . . | . . .
            . . . | 4 . 8 | . . .
            - - - + - - - + - - -
            . 3 . | 5 . 5 | . . .
            . . . | . . . | . . .
            . 7 . | 8 . 9 | . . .
            - - - + - - - + - - -
            . 9 . | . . . | . . .
            . . . | . . . | . . .
            . 2 . | . . . | . . .",
    )
    .unwrap();
    let mut collector = make_collector(&grid);
    collector
      .collect(ErrorMode::ShortCircuit)
      .expect_err("Should have short-circuited");
  }
}
