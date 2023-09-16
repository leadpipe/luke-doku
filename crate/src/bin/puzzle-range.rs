use chrono::NaiveDate;
use luke_doku::{date::LogicalDate, gen::*};
use std::{env, num::NonZeroI32};

/// Finds the puzzles with the smallest and largest number of clues among a
/// day's first N puzzles.
fn main() {
  let args: Vec<String> = env::args().collect();
  assert_eq!(
    3,
    args.len(),
    "usage: {} <date> <number-of-puzzles>",
    args[0]
  );
  let date = args[1]
    .parse::<NaiveDate>()
    .unwrap_or_else(|_| panic!("date (`{}`) must be formatted as %Y-%m-%d", args[1]));
  let count = args[2].parse::<NonZeroI32>().unwrap_or_else(|_| {
    panic!(
      "number-of-puzzles (`{}`) must be a positive integer",
      args[2]
    )
  });
  let (min, max) = find_puzzle_range(date, i32::from(count));
  println!(
    "Smallest number of clues ({}):\n{:?}",
    min.puzzle.len(),
    min
  );
  println!("Largest number of clues ({}):\n{:?}", max.puzzle.len(), max);
}

/// Finds smallest and largest Sudokus by number of clues among the first
/// `count` puzzles for `date`.
fn find_puzzle_range(date: NaiveDate, count: i32) -> (PuzzleDesc, PuzzleDesc) {
  let ds = daily_solution(LogicalDate::from(date));
  let mut smallest = None;
  let mut largest = None;
  for i in 1..=count {
    let desc = ds.gen(i);
    let len = desc.puzzle.len();
    let mut replace = true;
    if let Some((prev_len, _)) = smallest {
      replace = len < prev_len;
    }
    if replace {
      smallest = Some((len, desc.clone()));
    }
    replace = true;
    if let Some((prev_len, _)) = largest {
      replace = len > prev_len;
    }
    if replace {
      largest = Some((len, desc));
    }
  }
  (smallest.unwrap().1, largest.unwrap().1)
}
