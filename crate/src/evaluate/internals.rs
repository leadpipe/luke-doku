//| Defines the internals of the evaluator for Luke-doku.

use super::*;
use crate::{
  core::{AsgmtSet, Invalid, NumSet, Set, Unit},
  deduce::{Fact, FactFinder},
};

pub fn evaluate_complexity(puzzle: &Puzzle) -> Complexity {
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
    let mut inner = fact_finder.clone();
    inner.apply(asgmt);
    loop {
      let could_apply = apply_asgmts(&mut inner);
      if could_apply.is_err() {
        break;
      }
      if !could_apply.unwrap() {
        // We weren't able to eliminate this assignment, so we move on to the
        // next one.
        continue 'outer;
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
      Fact::SingleLoc { .. } => Complexity::Simple,
      Fact::SingleNum { .. } => Complexity::Simple,
      Fact::SpeculativeAssignment { .. } => Complexity::Simple,
      Fact::Overlap { .. } => Complexity::Moderate,
      Fact::LockedSet {
        nums,
        unit,
        is_naked,
        ..
      } => {
        if nums.len() <= 3 && !is_naked {
          if let Unit::Blk(_) = unit {
            Complexity::Moderate
          } else {
            Complexity::Complex
          }
        } else {
          Complexity::Complex
        }
      }
      Fact::Implication {
        antecedents,
        consequent,
      } => {
        if self.nums().len() == 1 {
          return Complexity::Moderate;
        }
        if antecedents.len() == 1
          && matches!(antecedents[0], Fact::LockedSet { .. })
          && !matches!(**consequent, Fact::Implication { .. })
        {
          // A single locked set implies a single assignment, so we can treat it
          // as equivalent to the complexity of the locked set.
          return antecedents[0].complexity();
        }
        Complexity::Complex
      }
      _ => Complexity::Complex,
    }
  }

  fn nums(&self) -> NumSet {
    match self {
      Fact::SingleLoc { num, .. } => NumSet::singleton(*num),
      Fact::SingleNum { num, .. } => NumSet::singleton(*num),
      Fact::SpeculativeAssignment { num, .. } => NumSet::singleton(*num),
      Fact::Overlap { num, .. } => NumSet::singleton(*num),
      Fact::LockedSet { nums, .. } => *nums,
      Fact::Implication {
        antecedents,
        consequent,
      } => {
        let mut nums = consequent.nums();
        for antecedent in antecedents {
          nums |= antecedent.nums();
        }
        nums
      }
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
    evaluate_complexity(&puzzle)
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
}
