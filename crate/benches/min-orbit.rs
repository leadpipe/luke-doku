use chrono::{Duration, NaiveDate};
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use luke_doku::{core::SolvedGrid, date::LogicalDate, gen::*, permute::GridPermutation};

fn criterion_benchmark(c: &mut Criterion) {
  let start = NaiveDate::from_ymd_opt(1961, 9, 20).unwrap();
  c.bench_function("min-orbit 20", |b| {
    b.iter(|| find_min_orbit(start, black_box(20)))
  });
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);

/// Finds smallest minimal Sudoku solution among the daily solutions for the
/// days starting at `date` and continuing for `count` days.
fn find_min_orbit(mut date: NaiveDate, mut count: usize) -> (SolvedGrid, NaiveDate) {
  let mut smallest = None;
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
    date += Duration::days(1);
    count -= 1;
  }
  smallest.unwrap()
}
