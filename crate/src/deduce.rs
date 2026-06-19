//! Code that emulates human Sudoku deduction patterns.

use crate::core::*;

mod internals;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::wasm_bindgen;

/// A fact that can be deduced from a Sudoku grid.
#[derive(Clone, Debug, Eq, Hash, PartialEq, PartialOrd, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../www/src/facts/")]
#[serde(tag = "type")]
pub enum Fact {
  /// Assignment: the given numeral has only one possible location in the given
  /// unit.  (Also known as a "hidden single.")
  SingleLoc { num: Num, unit: Unit, loc: Loc },
  /// Assignment: the given location has only one possible numeral.  (Also known
  /// as a "naked single.")
  SingleNum { loc: Loc, num: Num },
  /// Assignment: the given numeral is assigned to the given location, with no
  /// justification.
  SpeculativeAssignment { loc: Loc, num: Num },
  /// Error: there is no possible location for the given numeral in the given
  /// unit.
  NoLoc { num: Num, unit: Unit },
  /// Error: there is no possible numeral for the given location.
  NoNum { loc: Loc },
  /// Error: the given numeral is assigned to all the given locations (more than
  /// one) within the unit.
  Conflict { num: Num, unit: Unit, locs: LocSet },
  /// Elimination: the given numeral can only be within the intersection of the
  /// two given units, one of which must be a block and the other a line, so all
  /// other locations in the `unit` can be eliminated.
  Overlap {
    num: Num,
    unit: Unit,
    cross_unit: Unit,
  },
  /// Elimination: the given numerals can only occupy the given locations within
  /// the unit, so all other locations in the unit can be eliminated for those
  /// numerals, and all other numerals can be eliminated from those locations.
  Subset {
    nums: NumSet,
    unit: Unit,
    locs: LocSet,
    cross_unit: Option<Unit>,
    is_naked: bool,
  },
  /// A fact that is implied by other facts.
  Implication {
    antecedents: Vec<Fact>,
    consequent: Box<Fact>,
  },
}

impl Fact {
  /// Returns the assignment associated with this fact, if any.
  pub fn as_asgmt(&self) -> Option<Asgmt> {
    match self {
      Fact::SingleLoc { num, loc, .. } => Some(Asgmt::new(*num, *loc)),
      Fact::SingleNum { loc, num } => Some(Asgmt::new(*num, *loc)),
      Fact::SpeculativeAssignment { loc, num } => Some(Asgmt::new(*num, *loc)),
      Fact::Implication { consequent, .. } => consequent.as_asgmt(),
      _ => None,
    }
  }

  pub fn as_eliminations(&self) -> AsgmtSet {
    match self {
      Fact::SingleLoc { .. } | Fact::SingleNum { .. } | Fact::SpeculativeAssignment { .. } => {
        self.as_asgmt().unwrap().to_eliminations()
      }
      Fact::Overlap {
        num,
        unit,
        cross_unit,
      } => {
        let mut answer = AsgmtSet::new();
        answer.union_in_place(*num, cross_unit.locs() - unit.locs());
        answer
      }
      Fact::Subset {
        nums,
        unit,
        locs,
        cross_unit,
        ..
      } => {
        let mut answer = AsgmtSet::new();
        let mut outside_locs = unit.locs() - *locs;
        if let Some(cross_unit) = cross_unit {
          outside_locs |= cross_unit.locs() - unit.locs()
        }
        for num in Num::all() {
          if nums.contains(num) {
            answer.union_in_place(num, outside_locs);
          } else {
            answer.union_in_place(num, *locs);
          }
        }
        answer
      }
      Fact::Implication {
        antecedents,
        consequent,
      } => {
        let mut answer = consequent.as_eliminations();
        for antecedent in antecedents {
          answer |= antecedent.as_eliminations();
        }
        answer
      }
      _ => AsgmtSet::new(),
    }
  }

  /// Tells whether this fact is an assignment.
  pub fn is_asgmt(&self) -> bool {
    match self {
      Fact::SingleLoc { .. } | Fact::SingleNum { .. } | Fact::SpeculativeAssignment { .. } => true,
      Fact::Implication { consequent, .. } => consequent.is_asgmt(),
      _ => false,
    }
  }

  /// Tells whether this fact is an error.
  pub fn is_error(&self) -> bool {
    match self {
      Fact::NoLoc { .. } | Fact::NoNum { .. } | Fact::Conflict { .. } => true,
      Fact::Implication { consequent, .. } => consequent.is_error(),
      _ => false,
    }
  }

  /// Finds the "nub" of this fact, which is the fact itself if it is not an
  /// implication, or the nub of the consequent.
  pub fn nub(&self) -> &Fact {
    match self {
      Fact::Implication { consequent, .. } => consequent.nub(),
      _ => self,
    }
  }
}

/// A stateful object that can deduce facts about a Sudoku grid.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct FactFinder {
  /// The remaining possible assignments: all possible assignments that haven't
  /// already happened.
  remaining_asgmts: AsgmtSet,

  /// The assignments that have been made.
  actual_asgmts: AsgmtSet,

  /// An alternate view of `remaining_asgmts` that is more efficient for some
  /// operations.  Also tracks errors.
  sukaku_map: internals::SukakuMap,
}

impl FactFinder {
  /// Creates a new `FactFinder` with the given grid.
  pub fn new(grid: &Grid) -> Self {
    let possible_asgmts = AsgmtSet::possibles_from_grid(grid);
    let simple_asgmts = AsgmtSet::simple_from_grid(grid);
    let sukaku_map = internals::SukakuMap::from_grid(grid);
    Self {
      remaining_asgmts: possible_asgmts - simple_asgmts,
      actual_asgmts: simple_asgmts,
      sukaku_map,
    }
  }

  /// Returns the current state of the grid.
  pub fn to_grid(&self) -> Grid {
    self.actual_asgmts.to_grid()
  }

  /// Returns all remaining and actual assignments.
  pub fn possible_asgmts(&self) -> AsgmtSet {
    self.remaining_asgmts | self.actual_asgmts
  }

  /// Returns the facts deducible from the current state of the grid, including
  /// any errors.
  pub fn deduce_all(&self) -> Vec<Fact> {
    self.deduce_all_with_timeout(None).0
  }

  /// Returns the facts deducible from the current state of the grid, including
  /// any errors, and stopping early if the max time is reached.
  pub fn deduce_all_with_timeout(&self, max_time_ms: Option<f64>) -> (Vec<Fact>, bool) {
    let mut collector =
      internals::Collector::new(self.remaining_asgmts, self.actual_asgmts, self.sukaku_map);
    collector.max_time_ms = max_time_ms;
    collector.collect(internals::ErrorMode::Collect).unwrap();
    (collector.facts, collector.timed_out)
  }

  /// Returns the facts deducible from the current state of the grid, ignoring
  /// any errors: use this when the current state is known to be valid.
  pub fn deduce_valid(&self) -> Vec<Fact> {
    let mut collector =
      internals::Collector::new(self.remaining_asgmts, self.actual_asgmts, self.sukaku_map);
    collector.collect(internals::ErrorMode::Ignore).unwrap();
    collector.facts
  }

  /// Returns only the direct assignments that can be deduced from the
  /// current state of the grid.
  pub fn deduce_singles(&self) -> Vec<Fact> {
    let mut collector =
      internals::Collector::new(self.remaining_asgmts, self.actual_asgmts, self.sukaku_map);
    collector.collect_singles();
    collector.facts
  }

  /// Returns the facts deducible from the current state of the grid, short-circuiting
  /// the search if an error is found.  This is useful for finding errors in the
  /// current state of the grid, such as when the grid is known to be invalid.
  pub fn deduce_invalid(&self) -> Result<Vec<Fact>, Invalid> {
    let mut collector =
      internals::Collector::new(self.remaining_asgmts, self.actual_asgmts, self.sukaku_map);
    collector.collect(internals::ErrorMode::ShortCircuit)?;
    Ok(collector.facts)
  }

  /// Applies the given fact to the grid and updates the possible assignments.
  /// Only facts that are consistent with the current state of the game (such as
  /// those returned from `deduce`) should be applied.
  pub fn apply_fact(&mut self, fact: &Fact) {
    if let Some(asgmt) = fact.as_asgmt() {
      self.apply(asgmt);
    } else {
      let eliminations = fact.as_eliminations();
      self.remaining_asgmts -= eliminations;
      self.sukaku_map.eliminate(&eliminations);
    }
  }

  pub fn eliminate(&mut self, asgmt: Asgmt) {
    self.remaining_asgmts.remove(asgmt);
    self.sukaku_map.eliminate_one(asgmt.loc, asgmt.num);
  }

  pub fn apply(&mut self, asgmt: Asgmt) {
    self.remaining_asgmts.apply(asgmt);
    self.remaining_asgmts.remove(asgmt);
    self.actual_asgmts.insert(asgmt);
    self.sukaku_map.apply(asgmt);
  }

  pub fn deduce_with_speculative(
    &self,
    speculative_facts: Vec<Fact>,
    base_remaining_asgmts: AsgmtSet,
    base_sukaku_map: internals::SukakuMap,
  ) -> Vec<Fact> {
    let mut collector =
      internals::Collector::new(self.remaining_asgmts, self.actual_asgmts, self.sukaku_map);
    collector
      .collect_with_speculative(speculative_facts, base_remaining_asgmts, base_sukaku_map)
      .unwrap();
    collector.facts
  }
}

#[derive(Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../www/src/facts/")]
#[serde(rename_all = "camelCase")]
pub struct DeduceResult {
  pub facts: Vec<Fact>,
  pub timed_out: bool,
}

#[derive(Deserialize)]
pub struct WasmAsgmt {
  pub loc: i8,
  pub num: i8,
}

pub fn apply_constraints(finder: &mut FactFinder, constraints: &[Vec<WasmAsgmt>]) {
  let mut changed = true;
  while changed {
    changed = false;
    for constraint in constraints {
      let mut active_asgmts = Vec::new();
      let mut inactive_asgmts = Vec::new();

      for wa in constraint {
        let asgmt = Asgmt::new(Num::new(wa.num).unwrap(), Loc::new(wa.loc).unwrap());
        if finder.actual_asgmts.contains(asgmt) {
          active_asgmts.push(asgmt);
        } else if finder.remaining_asgmts.contains(asgmt) {
          inactive_asgmts.push(asgmt);
        }
      }

      if active_asgmts.len() == constraint.len() {
        finder.remaining_asgmts = AsgmtSet::new();
        changed = false;
        break;
      } else if active_asgmts.len() == constraint.len() - 1 && inactive_asgmts.len() == 1 {
        let target = inactive_asgmts[0];
        let mut elim_set = AsgmtSet::new();
        elim_set.insert(target);
        finder.remaining_asgmts -= elim_set;
        finder.sukaku_map.eliminate(&elim_set);
        changed = true;
      } else if constraint.len() == 1 && inactive_asgmts.len() == 1 {
        let target = inactive_asgmts[0];
        let mut elim_set = AsgmtSet::new();
        elim_set.insert(target);
        finder.remaining_asgmts -= elim_set;
        finder.sukaku_map.eliminate(&elim_set);
        changed = true;
      }
    }
  }
}

#[wasm_bindgen(js_name = "deduceFacts")]
pub fn deduce_facts(
  grid: &Grid,
  eliminations: wasm_bindgen::JsValue,
  max_time_ms: Option<f64>,
) -> wasm_bindgen::JsValue {
  let constraints: Option<Vec<Vec<WasmAsgmt>>> =
    if eliminations.is_undefined() || eliminations.is_null() {
      None
    } else {
      Some(serde_wasm_bindgen::from_value(eliminations).unwrap())
    };

  let mut finder = FactFinder::new(grid);
  if let Some(ref c) = constraints {
    apply_constraints(&mut finder, c);
  }

  let (facts, timed_out) = finder.deduce_all_with_timeout(max_time_ms);
  serde_wasm_bindgen::to_value(&DeduceResult { facts, timed_out }).unwrap()
}

#[derive(Clone, Debug, Serialize, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../www/src/facts/")]
#[serde(rename_all = "camelCase")]
pub struct SearchProgress {
  pub depth: u32,
  pub current_indices: Vec<usize>,
  pub invalid_subsets: Vec<Vec<usize>>,
  pub is_complete: bool,
}

#[derive(Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../www/src/facts/")]
#[serde(rename_all = "camelCase")]
pub struct SearchDisproofsResult {
  pub disproofs: Vec<Fact>,
  pub progress: SearchProgress,
}

fn find_subset_largest_element_index(subset: &[usize], combination: &[usize]) -> Option<usize> {
  let mut combo_idx = 0;
  let mut subset_idx = 0;
  let mut last_combo_idx = None;

  while subset_idx < subset.len() && combo_idx < combination.len() {
    if combination[combo_idx] == subset[subset_idx] {
      last_combo_idx = Some(combo_idx);
      subset_idx += 1;
      combo_idx += 1;
    } else if combination[combo_idx] < subset[subset_idx] {
      combo_idx += 1;
    } else {
      return None;
    }
  }

  if subset_idx == subset.len() {
    last_combo_idx
  } else {
    None
  }
}

fn advance_search(
  combination: &mut Vec<usize>,
  invalid_subsets: &[Vec<usize>],
  conflict_p: Option<usize>,
  k: usize,
) -> bool {
  if combination.is_empty() {
    return false;
  }
  let mut min_p = conflict_p;
  for subset in invalid_subsets {
    if let Some(p) = find_subset_largest_element_index(subset, combination) {
      match min_p {
        None => min_p = Some(p),
        Some(mp) if p < mp => min_p = Some(p),
        _ => {}
      }
    }
  }

  let mut p = match min_p {
    Some(mp) => mp,
    None => combination.len() - 1,
  };

  loop {
    combination[p] += 1;
    let d = combination.len();
    if combination[p] <= k - (d - p) {
      for j in (p + 1)..d {
        combination[j] = combination[j - 1] + 1;
      }
      return true;
    } else {
      if p == 0 {
        return false;
      }
      p -= 1;
    }
  }
}

fn increment_depth(progress: &mut SearchProgress, max_depth: u32, candidates_len: usize) -> bool {
  progress.depth += 1;
  if progress.depth > max_depth {
    progress.is_complete = true;
    return false;
  }
  if candidates_len >= progress.depth as usize {
    progress.current_indices = (0..progress.depth as usize).collect();
    true
  } else {
    progress.is_complete = true;
    false
  }
}

/// Recursively collects all speculative assignments that form the leaves of the
/// implication tree for the given fact.
///
/// Note: A `SpeculativeAssignment` is never a consequent of an implication,
/// and nested implications only occur in antecedents. Therefore, we do not need
/// to recurse into the `consequent`.
fn get_speculative_antecedents(fact: &Fact, antecedents: &mut Vec<Asgmt>) {
  match fact {
    Fact::Implication {
      antecedents: ants, ..
    } => {
      for ant in ants {
        get_speculative_antecedents(ant, antecedents);
      }
    }
    Fact::SpeculativeAssignment { loc, num } => {
      let asgmt = Asgmt::new(*num, *loc);
      if !antecedents.contains(&asgmt) {
        antecedents.push(asgmt);
      }
    }
    _ => {}
  }
}

fn strip_speculative_assignments(fact: &Fact) -> Fact {
  match fact {
    Fact::Implication { antecedents, consequent } => {
      let mut new_ants = Vec::new();
      for ant in antecedents {
        let new_ant = strip_speculative_assignments(ant);
        if !matches!(new_ant, Fact::SpeculativeAssignment { .. }) {
          new_ants.push(new_ant);
        }
      }
      let new_cons = strip_speculative_assignments(consequent);
      if new_ants.is_empty() {
        new_cons
      } else {
        Fact::Implication {
          antecedents: new_ants,
          consequent: Box::new(new_cons),
        }
      }
    }
    _ => fact.clone(),
  }
}

pub fn search_disproofs_native(

  base_finder: FactFinder,
  solutions: &[SolvedGrid],
  progress: Option<SearchProgress>,
  max_depth: Option<u32>,
  max_time_ms: Option<f64>,
  constraints: Option<&[Vec<WasmAsgmt>]>,
) -> SearchDisproofsResult {
  let max_depth = max_depth.unwrap_or(2);
  let mut solutions_asgmt_set = AsgmtSet::new();
  for solution in solutions {
    solutions_asgmt_set |= AsgmtSet::simple_from_grid(&solution.grid());
  }
  let mut candidates: Vec<Asgmt> = (base_finder.remaining_asgmts - solutions_asgmt_set)
    .iter()
    .collect();
  candidates.sort();

  let mut progress = progress.unwrap_or_else(|| SearchProgress {
    depth: 1,
    current_indices: if candidates.is_empty() {
      vec![]
    } else {
      vec![0]
    },
    invalid_subsets: Vec::new(),
    is_complete: candidates.is_empty(),
  });

  if progress.is_complete || candidates.is_empty() {
    progress.is_complete = true;
    return SearchDisproofsResult {
      disproofs: Vec::new(),
      progress,
    };
  }

  if progress
    .current_indices
    .iter()
    .any(|&i| i >= candidates.len())
  {
    progress.depth = 1;
    progress.current_indices = vec![0];
    progress.invalid_subsets.clear();
  }

  let start_time = crate::time::now();
  let time_limit = max_time_ms.unwrap_or(500.0);
  let mut disproofs = Vec::new();

  loop {
    if crate::time::now() - start_time > time_limit {
      break;
    }

    // Check for internal compatibility among the current combination of candidates.
    let mut incompatible_at = None;
    let mut foreclosed = AsgmtSet::new();
    for p in 0..progress.current_indices.len() {
      let asgmt = candidates[progress.current_indices[p]];
      if foreclosed.contains(asgmt) {
        incompatible_at = Some(p);
        break;
      }
      foreclosed |= asgmt.to_eliminations();
    }

    if let Some(p) = incompatible_at {
      if !advance_search(
        &mut progress.current_indices,
        &progress.invalid_subsets,
        Some(p),
        candidates.len(),
      ) && !increment_depth(&mut progress, max_depth, candidates.len())
      {
        break;
      }
      continue;
    }

    let spec_asgmts: Vec<Asgmt> = progress
      .current_indices
      .iter()
      .map(|&i| candidates[i])
      .collect();

    let speculative_facts: Vec<Fact> = spec_asgmts
      .iter()
      .map(|&asgmt| Fact::SpeculativeAssignment {
        loc: asgmt.loc,
        num: asgmt.num,
      })
      .collect();

    let mut speculative_finder = base_finder;
    for &asgmt in &spec_asgmts {
      speculative_finder.apply(asgmt);
    }
    if let Some(c) = constraints {
      apply_constraints(&mut speculative_finder, c);
    }

    let deduced_facts = speculative_finder.deduce_with_speculative(
      speculative_facts,
      base_finder.remaining_asgmts,
      base_finder.sukaku_map,
    );

    for fact in &deduced_facts {
      if fact.is_error() {
        let mut error_ants = Vec::new();
        get_speculative_antecedents(fact, &mut error_ants);
        let mut subset_indices: Vec<usize> = error_ants
          .iter()
          .map(|asgmt| candidates.iter().position(|&c| c == *asgmt).unwrap())
          .collect();
        subset_indices.sort();

        if !progress.invalid_subsets.contains(&subset_indices) {
          progress.invalid_subsets.push(subset_indices);
        }

        let mut spec_facts_for_this_error = Vec::new();
        let mut sorted_error_ants = error_ants.clone();
        sorted_error_ants.sort();
        for &asgmt in &sorted_error_ants {
          spec_facts_for_this_error.push(Fact::SpeculativeAssignment {
            loc: asgmt.loc,
            num: asgmt.num,
          });
        }

        let stripped_fact = strip_speculative_assignments(fact);
        disproofs.push(Fact::Implication {
          antecedents: spec_facts_for_this_error,
          consequent: Box::new(stripped_fact),
        });
      }
    }

    if !advance_search(
      &mut progress.current_indices,
      &progress.invalid_subsets,
      None,
      candidates.len(),
    ) && !increment_depth(&mut progress, max_depth, candidates.len())
    {
      break;
    }
  }

  SearchDisproofsResult {
    disproofs,
    progress,
  }
}

#[wasm_bindgen(js_name = "calculateProductivity")]
pub fn calculate_productivity(grid: &Grid, loc: Loc, num: Num) -> usize {
  let mut base_ledger = match crate::solve::ledger::Ledger::new(grid) {
    Ok(l) => l,
    Err(_) => return 0,
  };

  if base_ledger.apply_implications().is_err() {
    return 0;
  }
  let base_solved = 81 - base_ledger.unset().len();

  let mut test_ledger = base_ledger;
  test_ledger.eliminate(num, loc);
  if test_ledger.apply_implications().is_err() {
    return 0;
  }
  let new_solved = 81 - test_ledger.unset().len();

  if new_solved > base_solved {
    (new_solved - base_solved) as usize
  } else {
    0
  }
}

#[wasm_bindgen(js_name = "searchDisproofs")]
pub fn search_disproofs(
  grid: &Grid,
  solutions: Option<Vec<SolvedGrid>>,
  eliminations: wasm_bindgen::JsValue,
  progress: wasm_bindgen::JsValue,
  max_depth: Option<u32>,
  max_time_ms: Option<f64>,
) -> wasm_bindgen::JsValue {
  let constraints: Option<Vec<Vec<WasmAsgmt>>> =
    if eliminations.is_undefined() || eliminations.is_null() {
      None
    } else {
      Some(serde_wasm_bindgen::from_value(eliminations).unwrap())
    };

  let progress: Option<SearchProgress> = if progress.is_undefined() || progress.is_null() {
    None
  } else {
    Some(serde_wasm_bindgen::from_value(progress).unwrap())
  };

  let mut base_finder = FactFinder::new(grid);
  if let Some(ref c) = constraints {
    apply_constraints(&mut base_finder, c);
  }

  let solutions = solutions.unwrap_or_default();
  let result = search_disproofs_native(
    base_finder,
    &solutions,
    progress,
    max_depth,
    max_time_ms,
    constraints.as_deref(),
  );
  serde_wasm_bindgen::to_value(&result).unwrap()
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::str::FromStr;

  #[test]
  fn test_find_subset_largest_element_index() {
    assert_eq!(
      find_subset_largest_element_index(&[0, 3], &[0, 3, 5]),
      Some(1)
    );
    assert_eq!(
      find_subset_largest_element_index(&[2, 9], &[2, 7, 9]),
      Some(2)
    );
    assert_eq!(find_subset_largest_element_index(&[2, 8], &[2, 7, 9]), None);
    assert_eq!(find_subset_largest_element_index(&[5], &[0, 3, 5]), Some(2));
  }

  #[test]
  fn test_advance_search() {
    let mut comb = vec![0, 3, 5];
    let invalid = vec![vec![0, 3]];
    let ok = advance_search(&mut comb, &invalid, None, 10);
    assert!(ok);
    assert_eq!(comb, vec![0, 4, 5]);

    let mut comb2 = vec![2, 7, 9];
    let invalid2 = vec![vec![2, 9]];
    let ok2 = advance_search(&mut comb2, &invalid2, None, 10);
    assert!(ok2);
    assert_eq!(comb2, vec![2, 8, 9]);

    let mut comb3 = vec![7, 8, 9];
    let invalid3 = vec![vec![7, 8, 9]];
    let ok3 = advance_search(&mut comb3, &invalid3, None, 10);
    assert!(!ok3); // exhausted
  }

  #[test]
  fn test_search_disproofs_depth_1() {
    let grid = Grid::from_str(
      r"
            . . . | 1 5 6 | 7 8 9
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            4 . . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            . 4 . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .",
    )
    .unwrap();

    // Candidates in Row 0:
    // L00: {2, 3}
    // L01: {2, 3}
    // L02: {2, 3, 4}
    //
    // Speculative L02=2 should lead to L00=3, L01=3 (Conflict)
    // Speculative L02=3 should lead to L00=2, L01=2 (Conflict)

    let res = search_disproofs_native(
      FactFinder::new(&grid),
      &[],
      None,
      Some(1),
      Some(1000.0),
      None,
    );

    assert!(!res.disproofs.is_empty());

    // Check that we found at least one of the expected disproofs
    let mut found_l02_2 = false;
    let mut found_l02_3 = false;

    for fact in &res.disproofs {
      if let Fact::Implication {
        antecedents,
        consequent,
      } = fact
      {
        if antecedents.len() == 1 {
          if let Fact::SpeculativeAssignment { loc, num } = &antecedents[0] {
            if loc.index() == 2 {
              if num.index() == 1 {
                found_l02_2 = true;
                assert!(consequent.is_error());
              } else if num.index() == 2 {
                found_l02_3 = true;
                assert!(consequent.is_error());
              }
            }
          }
        }
      }
    }
    assert!(found_l02_2);
    assert!(found_l02_3);
  }

  #[test]
  fn test_search_disproofs_depth_2_conflict() {
    let grid = Grid::from_str(
      r"
            . . . | 1 5 6 | 7 8 9
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            4 . . | . . . | . . .
            . . . | . . . | . . .
            . . 2 | . . . | . . .
            - - - + - - - + - - -
            . 3 . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .",
    )
    .unwrap();

    let finder = FactFinder::new(&grid);
    let mut solutions_asgmt_set = AsgmtSet::new();
    let mut candidates: Vec<Asgmt> = (finder.remaining_asgmts - solutions_asgmt_set)
      .iter()
      .collect();
    candidates.sort();

    let target1 = Asgmt::new(N2, L11); // R0C0 = 2
    let target2 = Asgmt::new(N4, L13); // R0C2 = 4

    let idx1 = candidates.iter().position(|&c| c == target1).unwrap();
    let idx2 = candidates.iter().position(|&c| c == target2).unwrap();

    let mut current_indices = vec![idx1, idx2];
    current_indices.sort();

    let progress = SearchProgress {
      depth: 2,
      current_indices,
      invalid_subsets: Vec::new(),
      is_complete: false,
    };

    let res = search_disproofs_native(
      FactFinder::new(&grid),
      &[],
      Some(progress),
      Some(2),
      Some(2000.0),
      None,
    );

    assert!(!res.disproofs.is_empty());

    let mut found_depth_2_conflict = false;
    for fact in &res.disproofs {
      let mut error_ants = Vec::new();
      get_speculative_antecedents(fact, &mut error_ants);
      if error_ants.len() == 2 {
        let asgmt1 = error_ants[0];
        let asgmt2 = error_ants[1];
        // Verify we found the expected pair (R0C0=2 and R0C2=4, in either order)
        let is_r0c0_2 = asgmt1.loc.index() == 0 && asgmt1.num.index() == 1;
        let is_r0c2_4 = asgmt2.loc.index() == 2 && asgmt2.num.index() == 3;
        let is_r0c0_2_rev = asgmt2.loc.index() == 0 && asgmt2.num.index() == 1;
        let is_r0c2_4_rev = asgmt1.loc.index() == 2 && asgmt1.num.index() == 3;
        if (is_r0c0_2 && is_r0c2_4) || (is_r0c0_2_rev && is_r0c2_4_rev) {
          found_depth_2_conflict = true;
          assert!(fact.is_error());
        }
      }
    }
    assert!(found_depth_2_conflict);
  }

  #[test]
  fn test_search_disproofs_excludes_solution() {
    let grid = Grid::from_str(
      r"
            . . . | 1 5 6 | 7 8 9
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            4 . . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            . 4 . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .",
    )
    .unwrap();

    // In a normal search (without solutions), both L02=2 and L02=3 are found as disproofs.
    // Let's pass a solution that assigns L02=2 (using the swapped solved grid).
    let solved_str = r"
      4 3 2 | 1 5 6 | 7 8 9
      1 5 6 | 7 8 9 | 4 3 2
      7 8 9 | 4 3 2 | 1 5 6
      ------+------+------
      2 1 4 | 3 6 5 | 8 9 7
      3 6 5 | 8 9 7 | 2 1 4
      8 9 7 | 2 1 4 | 3 6 5
      ------+------+------
      5 7 8 | 9 4 3 | 6 2 1
      9 4 3 | 6 2 1 | 5 7 8
      6 2 1 | 5 7 8 | 9 4 3
    ";
    let solved_grid = Grid::from_str(solved_str).unwrap();
    let solved_sg = SolvedGrid::try_from(&solved_grid).unwrap();

    let res = search_disproofs_native(
      FactFinder::new(&grid),
      &[solved_sg],
      None,
      Some(1),
      Some(1000.0),
      None,
    );

    // We should NOT find the disproof for L02=2, but we SHOULD still find the disproof for L02=3.
    let mut found_l02_2 = false;
    let mut found_l02_3 = false;

    for fact in &res.disproofs {
      if let Fact::Implication {
        antecedents,
        consequent,
      } = fact
      {
        if antecedents.len() == 1 {
          if let Fact::SpeculativeAssignment { loc, num } = &antecedents[0] {
            if loc.index() == 2 {
              if num.index() == 1 {
                found_l02_2 = true;
                assert!(consequent.is_error());
              } else if num.index() == 2 {
                found_l02_3 = true;
                assert!(consequent.is_error());
              }
            }
          }
        }
      }
    }
    assert!(!found_l02_2);
    assert!(found_l02_3);
  }

  #[test]
  fn test_calculate_productivity() {
    let grid = Grid::from_str(
      r"
            . . . | 1 5 6 | 7 8 9
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            4 . . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            . 4 . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .",
    )
    .unwrap();
    // Candidates at L11 (R0C0): {2, 3}
    // If we eliminate 2 (N2), L11 should be forced to 3 (N3), solving at least 1 cell.
    let prod = calculate_productivity(&grid, L11, N2);
    assert!(prod >= 1);
  }

  #[test]
  fn test_apply_constraints_single() {
    let grid = Grid::from_str(
      r"
            . . . | 1 5 6 | 7 8 9
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            4 . . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            . 4 . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .",
    )
    .unwrap();
    let mut finder = FactFinder::new(&grid);
    let target_asg = Asgmt::new(N2, L11);
    assert!(finder.remaining_asgmts.contains(target_asg));

    let constraints = vec![vec![WasmAsgmt {
      loc: L11.index() as i8,
      num: N2.get(),
    }]];
    apply_constraints(&mut finder, &constraints);
    assert!(!finder.remaining_asgmts.contains(target_asg));
  }

  #[test]
  fn test_apply_constraints_multi() {
    let grid = Grid::from_str(
      r"
            . . . | 1 5 6 | 7 8 9
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            4 . . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .
            - - - + - - - + - - -
            . 4 . | . . . | . . .
            . . . | . . . | . . .
            . . . | . . . | . . .",
    )
    .unwrap();
    let mut finder = FactFinder::new(&grid);
    let asg_a = Asgmt::new(N2, L11);
    let asg_b = Asgmt::new(N3, L12);
    assert!(finder.remaining_asgmts.contains(asg_a));
    assert!(finder.remaining_asgmts.contains(asg_b));

    // Put asg_a into actual_asgmts to simulate it being satisfied/solved
    finder.actual_asgmts.insert(asg_a);
    finder.remaining_asgmts.remove(asg_a);

    let constraints = vec![vec![
      WasmAsgmt {
        loc: L11.index() as i8,
        num: N2.get(),
      },
      WasmAsgmt {
        loc: L12.index() as i8,
        num: N3.get(),
      },
    ]];

    apply_constraints(&mut finder, &constraints);
    // Since asg_a is active, the constraint should propagate to eliminate asg_b
    assert!(!finder.remaining_asgmts.contains(asg_b));
  }

  #[test]
  fn test_search_disproofs_accumulate_antecedents() {
    let grid = Grid::from_str(
      r"
            . 7 4 | . 9 . | 6 . 3
            3 . 9 | 7 . 6 | . 4 .
            6 . 5 | . 4 3 | 9 7 .
            - - - + - - - + - - -
            4 3 8 | 2 6 9 | 7 1 5
            . . 6 | 4 8 7 | 2 3 9
            7 9 2 | . . . | 4 6 8
            - - - + - - - + - - -
            . . 1 | . 7 4 | . . 6
            . 4 3 | 6 . . | . . 7
            8 6 7 | 9 . . | . 2 4",
    )
    .unwrap();
    let finder = FactFinder::new(&grid);
    let res = search_disproofs_native(finder, &[], None, Some(10), Some(5000.0), None);

    let mut found_target = false;
    for fact in &res.disproofs {
      if let Fact::NoLoc { num, unit } = fact.nub() {
        if *num == N5 && *unit == R2.to_unit() {
          let mut sub_units = Vec::new();
          collect_subset_units(fact, &mut sub_units);
          if sub_units.contains(&B2.to_unit()) && sub_units.contains(&B9.to_unit()) {
            found_target = true;
            let spec_count = count_speculative_assignments(fact, L86, N2);
            assert_eq!(
              spec_count, 1,
              "The speculative assignment L86=N2 must appear exactly once in the tree, but found {}",
              spec_count
            );
          }
        }
      }
    }
    assert!(
      found_target,
      "Disproof showing no location for 5 in Row 2 must include both subset B2 and B9 dependencies"
    );
  }

  fn collect_subset_units(fact: &Fact, units: &mut Vec<Unit>) {
    match fact {
      Fact::Implication {
        antecedents,
        consequent,
      } => {
        for ant in antecedents {
          collect_subset_units(ant, units);
        }
        collect_subset_units(consequent, units);
      }
      Fact::Subset { unit, .. } => {
        units.push(*unit);
      }
      _ => {}
    }
  }

  fn count_speculative_assignments(fact: &Fact, target_loc: Loc, target_num: Num) -> usize {
    match fact {
      Fact::Implication {
        antecedents,
        consequent,
      } => {
        let mut count = 0;
        for ant in antecedents {
          count += count_speculative_assignments(ant, target_loc, target_num);
        }
        count += count_speculative_assignments(consequent, target_loc, target_num);
        count
      }
      Fact::SpeculativeAssignment { loc, num } => {
        if *loc == target_loc && *num == target_num {
          1
        } else {
          0
        }
      }
      _ => 0,
    }
  }
}
