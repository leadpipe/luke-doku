use rand_distr::{Distribution, Normal};
use static_assertions::const_assert;
use std::mem::size_of;
use wasm_bindgen::prelude::wasm_bindgen;

/// The pseudo-random number generator we use.
pub type Random = rand_pcg::Pcg64Mcg;

// Expose some key traits for simplicity.
pub use rand::prelude::SliceRandom;
pub use rand::Rng;

/// Constructs a new Random from a given string seed.
pub fn new_random(seed: &str) -> Random {
  rand_seeder::Seeder::from(seed).into_rng()
}

/// The alias for Random we expose to JS.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(C, align(16))]
#[wasm_bindgen]
pub struct JsRandom {guts: u128}
const_assert!(size_of::<Random>() == size_of::<JsRandom>());

impl JsRandom {
  /// Externalizes a Random by cloning its bits.
  pub fn from_rng(rng: &Random) -> Self {
    unsafe {
      let p: *const Random = rng;
      let guts = *(p as *const u128);
      Self{guts}
    }
  }

  /// Treats an externalized random as a random.
  pub fn rng(&mut self) -> &mut Random {
    unsafe {
      let p: *mut Self = self;
      &mut *(p as *mut Random)
    }
  }
}

#[wasm_bindgen]
impl JsRandom {
  /// Makes a new RNG from a given string seed.
  #[wasm_bindgen(constructor)]
  pub fn new(seed: &str) -> Self {
    Self::from_rng(&mut new_random(seed))
  }

  /// Generates the next floating-point number in the half-open interval [0,
  /// 1).
  pub fn next(&mut self) -> f64 {
    self.rng().random()
  }

  /// Returns true with the given probability.
  pub fn choice(&mut self, p: f64) -> bool {
    self.rng().random_bool(p)
  }

  /// Generates a floating-point number in the half-open interval [a, b).
  pub fn range(&mut self, a: f64, b: f64) -> f64 {
    self.next() * (b - a) + a
  }

  /// Generates a normally distributed floating-point number with the given
  /// mean and standard deviation.
  pub fn normal(&mut self, mean: f64, std_dev: f64) -> f64 {
    Normal::new(mean, std_dev).unwrap().sample(self.rng())
  }
}
