use chrono::NaiveDate;
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use luke_doku::{date::LogicalDate, gen::*};

fn criterion_benchmark(c: &mut Criterion) {
  let date = NaiveDate::from_ymd_opt(1961, 9, 20).unwrap();
  let ds = daily_solution(&LogicalDate::from(date));
  c.bench_function("puzzles 30", |b| b.iter(|| gen_puzzles(&ds, black_box(30))));
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);

/// Generates N puzzles for the given day.
fn gen_puzzles(ds: &DailySolution, count: i32) -> () {
  for i in 1..=count {
    ds.gen(i);
  }
}
