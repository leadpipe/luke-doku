//! Code that emulates human Sudoku deduction patterns.

use crate::core::*;

mod internals;

/// A fact that can be deduced from a Sudoku grid.
#[derive(Clone, Debug, Eq, Hash, PartialEq, PartialOrd)]
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
  LockedSet {
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
        answer.union_in_place(*num, unit.locs() - cross_unit.locs());
        answer
      }
      Fact::LockedSet {
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

  /// Returns the facts deducible from the current state of the grid.
  pub fn deduce(&self) -> Vec<Fact> {
    let mut collector =
      internals::Collector::new(self.remaining_asgmts, self.actual_asgmts, self.sukaku_map);
    collector.collect();
    collector.facts
  }

  /// Applies the given fact to the grid and updates the possible assignments.
  /// Only facts that are consistent with the current state of the game (such as
  /// those returned from `deduce`) should be applied.
  pub fn apply_fact(&mut self, fact: &Fact) {
    if let Some(asgmt) = fact.as_asgmt() {
      self.remaining_asgmts.apply(asgmt);
      self.remaining_asgmts.remove(asgmt);
      self.actual_asgmts.insert(asgmt);
      self.sukaku_map.apply(asgmt);
    } else {
      let eliminations = fact.as_eliminations();
      self.remaining_asgmts -= eliminations;
      self.sukaku_map.eliminate(&eliminations);
    }
  }
}
