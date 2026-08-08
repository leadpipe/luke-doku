use crate::core::*;
use crate::deduce::internals::Collector;
use crate::deduce::Fact;
use itertools::Itertools;

pub fn find_fish(collector: &mut Collector) {
  for num in Num::all() {
    let locs = collector.remaining_asgmts.num_locs(num);
    if locs.is_empty() {
      continue;
    }

    let mut eliminated = LocSet::new();
    // Rows as base, Cols as cover
    find_fish_in_direction(collector, num, locs, true, &mut eliminated);
    // Cols as base, Rows as cover
    find_fish_in_direction(collector, num, locs, false, &mut eliminated);
  }
}

fn find_fish_in_direction(
  collector: &mut Collector,
  num: Num,
  locs: LocSet,
  base_is_row: bool,
  eliminated: &mut LocSet,
) {
  let row_units: Vec<Unit> = Row::all()
    .map(|r| r.to_unit())
    .filter(|u| !(locs & u.locs()).is_empty())
    .collect();
  let col_units: Vec<Unit> = Col::all()
    .map(|c| c.to_unit())
    .filter(|u| !(locs & u.locs()).is_empty())
    .collect();
  let (base_units, cover_units) = if base_is_row {
    (row_units, col_units)
  } else {
    (col_units, row_units)
  };

  // Helper closure to process a combination
  let mut process_combo = |base_combo: &[Unit], cover_combo: &[Unit]| {
    let mut base_combo_locs = LocSet::new();
    for u in base_combo {
      base_combo_locs |= u.locs();
    }
    let cands_in_base = locs & base_combo_locs;
    if cands_in_base.is_empty() {
      return;
    }

    let mut cover_combo_locs = LocSet::new();
    for u in cover_combo {
      cover_combo_locs |= u.locs();
    }

    let fins = cands_in_base - cover_combo_locs;

    let mut fin_block: Option<Blk> = None;
    let mut valid_fins = true;

    if !fins.is_empty() {
      for fin_loc in fins.iter() {
        if let Some(b) = fin_block {
          if fin_loc.blk() != b {
            valid_fins = false;
            break;
          }
        } else {
          fin_block = Some(fin_loc.blk());
        }
      }
    }

    if !valid_fins {
      return;
    }

    let mut potential_eliminations = (locs & cover_combo_locs) - base_combo_locs;

    if let Some(b) = fin_block {
      potential_eliminations &= b.locs();
    }

    potential_eliminations -= *eliminated;

    if !potential_eliminations.is_empty() {
      *eliminated |= potential_eliminations;
      let mut base_unit_set = UnitSet::default();
      for u in base_combo {
        base_unit_set.insert(*u);
      }
      let mut cover_unit_set = UnitSet::default();
      for u in cover_combo {
        cover_unit_set.insert(*u);
      }

      collector.add_fact(Fact::Fish {
        num,
        base_units: base_unit_set,
        cover_units: cover_unit_set,
        finned_locs: fins,
        elimination_locs: potential_eliminations,
      });
    }
  };

  for size in 2..=4 {
    if base_units.len() < size {
      continue;
    }
    for base_combo in base_units.iter().cloned().combinations(size) {
      let mut base_combo_locs = LocSet::new();
      for u in &base_combo {
        base_combo_locs |= u.locs();
      }
      let cands_in_base = locs & base_combo_locs;

      let active_cover_units: Vec<Unit> = cover_units
        .iter()
        .cloned()
        .filter(|u| !(cands_in_base & u.locs()).is_empty())
        .collect();

      if active_cover_units.len() < size {
        continue;
      }

      for cover_combo in active_cover_units.into_iter().combinations(size) {
        process_combo(&base_combo, &cover_combo);
      }
    }
  }
}

pub fn find_empty_rectangles(_collector: &mut Collector) {
  // TODO: Implement Empty Rectangle
}

pub fn find_skyscrapers(_collector: &mut Collector) {
  // TODO: Implement Skyscraper
}

pub fn find_two_string_kites(_collector: &mut Collector) {
  // TODO: Implement 2-String Kite
}
