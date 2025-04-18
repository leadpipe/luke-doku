//! Defines the core Luke-doku types.
//!
//! Among these are:
//!
//! - Grid: the 9x9 Sudoku board
//! - Num: the 9 numerals that go in the grid's squares
//! - Loc: the 81 locations of the grid
//! - various types identifying parts of the grid like Row, Col and Blk

mod asgmt;
pub mod bits;
mod grid;
mod id_types;
mod loc;
pub mod masks;
mod num;
pub mod set;
mod units;

pub use asgmt::*;
pub use grid::*;
pub use loc::*;
pub use num::*;
pub use set::Set;
pub use units::*;

/// Marker error for invalid Sudoku grids.
#[derive(Debug)]
pub struct Invalid;
