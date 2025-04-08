//! Code that emulates human Sudoku deduction patterns.

use crate::core::*;

/// A fact that can be deduced from a Sudoku grid.
#[derive(Clone, Eq, Hash, PartialEq, PartialOrd)]
pub enum Fact {
  /// Assignment: the given numeral has only one possible location in the given
  /// unit.
  SingleLoc { num: Num, unit: Unit, loc: Loc },
  /// Assignment: the given location has only one possible numeral.
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
      Fact::SingleLoc { num, loc, .. } => Asgmt::new(*num, *loc).to_eliminations(),
      Fact::SingleNum { loc, num } => Asgmt::new(*num, *loc).to_eliminations(),
      Fact::SpeculativeAssignment { loc, num } => Asgmt::new(*num, *loc).to_eliminations(),
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
      } => {
        let mut answer = AsgmtSet::new();
        let mut outside_locs = unit.locs() - *locs;
        if let Some(cross_unit) = cross_unit {
          outside_locs |= cross_unit.locs() - unit.locs()
        }
        for num in Num::all() {
          if nums.contains(num) {
            answer.union_in_place(num, *locs);
          } else {
            answer.union_in_place(num, outside_locs);
          }
        }
        answer
      }
      Fact::Implication { consequent, .. } => consequent.as_eliminations(),
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
}

/// A stateful object that can deduce facts about a Sudoku grid.
pub struct FactFinder {
  /// The remaining possible assignments.
  asgmts: AsgmtSet,

  /// The current state of the grid.
  grid: Grid,

  /// The latent facts that have been deduced.
  facts: Vec<Fact>,
}

impl FactFinder {
  /// Creates a new `FactFinder` with the given grid.
  ///
  /// ## Panics
  ///
  /// Panics if the grid is invalid.
  pub fn new(grid: Grid) -> Self {
    let asgmts = AsgmtSet::from_grid(&grid).unwrap();
    Self {
      asgmts,
      grid,
      facts: Vec::new(),
    }
  }

  /// Returns the current set of possible assignments.
  pub fn asgmts(&self) -> &AsgmtSet {
    &self.asgmts
  }

  /// Returns the current state of the grid.
  pub fn grid(&self) -> &Grid {
    &self.grid
  }

  /// Returns the list of deduced facts.
  pub fn facts(&self) -> &[Fact] {
    &self.facts
  }

  /// Applies the given fact to the grid and updates the possible assignments.
  pub fn apply_fact(&mut self, fact: &Fact) {
    if let Some(asgmt) = fact.as_asgmt() {
      self.asgmts.apply(asgmt);
      self.grid[asgmt.loc] = Some(asgmt.num);
    } else {
      self.asgmts -= fact.as_eliminations();
    }
    self.facts.push(fact.clone());
  }
}
