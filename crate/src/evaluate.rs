//! Defines the evaluator for Luke-doku.

use wasm_bindgen::prelude::wasm_bindgen;

/// The evaluated complexity of a puzzle.  The numeric value corresponds to a
/// number of stars.
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
pub struct Rating {
  /// How intrinsically hard the puzzle is.
  pub complexity: Complexity,
  /// How long the evaluator estimates it will take a person to solve the
  /// puzzle, in milliseconds.
  pub estimated_time_ms: f64,
  /// The version of the evaluator that produced this rating.
  pub evaluator_version: u32,
}

const EVALUATOR_VERSION: u32 = 0;

#[wasm_bindgen(js_name = "evaluatorVersion")]
pub fn evaluator_version() -> u32 {
  EVALUATOR_VERSION
}
