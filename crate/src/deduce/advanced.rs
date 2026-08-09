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

pub fn find_empty_rectangles(collector: &mut Collector) {
  for num in Num::all() {
    let locs = collector.remaining_asgmts.num_locs(num);
    if locs.len() < 4 {
      continue;
    }


    // 1. Find Conjugate Pairs (Rows and Cols only)
    let mut row_counts = [0u8; 9];
    let mut col_counts = [0u8; 9];
    for loc in locs.iter() {
      row_counts[loc.row().index()] += 1;
      col_counts[loc.col().index()] += 1;
    }

    let mut has_cp = false;
    for &c in &row_counts {
      if c == 2 {
        has_cp = true;
        break;
      }
    }
    if !has_cp {
      for &c in &col_counts {
        if c == 2 {
          has_cp = true;
          break;
        }
      }
    }
    if !has_cp {
      continue;
    }
    let mut conjugate_pairs = Vec::new();
    for (r, &count) in row_counts.iter().enumerate() {
      if count == 2 {
        let u = Row::from_index(r).unwrap().to_unit();
        let u_locs = locs & u.locs();
        let mut iter = u_locs.iter();
        conjugate_pairs.push((u, iter.next().unwrap(), iter.next().unwrap()));
      }
    }
    for (c, &count) in col_counts.iter().enumerate() {
      if count == 2 {
        let u = Col::from_index(c).unwrap().to_unit();
        let u_locs = locs & u.locs();
        let mut iter = u_locs.iter();
        conjugate_pairs.push((u, iter.next().unwrap(), iter.next().unwrap()));
      }
    }

    // 2. Find ERs
    let mut ers = Vec::new();
    for blk in Blk::all() {
      let block = blk.to_unit();
      let b_locs = locs & block.locs();
      if b_locs.len() < 2 {
        continue;
      }

      let mut blk_locs = Vec::with_capacity(9);
      for loc in b_locs.iter() {
        blk_locs.push((loc.row().blk_row(), loc.col().blk_col()));
      }

      for r in BlkLine::all() {
        for c in BlkLine::all() {
          let mut is_er = true;
          let mut in_r_only = true;
          let mut in_c_only = true;
          for &(loc_r, loc_c) in &blk_locs {
            let matches_r = loc_r == r;
            let matches_c = loc_c == c;
            if !matches_r && !matches_c {
              is_er = false;
              break;
            }
            if !matches_r {
              in_r_only = false;
            }
            if !matches_c {
              in_c_only = false;
            }
          }

          if is_er && !in_r_only && !in_c_only {
            let er_row = blk.row(r).to_unit();
            let er_col = blk.col(c).to_unit();
            ers.push((block, er_row, er_col));
          }
        }
      }
    }



    // 3. Match ERs and Conjugate Pairs
    for (block, er_row, er_col) in ers {
      let blk = if let Unit::Blk(b) = block { b } else { unreachable!() };
      let er_r = if let Unit::Row(r) = er_row { r } else { unreachable!() };
      let er_c = if let Unit::Col(c) = er_col { c } else { unreachable!() };

      for (u, loc1, loc2) in &conjugate_pairs {
        // CP must be outside the ER block
        if loc1.blk() == blk || loc2.blk() == blk {
          continue;
        }

        if let Unit::Row(_) = u {
          // If CP is a Row, it must intersect er_col
          for (end1, end2) in [(*loc1, *loc2), (*loc2, *loc1)] {
            if end1.col() == er_c {
              // Target is at intersection of er_row and end2's col
              let target = Loc::at(er_r, end2.col());
              if target != end2 && target.blk() != blk && locs.contains(target) {
                let mut cp_set = LocSet::new();
                cp_set.insert(*loc1);
                cp_set.insert(*loc2);
                let mut elims = LocSet::new();
                elims.insert(target);
                collector.add_fact(Fact::EmptyRectangle {
                  num,
                  block,
                  row: er_row,
                  col: er_col,
                  conjugate_pair: cp_set,
                  elimination_locs: elims,
                });
              }
            }
          }
        }

        if let Unit::Col(_) = u {
          // If CP is a Col, it must intersect er_row
          for (end1, end2) in [(*loc1, *loc2), (*loc2, *loc1)] {
            if end1.row() == er_r {
              // Target is at intersection of end2's row and er_col
              let target = Loc::at(end2.row(), er_c);
              if target != end2 && target.blk() != blk && locs.contains(target) {
                let mut cp_set = LocSet::new();
                cp_set.insert(*loc1);
                cp_set.insert(*loc2);
                let mut elims = LocSet::new();
                elims.insert(target);
                collector.add_fact(Fact::EmptyRectangle {
                  num,
                  block,
                  row: er_row,
                  col: er_col,
                  conjugate_pair: cp_set,
                  elimination_locs: elims,
                });
              }
            }
          }
        }
      }
    }
  }
}

pub fn find_skyscrapers(_collector: &mut Collector) {
  // TODO: Implement Skyscraper
}

pub fn find_two_string_kites(_collector: &mut Collector) {
  // TODO: Implement 2-String Kite
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::core::{Asgmt, AsgmtSet};
  use crate::deduce::internals::SukakuMap;
  use crate::deduce::Fact;

  #[test]
  fn test_empty_rectangle_row_cp() {
    let mut remaining = AsgmtSet::new();
    
    // ER for N1 in B1. (ER row R1, ER col C1)
    // Candidates in B1 at (R1, C2) and (R2, C1).
    remaining.insert(Asgmt::new(N1, L12));
    remaining.insert(Asgmt::new(N1, L21));
    
    // CP for N1 in R4. candidates at C1, C4.
    remaining.insert(Asgmt::new(N1, L41));
    remaining.insert(Asgmt::new(N1, L44));
    
    // Target cell: (R1, C4).
    remaining.insert(Asgmt::new(N1, L14));
    
    // Need a few more candidates so that rows/cols don't accidentally become singletons
    // that the solver might resolve if it were a full solve, though here we just call find_empty_rectangles directly.
    remaining.insert(Asgmt::new(N1, L88));
    remaining.insert(Asgmt::new(N1, L99));
    
    let mut collector = Collector::new(
      remaining, 
      AsgmtSet::new(), 
      SukakuMap::from_grid(&Grid::new())
    );
    
    find_empty_rectangles(&mut collector);
    
    let mut found = false;
    for fact in &collector.facts {
      if let Fact::EmptyRectangle { elimination_locs, .. } = fact {
        if elimination_locs.contains(L14) {
          found = true;
          break;
        }
      }
    }
    assert!(found, "Empty Rectangle should eliminate L14");
  }

  #[test]
  fn test_empty_rectangle_col_cp() {
    let mut remaining = AsgmtSet::new();
    
    // ER for N1 in B1. (ER row R1, ER col C1)
    remaining.insert(Asgmt::new(N1, L12));
    remaining.insert(Asgmt::new(N1, L21));
    
    // CP for N1 in C4. candidates at R1, R4.
    remaining.insert(Asgmt::new(N1, L14));
    remaining.insert(Asgmt::new(N1, L44));
    
    // Target cell: (R4, C1).
    remaining.insert(Asgmt::new(N1, L41));
    
    remaining.insert(Asgmt::new(N1, L88));
    remaining.insert(Asgmt::new(N1, L99));
    
    let mut collector = Collector::new(
      remaining, 
      AsgmtSet::new(), 
      SukakuMap::from_grid(&Grid::new())
    );
    
    find_empty_rectangles(&mut collector);
    
    let mut found = false;
    for fact in &collector.facts {
      if let Fact::EmptyRectangle { elimination_locs, .. } = fact {
        if elimination_locs.contains(L41) {
          found = true;
          break;
        }
      }
    }
    assert!(found, "Empty Rectangle should eliminate L41");
  }
}
