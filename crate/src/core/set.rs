//! Defines the Set trait, for implementing fixed-capacity sets.

use super::bits::{Bits, BitsIterable};

/// A set of items with a fixed universe of values.
pub trait Set<'a>
where
  Self: Sized,
  Self::Bits: 'a,
  &'a Self::Bits: BitsIterable,
{
  /// The type of the elements that this set may contain.
  type Item: Copy + Eq;
  /// The type of the Bits object that backs this set.
  type Bits: Bits;

  /// Exposes the Bits object that backs this set.
  fn bits(&self) -> &Self::Bits;

  /// Exposes the Bits object that backs this set, for mutation.
  fn mut_bits(&mut self) -> &mut Self::Bits;

  /// Converts an item to a Bits value, an integer in 0..Self::Bits::CAPACITY.
  fn to_bits_value(&self, item: Self::Item) -> i32;

  /// Converts a Bits value to an item.
  fn from_bits_value(&self, value: i32) -> Self::Item;

  /// Tells whether this set is empty.
  fn is_empty(&self) -> bool {
    self.bits().is_empty()
  }

  /// How many items are in this set.
  fn len(&self) -> i32 {
    self.bits().len()
  }

  /// The smallest item, or None if empty.
  fn smallest_item(&self) -> Option<Self::Item> {
    self
      .bits()
      .smallest_value()
      .map(|value| self.from_bits_value(value))
  }

  /// The item at the given index, or None if the index is out of bounds.
  fn item_at(&self, n: i32) -> Option<Self::Item> {
    self
      .bits()
      .value_at(n)
      .map(|value| self.from_bits_value(value))
  }

  /// Whether the given item is in this set.
  fn contains(&self, item: Self::Item) -> bool {
    self.bits().contains(self.to_bits_value(item))
  }

  /// Adds an item to the set.  Tells whether it was actually added, meaning
  /// it was previously absent from the set.
  fn insert(&mut self, item: Self::Item) -> bool {
    let value = self.to_bits_value(item);
    self.mut_bits().insert(value)
  }

  /// Removes an item from the set.  Tells whether it was actually removed,
  /// meaning it was previously present in the set.
  fn remove(&mut self, item: Self::Item) -> bool {
    let value = self.to_bits_value(item);
    self.mut_bits().remove(value)
  }

  /// Returns an iterator over this set's items.
  fn iter(&'a self) -> SetIter<'a, Self> {
    SetIter {
      set: self,
      iter: self.bits().value_iter(),
    }
  }
}

/// Lets you add implementations for the bit operators to a Set struct.
#[macro_export]
macro_rules! define_set_operators {
  ($type:ty) => {
    impl std::ops::BitAnd for $type {
      type Output = Self;
      fn bitand(mut self, rhs: Self) -> Self {
        self &= rhs;
        self
      }
    }
    impl std::ops::BitAndAssign for $type {
      fn bitand_assign(&mut self, rhs: Self) {
        *self.mut_bits() &= *rhs.bits()
      }
    }
    impl std::ops::BitOr for $type {
      type Output = Self;
      fn bitor(mut self, rhs: Self) -> Self {
        self |= rhs;
        self
      }
    }
    impl std::ops::BitOrAssign for $type {
      fn bitor_assign(&mut self, rhs: Self) {
        *self.mut_bits() |= *rhs.bits()
      }
    }
    impl std::ops::BitXor for $type {
      type Output = Self;
      fn bitxor(mut self, rhs: Self) -> Self {
        self ^= rhs;
        self
      }
    }
    impl std::ops::BitXorAssign for $type {
      fn bitxor_assign(&mut self, rhs: Self) {
        *self.mut_bits() ^= *rhs.bits()
      }
    }
    impl std::ops::Not for $type {
      type Output = Self;
      fn not(mut self) -> Self {
        *self.mut_bits() ^= <$type as Set>::Bits::ONES;
        self
      }
    }
    // Note we can't implement this for Bits, because of u8/u16/u32.
    impl std::ops::Sub for $type {
      type Output = Self;
      fn sub(mut self, rhs: Self) -> Self {
        self -= rhs;
        self
      }
    }
    // Note we can't implement this for Bits, because of u8/u16/u32.
    impl std::ops::SubAssign for $type {
      fn sub_assign(&mut self, rhs: Self) {
        *self.mut_bits() &= !*rhs.bits();
      }
    }
    // Note we can't implement this for Bits, because of u8/u16/u32.
    impl PartialOrd for $type {
      fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        if *self == *other {
          Some(std::cmp::Ordering::Equal)
        } else {
          let both = *self | *other;
          if both == *self {
            Some(std::cmp::Ordering::Greater)
          } else if both == *other {
            Some(std::cmp::Ordering::Less)
          } else {
            None
          }
        }
      }
    }
  };
}

#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub struct SetIter<'a, S: Set<'a>>
where
  &'a S::Bits: BitsIterable,
{
  set: &'a S,
  iter: <&'a S::Bits as BitsIterable>::ValueIterator,
}

impl<'a, S: Set<'a>> Iterator for SetIter<'a, S>
where
  &'a S::Bits: BitsIterable,
{
  type Item = S::Item;
  fn next(&mut self) -> Option<S::Item> {
    match self.iter.next() {
      None => None,
      Some(value) => Some(self.set.from_bits_value(value)),
    }
  }
}

/// A set of integers, backed by a Bits object.  The integers are in the range
/// `0..(1 << Self::Bits::CAPACITY)`.
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub struct IntSet<T: Bits + BitsIterable>(pub T);
impl<'a, T: Bits + BitsIterable + 'a> Set<'a> for IntSet<T>
where
  &'a T: BitsIterable,
{
  type Item = i32;
  type Bits = T;

  fn bits(&self) -> &Self::Bits {
    &self.0
  }

  fn mut_bits(&mut self) -> &mut Self::Bits {
    &mut self.0
  }

  fn to_bits_value(&self, item: Self::Item) -> i32 {
    item
  }
  fn from_bits_value(&self, value: i32) -> Self::Item {
    value
  }
}

define_set_operators!(IntSet<u32>);
define_set_operators!(IntSet<u16>);
define_set_operators!(IntSet<u8>);

impl<T: Bits + BitsIterable + 'static> Default for IntSet<T>
where
  &'static T: BitsIterable,
{
  fn default() -> Self {
    Self(T::ZERO)
  }
}
