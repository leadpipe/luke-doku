use std::{collections::HashMap, env};

use chrono::{Duration, NaiveDate};
use luke_doku::{core::SolvedGrid, date::LogicalDate, gen::*, permute::GridPermutation};

/// Finds a pair of days whose daily solutions belong to the same Sudoku orbit.
/// Even though there are 5B+ distinct orbits, you reach a 50% likelihood of
/// finding a match after around sqrt(5B), which is around 70K.  (This is the
/// "birthday paradox.")
fn main() {
  let args: Vec<String> = env::args().collect();
  assert_eq!(2, args.len(), "usage: {} <starting-date>", args[0]);
  let start = args[1].parse::<NaiveDate>().unwrap_or_else(|_| {
    panic!(
      "starting-date (`{}`) must be formatted as %Y-%m-%d",
      args[1]
    )
  });
  let (a, b) = find_shared_orbit(start);
  println!(
    "{}, {}: {} and {} days from start, {} days apart",
    a,
    b,
    (a - start).num_days(),
    (b - start).num_days(),
    (b - a).num_days()
  );
}

/// Finds a pair of days whose daily solutions are in the same orbit.
fn find_shared_orbit(mut date: NaiveDate) -> (NaiveDate, NaiveDate) {
  let mut minima: HashMap<SolvedGrid, NaiveDate> = HashMap::new();
  loop {
    let ds = daily_solution(&LogicalDate::from(date));
    let (_, min, _) = GridPermutation::minimizing(&ds.solution);
    if let Some(&prev_date) = minima.get(&min) {
      return (prev_date, date);
    }
    minima.insert(min, LogicalDate::into(ds.date));
    date += Duration::days(1);
  }
}
