//! Defines the evaluator for Luke-doku.

use num_derive::FromPrimitive;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::gen::Puzzle;

mod internals;

/// The evaluated complexity of a puzzle.  The numeric value corresponds to a
/// number of stars.
#[derive(Clone, Copy, Debug, Eq, FromPrimitive, Hash, Ord, PartialEq, PartialOrd)]
#[wasm_bindgen]
#[repr(C)]
pub enum Complexity {
  /// The puzzle can be solved entirely with direct assignments.
  Simple = 1,
  /// The puzzle requires basic deductions.
  Moderate,
  /// The puzzle requires advanced deductions.
  Complex,
  /// The puzzle requires basic disproofs/trails.
  Expert,
  /// The puzzle requires recursive disproofs.
  Lunatic,
}

/// A puzzle's rating, the result of evaluating it.
#[derive(Clone, Copy, Debug, PartialEq)]
#[wasm_bindgen]
pub struct Rating {
  /// How intrinsically hard the puzzle is.
  pub complexity: Complexity,
  /// How long the evaluator estimates it will take a person to solve the
  /// puzzle, in milliseconds.
  #[wasm_bindgen(js_name = "estimatedTimeMs")]
  pub estimated_time_ms: f64,
  /// The version of the evaluator that produced this rating.
  #[wasm_bindgen(js_name = "evaluatorVersion")]
  pub evaluator_version: u32,
}

const EVALUATOR_VERSION: u32 = 0;

#[wasm_bindgen(js_name = "evaluatorVersion")]
pub fn evaluator_version() -> u32 {
  EVALUATOR_VERSION
}

/// Evaluates a puzzle's complexity and estimates how long it will take to
/// solve.
#[wasm_bindgen]
pub fn evaluate(puzzle: &Puzzle) -> Rating {
  let complexity = internals::evaluate_complexity(puzzle);
  let estimated_time_ms = 0.0; // TODO: implement this
  Rating {
    complexity,
    estimated_time_ms,
    evaluator_version: EVALUATOR_VERSION,
  }
}
