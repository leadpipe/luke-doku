use crate::core::*;
use crate::deduce::internals::Collector;
use crate::deduce::Fact;
use itertools::Itertools;

pub fn find_fish(collector: &mut Collector) {
  for num in Num::all() {
    if collector.check_timeout() {
      return;
    }
    let locs = collector.finder.remaining_asgmts.num_locs(num);
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
      if cands_in_base.is_empty() {
        continue;
      }

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
          base_combo_locs,
          cands_in_base,
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
  base_combo_locs: LocSet,
  cands_in_base: LocSet,
  cover_combo: &[Unit],
  eliminated: &mut LocSet,
) {
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

/// Finds conjugate pairs (bi-value lines) in rows and columns for the given
/// candidate locations.
fn find_conjugate_pairs(locs: LocSet) -> ([Option<(Loc, Loc)>; 9], [Option<(Loc, Loc)>; 9]) {
  let mut row_pairs = [None; 9];
  let mut col_pairs = [None; 9];

  for r in Row::all() {
    let u_locs = locs & r.locs();
    if u_locs.len() == 2 {
      let mut iter = u_locs.iter();
      row_pairs[r.index()] = Some((iter.next().unwrap(), iter.next().unwrap()));
    }
  }

  for c in Col::all() {
    let u_locs = locs & c.locs();
    if u_locs.len() == 2 {
      let mut iter = u_locs.iter();
      col_pairs[c.index()] = Some((iter.next().unwrap(), iter.next().unwrap()));
    }
  }

  (row_pairs, col_pairs)
}

pub fn find_empty_rectangles(collector: &mut Collector) {
  for num in Num::all() {
    if collector.check_timeout() {
      return;
    }
    let locs = collector.finder.remaining_asgmts.num_locs(num);
    if locs.len() < 4 {
      continue;
    }

    // 1. Find Conjugate Pairs (Rows and Cols only)
    let (row_pairs, col_pairs) = find_conjugate_pairs(locs);
    let conjugate_pairs: Vec<(Unit, Loc, Loc)> = Row::all()
      .filter_map(|r| row_pairs[r.index()].map(|(l1, l2)| (r.to_unit(), l1, l2)))
      .chain(Col::all().filter_map(|c| col_pairs[c.index()].map(|(l1, l2)| (c.to_unit(), l1, l2))))
      .collect();
    if conjugate_pairs.is_empty() {
      continue;
    }

    // 2. Find ERs
    let mut ers = Vec::new();
    for blk in Blk::all() {
      if collector.check_timeout() {
        return;
      }
      let b_locs = locs & blk.locs();
      if b_locs.len() < 2 {
        continue;
      }

      for r in BlkLine::all() {
        for c in BlkLine::all() {
          let mut is_er = true;
          let mut in_r_only = true;
          let mut in_c_only = true;
          for loc in b_locs.iter() {
            let matches_r = loc.blk_row() == r;
            let matches_c = loc.blk_col() == c;
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
            ers.push((blk, blk.row(r), blk.col(c)));
          }
        }
      }
    }

    // 3. Match ERs and Conjugate Pairs
    for (blk, er_r, er_c) in ers {
      if collector.check_timeout() {
        return;
      }
      let block = blk.to_unit();
      let er_row = er_r.to_unit();
      let er_col = er_c.to_unit();

      for &(u, loc1, loc2) in &conjugate_pairs {
        // CP must be outside the ER block
        if loc1.blk() == blk || loc2.blk() == blk {
          continue;
        }

        for (end1, end2) in [(loc1, loc2), (loc2, loc1)] {
          let target = match u {
            Unit::Row(_) if end1.col() == er_c => Some(Loc::at(er_r, end2.col())),
            Unit::Col(_) if end1.row() == er_r => Some(Loc::at(end2.row(), er_c)),
            _ => None,
          };
          if let Some(target) = target {
            if target != end2 && target.blk() != blk && locs.contains(target) {
              collector.add_fact(Fact::EmptyRectangle {
                num,
                block,
                row: er_row,
                col: er_col,
                conjugate_pair: loc1.as_set() | loc2.as_set(),
                elimination_locs: target.as_set(),
              });
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
    let locs = collector.finder.remaining_asgmts.num_locs(num);
    if locs.len() < 4 {
      continue;
    }

    let (row_cp, col_cp) = find_conjugate_pairs(locs);
    let row_pairs: Vec<(Unit, Loc, Loc)> = Row::all()
      .filter_map(|r| row_cp[r.index()].map(|(l1, l2)| (r.to_unit(), l1, l2)))
      .collect();
    let col_pairs: Vec<(Unit, Loc, Loc)> = Col::all()
      .filter_map(|c| col_cp[c.index()].map(|(l1, l2)| (c.to_unit(), l1, l2)))
      .collect();

    find_skyscrapers_in_lines(collector, num, locs, &row_pairs, |a, b| a.col() == b.col());
    if collector.check_timeout() {
      return;
    }
    find_skyscrapers_in_lines(collector, num, locs, &col_pairs, |a, b| a.row() == b.row());
  }
}

fn find_skyscrapers_in_lines(
  collector: &mut Collector,
  num: Num,
  locs: LocSet,
  pairs: &[(Unit, Loc, Loc)],
  same_cross_line: fn(Loc, Loc) -> bool,
) {
  for i in 0..pairs.len() {
    if collector.check_timeout() {
      return;
    }
    for j in (i + 1)..pairs.len() {
      let (u1, l1_a, l1_b) = pairs[i];
      let (u2, l2_a, l2_b) = pairs[j];

      let mut shared_cross = 0;
      let mut roofs = None;

      for (base1, roof1) in [(l1_a, l1_b), (l1_b, l1_a)] {
        for (base2, roof2) in [(l2_a, l2_b), (l2_b, l2_a)] {
          if same_cross_line(base1, base2) {
            shared_cross += 1;
            roofs = Some((roof1, roof2));
          }
        }
      }

      if shared_cross == 1 {
        let (roof1, roof2) = roofs.unwrap();
        let elims = (locs & roof1.peers() & roof2.peers()) - (u1.locs() | u2.locs());
        if !elims.is_empty() {
          let mut base_units = UnitSet::default();
          base_units.insert(u1);
          base_units.insert(u2);

          collector.add_fact(Fact::Skyscraper {
            num,
            base_units,
            roof_locs: roof1.as_set() | roof2.as_set(),
            elimination_locs: elims,
          });
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
    let locs = collector.finder.remaining_asgmts.num_locs(num);
    if locs.len() < 4 {
      continue;
    }

    let (row_pairs, col_pairs) = find_conjugate_pairs(locs);

    for blk in Blk::all() {
      if collector.check_timeout() {
        return;
      }
      let b_locs = locs & blk.locs();
      if b_locs.len() < 2 {
        continue;
      }
      let blk_vec: Vec<Loc> = b_locs.iter().collect();

      let other_outside_blk = |pair: Option<(Loc, Loc)>, base: Loc| -> Option<Loc> {
        pair.and_then(|(l1, l2)| {
          let other = if l1 == base { l2 } else { l1 };
          (other.blk() != blk).then_some(other)
        })
      };

      let kite_elims = |roof_r: Option<Loc>, roof_c: Option<Loc>, r: Row, c: Col| -> LocSet {
        if let (Some(rr), Some(rc)) = (roof_r, roof_c) {
          (locs & rr.peers() & rc.peers()) - (r.locs() | c.locs())
        } else {
          LocSet::new()
        }
      };

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

          let str_r_a = other_outside_blk(row_pairs[r_a.index()], loc_a);
          let str_c_b = other_outside_blk(col_pairs[c_b.index()], loc_b);
          let str_r_b = other_outside_blk(row_pairs[r_b.index()], loc_b);
          let str_c_a = other_outside_blk(col_pairs[c_a.index()], loc_a);

          let kite1_elims = kite_elims(str_r_a, str_c_b, r_a, c_b);
          let kite2_elims = kite_elims(str_r_b, str_c_a, r_b, c_a);

          let mut rows = UnitSet::default();
          let mut cols = UnitSet::default();
          let mut string_ends = LocSet::new();
          let mut elimination_locs = LocSet::new();

          for (elims, r, c, end_r, end_c) in [
            (kite1_elims, r_a, c_b, str_r_a, str_c_b),
            (kite2_elims, r_b, c_a, str_r_b, str_c_a),
          ] {
            if !elims.is_empty() {
              rows.insert(r.to_unit());
              cols.insert(c.to_unit());
              string_ends.insert(end_r.unwrap());
              string_ends.insert(end_c.unwrap());
              elimination_locs |= elims;
            }
          }

          if !elimination_locs.is_empty() {
            collector.add_fact(Fact::TwoStringKite {
              num,
              block: blk.to_unit(),
              rows,
              cols,
              string_ends,
              elimination_locs,
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
  use crate::deduce::{Fact, FactFinder};

  fn collector_from_remaining(remaining: AsgmtSet) -> Collector {
    Collector::new(FactFinder {
      remaining_asgmts: remaining,
      actual_asgmts: AsgmtSet::new(),
      sukaku_map: SukakuMap::from_grid(&Grid::new()),
    })
  }

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

    let mut collector = collector_from_remaining(remaining);

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

    let mut collector = collector_from_remaining(remaining);

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

    let mut collector = collector_from_remaining(remaining);
    // Force timeout
    collector.timeout.timed_out = true;

    find_fish(&mut collector);
    assert!(collector.facts.is_empty());

    find_empty_rectangles(&mut collector);
    assert!(collector.facts.is_empty());

    find_skyscrapers(&mut collector);
    assert!(collector.facts.is_empty());

    find_two_string_kites(&mut collector);
    assert!(collector.facts.is_empty());

    // Test with max_time_ms = 0.0 (elapsed time check)
    let mut timed_collector = collector_from_remaining(remaining);
    timed_collector.timeout.start_time_ms = 0.0; // long ago in the past
    timed_collector.timeout.max_time_ms = Some(0.0);

    find_empty_rectangles(&mut timed_collector);
    assert!(timed_collector.facts.is_empty());
    assert!(timed_collector.timeout.timed_out);
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

    let mut collector = collector_from_remaining(remaining);

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

    let mut collector = collector_from_remaining(remaining);

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

  #[test]
  fn test_find_conjugate_pairs() {
    let mut locs = LocSet::new();
    // Row 1 has exactly 2 candidates: L12, L17
    locs.insert(L12);
    locs.insert(L17);
    // Row 2 has 3 candidates (not a conjugate pair): L21, L22, L23
    locs.insert(L21);
    locs.insert(L22);
    locs.insert(L23);
    // Row 4 has 1 candidate (not a conjugate pair): L47 -> makes Col 7 have 2 candidates (L17, L47)
    locs.insert(L47);

    let (row_pairs, col_pairs) = find_conjugate_pairs(locs);
    assert_eq!(row_pairs[R1.index()], Some((L12, L17)));
    assert_eq!(row_pairs[R2.index()], None);
    assert_eq!(row_pairs[R4.index()], None);
    assert_eq!(col_pairs[C7.index()], Some((L17, L47)));
    assert_eq!(col_pairs[C2.index()], Some((L12, L22)));
    assert_eq!(col_pairs[C1.index()], None);
  }

  #[test]
  fn test_skyscraper_row_and_col_base() {
    // 1. Row-base Skyscraper for N3:
    // Row 1 CP: L11 (R1C1), L14 (R1C4)
    // Row 7 CP: L71 (R7C1), L76 (R7C6)
    // Shared base col: C1 (L11 & L71). Roofs: L14 (B2) and L76 (B8).
    // Common peers of L14 and L76 outside R1/R7: L26, L36 (in B2 & C6) and L84, L94 (in B8 & C4).
    let mut remaining = AsgmtSet::new();
    for loc in [L11, L14, L71, L76, L26, L84, L55, L58, L59] {
      remaining.insert(Asgmt::new(N3, loc));
    }

    let mut collector = collector_from_remaining(remaining);
    find_skyscrapers(&mut collector);

    let row_sky = collector.facts.iter().find(|f| {
      matches!(
        f,
        Fact::Skyscraper {
          num: N3,
          base_units,
          roof_locs,
          elimination_locs,
        } if base_units.contains(R1.to_unit())
          && base_units.contains(R7.to_unit())
          && *roof_locs == (L14.as_set() | L76.as_set())
          && *elimination_locs == (L26.as_set() | L84.as_set())
      )
    });
    assert!(row_sky.is_some(), "Should find row-based Skyscraper");

    // 2. Col-base Skyscraper for N4:
    // Transpose of above:
    // Col 1 CP: L11 (R1C1), L41 (R4C1)
    // Col 7 CP: L17 (R1C7), L67 (R6C7)
    // Shared base row: R1 (L11 & L17). Roofs: L41 (B4) and L67 (B6).
    // Common peers of L41 and L67: L62 (in B4 & R6) and L48 (in B6 & R4).
    let mut remaining_col = AsgmtSet::new();
    for loc in [L11, L41, L17, L67, L62, L48, L55, L85, L95] {
      remaining_col.insert(Asgmt::new(N4, loc));
    }

    let mut collector_col = collector_from_remaining(remaining_col);
    find_skyscrapers(&mut collector_col);

    let col_sky = collector_col.facts.iter().find(|f| {
      matches!(
        f,
        Fact::Skyscraper {
          num: N4,
          base_units,
          roof_locs,
          elimination_locs,
        } if base_units.contains(C1.to_unit())
          && base_units.contains(C7.to_unit())
          && *roof_locs == (L41.as_set() | L67.as_set())
          && *elimination_locs == (L62.as_set() | L48.as_set())
      )
    });
    assert!(col_sky.is_some(), "Should find col-based Skyscraper");

    // 3. X-Wing (2 shared cross-lines) must NOT be reported as a Skyscraper:
    let mut x_wing = AsgmtSet::new();
    for loc in [L11, L14, L71, L74, L24, L81] {
      x_wing.insert(Asgmt::new(N6, loc));
    }
    let mut collector_xw = collector_from_remaining(x_wing);
    find_skyscrapers(&mut collector_xw);
    assert!(
      collector_xw.facts.is_empty(),
      "X-Wing (shared_cross == 2) should not produce a Skyscraper fact"
    );
  }

  #[test]
  fn test_fish_unfinned_finned_and_invalid_fins() {
    // 1. Unfinned Row X-Wing on R2, R5 covering C3, C7 eliminating L83:
    let mut remaining = AsgmtSet::new();
    for loc in [L23, L27, L53, L57, L83, L88, L99] {
      remaining.insert(Asgmt::new(N2, loc));
    }
    let mut collector = collector_from_remaining(remaining);
    find_fish(&mut collector);
    assert!(
      collector.facts.iter().any(|f| matches!(
        f,
        Fact::Fish {
          num: N2,
          base_units,
          cover_units,
          finned_locs,
          elimination_locs,
        } if base_units.contains(R2.to_unit())
          && base_units.contains(R5.to_unit())
          && cover_units.contains(C3.to_unit())
          && cover_units.contains(C7.to_unit())
          && finned_locs.is_empty()
          && elimination_locs.contains(L83)
      )),
      "Should find unfinned row X-Wing"
    );

    // 2. Finned Row X-Wing on R1, R4 covering C1, C5 with fin at L46 (in B5),
    // eliminating L65 (in C5 & B5) but NOT L85 (outside B5):
    let mut finned = AsgmtSet::new();
    for loc in [L11, L15, L41, L45, L46, L65, L85, L99] {
      finned.insert(Asgmt::new(N7, loc));
    }
    let mut collector_fin = collector_from_remaining(finned);
    find_fish(&mut collector_fin);
    assert!(
      collector_fin.facts.iter().any(|f| matches!(
        f,
        Fact::Fish {
          num: N7,
          base_units,
          cover_units,
          finned_locs,
          elimination_locs,
        } if base_units.contains(R1.to_unit())
          && base_units.contains(R4.to_unit())
          && cover_units.contains(C1.to_unit())
          && cover_units.contains(C5.to_unit())
          && *finned_locs == L46.as_set()
          && *elimination_locs == L65.as_set()
      )),
      "Should find finned X-Wing restricting eliminations to fin block B5"
    );

    // 3. Fins in two different blocks (L43 in B4 and L49 in B6) are invalid for C1, C5 cover:
    let mut multi_block_fins = AsgmtSet::new();
    for loc in [L11, L15, L41, L45, L43, L49, L65] {
      multi_block_fins.insert(Asgmt::new(N8, loc));
    }
    let mut collector_invalid = collector_from_remaining(multi_block_fins);
    find_fish(&mut collector_invalid);
    assert!(
      !collector_invalid.facts.iter().any(|f| matches!(
        f,
        Fact::Fish {
          num: N8,
          base_units,
          cover_units,
          ..
        } if base_units.contains(R1.to_unit())
          && base_units.contains(R4.to_unit())
          && cover_units.contains(C1.to_unit())
          && cover_units.contains(C5.to_unit())
      )),
      "Fins in different blocks must not form a valid Fish"
    );
  }
}
