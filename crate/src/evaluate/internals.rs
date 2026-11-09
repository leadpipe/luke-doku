//| Defines the internals of the evaluator for Luke-doku.

use super::*;
use crate::{
  core::{AsgmtSet, Invalid, NumSet, Set, Unit},
  deduce::{Fact, FactFinder},
};

pub fn evaluate_complexity<F>(puzzle: &Puzzle, mut observer: F) -> Complexity
where
  F: FnMut(&Fact),
{
  let solution = puzzle.solution_asgmts();
  let mut fact_finder = FactFinder::new(&puzzle.clues);
  let mut answer = Complexity::Simple;
  loop {
    let facts = find_facts(&fact_finder, answer);
    let mut min_complexity = Complexity::Complex;
    let asgmts: Vec<(&Fact, Complexity)> = facts
      .iter()
      .filter_map(|fact| {
        if fact.is_asgmt() {
          let complexity = fact.complexity();
          min_complexity = min_complexity.min(complexity);
          Some((fact, complexity))
        } else {
          None
        }
      })
      .collect();
    if asgmts.is_empty() {
      break;
    }
    answer = answer.max(min_complexity);
    for (fact, complexity) in asgmts {
      if complexity <= answer {
        observer(fact);
        fact_finder.apply_fact(fact);
      }
    }
  }
  if fact_finder.possible_asgmts() != solution {
    // Straight deductions are not enough to solve the puzzle, so the complexity
    // is at least "expert," meaning that it requires some disproofs.
    answer = if can_solve_via_single_disproofs(&mut fact_finder, &solution) {
      Complexity::Expert
    } else {
      Complexity::Lunatic
    };
  }
  answer
}

fn find_facts(fact_finder: &FactFinder, answer: Complexity) -> Vec<Fact> {
  if answer == Complexity::Simple {
    let singles = fact_finder.deduce_singles();
    if singles.is_empty() {
      return fact_finder.deduce_all();
    }
    singles
  } else {
    fact_finder.deduce_all()
  }
}

/// Figures out whether the puzzle can be solved via single disproofs, meaning
/// non-recursive disproofs that eliminate a single assignment.
fn can_solve_via_single_disproofs(fact_finder: &mut FactFinder, solution: &AsgmtSet) -> bool {
  'outer: for asgmt in (fact_finder.possible_asgmts() - *solution).iter() {
    let mut inner = *fact_finder;
    inner.apply(asgmt);
    loop {
      match apply_asgmts(&mut inner) {
        Ok(true) => {}
        // We weren't able to eliminate this assignment, so move on to the next one.
        Ok(false) => continue 'outer,
        Err(Invalid) => break,
      }
    }
    // We found a contradiction, so we can eliminate this assignment.
    fact_finder.eliminate(asgmt);
    // Then follow deductions to see if we can reach the solution.
    while fact_finder.possible_asgmts() != *solution {
      if !apply_asgmts(fact_finder).unwrap() {
        // Safe because we're back to the valid state.
        continue 'outer;
      }
    }
    // We found the solution via this disproof, so we can stop.
    return true;
  }
  // We weren't able to solve the puzzle via single disproofs.
  false
}

/// Applies all assignments in the fact finder, returning whether any were
/// found.
fn apply_asgmts(fact_finder: &mut FactFinder) -> Result<bool, Invalid> {
  let facts = fact_finder.deduce_invalid()?;
  let mut found = false;
  for fact in facts {
    if fact.is_asgmt() {
      found = true;
      fact_finder.apply_fact(&fact);
    }
  }
  Ok(found)
}

impl Fact {
  /// Returns the complexity of this fact.
  fn complexity(&self) -> Complexity {
    match self {
      Fact::SingleLoc { .. } | Fact::SingleNum { .. } | Fact::SpeculativeAssignment { .. } => {
        Complexity::Simple
      }
      Fact::Overlap { .. } => Complexity::Moderate,
      Fact::Subset {
        nums,
        unit,
        is_naked,
        ..
      } => {
        if nums.len() <= 3 && !is_naked && matches!(unit, Unit::Blk(_)) {
          Complexity::Moderate
        } else {
          Complexity::Complex
        }
      }
      Fact::Implication {
        antecedents,
        consequent,
      } => {
        let max_antecedent_complexity = antecedents
          .iter()
          .map(Fact::complexity)
          .max()
          .unwrap_or(Complexity::Moderate);
        if self.nums().len() == 1 {
          return max_antecedent_complexity.max(Complexity::Moderate);
        }
        if antecedents.len() == 1
          && matches!(antecedents[0], Fact::Subset { .. })
          && !matches!(**consequent, Fact::Implication { .. })
        {
          // A single locked set implies a single assignment, so we can treat it
          // as equivalent to the complexity of the locked set.
          return max_antecedent_complexity;
        }
        Complexity::Complex
      }
      Fact::Fish {
        base_units,
        finned_locs,
        ..
      } => {
        if finned_locs.is_empty() && base_units.len() == 2 {
          Complexity::Moderate
        } else {
          Complexity::Complex
        }
      }
      Fact::TwoStringKite { rows, .. } => {
        if rows.len() == 1 {
          Complexity::Moderate
        } else {
          Complexity::Complex
        }
      }
      _ => Complexity::Complex,
    }
  }

  fn nums(&self) -> NumSet {
    match self {
      Fact::SingleLoc { num, .. }
      | Fact::SingleNum { num, .. }
      | Fact::SpeculativeAssignment { num, .. }
      | Fact::Overlap { num, .. }
      | Fact::Fish { num, .. }
      | Fact::EmptyRectangle { num, .. }
      | Fact::Skyscraper { num, .. }
      | Fact::TwoStringKite { num, .. } => NumSet::singleton(*num),
      Fact::Subset { nums, .. } => *nums,
      Fact::Implication {
        antecedents,
        consequent,
      } => antecedents
        .iter()
        .fold(consequent.nums(), |nums, ant| nums | ant.nums()),
      _ => NumSet::new(),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{core::Grid, gen::Puzzle};
  use std::str::FromStr;

  fn eval_complexity(s: &str) -> Complexity {
    let grid = Grid::from_str(s).unwrap();
    let puzzle = Puzzle::new(&grid, None).unwrap();
    evaluate_complexity(&puzzle, |_| {})
  }

  #[test]
  fn test_evaluate_complexity_simple() {
    let complexity = eval_complexity(
      r"
      . . 1 | 7 8 . | . . .
      . 4 . | . 6 3 | 1 7 .
      6 . 8 | . . . | . . .
      - - - + - - - + - - -
      . . . | . 4 . | 9 1 .
      . . . | . . 1 | . 3 .
      . . . | . 7 . | 4 2 .
      - - - + - - - + - - -
      5 . 9 | . . . | . . .
      . 1 . | . 2 8 | 6 4 .
      . . 2 | 9 3 . | . . .
    ",
    );
    assert_eq!(complexity, Complexity::Simple);
  }

  #[test]
  fn test_evaluate_complexity_moderate() {
    let complexity = eval_complexity(
      r"
      . . 9 | 1 . 5 | 7 . .
      2 7 . | . . 3 | . . .
      3 . . | . . 6 | . . 1
      - - - + - - - + - - -
      . 1 . | . . . | 3 5 7
      . . . | . . . | . . .
      4 . 7 | . . . | . . 2
      - - - + - - - + - - -
      . 3 . | 2 . . | . . 8
      . . 4 | . . 7 | . 2 .
      . . . | 4 . . | 9 7 .
    ",
    );
    assert_eq!(complexity, Complexity::Moderate);
  }

  #[test]
  fn test_evaluate_complexity_complex() {
    let complexity = eval_complexity(
      r"
      7 . 6 | . 8 . | . 5 2
      . . . | 5 4 . | . . .
      . 9 5 | . . . | . . 8
      - - - + - - - + - - -
      . . 4 | 6 . . | 5 8 .
      . 2 . | 4 7 5 | . 9 1
      . 5 . | 8 . 3 | 2 4 .
      - - - + - - - + - - -
      3 . . | . . 4 | 8 2 5
      . . 1 | . 5 8 | . . .
      5 . . | . . . | 7 1 4
    ",
    );
    assert_eq!(complexity, Complexity::Complex);
  }

  #[test]
  fn test_evaluate_complexity_expert() {
    let complexity = eval_complexity(
      r"
      . 9 . | . 2 . | 5 . 1
      . . . | . 1 6 | 7 . .
      . . . | . . 7 | . . 9
      - - - + - - - + - - -
      . 6 . | . . . | . . .
      9 . 4 | . . . | 6 . 2
      . . 3 | . . . | . 9 .
      - - - + - - - + - - -
      1 . 7 | 3 . 9 | . . .
      . . . | 2 8 . | . . .
      5 . 8 | . 6 . | . 1 .
    ",
    );
    assert_eq!(complexity, Complexity::Expert);
  }

  #[test]
  fn test_evaluate_complexity_lunatic() {
    let complexity = eval_complexity(
      r"
      . . 5 |3 . . |. . . 
      8 . . |. . . |. 2 . 
      . 7 . |. 1 . |5 . . 
      ------+------+------
      4 . . |. . 5 |3 . . 
      . 1 . |. 7 . |. . 6 
      . . 3 |2 . . |. 8 . 
      ------+------+------
      . 6 . |5 . . |. . 9 
      . . 4 |. . . |. 3 . 
      . . . |. . 9 |7 . . 
    ",
    );
    assert_eq!(complexity, Complexity::Lunatic);
  }

  #[test]
  fn test_fact_complexity_and_nums() {
    use crate::core::{
      LocSet, UnitSet, UnitTrait, B1, C1, C2, C3, L11, L12, L13, L14, N1, N2, N3, N4, R1, R2, R3,
    };

    let single_loc = Fact::SingleLoc {
      num: N1,
      unit: R1.to_unit(),
      loc: L11,
    };
    let single_num = Fact::SingleNum { loc: L11, num: N2 };
    let spec_asgmt = Fact::SpeculativeAssignment { loc: L11, num: N3 };
    assert_eq!(single_loc.complexity(), Complexity::Simple);
    assert_eq!(single_num.complexity(), Complexity::Simple);
    assert_eq!(spec_asgmt.complexity(), Complexity::Simple);
    assert_eq!(single_loc.nums(), NumSet::singleton(N1));
    assert_eq!(single_num.nums(), NumSet::singleton(N2));
    assert_eq!(spec_asgmt.nums(), NumSet::singleton(N3));

    let overlap = Fact::Overlap {
      num: N1,
      unit: B1.to_unit(),
      cross_unit: R1.to_unit(),
    };
    assert_eq!(overlap.complexity(), Complexity::Moderate);
    assert_eq!(overlap.nums(), NumSet::singleton(N1));

    // Subsets: hidden block subset of size <= 3 is Moderate; naked, row/col, or size 4 is Complex.
    let pair_nums = NumSet::singleton(N1) | NumSet::singleton(N2);
    let quad_nums = pair_nums | NumSet::singleton(N3) | NumSet::singleton(N4);
    let hidden_blk_pair = Fact::Subset {
      nums: pair_nums,
      unit: B1.to_unit(),
      locs: LocSet::singleton(L11) | LocSet::singleton(L12),
      cross_unit: None,
      is_naked: false,
    };
    let naked_blk_pair = Fact::Subset {
      nums: pair_nums,
      unit: B1.to_unit(),
      locs: LocSet::singleton(L11) | LocSet::singleton(L12),
      cross_unit: None,
      is_naked: true,
    };
    let hidden_row_pair = Fact::Subset {
      nums: pair_nums,
      unit: R1.to_unit(),
      locs: LocSet::singleton(L11) | LocSet::singleton(L12),
      cross_unit: None,
      is_naked: false,
    };
    let hidden_blk_quad = Fact::Subset {
      nums: quad_nums,
      unit: B1.to_unit(),
      locs: LocSet::singleton(L11)
        | LocSet::singleton(L12)
        | LocSet::singleton(L13)
        | LocSet::singleton(L14),
      cross_unit: None,
      is_naked: false,
    };
    assert_eq!(hidden_blk_pair.complexity(), Complexity::Moderate);
    assert_eq!(naked_blk_pair.complexity(), Complexity::Complex);
    assert_eq!(hidden_row_pair.complexity(), Complexity::Complex);
    assert_eq!(hidden_blk_quad.complexity(), Complexity::Complex);
    assert_eq!(hidden_blk_quad.nums(), quad_nums);

    // Implication:
    // - Single numeral across antecedent + consequent -> Moderate
    let single_num_imp = Fact::Implication {
      antecedents: vec![overlap.clone()],
      consequent: Box::new(single_loc.clone()),
    };
    assert_eq!(single_num_imp.nums(), NumSet::singleton(N1));
    assert_eq!(single_num_imp.complexity(), Complexity::Moderate);

    // - Single Subset antecedent -> delegates to antecedent complexity
    let subset_imp_mod = Fact::Implication {
      antecedents: vec![hidden_blk_pair.clone()],
      consequent: Box::new(Fact::SingleNum { loc: L13, num: N3 }),
    };
    let subset_imp_cplx = Fact::Implication {
      antecedents: vec![naked_blk_pair.clone()],
      consequent: Box::new(Fact::SingleNum { loc: L13, num: N3 }),
    };
    assert_eq!(subset_imp_mod.complexity(), Complexity::Moderate);
    assert_eq!(subset_imp_cplx.complexity(), Complexity::Complex);
    assert_eq!(subset_imp_mod.nums(), pair_nums | NumSet::singleton(N3));

    // - Multiple multi-num antecedents -> Complex
    let multi_ant_imp = Fact::Implication {
      antecedents: vec![single_loc.clone(), single_num.clone()],
      consequent: Box::new(spec_asgmt.clone()),
    };
    assert_eq!(multi_ant_imp.complexity(), Complexity::Complex);

    // Fish: unfinned size 2 -> Moderate; finned or size 3 -> Complex
    let mut base2 = UnitSet::default();
    base2.insert(R1.to_unit());
    base2.insert(R2.to_unit());
    let mut cover2 = UnitSet::default();
    cover2.insert(C1.to_unit());
    cover2.insert(C2.to_unit());
    let x_wing = Fact::Fish {
      num: N4,
      base_units: base2,
      cover_units: cover2,
      finned_locs: LocSet::new(),
      elimination_locs: LocSet::singleton(L13),
    };
    let finned_x_wing = Fact::Fish {
      num: N4,
      base_units: base2,
      cover_units: cover2,
      finned_locs: LocSet::singleton(L14),
      elimination_locs: LocSet::singleton(L13),
    };
    let mut base3 = base2;
    base3.insert(R3.to_unit());
    let mut cover3 = cover2;
    cover3.insert(C3.to_unit());
    let swordfish = Fact::Fish {
      num: N4,
      base_units: base3,
      cover_units: cover3,
      finned_locs: LocSet::new(),
      elimination_locs: LocSet::singleton(L14),
    };
    assert_eq!(x_wing.complexity(), Complexity::Moderate);
    assert_eq!(finned_x_wing.complexity(), Complexity::Complex);
    assert_eq!(swordfish.complexity(), Complexity::Complex);
    assert_eq!(x_wing.nums(), NumSet::singleton(N4));

    // TwoStringKite: 1 row -> Moderate, 2 rows -> Complex
    let mut r_one = UnitSet::default();
    r_one.insert(R1.to_unit());
    let mut r_two = r_one;
    r_two.insert(R2.to_unit());
    let kite1 = Fact::TwoStringKite {
      num: N2,
      block: B1.to_unit(),
      rows: r_one,
      cols: cover2,
      string_ends: LocSet::new(),
      elimination_locs: LocSet::new(),
    };
    let kite2 = Fact::TwoStringKite {
      num: N2,
      block: B1.to_unit(),
      rows: r_two,
      cols: cover2,
      string_ends: LocSet::new(),
      elimination_locs: LocSet::new(),
    };
    assert_eq!(kite1.complexity(), Complexity::Moderate);
    assert_eq!(kite2.complexity(), Complexity::Complex);
    assert_eq!(kite1.nums(), NumSet::singleton(N2));

    // EmptyRectangle, Skyscraper, and error facts:
    let er = Fact::EmptyRectangle {
      num: N3,
      block: B1.to_unit(),
      row: R1.to_unit(),
      col: C1.to_unit(),
      conjugate_pair: LocSet::new(),
      elimination_locs: LocSet::new(),
    };
    let sky = Fact::Skyscraper {
      num: N3,
      base_units: base2,
      roof_locs: LocSet::new(),
      elimination_locs: LocSet::new(),
    };
    let no_num = Fact::NoNum { loc: L11 };
    assert_eq!(er.complexity(), Complexity::Complex);
    assert_eq!(sky.complexity(), Complexity::Complex);
    assert_eq!(no_num.complexity(), Complexity::Complex);
    assert_eq!(er.nums(), NumSet::singleton(N3));
    assert_eq!(sky.nums(), NumSet::singleton(N3));
    assert_eq!(no_num.nums(), NumSet::new());

    // Single-numeral implications must respect antecedent complexity:
    // - Unfinned X-Wing (Moderate) implying a same-numeral SingleLoc -> Moderate
    let x_wing_same_num_imp = Fact::Implication {
      antecedents: vec![x_wing.clone()],
      consequent: Box::new(Fact::SingleLoc {
        num: N4,
        unit: R1.to_unit(),
        loc: L11,
      }),
    };
    assert_eq!(x_wing_same_num_imp.nums(), NumSet::singleton(N4));
    assert_eq!(x_wing_same_num_imp.complexity(), Complexity::Moderate);

    // - Finned X-Wing, Swordfish, Skyscraper, or EmptyRectangle (Complex) implying
    //   a same-numeral SingleLoc -> Complex (not downgraded to Moderate)
    let finned_fish_same_num_imp = Fact::Implication {
      antecedents: vec![finned_x_wing.clone()],
      consequent: Box::new(Fact::SingleLoc {
        num: N4,
        unit: R1.to_unit(),
        loc: L11,
      }),
    };
    let sky_same_num_imp = Fact::Implication {
      antecedents: vec![sky.clone()],
      consequent: Box::new(Fact::SingleLoc {
        num: N3,
        unit: R1.to_unit(),
        loc: L11,
      }),
    };
    assert_eq!(finned_fish_same_num_imp.nums(), NumSet::singleton(N4));
    assert_eq!(finned_fish_same_num_imp.complexity(), Complexity::Complex);
    assert_eq!(sky_same_num_imp.nums(), NumSet::singleton(N3));
    assert_eq!(sky_same_num_imp.complexity(), Complexity::Complex);
  }
}
