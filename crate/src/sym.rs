//! Defines symmetries of the Sudoku grid.

use std::{
  cmp::{min, Ordering},
  convert::TryInto,
  ptr::addr_of_mut,
};

use num_derive::FromPrimitive;
use num_traits::FromPrimitive;
use once_cell::sync::Lazy;
use serde::Serialize;
use wasm_bindgen::{
  convert::{FromWasmAbi, IntoWasmAbi},
  describe::{inform, WasmDescribe, I8},
  prelude::wasm_bindgen,
  JsValue,
};

use crate::{core::*, random::*};
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum Diagonal {
  Main,
  Anti,
}

#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum Axis {
  X,
  Y,
}

/// The symmetries of the Sudoku grid.  These are typically used to generate and
/// describe the arrangement of a puzzle's clues within the grid.
///
/// Each symmetry divides the Sudoku grid into "orbits," collections of cells
/// that are equivalent to each other under the symmetry.
///
/// `Sym` implements partial ordering according to whether one symmetry implies
/// the other, meaning that all of the orbits of the "larger" one are supersets
/// of the orbits of the "smaller" one.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum Sym {
  /// The classic Sudoku symmetry, 180-degree rotational.
  Rotation180,
  /// 90-degree rotational symmetry.
  Rotation90,
  /// Mirror symmetry across the X or Y axis.
  Mirror(Axis),
  /// Mirror symmetry across both X and Y axes.
  DoubleMirror,
  /// Mirror symmetry across the main or anti diagonal.
  Diagonal(Diagonal),
  /// Mirror symmetry across both diagonals.
  DoubleDiagonal,
  /// Mirror symmetry across both axes and both diagonals.
  FullyReflective,
  /// Translational symmetry by block along the main or anti diagonal.
  Blockwise(Diagonal),
  /// No symmetry.
  None,
}

/// A simple enum, interconvertible with Sym, for translating to JS.
#[derive(Clone, Copy, Debug, Eq, FromPrimitive, Hash, PartialEq)]
#[wasm_bindgen(js_name = "Sym")]
#[allow(non_camel_case_types)]
#[repr(C)]
pub enum ExplicitSym {
  Rotation180,
  Rotation90,
  Mirror_X,
  Mirror_Y,
  DoubleMirror,
  Diagonal_Main,
  Diagonal_Anti,
  DoubleDiagonal,
  FullyReflective,
  Blockwise_Main,
  Blockwise_Anti,
  None,
}

#[wasm_bindgen(js_name = "evaluateSymmetry")]
pub fn evaluate_symmetry(sym: ExplicitSym, clues: &Grid) -> JsValue {
  serde_wasm_bindgen::to_value(&Sym::from_explicit(sym).evaluate(clues)).unwrap()
}

#[wasm_bindgen(js_name = "bestSymmetryMatches")]
pub fn best_matches(clues: &Grid, max_nonconforming_locs: usize) -> JsValue {
  let matches: Vec<(i32, SymMatch)> = Sym::best_matches(clues, max_nonconforming_locs)
    .into_iter()
    .map(|(s, m)| (s.explicit() as i32, m))
    .collect();
  serde_wasm_bindgen::to_value(&matches).unwrap()
}

impl WasmDescribe for Sym {
  fn describe() {
    inform(I8)
  }
}

impl FromWasmAbi for Sym {
  type Abi = i32;

  unsafe fn from_abi(js: Self::Abi) -> Self {
    let sym = FromPrimitive::from_i32(js).expect("Unrecognized symmetry");
    Self::from_explicit(sym)
  }
}

impl IntoWasmAbi for Sym {
  type Abi = i32;

  fn into_abi(self) -> Self::Abi {
    self.explicit() as _
  }
}

/// How well a puzzle matches a symmetry, in terms of which locations have
/// clues.
#[derive(Clone, Debug, Eq, Hash, PartialEq, Serialize)]
pub struct SymMatch {
  /// The orbits that are full.
  pub full_orbits: Vec<&'static [Loc]>,
  /// The number of locations that don't conform to the symmetry.
  pub num_nonconforming_locs: usize,
  /// The orbits that are only partially full.
  pub partial_orbits: Vec<&'static [Loc]>,
}

/// All the symmetries.
pub static SYMS: &[Sym] = &[
  // These are in partial order, greatest to smallest:
  Sym::FullyReflective,
  Sym::Rotation90,
  Sym::DoubleMirror,
  Sym::Mirror(Axis::X),
  Sym::Mirror(Axis::Y),
  Sym::DoubleDiagonal,
  Sym::Diagonal(Diagonal::Main),
  Sym::Diagonal(Diagonal::Anti),
  Sym::Rotation180,
  Sym::Blockwise(Diagonal::Main),
  Sym::Blockwise(Diagonal::Anti),
  Sym::None,
];

impl Sym {
  pub fn explicit(self) -> ExplicitSym {
    match self {
      Self::Rotation180 => ExplicitSym::Rotation180,
      Self::Rotation90 => ExplicitSym::Rotation90,
      Self::Mirror(Axis::X) => ExplicitSym::Mirror_X,
      Self::Mirror(Axis::Y) => ExplicitSym::Mirror_Y,
      Self::DoubleMirror => ExplicitSym::DoubleMirror,
      Self::Diagonal(Diagonal::Main) => ExplicitSym::Diagonal_Main,
      Self::Diagonal(Diagonal::Anti) => ExplicitSym::Diagonal_Anti,
      Self::DoubleDiagonal => ExplicitSym::DoubleDiagonal,
      Self::FullyReflective => ExplicitSym::FullyReflective,
      Self::Blockwise(Diagonal::Main) => ExplicitSym::Blockwise_Main,
      Self::Blockwise(Diagonal::Anti) => ExplicitSym::Blockwise_Anti,
      Self::None => ExplicitSym::None,
    }
  }

  pub fn from_explicit(sym: ExplicitSym) -> Self {
    match sym {
      ExplicitSym::Rotation180 => Self::Rotation180,
      ExplicitSym::Rotation90 => Self::Rotation90,
      ExplicitSym::Mirror_X => Self::Mirror(Axis::X),
      ExplicitSym::Mirror_Y => Self::Mirror(Axis::Y),
      ExplicitSym::DoubleMirror => Self::DoubleMirror,
      ExplicitSym::Diagonal_Main => Self::Diagonal(Diagonal::Main),
      ExplicitSym::Diagonal_Anti => Self::Diagonal(Diagonal::Anti),
      ExplicitSym::DoubleDiagonal => Self::DoubleDiagonal,
      ExplicitSym::FullyReflective => Self::FullyReflective,
      ExplicitSym::Blockwise_Main => Self::Blockwise(Diagonal::Main),
      ExplicitSym::Blockwise_Anti => Self::Blockwise(Diagonal::Anti),
      ExplicitSym::None => Self::None,
    }
  }

  /// Returns this symmetry's orbits: the sets of equivalent locations under
  /// the symmetry.
  pub fn orbits(self) -> &'static [&'static [Loc]] {
    match self {
      Self::Rotation180 => &*ROTATION180,
      Self::Rotation90 => &*ROTATION90,
      Self::Mirror(Axis::X) => &*MIRROR_X,
      Self::Mirror(Axis::Y) => &*MIRROR_Y,
      Self::DoubleMirror => &*DOUBLE_MIRROR,
      Self::Diagonal(Diagonal::Main) => &*DIAGONAL_MAIN,
      Self::Diagonal(Diagonal::Anti) => &*DIAGONAL_ANTI,
      Self::DoubleDiagonal => &*DOUBLE_DIAGONAL,
      Self::FullyReflective => &*FULLY_REFLECTIVE,
      Self::Blockwise(Diagonal::Main) => &*BLOCKWISE_MAIN,
      Self::Blockwise(Diagonal::Anti) => &*BLOCKWISE_ANTI,
      Self::None => &*NONE,
    }
  }

  /// Returns this symmetry's orbits after shuffling by the given random
  /// number generator.
  pub fn shuffled_orbits<R: Rng>(self, random: &mut R) -> Vec<&'static [Loc]> {
    let mut answer = Vec::from(self.orbits());
    answer.shuffle(random);
    answer
  }

  /// Calculates how well the given puzzle matches this symmetry.
  pub fn evaluate(self, clues: &Grid) -> SymMatch {
    let mut full_orbits = vec![];
    let mut num_nonconforming_locs = 0;
    let mut partial_orbits = vec![];
    for orbit in self.orbits() {
      let filled_count = filled_count(orbit, clues);
      num_nonconforming_locs += min(filled_count, orbit.len() - filled_count);
      if filled_count > 0 {
        if filled_count < orbit.len() {
          partial_orbits.push(*orbit);
        } else {
          full_orbits.push(*orbit);
        }
      }
    }
    SymMatch {
      full_orbits,
      num_nonconforming_locs,
      partial_orbits,
    }
  }

  /// Finds the symmetries that best match the given puzzle grid,
  /// disqualifying any symmetries that match with more than the given number
  /// of nonconforming locations.
  pub fn best_matches(clues: &Grid, max_nonconforming_locs: usize) -> Vec<(Sym, SymMatch)> {
    let mut answer: Vec<(Sym, SymMatch)> = vec![];
    for sym in SYMS {
      let m = sym.evaluate(clues);
      if m.num_nonconforming_locs > max_nonconforming_locs {
        // Ignore symmetries that are too far from describing this puzzle.
        continue;
      }
      let mut add = true;
      for (prev_sym, prev_match) in &answer {
        if *prev_sym > *sym && (!m.is_complete() || prev_match.is_complete() || *sym == Sym::None) {
          add = false;
          break;
        }
      }
      if add {
        answer.push((*sym, m));
      }
    }
    answer.sort_by(|a, b| a.1.num_nonconforming_locs.cmp(&b.1.num_nonconforming_locs));
    answer
  }
}

impl SymMatch {
  pub fn is_complete(&self) -> bool {
    self.num_nonconforming_locs == 0
  }
}

fn filled_count(orbit: &[Loc], clues: &Grid) -> usize {
  orbit.iter().filter(|loc| clues[**loc].is_some()).count()
}

impl PartialOrd for Sym {
  fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
    if *self == *other {
      return Some(Ordering::Equal);
    }
    match self {
      Self::Rotation180 => match other {
        Self::Rotation90 | Self::DoubleMirror | Self::DoubleDiagonal | Self::FullyReflective => {
          Some(Ordering::Less)
        }
        Self::None => Some(Ordering::Greater),
        _ => None,
      },
      Self::Rotation90 => match other {
        Self::FullyReflective => Some(Ordering::Less),
        Self::Rotation180 | Self::None => Some(Ordering::Greater),
        _ => None,
      },
      Self::Mirror(_) => match other {
        Self::DoubleMirror | Self::FullyReflective => Some(Ordering::Less),
        Self::None => Some(Ordering::Greater),
        _ => None,
      },
      Self::DoubleMirror => match other {
        Self::FullyReflective => Some(Ordering::Less),
        Self::Rotation180 | Self::Mirror(_) | Self::None => Some(Ordering::Greater),
        _ => None,
      },
      Self::Diagonal(_) => match other {
        Self::DoubleDiagonal | Self::FullyReflective => Some(Ordering::Less),
        Self::None => Some(Ordering::Greater),
        _ => None,
      },
      Self::DoubleDiagonal => match other {
        Self::FullyReflective => Some(Ordering::Less),
        Self::Rotation180 | Self::Diagonal(_) | Self::None => Some(Ordering::Greater),
        _ => None,
      },
      Self::FullyReflective => match other {
        Self::Rotation180
        | Self::Rotation90
        | Self::Mirror(_)
        | Self::DoubleMirror
        | Self::Diagonal(_)
        | Self::DoubleDiagonal
        | Self::None => Some(Ordering::Greater),
        _ => None,
      },
      Self::Blockwise(_) => match other {
        Self::None => Some(Ordering::Greater),
        _ => None,
      },
      Self::None => Some(Ordering::Less),
    }
  }
}

/// Each symmetry's orbits are backed by an array of all the locations.
type OrbitsLocs = [Loc; 81];

/// The orbits themselves are slices of the underlying array.
type Orbits<const N: usize> = [&'static [Loc]; N];

fn new_orbits<const N: usize>(locs: *mut OrbitsLocs, gen: fn(Loc) -> Vec<Loc>) -> Orbits<N> {
  let mut orbit_ranges = Vec::with_capacity(N);
  let mut remaining = LocSet::all();
  let mut index = 0;
  while !remaining.is_empty() {
    let loc = remaining.smallest_item().unwrap();
    let mut in_orbit = loc.as_set();
    let others = gen(loc);
    others.iter().for_each(|loc| {
      in_orbit.insert(*loc);
    });
    assert!(remaining >= in_orbit);
    let start = index;
    in_orbit.iter().for_each(|loc| {
      unsafe {
        (*locs)[index] = loc;
      }
      index += 1
    });
    orbit_ranges.push(start..index);
    remaining -= in_orbit;
  }
  assert_eq!(orbit_ranges.len(), N);
  let mut orbits = vec![];
  for r in orbit_ranges {
    unsafe {
      orbits.push(&(*locs)[r]);
    }
  }
  orbits.try_into().unwrap()
}

static mut ROTATION180_LOCS: OrbitsLocs = [L11; 81];
static ROTATION180: Lazy<Orbits<{ 80 / 2 + 1 }>> =
  Lazy::new(|| unsafe { new_orbits(addr_of_mut!(ROTATION180_LOCS), |loc| vec![loc.opp()]) });
static mut ROTATION90_LOCS: OrbitsLocs = [L11; 81];
static ROTATION90: Lazy<Orbits<{ 80 / 4 + 1 }>> = Lazy::new(|| unsafe {
  new_orbits(addr_of_mut!(ROTATION90_LOCS), |loc| {
    vec![
      Loc::at(loc.col().t(), loc.row().opp().t()),
      loc.opp(),
      Loc::at(loc.col().opp().t(), loc.row().t()),
    ]
  })
});
static mut MIRROR_X_LOCS: OrbitsLocs = [L11; 81];
static MIRROR_X: Lazy<Orbits<{ 72 / 2 + 9 }>> = Lazy::new(|| unsafe {
  new_orbits(addr_of_mut!(MIRROR_X_LOCS), |loc| {
    vec![Loc::at(loc.row().opp(), loc.col())]
  })
});
static mut MIRROR_Y_LOCS: OrbitsLocs = [L11; 81];
static MIRROR_Y: Lazy<Orbits<{ 72 / 2 + 9 }>> = Lazy::new(|| unsafe {
  new_orbits(addr_of_mut!(MIRROR_Y_LOCS), |loc| {
    vec![Loc::at(loc.row(), loc.col().opp())]
  })
});
static mut DOUBLE_MIRROR_LOCS: OrbitsLocs = [L11; 81];
static DOUBLE_MIRROR: Lazy<Orbits<{ 64 / 4 + 16 / 2 + 1 }>> = Lazy::new(|| unsafe {
  new_orbits(addr_of_mut!(DOUBLE_MIRROR_LOCS), |loc| {
    vec![
      Loc::at(loc.row().opp(), loc.col()),
      loc.opp(),
      Loc::at(loc.row(), loc.col().opp()),
    ]
  })
});
static mut DIAGONAL_MAIN_LOCS: OrbitsLocs = [L11; 81];
static DIAGONAL_MAIN: Lazy<Orbits<{ 72 / 2 + 9 }>> =
  Lazy::new(|| unsafe { new_orbits(addr_of_mut!(DIAGONAL_MAIN_LOCS), |loc| vec![loc.t()]) });
static mut DIAGONAL_ANTI_LOCS: OrbitsLocs = [L11; 81];
static DIAGONAL_ANTI: Lazy<Orbits<{ 72 / 2 + 9 }>> =
  Lazy::new(|| unsafe { new_orbits(addr_of_mut!(DIAGONAL_ANTI_LOCS), |loc| vec![loc.t().opp()]) });
static mut DOUBLE_DIAGONAL_LOCS: OrbitsLocs = [L11; 81];
static DOUBLE_DIAGONAL: Lazy<Orbits<{ 64 / 4 + 16 / 2 + 1 }>> = Lazy::new(|| unsafe {
  new_orbits(addr_of_mut!(DOUBLE_DIAGONAL_LOCS), |loc| {
    vec![loc.t(), loc.opp(), loc.t().opp()]
  })
});
static mut FULLY_REFLECTIVE_LOCS: OrbitsLocs = [L11; 81];
static FULLY_REFLECTIVE: Lazy<Orbits<{ 48 / 8 + 32 / 4 + 1 }>> = Lazy::new(|| unsafe {
  new_orbits(addr_of_mut!(FULLY_REFLECTIVE_LOCS), |loc| {
    vec![
      loc.t(),
      Loc::at(loc.col().t(), loc.row().opp().t()),
      Loc::at(loc.row(), loc.col().opp()),
      loc.opp(),
      loc.opp().t(),
      Loc::at(loc.col().opp().t(), loc.row().t()),
      Loc::at(loc.row().opp(), loc.col()),
    ]
  })
});
static mut BLOCKWISE_MAIN_LOCS: OrbitsLocs = [L11; 81];
static BLOCKWISE_MAIN: Lazy<Orbits<{ 81 / 3 }>> = Lazy::new(|| unsafe {
  new_orbits(addr_of_mut!(BLOCKWISE_MAIN_LOCS), |loc| {
    vec![
      Blk::from_bands(loc.row_band().prev(), loc.col_band().prev())
        .loc_at(loc.blk_row(), loc.blk_col()),
      Blk::from_bands(loc.row_band().next(), loc.col_band().next())
        .loc_at(loc.blk_row(), loc.blk_col()),
    ]
  })
});
static mut BLOCKWISE_ANTI_LOCS: OrbitsLocs = [L11; 81];
static BLOCKWISE_ANTI: Lazy<Orbits<{ 81 / 3 }>> = Lazy::new(|| unsafe {
  new_orbits(addr_of_mut!(BLOCKWISE_ANTI_LOCS), |loc| {
    vec![
      Blk::from_bands(loc.row_band().prev(), loc.col_band().next())
        .loc_at(loc.blk_row(), loc.blk_col()),
      Blk::from_bands(loc.row_band().next(), loc.col_band().prev())
        .loc_at(loc.blk_row(), loc.blk_col()),
    ]
  })
});
static mut NONE_LOCS: OrbitsLocs = [L11; 81];
static NONE: Lazy<Orbits<81>> =
  Lazy::new(|| unsafe { new_orbits(addr_of_mut!(NONE_LOCS), |_| vec![]) });

#[cfg(test)]
mod tests {
  use std::str::FromStr;

  use super::*;

  /// Returns an array that maps every location to the orbit it belongs to as
  /// a set.
  fn loc_orbits(sym: Sym) -> [LocSet; 81] {
    let mut answer = [LocSet::new(); 81];
    for orbit in sym.orbits() {
      let mut set = LocSet::new();
      for loc in *orbit {
        set.insert(*loc);
      }
      for loc in *orbit {
        assert!(answer[loc.index()].is_empty());
        answer[loc.index()] = set;
      }
    }
    answer
  }

  #[test]
  fn partial_order() {
    for s1 in SYMS {
      let s1_loc_orbits = loc_orbits(*s1);
      for s2 in SYMS {
        let order = s1.partial_cmp(s2);
        // Only actually equal syms compare equal.
        assert_eq!(s1 == s2, order == Some(Ordering::Equal));
        if s1 == s2 {
          continue;
        }
        let s2_loc_orbits = loc_orbits(*s2);
        let mut calced_order = Some(Ordering::Equal);
        for loc in Loc::all() {
          let set_order = s1_loc_orbits[loc.index()].partial_cmp(&s2_loc_orbits[loc.index()]);
          if set_order != Some(Ordering::Equal) {
            if calced_order == Some(Ordering::Equal) {
              calced_order = set_order;
            } else if calced_order != set_order {
              calced_order = None;
            }
          }
        }
        assert_eq!(order, calced_order, "{:?} vs {:?}", s1, s2);
      }
    }
  }

  #[test]
  fn list_in_partial_order() {
    for i in 0..SYMS.len() {
      for j in (i + 1)..SYMS.len() {
        assert_eq!(false, SYMS[i] <= SYMS[j]);
      }
    }
  }

  #[test]
  fn best_matches() {
    let clues = Grid::from_str(
      r"
            . . 2 | 6 . . | . . .
            1 6 . | . 5 . | 9 . .
            5 . 3 | 4 . . | . . .
            - - - + - - - + - - -
            4 . . | . . . | . . 3
            . . . | 7 . . | . 2 .
            9 . . | . . . | 5 . 8
            - - - + - - - + - - -
            . . . | . . 4 | 1 . .
            6 . . | 2 . . | . 5 .
            . . . | 1 . 6 | 8 . .",
    )
    .unwrap();

    let sym_counts: Vec<(Sym, usize)> = Sym::best_matches(&clues, 8)
      .iter()
      .map(|(sym, m)| (*sym, m.num_nonconforming_locs))
      .collect();
    assert_eq!(
      sym_counts,
      &[
        (Sym::Blockwise(Diagonal::Anti), 3),
        (Sym::Diagonal(Diagonal::Anti), 8),
      ]
    );

    let clues = Grid::from_str(
      r"
            . 7 2 | . 8 . | 6 4 .
            6 1 4 | 2 . 3 | 8 5 9
            8 9 . | 4 5 6 | . 7 2
            - - - + - - - + - - -
            . 8 6 | 7 9 4 | 5 2 .
            2 . 9 | 5 . 8 | 7 . 6
            . 5 1 | 3 6 2 | 4 9 .
            - - - + - - - + - - -
            1 2 . | 6 4 9 | . 8 7
            4 3 8 | 1 . 7 | 9 6 5
            . 6 7 | . 3 . | 2 1 .",
    )
    .unwrap();

    let sym_counts: Vec<(Sym, usize)> = Sym::best_matches(&clues, 8)
      .iter()
      .map(|(sym, m)| (*sym, m.num_nonconforming_locs))
      .collect();
    assert_eq!(sym_counts, &[(Sym::FullyReflective, 0)]);

    let clues = Grid::from_str(
      r"
            . 7 2 | . 8 . | 6 4 .
            6 . 4 | 2 . 3 | 8 5 9
            8 9 . | 4 5 6 | . 7 2
            - - - + - - - + - - -
            . 8 6 | 7 9 4 | 5 2 .
            2 . 9 | 5 . 8 | 7 . 6
            . 5 1 | 3 6 2 | 4 9 .
            - - - + - - - + - - -
            1 2 . | 6 4 9 | . 8 7
            4 3 8 | 1 . 7 | 9 . 5
            . 6 7 | . 3 . | 2 1 .",
    )
    .unwrap();

    let sym_counts: Vec<(Sym, usize)> = Sym::best_matches(&clues, 8)
      .iter()
      .map(|(sym, m)| (*sym, m.num_nonconforming_locs))
      .collect();
    assert_eq!(
      sym_counts,
      &[(Sym::DoubleDiagonal, 0), (Sym::FullyReflective, 2),]
    );
  }
}
