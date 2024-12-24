use chrono::{Duration, NaiveDate};
use luke_doku::{core::SolvedGrid, date::LogicalDate, gen::*, permute::GridPermutation};
use std::{env, num::NonZeroUsize};

/// Finds the days whose daily solutions belongs to the smallest and largest
/// Sudoku orbits in a given range of days.
fn main() {
  let args: Vec<String> = env::args().collect();
  assert_eq!(
    3,
    args.len(),
    "usage: {} <starting-date> <number-of-days>",
    args[0]
  );
  let start = args[1].parse::<NaiveDate>().unwrap_or_else(|_| {
    panic!(
      "starting-date (`{}`) must be formatted as %Y-%m-%d",
      args[1]
    )
  });
  let count = args[2]
    .parse::<NonZeroUsize>()
    .unwrap_or_else(|_| panic!("number-of-days (`{}`) must be a positive integer", args[2]));
  let ((min, min_date), (max, max_date)) = find_orbit_range(start, usize::from(count));
  println!("Smallest minimum found on {}:\n{:?}", min_date, min);
  println!("Largest minimum found on {}:\n{:?}", max_date, max);
}

/// Finds smallest and largest minimal Sudoku solutions among the daily
/// solutions for the days starting at `date` and continuing for `count` days.
fn find_orbit_range(
  mut date: NaiveDate,
  mut count: usize,
) -> ((SolvedGrid, NaiveDate), (SolvedGrid, NaiveDate)) {
  let mut smallest = None;
  let mut largest = None;
  while count > 0 {
    let ds = daily_solution(&LogicalDate::from(date));
    let (_, min, _) = GridPermutation::minimizing(&ds.solution);
    let mut replace = true;
    if let Some((prev_min, _)) = smallest {
      replace = min < prev_min;
    }
    if replace {
      smallest = Some((min, date));
    }
    replace = true;
    if let Some((prev_min, _)) = largest {
      replace = min > prev_min;
    }
    if replace {
      largest = Some((min, date));
    }
    date += Duration::days(1);
    count -= 1;
  }
  (smallest.unwrap(), largest.unwrap())
}
