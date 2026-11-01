use crate::core::*;
use crate::deduce::internals::Collector;
use crate::deduce::Fact;
use itertools::Itertools;

pub fn find_fish(collector: &mut Collector) {
  for num in Num::all() {
    if collector.check_timeout() {
      return;
    }
    let locs = collector.remaining_asgmts.num_locs(num);
    if locs.is_empty() {
      continue;
    }

    let mut eliminated = LocSet::new();
    // Rows as base, Cols as cover
    find_fish_in_direction(collector, num, locs, true, &mut eliminated);
    if collector.check_timeout() {
      return;
    }
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

  for size in 2..=4 {
    if collector.check_timeout() {
      return;
    }
    if base_units.len() < size {
      continue;
    }
    for base_combo in base_units.iter().cloned().combinations(size) {
      if collector.check_timeout() {
        return;
      }
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
        if collector.check_timeout() {
          return;
        }
        process_fish_combo(
          collector,
          num,
          locs,
          &base_combo,
          &cover_combo,
          eliminated,
        );
      }
    }
  }
}

fn process_fish_combo(
  collector: &mut Collector,
  num: Num,
  locs: LocSet,
  base_combo: &[Unit],
  cover_combo: &[Unit],
  eliminated: &mut LocSet,
) {
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
}

pub fn find_empty_rectangles(collector: &mut Collector) {
  for num in Num::all() {
    if collector.check_timeout() {
      return;
    }
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
      if collector.check_timeout() {
        return;
      }
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
      if collector.check_timeout() {
        return;
      }
      let blk = if let Unit::Blk(b) = block {
        b
      } else {
        unreachable!()
      };
      let er_r = if let Unit::Row(r) = er_row {
        r
      } else {
        unreachable!()
      };
      let er_c = if let Unit::Col(c) = er_col {
        c
      } else {
        unreachable!()
      };

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

pub fn find_skyscrapers(collector: &mut Collector) {
  for num in Num::all() {
    if collector.check_timeout() {
      return;
    }
    let locs = collector.remaining_asgmts.num_locs(num);
    if locs.len() < 4 {
      continue;
    }

    let mut row_pairs = Vec::new();
    let mut col_pairs = Vec::new();

    for r in Row::all() {
      let u_locs = locs & r.to_unit().locs();
      if u_locs.len() == 2 {
        let mut iter = u_locs.iter();
        row_pairs.push((r.to_unit(), iter.next().unwrap(), iter.next().unwrap()));
      }
    }

    for c in Col::all() {
      let u_locs = locs & c.to_unit().locs();
      if u_locs.len() == 2 {
        let mut iter = u_locs.iter();
        col_pairs.push((c.to_unit(), iter.next().unwrap(), iter.next().unwrap()));
      }
    }

    for i in 0..row_pairs.len() {
      if collector.check_timeout() {
        return;
      }
      for j in (i + 1)..row_pairs.len() {
        let (u1, r1_c1, r1_c2) = row_pairs[i];
        let (u2, r2_c1, r2_c2) = row_pairs[j];

        let mut shared_cols = 0;
        let mut roof1 = None;
        let mut roof2 = None;

        if r1_c1.col() == r2_c1.col() {
          shared_cols += 1;
          roof1 = Some(r1_c2);
          roof2 = Some(r2_c2);
        }
        if r1_c1.col() == r2_c2.col() {
          shared_cols += 1;
          roof1 = Some(r1_c2);
          roof2 = Some(r2_c1);
        }
        if r1_c2.col() == r2_c1.col() {
          shared_cols += 1;
          roof1 = Some(r1_c1);
          roof2 = Some(r2_c2);
        }
        if r1_c2.col() == r2_c2.col() {
          shared_cols += 1;
          roof1 = Some(r1_c1);
          roof2 = Some(r2_c1);
        }

        if shared_cols == 1 {
          let roof1 = roof1.unwrap();
          let roof2 = roof2.unwrap();
          let mut elims = locs & roof1.peers() & roof2.peers();
          elims -= u1.locs() | u2.locs();
          if !elims.is_empty() {
            let mut base_units = UnitSet::default();
            base_units.insert(u1);
            base_units.insert(u2);
            let mut roof_locs = LocSet::new();
            roof_locs.insert(roof1);
            roof_locs.insert(roof2);

            collector.add_fact(Fact::Skyscraper {
              num,
              base_units,
              roof_locs,
              elimination_locs: elims,
            });
          }
        }
      }
    }

    for i in 0..col_pairs.len() {
      if collector.check_timeout() {
        return;
      }
      for j in (i + 1)..col_pairs.len() {
        let (u1, c1_r1, c1_r2) = col_pairs[i];
        let (u2, c2_r1, c2_r2) = col_pairs[j];

        let mut shared_rows = 0;
        let mut roof1 = None;
        let mut roof2 = None;

        if c1_r1.row() == c2_r1.row() {
          shared_rows += 1;
          roof1 = Some(c1_r2);
          roof2 = Some(c2_r2);
        }
        if c1_r1.row() == c2_r2.row() {
          shared_rows += 1;
          roof1 = Some(c1_r2);
          roof2 = Some(c2_r1);
        }
        if c1_r2.row() == c2_r1.row() {
          shared_rows += 1;
          roof1 = Some(c1_r1);
          roof2 = Some(c2_r2);
        }
        if c1_r2.row() == c2_r2.row() {
          shared_rows += 1;
          roof1 = Some(c1_r1);
          roof2 = Some(c2_r1);
        }

        if shared_rows == 1 {
          let roof1 = roof1.unwrap();
          let roof2 = roof2.unwrap();
          let mut elims = locs & roof1.peers() & roof2.peers();
          elims -= u1.locs() | u2.locs();
          if !elims.is_empty() {
            let mut base_units = UnitSet::default();
            base_units.insert(u1);
            base_units.insert(u2);
            let mut roof_locs = LocSet::new();
            roof_locs.insert(roof1);
            roof_locs.insert(roof2);

            collector.add_fact(Fact::Skyscraper {
              num,
              base_units,
              roof_locs,
              elimination_locs: elims,
            });
          }
        }
      }
    }
  }
}

pub fn find_two_string_kites(collector: &mut Collector) {
  for num in Num::all() {
    if collector.check_timeout() {
      return;
    }
    let locs = collector.remaining_asgmts.num_locs(num);
    if locs.len() < 4 {
      continue;
    }

    let mut row_pairs: [Option<(Loc, Loc)>; 9] = [None; 9];
    let mut col_pairs: [Option<(Loc, Loc)>; 9] = [None; 9];

    for r in Row::all() {
      let u_locs = locs & r.to_unit().locs();
      if u_locs.len() == 2 {
        let mut iter = u_locs.iter();
        row_pairs[r.index()] = Some((iter.next().unwrap(), iter.next().unwrap()));
      }
    }

    for c in Col::all() {
      let u_locs = locs & c.to_unit().locs();
      if u_locs.len() == 2 {
        let mut iter = u_locs.iter();
        col_pairs[c.index()] = Some((iter.next().unwrap(), iter.next().unwrap()));
      }
    }

    for blk in Blk::all() {
      if collector.check_timeout() {
        return;
      }
      let b_locs = locs & blk.to_unit().locs();
      if b_locs.len() < 2 {
        continue;
      }
      let blk_vec: Vec<Loc> = b_locs.iter().collect();

      for i in 0..blk_vec.len() {
        for j in (i + 1)..blk_vec.len() {
          if collector.check_timeout() {
            return;
          }
          let loc_a = blk_vec[i];
          let loc_b = blk_vec[j];

          if loc_a.row() == loc_b.row() || loc_a.col() == loc_b.col() {
            continue;
          }

          let r_a = loc_a.row();
          let c_a = loc_a.col();
          let r_b = loc_b.row();
          let c_b = loc_b.col();

          // String 1: Row A (base loc_a)
          let str_r_a = row_pairs[r_a.index()].and_then(|(l1, l2)| {
            let other = if l1 == loc_a { l2 } else { l1 };
            if other.blk() != blk {
              Some(other)
            } else {
              None
            }
          });

          // String 2: Col B (base loc_b)
          let str_c_b = col_pairs[c_b.index()].and_then(|(l1, l2)| {
            let other = if l1 == loc_b { l2 } else { l1 };
            if other.blk() != blk {
              Some(other)
            } else {
              None
            }
          });

          // String 3: Row B (base loc_b)
          let str_r_b = row_pairs[r_b.index()].and_then(|(l1, l2)| {
            let other = if l1 == loc_b { l2 } else { l1 };
            if other.blk() != blk {
              Some(other)
            } else {
              None
            }
          });

          // String 4: Col A (base loc_a)
          let str_c_a = col_pairs[c_a.index()].and_then(|(l1, l2)| {
            let other = if l1 == loc_a { l2 } else { l1 };
            if other.blk() != blk {
              Some(other)
            } else {
              None
            }
          });

          // Kite 1 connects Row A and Col B
          let kite1_elims = if let (Some(roof_ra), Some(roof_cb)) = (str_r_a, str_c_b) {
            let mut elims = locs & roof_ra.peers() & roof_cb.peers();
            elims -= r_a.to_unit().locs() | c_b.to_unit().locs();
            elims
          } else {
            LocSet::new()
          };

          // Kite 2 connects Row B and Col A
          let kite2_elims = if let (Some(roof_rb), Some(roof_ca)) = (str_r_b, str_c_a) {
            let mut elims = locs & roof_rb.peers() & roof_ca.peers();
            elims -= r_b.to_unit().locs() | c_a.to_unit().locs();
            elims
          } else {
            LocSet::new()
          };

          if !kite1_elims.is_empty() && !kite2_elims.is_empty() {
            // Dual 2-String Kite
            let mut rows = UnitSet::default();
            rows.insert(r_a.to_unit());
            rows.insert(r_b.to_unit());

            let mut cols = UnitSet::default();
            cols.insert(c_a.to_unit());
            cols.insert(c_b.to_unit());

            let mut string_ends = LocSet::new();
            string_ends.insert(str_r_a.unwrap());
            string_ends.insert(str_c_b.unwrap());
            string_ends.insert(str_r_b.unwrap());
            string_ends.insert(str_c_a.unwrap());

            collector.add_fact(Fact::TwoStringKite {
              num,
              block: blk.to_unit(),
              rows,
              cols,
              string_ends,
              elimination_locs: kite1_elims | kite2_elims,
            });
          } else if !kite1_elims.is_empty() {
            // Standard 2-String Kite (Kite 1)
            let mut rows = UnitSet::default();
            rows.insert(r_a.to_unit());

            let mut cols = UnitSet::default();
            cols.insert(c_b.to_unit());

            let mut string_ends = LocSet::new();
            string_ends.insert(str_r_a.unwrap());
            string_ends.insert(str_c_b.unwrap());

            collector.add_fact(Fact::TwoStringKite {
              num,
              block: blk.to_unit(),
              rows,
              cols,
              string_ends,
              elimination_locs: kite1_elims,
            });
          } else if !kite2_elims.is_empty() {
            // Standard 2-String Kite (Kite 2)
            let mut rows = UnitSet::default();
            rows.insert(r_b.to_unit());

            let mut cols = UnitSet::default();
            cols.insert(c_a.to_unit());

            let mut string_ends = LocSet::new();
            string_ends.insert(str_r_b.unwrap());
            string_ends.insert(str_c_a.unwrap());

            collector.add_fact(Fact::TwoStringKite {
              num,
              block: blk.to_unit(),
              rows,
              cols,
              string_ends,
              elimination_locs: kite2_elims,
            });
          }
        }
      }
    }
  }
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
      SukakuMap::from_grid(&Grid::new()),
    );

    find_empty_rectangles(&mut collector);

    let mut found = false;
    for fact in &collector.facts {
      if let Fact::EmptyRectangle {
        elimination_locs, ..
      } = fact
      {
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
      SukakuMap::from_grid(&Grid::new()),
    );

    find_empty_rectangles(&mut collector);

    let mut found = false;
    for fact in &collector.facts {
      if let Fact::EmptyRectangle {
        elimination_locs, ..
      } = fact
      {
        if elimination_locs.contains(L41) {
          found = true;
          break;
        }
      }
    }
    assert!(found, "Empty Rectangle should eliminate L41");
  }

  #[test]
  fn test_advanced_search_timeout() {
    let mut remaining = AsgmtSet::new();
    remaining.insert(Asgmt::new(N1, L12));
    remaining.insert(Asgmt::new(N1, L21));
    remaining.insert(Asgmt::new(N1, L41));
    remaining.insert(Asgmt::new(N1, L44));
    remaining.insert(Asgmt::new(N1, L14));
    remaining.insert(Asgmt::new(N1, L88));
    remaining.insert(Asgmt::new(N1, L99));

    let mut collector = Collector::new(
      remaining,
      AsgmtSet::new(),
      SukakuMap::from_grid(&Grid::new()),
    );
    // Force timeout
    collector.timed_out = true;

    find_fish(&mut collector);
    assert!(collector.facts.is_empty());

    find_empty_rectangles(&mut collector);
    assert!(collector.facts.is_empty());

    find_skyscrapers(&mut collector);
    assert!(collector.facts.is_empty());

    find_two_string_kites(&mut collector);
    assert!(collector.facts.is_empty());

    // Test with max_time_ms = 0.0 (elapsed time check)
    let mut timed_collector = Collector::new(
      remaining,
      AsgmtSet::new(),
      SukakuMap::from_grid(&Grid::new()),
    );
    timed_collector.start_time_ms = 0.0; // long ago in the past
    timed_collector.max_time_ms = Some(0.0);

    find_empty_rectangles(&mut timed_collector);
    assert!(timed_collector.facts.is_empty());
    assert!(timed_collector.timed_out);
  }

  #[test]
  fn test_two_string_kite_standard() {
    let mut remaining = AsgmtSet::new();

    // 2-String Kite for N5 in B9 (R8, C7)
    // Row 8 CP: L84 (R8C4), L89 (R8C9 in B9)
    remaining.insert(Asgmt::new(N5, L84));
    remaining.insert(Asgmt::new(N5, L89));

    // Col 7 CP: L27 (R2C7), L97 (R9C7 in B9)
    remaining.insert(Asgmt::new(N5, L27));
    remaining.insert(Asgmt::new(N5, L97));

    // Target elimination at L24 (R2C4)
    remaining.insert(Asgmt::new(N5, L24));

    // Add extra candidates so rows/cols are not singletons
    remaining.insert(Asgmt::new(N5, L11));
    remaining.insert(Asgmt::new(N5, L33));

    let mut collector = Collector::new(
      remaining,
      AsgmtSet::new(),
      SukakuMap::from_grid(&Grid::new()),
    );

    find_two_string_kites(&mut collector);

    let mut found = false;
    for fact in &collector.facts {
      if let Fact::TwoStringKite {
        num,
        block,
        rows,
        cols,
        string_ends,
        elimination_locs,
      } = fact
      {
        if *num == N5
          && *block == B9.to_unit()
          && rows.len() == 1
          && cols.len() == 1
          && string_ends.contains(L84)
          && string_ends.contains(L27)
          && elimination_locs.contains(L24)
        {
          found = true;
          break;
        }
      }
    }
    assert!(found, "Standard 2-String Kite should eliminate L24");
  }

  #[test]
  fn test_two_string_kite_dual() {
    let mut remaining = AsgmtSet::new();

    // Dual 2-String Kite for N1 in B1 (Hodoku example 1)
    // Connecting candidates in B1: L13 (R1C3) and L31 (R3C1)
    // Row 1 CP: L13 and L18 (R1C8)
    remaining.insert(Asgmt::new(N1, L13));
    remaining.insert(Asgmt::new(N1, L18));

    // Col 1 CP: L31 and L61 (R6C1)
    remaining.insert(Asgmt::new(N1, L31));
    remaining.insert(Asgmt::new(N1, L61));

    // Row 3 CP: L31 and L39 (R3C9)
    remaining.insert(Asgmt::new(N1, L39));

    // Col 3 CP: L13 and L43 (R4C3)
    remaining.insert(Asgmt::new(N1, L43));

    // Eliminations: L68 (R6C8) and L49 (R4C9)
    remaining.insert(Asgmt::new(N1, L68));
    remaining.insert(Asgmt::new(N1, L49));

    // Extra dummy candidates in other rows/cols to avoid unintended conjugate pairs
    remaining.insert(Asgmt::new(N1, L85));
    remaining.insert(Asgmt::new(N1, L96));

    let mut collector = Collector::new(
      remaining,
      AsgmtSet::new(),
      SukakuMap::from_grid(&Grid::new()),
    );

    find_two_string_kites(&mut collector);

    let mut found = false;
    for fact in &collector.facts {
      if let Fact::TwoStringKite {
        num,
        block,
        rows,
        cols,
        string_ends,
        elimination_locs,
      } = fact
      {
        if *num == N1
          && *block == B1.to_unit()
          && rows.len() == 2
          && cols.len() == 2
          && string_ends.len() == 4
          && elimination_locs.contains(L68)
          && elimination_locs.contains(L49)
        {
          found = true;
          break;
        }
      }
    }
    assert!(found, "Dual 2-String Kite should eliminate L68 and L49");
  }
}
