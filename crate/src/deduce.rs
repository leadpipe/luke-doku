//! Code that emulates human Sudoku deduction patterns.

use crate::core::*;
use crate::time;

mod internals;

use crate::solve::ledger::Ledger;
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

  pub fn depends_on_speculative_assignment(&self, target_loc: Loc, target_num: Num) -> bool {
    match self {
      Fact::Implication {
        antecedents,
        consequent,
      } => {
        antecedents
          .iter()
          .any(|ant| ant.depends_on_speculative_assignment(target_loc, target_num))
          || consequent.depends_on_speculative_assignment(target_loc, target_num)
      }
      Fact::SpeculativeAssignment { loc, num } => *loc == target_loc && *num == target_num,
      _ => false,
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
        if consequent.is_error() && antecedents.len() == 1 {
          if let Some(asgmt) = antecedents[0].as_asgmt() {
            let mut answer = AsgmtSet::new();
            answer.insert(asgmt);
            return answer;
          }
        }
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

  /// Removes all occurrences of the given antecedent from the implication tree.
  /// This prevents exponential duplication of root assumptions in nested disproofs.
  pub fn strip_antecedent(&self, target: &Fact) -> Fact {
    match self {
      Fact::Implication {
        antecedents,
        consequent,
      } => {
        let mut new_antecedents = Vec::new();
        for ant in antecedents {
          if ant != target {
            new_antecedents.push(ant.strip_antecedent(target));
          }
        }
        if new_antecedents.is_empty() {
          consequent.strip_antecedent(target)
        } else {
          Fact::Implication {
            antecedents: new_antecedents,
            consequent: Box::new(consequent.strip_antecedent(target)),
          }
        }
      }
      _ => self.clone(),
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

  pub fn deduce_with_speculative_rich(
    &self,
    speculative_facts: Vec<Fact>,
    base_remaining_asgmts: AsgmtSet,
    base_sukaku_map: internals::SukakuMap,
  ) -> Vec<Fact> {
    let mut collector =
      internals::Collector::new(self.remaining_asgmts, self.actual_asgmts, self.sukaku_map);
    collector
      .collect_with_speculative_rich(speculative_facts, base_remaining_asgmts, base_sukaku_map)
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

#[derive(Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../www/src/facts/")]
#[serde(rename_all = "camelCase")]
pub struct ErroneousAssignmentProductivity {
  pub loc: Loc,
  pub num: Num,
  pub productivity: usize,
}

pub fn calculate_erroneous_productivity_native(
  grid: &Grid,
  solutions: &[SolvedGrid],
) -> Vec<ErroneousAssignmentProductivity> {
  let mut base_ledger = match Ledger::new(grid) {
    Ok(l) => l,
    Err(_) => return Vec::new(),
  };

  if base_ledger.apply_implications().is_err() {
    return Vec::new();
  }

  let base_solved = 81 - base_ledger.unset().len();

  let mut solutions_asgmt_set = AsgmtSet::new();
  for solution in solutions {
    solutions_asgmt_set |= AsgmtSet::simple_from_grid(&solution.grid());
  }

  let erroneous_candidates: Vec<Asgmt> = (base_ledger.asgmts() - solutions_asgmt_set)
    .iter()
    .collect();

  let mut results = Vec::new();
  for asgmt in erroneous_candidates {
    let mut test_ledger = base_ledger;
    test_ledger.eliminate(asgmt.num, asgmt.loc);
    let productivity = if test_ledger.apply_implications().is_err() {
      0
    } else {
      let new_solved = 81 - test_ledger.unset().len();
      if new_solved > base_solved {
        (new_solved - base_solved) as usize
      } else {
        0
      }
    };
    results.push(ErroneousAssignmentProductivity {
      loc: asgmt.loc,
      num: asgmt.num,
      productivity,
    });
  }

  // Sort descending by productivity, then ascending by loc, then num
  results.sort_by(|a, b| {
    b.productivity
      .cmp(&a.productivity)
      .then_with(|| a.loc.cmp(&b.loc))
      .then_with(|| a.num.cmp(&b.num))
  });

  results
}

#[wasm_bindgen(js_name = "calculateErroneousProductivity")]
pub fn calculate_erroneous_productivity(
  grid: &Grid,
  solutions: Option<Vec<SolvedGrid>>,
) -> wasm_bindgen::JsValue {
  let solutions = solutions.unwrap_or_default();
  let results = calculate_erroneous_productivity_native(grid, &solutions);
  serde_wasm_bindgen::to_value(&results).unwrap()
}

#[wasm_bindgen(js_name = "disproveErroneousAssignment")]
pub fn disprove_erroneous_assignment_wasm(
  grid: &Grid,
  target: wasm_bindgen::JsValue,
  solutions: Option<Vec<SolvedGrid>>,
  eliminations: wasm_bindgen::JsValue,
  max_time_ms: Option<f64>,
  max_depth: Option<usize>,
) -> wasm_bindgen::JsValue {
  let target: WasmAsgmt = serde_wasm_bindgen::from_value(target).unwrap();
  let target_asgmt = Asgmt::new(Num::new(target.num).unwrap(), Loc::new(target.loc).unwrap());

  let constraints: Option<Vec<Vec<WasmAsgmt>>> =
    if eliminations.is_undefined() || eliminations.is_null() {
      None
    } else {
      Some(serde_wasm_bindgen::from_value(eliminations).unwrap())
    };

  let mut base_finder = FactFinder::new(grid);
  if let Some(ref c) = constraints {
    apply_constraints(&mut base_finder, c);
  }

  let solutions = solutions.unwrap_or_default();
  let max_depth = max_depth.unwrap_or(5);
  let fact_opt = disprove_erroneous_assignment(
    &base_finder,
    target_asgmt,
    &solutions,
    max_time_ms,
    max_depth,
  );
  serde_wasm_bindgen::to_value(&fact_opt).unwrap()
}

pub fn disprove_erroneous_assignment(
  base_finder: &FactFinder,
  target: Asgmt,
  solutions: &[SolvedGrid],
  max_time_ms: Option<f64>,
  max_depth: usize,
) -> Option<Fact> {
  let start_time = time::now();
  let target_fact = Fact::SpeculativeAssignment {
    loc: target.loc,
    num: target.num,
  };

  let mut current_finder = base_finder.clone();
  current_finder.apply(target);

  let err_fact = disprove_recursive(
    base_finder,
    current_finder,
    &[target_fact.clone()],
    Vec::new(),
    solutions,
    1,
    max_depth,
    start_time,
    max_time_ms,
  )?;

  let stripped_err_fact = err_fact.strip_antecedent(&target_fact);

  Some(Fact::Implication {
    antecedents: vec![target_fact],
    consequent: Box::new(stripped_err_fact),
  })
}

fn disprove_recursive(
  base_finder: &FactFinder,
  mut current_finder: FactFinder,
  active_speculations: &[Fact],
  mut accumulated_nested_disproofs: Vec<Fact>,
  solutions: &[SolvedGrid],
  depth: usize,
  max_depth: usize,
  start_time: f64,
  max_time_ms: Option<f64>,
) -> Option<Fact> {
  if let Some(limit) = max_time_ms {
    if time::now() - start_time > limit {
      return None;
    }
  }
  if depth > max_depth {
    return None;
  }

  // 1. Run rich deductions in current_finder
  let mut spec_facts = Vec::new();
  if let Some(last_spec) = active_speculations.last() {
    spec_facts.push(last_spec.clone());
  }

  let deduced_facts = current_finder.deduce_with_speculative_rich(
    spec_facts,
    base_finder.remaining_asgmts,
    base_finder.sukaku_map,
  );

  // 2. Check for contradictions
  for fact in &deduced_facts {
    if fact.is_error() {
      if accumulated_nested_disproofs.is_empty() {
        return Some(fact.clone());
      } else {
        return Some(Fact::Implication {
          antecedents: accumulated_nested_disproofs.clone(),
          consequent: Box::new(fact.clone()),
        });
      }
    }
  }

  if depth >= max_depth {
    return None;
  }

  // 3. Apply deductions
  for fact in &deduced_facts {
    current_finder.apply_fact(fact);
  }

  // 4. Find erroneous candidates in the current hypothetical state
  let mut err_candidates =
    calculate_erroneous_productivity_native(&current_finder.to_grid(), solutions);

  if let Ok(base_ledger) = Ledger::new(&current_finder.to_grid()) {
    err_candidates.sort_by_key(|cand| {
      let mut test_ledger = base_ledger;
      test_ledger.assign_blindly(cand.num, cand.loc);
      if test_ledger.apply_implications().is_err() {
        0
      } else {
        test_ledger.unset().len()
      }
    });
  }

  if depth == 1 {
    let mut err_set = AsgmtSet::new();
    for cand in &err_candidates {
      err_set.insert(Asgmt::new(cand.num, cand.loc));
    }

    enum Target {
      NoNum(Loc, Vec<Num>),
      NoLoc(Unit, Num, Vec<Loc>),
    }

    let mut best_target: Option<Target> = None;

    // Search for NoNum targets
    for id in 0..81 {
      let loc = Loc::new(id).unwrap();

      let remaining_nums: Vec<Num> = (0..9)
        .map(|n| Num::new(n + 1).unwrap())
        .filter(|&num| {
          current_finder
            .remaining_asgmts
            .contains(Asgmt::new(num, loc))
        })
        .collect();
      if remaining_nums.is_empty() {
        continue;
      }
      if remaining_nums
        .iter()
        .all(|&num| err_set.contains(Asgmt::new(num, loc)))
      {
        let is_better = match &best_target {
          None => true,
          Some(Target::NoNum(_, best_nums)) => remaining_nums.len() < best_nums.len(),
          Some(Target::NoLoc(_, _, best_locs)) => remaining_nums.len() < best_locs.len(),
        };
        if is_better {
          best_target = Some(Target::NoNum(loc, remaining_nums));
        }
      }
    }

    // Search for NoLoc targets
    for unit in Unit::all() {
      for n_id in 0..9 {
        let num = Num::new(n_id + 1).unwrap();

        let remaining_locs: Vec<Loc> = unit
          .locs()
          .iter()
          .filter(|&loc| {
            current_finder
              .remaining_asgmts
              .contains(Asgmt::new(num, loc))
          })
          .collect();
        if remaining_locs.is_empty() {
          continue;
        }
        if remaining_locs
          .iter()
          .all(|&loc| err_set.contains(Asgmt::new(num, loc)))
        {
          let is_better = match &best_target {
            None => true,
            Some(Target::NoNum(_, best_nums)) => remaining_locs.len() < best_nums.len(),
            Some(Target::NoLoc(_, _, best_locs)) => remaining_locs.len() < best_locs.len(),
          };
          if is_better {
            best_target = Some(Target::NoLoc(unit, num, remaining_locs));
          }
        }
      }
    }

    if let Some(target) = best_target {
      let mut accumulated_for_target = accumulated_nested_disproofs.clone();
      let cands: Vec<Asgmt> = match target {
        Target::NoNum(loc, ref nums) => nums.iter().map(|&n| Asgmt::new(n, loc)).collect(),
        Target::NoLoc(_, num, ref locs) => locs.iter().map(|&l| Asgmt::new(num, l)).collect(),
      };

      let mut success = true;
      for cand_asgmt in cands {
        let cand_fact = Fact::SpeculativeAssignment {
          loc: cand_asgmt.loc,
          num: cand_asgmt.num,
        };
        let mut nested_finder = current_finder.clone();
        nested_finder.apply(cand_asgmt);
        let mut next_active = active_speculations.to_vec();
        next_active.push(cand_fact.clone());

        if let Some(err_fact) = disprove_recursive(
          base_finder,
          nested_finder,
          &next_active,
          accumulated_for_target.clone(),
          solutions,
          depth + 1,
          max_depth,
          start_time,
          max_time_ms,
        ) {
          let stripped = err_fact.strip_antecedent(&cand_fact);
          let f_cand = Fact::Implication {
            antecedents: vec![cand_fact],
            consequent: Box::new(stripped),
          };
          accumulated_for_target.push(f_cand.clone());
          current_finder.apply_fact(&f_cand);
        } else {
          success = false;
          break;
        }
      }

      if success {
        let consequent = match target {
          Target::NoNum(loc, _) => Fact::NoNum { loc },
          Target::NoLoc(unit, num, _) => Fact::NoLoc { num, unit },
        };
        return Some(Fact::Implication {
          antecedents: accumulated_for_target,
          consequent: Box::new(consequent),
        });
      }
    }
  }

  for cand in err_candidates {
    if let Some(limit) = max_time_ms {
      if time::now() - start_time > limit {
        return None;
      }
    }

    let cand_asgmt = Asgmt::new(cand.num, cand.loc);
    let cand_fact = Fact::SpeculativeAssignment {
      loc: cand.loc,
      num: cand.num,
    };

    // Assume cand under current state
    let mut nested_finder = current_finder.clone();
    nested_finder.apply(cand_asgmt);

    let mut next_active = active_speculations.to_vec();
    next_active.push(cand_fact.clone());

    if let Some(err_fact) = disprove_recursive(
      base_finder,
      nested_finder,
      &next_active,
      accumulated_nested_disproofs.clone(),
      solutions,
      depth + 1,
      max_depth,
      start_time,
      max_time_ms,
    ) {
      // We found a contradiction!
      // Check if the contradiction actually depends on cand_fact
      if !err_fact.depends_on_speculative_assignment(cand.loc, cand.num) {
        // Contradiction does not depend on cand_fact! Bubble it up.
        return Some(err_fact);
      }

      // Construct nested disproof for cand
      let stripped_err_fact = err_fact.strip_antecedent(&cand_fact);
      let f_cand = Fact::Implication {
        antecedents: vec![cand_fact.clone()],
        consequent: Box::new(stripped_err_fact),
      };

      // Apply f_cand to current_finder
      current_finder.apply_fact(&f_cand);
      accumulated_nested_disproofs.push(f_cand);

      let mut spec_facts = Vec::new();
      if let Some(last_spec) = active_speculations.last() {
        spec_facts.push(last_spec.clone());
      }

      let deduced_facts = current_finder.deduce_with_speculative_rich(
        spec_facts,
        base_finder.remaining_asgmts,
        base_finder.sukaku_map,
      );

      for fact in &deduced_facts {
        if fact.is_error() {
          if accumulated_nested_disproofs.is_empty() {
            return Some(fact.clone());
          } else {
            return Some(Fact::Implication {
              antecedents: accumulated_nested_disproofs.clone(),
              consequent: Box::new(fact.clone()),
            });
          }
        }
      }

      for fact in &deduced_facts {
        current_finder.apply_fact(fact);
      }
    }
  }

  None
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::str::FromStr;

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
  fn test_calculate_erroneous_productivity() {
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

    let mut helper = crate::solve::DefaultHelper();
    let summary = crate::solve::solve(&grid, 10, &mut helper);
    assert!(!summary.solutions.is_empty());

    let results = calculate_erroneous_productivity_native(&grid, &summary.solutions);

    let mut solutions_asgmt_set = AsgmtSet::new();
    for solution in &summary.solutions {
      solutions_asgmt_set |= AsgmtSet::simple_from_grid(&solution.grid());
    }

    // Verify all candidates returned are indeed erroneous
    for res in &results {
      let asgmt = Asgmt {
        num: res.num,
        loc: res.loc,
      };
      assert!(
        !solutions_asgmt_set.contains(asgmt),
        "Candidate assignment {:?} is in the solution set, so it should not be reported as erroneous",
        asgmt
      );
    }

    // Verify results are sorted descending by productivity
    for i in 1..results.len() {
      assert!(
        results[i - 1].productivity >= results[i].productivity,
        "Results not sorted by productivity: results[{}] has {} but results[{}] has {}",
        i - 1,
        results[i - 1].productivity,
        i,
        results[i].productivity
      );
    }
  }

  #[test]
  fn test_lunatic_nested_disproof() {
    // Lunatic puzzle from evaluate/internals.rs
    let grid = Grid::from_str(
      r"
      . . 5 | 3 . . | . . .
      8 . . | . . . | . 2 .
      . 7 . | . 1 . | 5 . .
      ------+------+------
      4 . . | . . 5 | 3 . .
      . 1 . | . 7 . | . . 6
      . . 3 | 2 . . | . 8 .
      ------+------+------
      . 6 . | 5 . . | . . 9
      . . 4 | . . . | . 3 .
      . . . | . . 9 | 7 . .
      ",
    )
    .unwrap();

    let mut helper = crate::solve::DefaultHelper();
    let summary = crate::solve::solve(&grid, 1, &mut helper);
    assert_eq!(summary.solutions.len(), 1);
    let solutions = summary.solutions;
    let base_finder = FactFinder::new(&grid);

    let target = Asgmt::new(N8, L54);
    let fact_opt =
      disprove_erroneous_assignment(&base_finder, target, &solutions, Some(10000.0), 5);
    assert!(
      fact_opt.is_some(),
      "Should have successfully disproved target L54=N8"
    );
    let fact = fact_opt.unwrap();

    // 1. Root implication asserts that target speculation (L54=N8) leads to contradiction
    if let Fact::Implication {
      antecedents,
      consequent,
    } = &fact
    {
      assert_eq!(antecedents.len(), 1);
      assert_eq!(
        antecedents[0],
        Fact::SpeculativeAssignment { loc: L54, num: N8 }
      );

      // 2. Consequent is another implication containing the nested disproof dependencies
      if let Fact::Implication {
        antecedents: nested_deps,
        consequent: final_error,
      } = &**consequent
      {
        // Assert we have nested dependencies
        assert!(
          !nested_deps.is_empty(),
          "Should have nested disproof dependencies"
        );

        // The ultimate consequent is indeed a base error fact
        assert!(
          final_error.is_error(),
          "Ultimate consequent should be a contradiction"
        );
      } else {
        panic!("Consequent of root implication should be a nested Implication");
      }
    } else {
      panic!("Root fact should be an Implication");
    }
  }

  #[test]
  fn test_nested_disproof_bug() {
    let grid = Grid::from_str(
      r"
      5 . . | . 7 9 | . 1 .
      . 1 6 | 3 . 8 | 9 . 5
      . 9 4 | 1 6 5 | 3 2 .
      ------+------+------
      . . . | . . 1 | . . .
      4 . 1 | . . 7 | . . .
      6 . 9 | . 3 4 | 1 . 2
      ------+------+------
      3 8 5 | 7 1 6 | 2 9 4
      1 4 7 | . . 2 | . . 3
      9 6 2 | . . 3 | 7 5 1
      ",
    )
    .unwrap();

    let mut helper = crate::solve::DefaultHelper();
    let summary = crate::solve::solve(&grid, 1, &mut helper);
    assert_eq!(summary.solutions.len(), 1);
    let solutions = summary.solutions;
    let base_finder = FactFinder::new(&grid);

    // L14 is row 0 col 3 (which is empty in grid, 2 in solution).
    // Target speculative assignment: L14 = 4.
    let target = Asgmt::new(N4, L14);

    let mut finder = base_finder.clone();
    finder.apply(target);
    let deduced = finder.deduce_all_with_timeout(None);
    println!("Deductions under target: {:#?}", deduced.0);

    let fact_opt = disprove_erroneous_assignment(&base_finder, target, &solutions, Some(5000.0), 5);
    assert!(
      fact_opt.is_some(),
      "Should have successfully disproved target L14=N4"
    );
    let fact = fact_opt.unwrap();

    // Verify it is not a direct implication to NoLoc for num: 3 in Blk 5.
    if let Fact::Implication {
      antecedents,
      consequent,
    } = &fact
    {
      assert_eq!(antecedents.len(), 1);
      assert_eq!(
        antecedents[0],
        Fact::SpeculativeAssignment { loc: L14, num: N4 }
      );

      // The consequent should be a nested Implication, not directly NoLoc!
      match &**consequent {
        Fact::Implication {
          antecedents: nested_deps,
          consequent: final_error,
        } => {
          assert!(
            !nested_deps.is_empty(),
            "Should have nested disproof dependencies"
          );
          assert!(final_error.is_error());
        }
        Fact::NoLoc { num, unit } => {
          panic!("Bug reproduced: target speculation directly implies NoLoc without nesting! NoLoc was: num={}, unit={:?}", num.get(), unit);
        }
        other => {
          panic!("Unexpected consequent: {:?}", other);
        }
      }
    } else {
      panic!("Root fact should be an Implication");
    }
  }
}
