//! Defines the Num type, which represents the numerals written in a Sudoku.

use super::bits::{Bits, Bits9};
use super::set::Set;
use crate::define_set_operators;
use core::fmt;
use paste::paste;
use seq_macro::seq;
use std::num::NonZeroI8;
use wasm_bindgen::convert::{FromWasmAbi, IntoWasmAbi, OptionFromWasmAbi, OptionIntoWasmAbi};
use wasm_bindgen::describe::{inform, WasmDescribe, I8};

/// Identifies one of the 9 numerals that can can occupy a location of a
/// Sudoku grid.
#[derive(Clone, Copy, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct Num(NonZeroI8);

// Constant Num values, N1 through N9.
seq!(K in 1..=9 {
    paste! {
        pub const [<N K>]: Num = Num(unsafe {
            // Safe because K in 1..=9
            NonZeroI8::new_unchecked(K)
        });
    }
});

impl Num {
  /// How many distinct numerals there are.
  pub const COUNT: usize = 9;

  /// Makes a Num from an int, which callers must ensure is in the range
  /// 1..=9.
  ///
  /// # Safety
  ///
  /// Callers must ensure the argument is in `1..=9`.
  pub unsafe fn new_unchecked(num: i8) -> Self {
    Num(NonZeroI8::new_unchecked(num))
  }

  /// Makes an optional Num from an int, present when it's in range and
  /// absent otherwise.
  pub fn new(num: i8) -> Option<Self> {
    if num > 0 && num <= 9 {
      Some(unsafe { Self::new_unchecked(num) })
    } else {
      None
    }
  }

  /// Makes a Num from an index, which callers must ensure is in the range
  /// 0..9.
  ///
  /// # Safety
  ///
  /// Callers must ensure the argument is in `0..9`.
  pub unsafe fn from_index_unchecked(i: usize) -> Self {
    Num::new_unchecked(i as i8 + 1)
  }

  /// Makes an optional Num from an index, present when it's in range and
  /// absent otherwise.
  pub fn from_index(i: usize) -> Option<Self> {
    if i < 9 {
      Some(unsafe { Self::from_index_unchecked(i) })
    } else {
      None
    }
  }

  /// Returns the int that this Num wraps, which is in 1..=9.
  pub fn get(self) -> i8 {
    self.0.get()
  }

  /// Returns the number to use for indexing, when you need to index by
  /// `Num`s.
  pub fn index(self) -> usize {
    (self.get() - 1) as usize
  }

  /// Iterates all distinct `Num`s, 1 through 9.
  pub fn all() -> impl Iterator<Item = Self> {
    (1..=9).map(|n| unsafe { Self::new_unchecked(n) })
  }

  /// Returns a singleton set containing just this numeral.
  pub fn as_set(self) -> NumSet {
    NumSet::singleton(self)
  }
}

impl WasmDescribe for Num {
  fn describe() {
    inform(I8)
  }
}

impl FromWasmAbi for Num {
  type Abi = i32;

  unsafe fn from_abi(js: Self::Abi) -> Self {
    Self::new(js as _).unwrap()
  }
}

impl OptionFromWasmAbi for Num {
  fn is_none(abi: &Self::Abi) -> bool {
    *abi == 0
  }
}

impl IntoWasmAbi for Num {
  type Abi = i32;

  fn into_abi(self) -> Self::Abi {
    self.get() as _
  }
}

impl OptionIntoWasmAbi for Num {
  fn none() -> Self::Abi {
    0
  }
}

impl fmt::Debug for Num {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    write!(f, "N{}", self.get())
  }
}

impl fmt::Display for Num {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    write!(f, "{}", self.get())
  }
}

/// A set of `Num`s.
#[derive(Clone, Copy, Eq, Hash, PartialEq)]
pub struct NumSet(pub Bits9);

impl NumSet {
  /// Makes a new empty NumSet.
  pub fn new() -> Self {
    NumSet(Bits9::ZERO)
  }

  /// Makes a new single-valued NumSet.
  pub fn singleton(num: Num) -> Self {
    NumSet(Bits9::singleton(num.index() as i32))
  }

  /// Makes a new NumSet containing all numerals.
  pub fn all() -> Self {
    NumSet(Bits9::ONES)
  }
}

impl Default for NumSet {
  fn default() -> Self {
    Self::new()
  }
}

impl FromIterator<Num> for NumSet {
  fn from_iter<I: IntoIterator<Item = Num>>(iter: I) -> Self {
    let mut set = Self::new();
    for num in iter {
      set.insert(num);
    }
    set
  }
}

#[macro_export]
/// Returns a NumSet containing the given numerals.
macro_rules! num_set {
  ($($num:expr),*) => {
    NumSet::from_iter([$($num),*])
  };
}

impl<'a> Set<'a> for NumSet {
  type Item = Num;
  type Bits = Bits9;

  fn bits(&self) -> &Self::Bits {
    &self.0
  }

  fn mut_bits(&mut self) -> &mut Self::Bits {
    &mut self.0
  }

  fn to_bits_value(&self, item: Self::Item) -> i32 {
    item.index() as i32
  }

  fn from_bits_value(&self, value: i32) -> Self::Item {
    // Safe because Bits9 only returns values in 0..9.
    unsafe { Num::new_unchecked((value + 1) as i8) }
  }
}

define_set_operators!(NumSet);

impl fmt::Debug for NumSet {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    let mut first = true;
    write!(f, "{{")?;
    for num in self.iter() {
      if first {
        first = false;
      } else {
        write!(f, ", ")?;
      }
      write!(f, "{:?}", num)?;
    }
    write!(f, "}}")
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn check_eq(set: NumSet, nums: &[Num]) {
    let contents: Vec<_> = set.iter().collect();
    assert_eq!(contents[..], *nums);
  }

  #[test]
  fn basics() {
    let mut set = NumSet::new();
    assert!(set.insert(N1));
    assert!(set.insert(N2));
    assert!(set.insert(N3));
    check_eq(set, &[N1, N2, N3]);

    assert!(!set.remove(N4));
    assert!(set.remove(N2));
    check_eq(set, &[N1, N3]);
  }

  #[test]
  fn ops() {
    let mut set1 = N1.as_set();
    let mut set2 = N2.as_set();
    let set3 = set1 | set2;
    check_eq(set3, &[N1, N2]);
    assert_eq!(set1, set3 ^ set2);

    set1 |= N7.as_set();
    set2 ^= N8.as_set();
    check_eq(NumSet::all() & !(set1 ^ set2), &[N3, N4, N5, N6, N9]);
  }
}
