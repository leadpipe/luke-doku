//! Types for working with bitmasks treated as sets.

use seq_macro::seq;
use static_assertions::const_assert;
use std::{
  fmt::Debug,
  ops::{BitAnd, BitAndAssign, BitOr, BitOrAssign, BitXor, BitXorAssign, Not},
};
use wasm_bindgen::convert::{FromWasmAbi, IntoWasmAbi};
use wasm_bindgen::describe::{inform, WasmDescribe, U16, U32, U8};

/// Operations on a fixed-capacity collection of bits.
///
/// You can see a `Bits` object as a set of bits, or as a set of values
/// (integers) in the range 0..CAPACITY.
pub trait Bits
where
  Self: BitAnd<Output = Self>
    + BitAndAssign
    + BitOr<Output = Self>
    + BitOrAssign
    + BitXor<Output = Self>
    + BitXorAssign
    + Copy
    + Eq
    + Not<Output = Self>
    + Sized,
{
  /// The number of bit positions in the collection, each of which will be
  /// present (a `1` bit) or absent (a `0` bit).
  const CAPACITY: i32;

  /// The instance of the Bits object with no `1` bits.  The empty set.
  const ZERO: Self;

  /// The instance of the Bits object with all possible `1` bits (CAPACITY of
  /// them).  The universal set.
  const ONES: Self;

  /// Returns a Bits instance consisting of the single `1` bit that
  /// corresponds to the given value.
  ///
  /// ## Panics
  ///
  /// Panics if the value is not representable in the set, meaning it's
  /// negative or greater than or equal to the set's capacity.
  fn singleton(value: i32) -> Self;

  /// The number of `1` bits in this collection.
  fn len(self) -> i32;

  /// Whether this is the empty set, meaning no `1` bits.
  fn is_empty(self) -> bool {
    self == Self::ZERO
  }

  /// Tells whether the given value's corresponding bit is `1`.
  fn contains(self, value: i32) -> bool {
    Self::is_valid_value(value) && !(self & Self::singleton(value)).is_empty()
  }

  /// The single `1` bit corresponding to the smallest value, or None if there
  /// are no `1` bits.
  fn smallest_bit(self) -> Option<Self>;

  /// The `i`th `1` bit in the set, or None if `i` is not in `0..self.len()`.
  /// This is a slow operation, O(Self::CAPACITY).
  fn bit_at(self, i: i32) -> Option<Self>;

  /// The smallest value in the collection whose bit is `1`, or None if there
  /// are no `1` bits.
  fn smallest_value(self) -> Option<i32>;

  /// The `i`th smallest value in the set whose bit is `1`, or None if `i` is
  /// not in `0..self.len()`.  This is a slow operation, O(Self::CAPACITY).
  fn value_at(self, i: i32) -> Option<i32> {
    let bit = self.bit_at(i)?;
    bit.smallest_value()
  }

  /// Tells whether the given value is representable in the set, meaning it's
  /// in the range 0..Self::CAPACITY.
  fn is_valid_value(n: i32) -> bool {
    n >= 0 && n < Self::CAPACITY
  }

  /// Ensures the given number is representable in the set.
  ///
  /// ## Panics
  ///
  /// Panics if the value is not representable in the set, meaning it's
  /// negative or greater than or equal to the set's capacity.
  fn check(n: i32) {
    assert!(
      Self::is_valid_value(n),
      "{} is out of bounds, must be in 0..{}",
      n,
      Self::CAPACITY
    );
  }

  /// Adds a value to the set.  Tells whether the (bit corresponding to the)
  /// value was previously absent from the set.
  ///
  /// ## Panics
  ///
  /// Panics if the value is not representable in the set, meaning it's
  /// negative or greater than or equal to the set's capacity.
  fn insert(&mut self, value: i32) -> bool;

  /// Removes a value from the set.  Tells whether the (bit corresponding to
  /// the) value was present in the set.
  ///
  /// ## Panics
  ///
  /// Panics if the value is not representable in the set, meaning it's
  /// negative or greater than or equal to the set's capacity.
  fn remove(&mut self, value: i32) -> bool;
}

pub trait BitsIterable {
  /// The corresponding Bits type.
  type Item: Bits;

  /// The type that will iterate this object's bits.
  type BitIterator: Iterator<Item = Self::Item> + Clone + Copy + Debug + Eq + PartialEq;

  /// The type that will iterate this object's values.
  type ValueIterator: Iterator<Item = i32> + Clone + Copy + Debug + Eq + PartialEq;

  /// Iterates through the `1` bits in this collection, by returning a series
  /// of instances of this type.  Each object returned has `o.len() == 1`.
  fn bit_iter(self) -> Self::BitIterator;

  /// Iterates through the values in this set, rendered as `i32`.
  fn value_iter(self) -> Self::ValueIterator;
}

/// Iterates through the bits of a `Bits` instance, by returning a separate
/// single-bit `Bits` instance for each `1` bit.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BitIter<T: Bits>(T);

impl<T: Bits> Iterator for BitIter<T> {
  type Item = T;
  fn next(&mut self) -> Option<T> {
    match self.0.smallest_bit() {
      None => None,
      Some(bit) => {
        self.0 &= !bit;
        Some(bit)
      }
    }
  }
}

/// Iterates through the values (integers) of a `Bits` instance.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct ValueIter<T: Bits>(BitIter<T>);

impl<T: Bits> Iterator for ValueIter<T> {
  type Item = i32;
  fn next(&mut self) -> Option<i32> {
    match self.0.next() {
      None => None,
      Some(bit) => bit.smallest_value(),
    }
  }
}

/// Implements the Bits trait for a built-in integer type.
macro_rules! impl_int_bits {
  ($int:ty) => {
    const_assert!(<$int>::MIN == 0); // True only for unsigned int types
    impl Bits for $int {
      const CAPACITY: i32 = <$int>::BITS as i32;
      const ZERO: $int = 0;
      const ONES: $int = <$int>::MAX; // Note, only works for unsigned int types
      fn singleton(value: i32) -> $int {
        Self::check(value);
        1 << value
      }
      fn len(self) -> i32 {
        self.count_ones() as i32
      }
      fn smallest_bit(self) -> Option<$int> {
        if self == 0 {
          None
        } else {
          Some(self & !(self - 1))
        }
      }
      fn smallest_value(self) -> Option<i32> {
        self.smallest_bit().map(|bit| bit.trailing_zeros() as i32)
      }
      fn bit_at(self, mut i: i32) -> Option<Self> {
        if i >= self.count_ones() as _ {
          return None;
        }
        // Binary search
        let mut lo = 0;
        let mut hi = Self::CAPACITY;
        loop {
          let half_width = (hi - lo) / 2;
          let mask = ((1 << half_width) - 1) << lo; // `half_width` 1 bits
          let count = (self & mask).count_ones() as i32;
          if i >= count {
            i -= count;
            lo += half_width;
          } else {
            hi -= half_width;
          }
          if half_width == 1 {
            debug_assert_eq!(i, 0);
            return Some(1 << lo);
          }
        }
      }
      fn insert(&mut self, value: i32) -> bool {
        let bit = Self::singleton(value);
        if (bit & *self) == 0 {
          *self |= bit;
          true
        } else {
          false
        }
      }
      fn remove(&mut self, value: i32) -> bool {
        let bit = Self::singleton(value);
        if (bit & *self) == 0 {
          false
        } else {
          *self &= !bit;
          true
        }
      }
    }

    impl BitsIterable for $int {
      type Item = $int;
      type BitIterator = BitIter<$int>;
      type ValueIterator = ValueIter<$int>;

      fn bit_iter(self) -> BitIter<$int> {
        BitIter(self)
      }
      fn value_iter(self) -> ValueIter<$int> {
        ValueIter(self.bit_iter())
      }
    }

    impl BitsIterable for &$int {
      type Item = $int;
      type BitIterator = BitIter<$int>;
      type ValueIterator = ValueIter<$int>;

      fn bit_iter(self) -> BitIter<$int> {
        BitIter(*self)
      }
      fn value_iter(self) -> ValueIter<$int> {
        ValueIter(self.bit_iter())
      }
    }
  };
}

impl_int_bits!(u8);
impl_int_bits!(u16);
impl_int_bits!(u32);

/// Defines Bits-implementing newtypes for Bits-implementing int types.
/// The purpose is to have a smaller capacity than the int type.
macro_rules! define_wrapped_bits_types {
    (
        $(
        $(#[$outer:meta])*
        $type_name:ident : $int:ty[$capacity:expr], $wasm_desc:ident;
        )*
    ) => {
        $(
        #[derive(Clone, Copy, Default, Eq, Hash, PartialEq)]
        $(#[$outer])*
        pub struct $type_name($int);

        // The enclosed type must be strictly bigger than the new type.
        const_assert!(<$int>::CAPACITY > $capacity);

        // These newtypes let you manipulate the wrapped int.
        impl $type_name {
            /// Reads the wrapped int bitmask.
            pub const fn backing_int(self) -> $int {
                self.0
            }

            /// Makes a new instance from the underlying int type.
            pub const fn from_backing_int(int: $int) -> Self {
                Self(int & Self::ONES.0)
            }

            /// Const form of `&`.
            pub const fn const_bitand(self, rhs: Self) -> Self {
                Self(self.0 & rhs.0)
            }

            /// Const form of `|`.
            pub const fn const_bitor(self, rhs: Self) -> Self {
                Self(self.0 | rhs.0)
            }

            /// Const form of `^`.
            pub const fn const_bitxor(self, rhs: Self) -> Self {
                Self(self.0 ^ rhs.0)
            }

            /// Const form of `!`.
            pub const fn const_not(self) -> Self {
                self.const_bitxor(Self::ONES)
            }
        }

        impl Bits for $type_name {
            const CAPACITY: i32 = $capacity;
            const ZERO: Self = Self(<$int>::ZERO);
            const ONES: Self = Self((1 << $capacity) - 1);
            fn singleton(value: i32) -> Self {
                Self::check(value);
                Self(<$int>::singleton(value))
            }
            fn len(self) -> i32 {
                self.0.len()
            }
            fn smallest_bit(self) -> Option<Self> {
                self.0.smallest_bit().map(Self)
            }
            fn smallest_value(self) -> Option<i32> {
                self.0.smallest_value()
            }
            fn bit_at(self, i: i32) -> Option<Self> {
                self.0.bit_at(i).map(Self)
            }
            fn insert(&mut self, value: i32) -> bool {
                Self::check(value);
                self.0.insert(value)
            }
            fn remove(&mut self, value: i32) -> bool {
                Self::check(value);
                self.0.remove(value)
            }
        }

        impl BitsIterable for &$type_name {
            type Item = $type_name;
            type BitIterator = BitIter<$type_name>;
            type ValueIterator = ValueIter<$type_name>;
            fn bit_iter(self) -> Self::BitIterator {
                BitIter(*self)
            }
            fn value_iter(self) -> Self::ValueIterator {
                ValueIter(self.bit_iter())
            }
        }

        impl BitAnd for $type_name {
            type Output = Self;
            fn bitand(self, rhs: Self) -> Self {
                self.const_bitand(rhs)
            }
        }
        impl BitAndAssign for $type_name {
            fn bitand_assign(&mut self, rhs: Self) {
                self.0 &= rhs.0
            }
        }
        impl BitOr for $type_name {
            type Output = Self;
            fn bitor(self, rhs: Self) -> Self {
                self.const_bitor(rhs)
            }
        }
        impl BitOrAssign for $type_name {
            fn bitor_assign(&mut self, rhs: Self) {
                self.0 |= rhs.0
            }
        }
        impl BitXor for $type_name {
            type Output = Self;
            fn bitxor(self, rhs: Self) -> Self {
                self.const_bitxor(rhs)
            }
        }
        impl BitXorAssign for $type_name {
            fn bitxor_assign(&mut self, rhs: Self) {
                self.0 ^= rhs.0
            }
        }
        impl Not for $type_name {
            type Output = Self;
            fn not(self) -> Self {
                self.const_not()
            }
        }
        impl Debug for $type_name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
              write!(f, "{}({:#o})", stringify!($type_name), self.0)  // octal
            }
        }
        impl WasmDescribe for $type_name {
            fn describe() {
                inform($wasm_desc)
            }
        }
        impl FromWasmAbi for $type_name {
            type Abi = u32;
            unsafe fn from_abi(js: Self::Abi) -> Self {
                Self::from_backing_int(js as $int)
            }
        }
        impl IntoWasmAbi for $type_name {
            type Abi = u32;
            fn into_abi(self) -> Self::Abi {
                self.0 as u32
            }
        }
        )*
    };
}

define_wrapped_bits_types! {
    /// A 3-bit set, used for intermediate values.
    Bits3: u8[3], U8;

    /// A 9-bit set for the many universes of 9 elements in the world of
    /// Sudoku.
    Bits9: u16[9], U16;

    /// A 27-bit set.  There aren't that many 27-element universes, but 27 bits
    /// takes up almost all of 32 bits, so it's an efficient way to divide up
    /// 81 bits.
    Bits27: u32[27], U32;

    /// An 18-bit set.  This is used for the 18 ways to form an overlap within a
    /// band.
    Bits18: u32[18], U32;
}

impl Bits9 {
  /// Converts a Bits9 into 3 Bits3 values.
  pub const fn to_bits3s(self) -> [Bits3; 3] {
    [
      Bits3::from_backing_int(self.0 as u8),
      Bits3::from_backing_int((self.0 >> 3) as u8),
      Bits3::from_backing_int((self.0 >> 6) as u8),
    ]
  }

  /// Converts 3 Bits3 values into a Bits9.
  pub const fn from_bits3s(b0: Bits3, b1: Bits3, b2: Bits3) -> Self {
    Self::from_backing_int(
      b0.backing_int() as u16 | ((b1.backing_int() as u16) << 3) | ((b2.backing_int() as u16) << 6),
    )
  }
}

impl Bits27 {
  /// Converts a Bits27 into 3 Bits9 values.
  pub const fn to_bits9s(self) -> [Bits9; 3] {
    [
      Bits9::from_backing_int(self.0 as u16),
      Bits9::from_backing_int((self.0 >> 9) as u16),
      Bits9::from_backing_int((self.0 >> 18) as u16),
    ]
  }

  /// Converts 3 Bits9 values into a Bits27.
  pub const fn from_bits9s(b0: Bits9, b1: Bits9, b2: Bits9) -> Self {
    Self::from_backing_int(
      b0.backing_int() as u32
        | ((b1.backing_int() as u32) << 9)
        | ((b2.backing_int() as u32) << 18),
    )
  }
}

pub trait BitsArray<T: Bits, const N: usize> {
  /// Makes a new instance.
  fn new(array: [T; N]) -> Self;

  /// Exposes the array.
  fn array(&self) -> &[T; N];

  /// Exposes the array.
  fn mut_array(&mut self) -> &mut [T; N];
}

/// Defines Bits-implementing newtypes for fixed-size arrays of Bits types.
macro_rules! define_bits_array_types {
    (
        $(
        $(#[$outer:meta])*
        $type_name:ident : [$nested:ty; $count:expr];
        )*
    ) => {
        $(
        #[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
        #[repr(C)]
        $(#[$outer])*
        pub struct $type_name([$nested; $count]);

        impl BitsArray<$nested, $count> for $type_name {
            fn new(array: [$nested; $count]) -> Self {
                Self(array)
            }

            fn array(&self) -> &[$nested; $count] {
                &self.0
            }

            fn mut_array(&mut self) -> &mut[$nested; $count] {
                &mut self.0
            }
        }

        impl $type_name {
            pub const fn const_new(array: [$nested; $count]) -> Self {
                Self(array)
            }

            /// Const form of `&`.
            pub const fn const_bitand(self, rhs: Self) -> Self {
                seq!(I in 0..$count {
                    return Self([#(self.0[I].const_bitand(rhs.0[I]),)*])
                });
            }

            /// Const form of `|`.
            pub const fn const_bitor(self, rhs: Self) -> Self {
                seq!(I in 0..$count {
                    return Self([#(self.0[I].const_bitor(rhs.0[I]),)*])
                });
            }

            /// Const form of `^`.
            pub const fn const_bitxor(self, rhs: Self) -> Self {
                seq!(I in 0..$count {
                    return Self([#(self.0[I].const_bitxor(rhs.0[I]),)*])
                });
            }

            /// Const form of `!`.
            pub const fn const_not(self) -> Self {
                self.const_bitxor(Self::ONES)
            }
        }

        /// Implementation of Bits for an array of Bits.
        impl Bits for $type_name {
            const CAPACITY: i32 = $count * <$nested>::CAPACITY;
            const ZERO: Self = Self([<$nested>::ZERO; $count]);
            const ONES: Self = Self([<$nested>::ONES; $count]);
            fn singleton(value: i32) -> Self {
                Self::check(value);
                let i = value / <$nested>::CAPACITY;
                let v = value % <$nested>::CAPACITY;
                let mut answer = Self::ZERO;
                unsafe {
                    // Safe because we've just checked the value.
                    *answer.0.get_unchecked_mut(i as usize) = <$nested>::singleton(v);
                }
                answer
            }
            fn len(self) -> i32 {
                self.0.iter().map(|b| b.len()).sum()
            }
            fn smallest_bit(self) -> Option<Self> {
                let mut answer = Self::ZERO;
                for i in 0..$count {
                    unsafe {
                        // Safe because $count is the size of the arrays.
                        if *self.0.get_unchecked(i) != <$nested>::ZERO {
                            *answer.0.get_unchecked_mut(i) =
                                self.0.get_unchecked(i).smallest_bit().unwrap();
                            return Some(answer);
                        }
                    }
                }
                None
            }
            fn bit_at(self, mut i: i32) -> Option<Self> {
                for j in 0..$count {
                    unsafe {
                        // Safe because $count is the size of the arrays.
                        let bits = *self.0.get_unchecked(j);
                        let len = bits.len();
                        if i < len {
                            let mut answer = Self::ZERO;
                            *answer.0.get_unchecked_mut(j) = bits.bit_at(i)?;
                            return Some(answer);
                        }
                        i -= len;
                    }
                }
                None
            }
            fn smallest_value(self) -> Option<i32> {
                let mut offset = 0i32;
                for i in 0..$count {
                    unsafe {
                        // Safe because $count is the size of the array.
                        if *self.0.get_unchecked(i) != <$nested>::ZERO {
                            let answer = offset + self.0.get_unchecked(i).smallest_value().unwrap();
                            return Some(answer);
                        }
                    }
                    offset += <$nested>::CAPACITY;
                }
                None
            }
            fn insert(&mut self, value: i32) -> bool {
                Self::check(value);
                let i = value / <$nested>::CAPACITY;
                let v = value % <$nested>::CAPACITY;
                unsafe {
                    // Safe because we've just checked the value.
                    self.0.get_unchecked_mut(i as usize).insert(v)
                }
            }
            fn remove(&mut self, value: i32) -> bool {
                Self::check(value);
                let i = value / <$nested>::CAPACITY;
                let v = value % <$nested>::CAPACITY;
                unsafe {
                    // Safe because we've just checked the value.
                    self.0.get_unchecked_mut(i as usize).remove(v)
                }
            }
        }

        impl<'a> BitsIterable for &'a $type_name {
            type Item = $type_name;
            type BitIterator = ArrayBitIter<'a, $type_name, $nested, $count>;
            type ValueIterator = ArrayValueIter<'a, $type_name, $nested, $count>;

            fn bit_iter(self) -> Self::BitIterator {
                ArrayBitIter::new(self)
            }
            fn value_iter(self) -> Self::ValueIterator {
                ArrayValueIter::new(self)
            }
        }

        impl BitAnd for $type_name {
            type Output = Self;
            fn bitand(mut self, rhs: Self) -> Self {
                self &= rhs;
                self
            }
        }
        impl BitAndAssign for $type_name {
            fn bitand_assign(&mut self, rhs: Self) {
                for i in 0..$count {
                    unsafe {
                        // Safe because $count is the size of the arrays.
                        *self.0.get_unchecked_mut(i) &= *rhs.0.get_unchecked(i);
                    }
                }
            }
        }
        impl BitOr for $type_name {
            type Output = Self;
            fn bitor(mut self, rhs: Self) -> Self {
                self |= rhs;
                self
            }
        }
        impl BitOrAssign for $type_name {
            fn bitor_assign(&mut self, rhs: Self) {
                for i in 0..$count {
                    unsafe {
                        // Safe because $count is the size of the arrays.
                        *self.0.get_unchecked_mut(i) |= *rhs.0.get_unchecked(i);
                    }
                }
            }
        }
        impl BitXor for $type_name {
            type Output = Self;
            fn bitxor(mut self, rhs: Self) -> Self {
                self ^= rhs;
                self
            }
        }
        impl BitXorAssign for $type_name {
            fn bitxor_assign(&mut self, rhs: Self) {
                for i in 0..$count {
                    unsafe {
                        // Safe because $count is the size of the arrays.
                        *self.0.get_unchecked_mut(i) ^= *rhs.0.get_unchecked(i);
                    }
                }
            }
        }
        impl Not for $type_name {
            type Output = Self;
            fn not(self) -> Self {
                self ^ Self::ONES
            }
        }
    )*
    };
}

define_bits_array_types! {
    /// An 81-bit set, as an array of 3 27-bit sets.
    Bits3x27: [Bits27; 3];

    /// A 729-bit set, as an array of 9 arrays of 3 27-bit sets.
    Bits9x3x27: [Bits3x27; 9];
}

/// Iterates through the bits of a `Bits` instance, by returning a separate
/// single-bit `Bits` instance for each `1` bit.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ArrayBitIter<'a, T, U, const N: usize>
where
  T: Bits + BitsArray<U, N>,
  U: Bits,
  &'a U: BitsIterable<Item = U>,
{
  bits: &'a T,
  nested: <&'a U as BitsIterable>::BitIterator,
  index: usize,
}

impl<'a, T, U, const N: usize> ArrayBitIter<'a, T, U, N>
where
  T: Bits + BitsArray<U, N>,
  U: Bits,
  &'a U: BitsIterable<Item = U>,
{
  fn new(bits: &'a T) -> Self {
    Self {
      bits,
      nested: bits.array()[0].bit_iter(),
      index: 0,
    }
  }
}

impl<'a, T, U, const N: usize> Iterator for ArrayBitIter<'a, T, U, N>
where
  T: Bits + BitsArray<U, N>,
  U: Bits,
  &'a U: BitsIterable<Item = U>,
{
  type Item = T;
  fn next(&mut self) -> Option<Self::Item> {
    while self.index < N {
      match self.nested.next() {
        None => {
          self.index += 1;
          if self.index >= N {
            break;
          }
          self.nested = unsafe {
            // Safe because index is in 0..N.
            self.bits.array().get_unchecked(self.index).bit_iter()
          };
        }
        Some(bit) => {
          let mut answer = [U::ZERO; N];
          unsafe {
            // Safe because self.index is always in 0..N here.
            *answer.get_unchecked_mut(self.index) = bit;
          }
          return Some(T::new(answer));
        }
      }
    }
    None
  }
}

/// Iterates through the values corresponding to the bits of a `Bits` instance,
/// by returning the index of each `1` bit.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ArrayValueIter<'a, T, U: Bits, const N: usize>
where
  T: Bits + BitsArray<U, N>,
  &'a U: BitsIterable,
{
  bits: &'a T,
  nested: <&'a U as BitsIterable>::ValueIterator,
  index: usize,
}

impl<'a, T, U, const N: usize> ArrayValueIter<'a, T, U, N>
where
  T: Bits + BitsArray<U, N>,
  U: Bits,
  &'a U: BitsIterable,
{
  fn new(bits: &'a T) -> Self {
    Self {
      bits,
      nested: bits.array()[0].value_iter(),
      index: 0,
    }
  }
}

impl<'a, T, U, const N: usize> Iterator for ArrayValueIter<'a, T, U, N>
where
  T: Bits + BitsArray<U, N>,
  U: Bits,
  &'a U: BitsIterable,
{
  type Item = i32;
  fn next(&mut self) -> Option<i32> {
    while self.index < N {
      match self.nested.next() {
        None => {
          self.index += 1;
          if self.index >= N {
            break;
          }
          self.nested = unsafe {
            // Safe because index is in 0..N.
            self.bits.array().get_unchecked(self.index).value_iter()
          };
        }
        Some(value) => return Some(self.index as i32 * U::CAPACITY + value),
      }
    }
    None
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use paste::paste;

  macro_rules! simple_bits_test {
    ($type_name:ty, $capacity:expr) => {
      paste! {
          #[test]
          fn [<bits_ops_ $type_name:snake>]() {
              assert_eq!($capacity, <$type_name>::CAPACITY);
              assert_eq!(<$type_name>::ZERO, !<$type_name>::ONES);
              assert_eq!(!<$type_name>::ZERO, <$type_name>::ONES);

              let mut bits = <$type_name>::ZERO;
              assert_eq!(None, bits.smallest_bit());
              assert_eq!(None, bits.smallest_value());

              bits.insert(1);
              bits.insert(2);

              assert_eq!(1, bits.smallest_value().unwrap());
              assert_eq!(2, bits.len());

              let values: Vec<_> = bits.value_iter().collect();
              assert_eq!([1, 2], values[..]);
              assert_eq!(1, bits.value_at(0).unwrap());
              assert_eq!(2, bits.value_at(1).unwrap());
              assert_eq!(None, bits.bit_at(2));

              assert!(bits.insert(0));
              assert!(!bits.insert(2));
              let values: Vec<_> = bits.value_iter().collect();
              assert_eq!([0, 1, 2], values[..]);
              assert_eq!(2, bits.value_at(2).unwrap());
              assert_eq!(None, bits.value_at(3));

              assert!(bits.remove(2));
              assert!(!bits.remove(2));
              let values: Vec<_> = bits.value_iter().collect();
              assert_eq!([0, 1], values[..]);
              assert_eq!(0, bits.value_at(0).unwrap());
              assert_eq!(1, bits.value_at(1).unwrap());
              assert_eq!(None, bits.bit_at(2));
          }

          #[test]
          fn [<full_range_ $type_name:snake>]() {
              let mut over = <$type_name>::ONES;
              let mut under = <$type_name>::ZERO;
              for i in 0..$capacity {
                  assert_eq!(i, under.len());
                  assert_eq!($capacity - i, over.len());
                  let on = <$type_name>::singleton(i);
                  assert_eq!(1, on.len());
                  assert_eq!(on, over.smallest_bit().unwrap());
                  assert_eq!(0, (under & on).len());
                  assert!(!under.contains(i));
                  assert_eq!(1, (over & on).len());
                  assert!(over.contains(i));
                  assert_eq!(None, under.bit_at(i));
                  under |= on;
                  assert_eq!(on, under.bit_at(i).unwrap());
                  over ^= on;
              }
              assert_eq!(<$type_name>::ZERO, over);
              assert!(over.is_empty());
              assert_eq!(<$type_name>::ONES, under);
              assert!(!under.is_empty());
          }

          #[test]
          #[should_panic(expected = "out of bounds")]
          fn [<check_ $type_name:snake>]() {
              <$type_name>::check($capacity + 1);
          }

          #[test]
          #[should_panic(expected = "out of bounds")]
          fn [<insert_ $type_name:snake>]() {
              let mut bits = <$type_name>::ZERO;
              bits.insert($capacity);
          }

          #[test]
          #[should_panic(expected = "out of bounds")]
          fn [<remove_ $type_name:snake>]() {
              let mut bits = <$type_name>::ONES;
              bits.remove($capacity);
          }
      }
    };
  }

  simple_bits_test!(u8, 8);
  simple_bits_test!(u16, 16);
  simple_bits_test!(u32, 32);
  simple_bits_test!(Bits3, 3);
  simple_bits_test!(Bits9, 9);
  simple_bits_test!(Bits27, 27);
  simple_bits_test!(Bits3x27, 81);
  simple_bits_test!(Bits9x3x27, 729);

  #[test]
  fn bits3x27_parts() {
    let mut bits = Bits3x27::ONES;
    for band in &mut bits.0 {
      assert_eq!(*band, Bits27::ONES);
      *band = Bits27::ZERO;
    }
    assert_eq!(bits, Bits3x27::ZERO);
  }

  #[test]
  fn sizes() {
    use std::mem::size_of;
    assert_eq!(size_of::<Bits3x27>(), 12);
    assert_eq!(size_of::<Bits9x3x27>(), 108);
  }

  #[test]
  fn bits3_9_27() {
    let parts = Bits9::from_backing_int(0o174).to_bits3s();
    assert_eq!([Bits3(4), Bits3(7), Bits3(1)], parts[..]);

    let parts = Bits27::from_backing_int(0o_174_345_202).to_bits9s();
    assert_eq!([Bits9(0o202), Bits9(0o345), Bits9(0o174)], parts[..]);
  }
}
