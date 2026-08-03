use chrono::{Days, NaiveDate};
use clap::Parser;
use std::collections::{BTreeMap, HashMap};

use luke_doku::date::LogicalDate;
use luke_doku::deduce::Fact;
use luke_doku::evaluate::{evaluate_with_observer, Complexity};
use luke_doku::gen::daily_solution;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
  /// The starting date, e.g., 2024-01-01
  #[arg(short, long)]
  start_date: String,

  /// Number of puzzles to generate per day
  #[arg(short, long, default_value_t = 10)]
  puzzles_per_day: i32,

  /// Number of days to generate for
  #[arg(short, long, default_value_t = 100)]
  days: i32,
}

fn fact_type_name(fact: &Fact) -> &'static str {
  match fact {
    Fact::SingleLoc { .. } => "SingleLoc",
    Fact::SingleNum { .. } => "SingleNum",
    Fact::SpeculativeAssignment { .. } => "SpeculativeAssignment",
    Fact::NoLoc { .. } => "NoLoc",
    Fact::NoNum { .. } => "NoNum",
    Fact::Conflict { .. } => "Conflict",
    Fact::ConflictLoc { .. } => "ConflictLoc",
    Fact::Overlap { .. } => "Overlap",
    Fact::Subset { .. } => "Subset",
    Fact::Implication { .. } => "Implication",
    Fact::Fish { .. } => "Fish",
    Fact::EmptyRectangle { .. } => "EmptyRectangle",
    Fact::Skyscraper { .. } => "Skyscraper",
    Fact::TwoStringKite { .. } => "TwoStringKite",
  }
}

fn count_interesting_facts(fact: &Fact, counts: &mut HashMap<&'static str, usize>) {
  match fact {
    Fact::SingleLoc { .. } | Fact::SingleNum { .. } | Fact::SpeculativeAssignment { .. } => {}
    Fact::Implication {
      antecedents,
      consequent,
    } => {
      for ant in antecedents {
        count_interesting_facts(ant, counts);
      }
      count_interesting_facts(consequent, counts);
    }
    _ => {
      *counts.entry(fact_type_name(fact)).or_insert(0) += 1;
    }
  }
}

fn main() {
  let args = Args::parse();

  let start_date = args
    .start_date
    .parse::<NaiveDate>()
    .expect("Invalid start date format. Use YYYY-MM-DD");

  let mut total_puzzles = 0;

  let mut solutions_distribution: BTreeMap<i32, usize> = BTreeMap::new();
  let mut complexity_distribution: BTreeMap<Complexity, usize> = BTreeMap::new();
  let mut fact_histograms_moderate: BTreeMap<&'static str, BTreeMap<usize, usize>> =
    BTreeMap::new();
  let mut fact_histograms_complex: BTreeMap<&'static str, BTreeMap<usize, usize>> = BTreeMap::new();

  let mut all_complexities: Vec<f64> = Vec::new();
  let mut day_means: Vec<f64> = Vec::new();

  println!(
    "Generating stats for {} days, {} puzzles per day starting on {}...",
    args.days, args.puzzles_per_day, start_date
  );

  for day_offset in 0..args.days {
    let current_date = start_date
      .checked_add_days(Days::new(day_offset as u64))
      .unwrap();
    let logical_date = LogicalDate::from(current_date);
    let ds = daily_solution(&logical_date);

    let mut day_complexities = Vec::new();

    for i in 1..=args.puzzles_per_day {
      let puzzle = ds.generate(i).unwrap();
      total_puzzles += 1;

      let solutions_count = puzzle.solutions_count();
      *solutions_distribution.entry(solutions_count).or_insert(0) += 1;

      let mut applied_facts = Vec::new();
      let rating = evaluate_with_observer(&puzzle, |fact| {
        applied_facts.push(fact.clone());
      });
      *complexity_distribution
        .entry(rating.complexity)
        .or_insert(0) += 1;

      let comp_score = rating.complexity as i32 as f64;
      day_complexities.push(comp_score);
      all_complexities.push(comp_score);

      if rating.complexity == Complexity::Moderate {
        let mut fact_counts = HashMap::new();
        for fact in &applied_facts {
          count_interesting_facts(fact, &mut fact_counts);
        }
        for (fact_type, count) in fact_counts {
          *fact_histograms_moderate
            .entry(fact_type)
            .or_default()
            .entry(count)
            .or_insert(0) += 1;
        }
      } else if rating.complexity == Complexity::Complex {
        let mut fact_counts = HashMap::new();
        for fact in &applied_facts {
          count_interesting_facts(fact, &mut fact_counts);
        }
        for (fact_type, count) in fact_counts {
          *fact_histograms_complex
            .entry(fact_type)
            .or_default()
            .entry(count)
            .or_insert(0) += 1;
        }
      }
    }

    let day_mean = day_complexities.iter().sum::<f64>() / day_complexities.len() as f64;
    day_means.push(day_mean);
  }

  println!("\nTotal Puzzles Evaluated: {}", total_puzzles);

  println!("\nNumber of Solutions Distribution:");
  for (sols, count) in &solutions_distribution {
    println!(
      "  {} solutions: {} ({:.1}%)",
      sols,
      count,
      (*count as f64 / total_puzzles as f64) * 100.0
    );
  }

  println!("\nComplexity Distribution:");
  for (comp, count) in &complexity_distribution {
    println!(
      "  {:?}: {} ({:.1}%)",
      comp,
      count,
      (*count as f64 / total_puzzles as f64) * 100.0
    );
  }

  let print_fact_histogram =
    |title: &str,
     total_puzzles_in_bucket: usize,
     histograms: &BTreeMap<&'static str, BTreeMap<usize, usize>>| {
      println!("\n{}", title);
      if total_puzzles_in_bucket == 0 {
        println!("  (No puzzles in this category)");
        return;
      }
      for (fact, counts) in histograms {
        println!("  {}:", fact);
        
        let mut total_with_fact = 0;
        let mut max_count = 0;
        for (&appearances, &num_puzzles) in counts {
            total_with_fact += num_puzzles;
            if appearances > max_count {
                max_count = appearances;
            }
        }
        
        let count_0 = total_puzzles_in_bucket - total_with_fact;
        let bucket_size = if max_count <= 15 {
            1
        } else if max_count <= 50 {
            5
        } else if max_count <= 200 {
            10
        } else if max_count <= 1000 {
            50
        } else {
            100
        };

        let mut bucketed = BTreeMap::new();
        if count_0 > 0 {
            bucketed.insert(0, count_0);
        }
        for (&appearances, &num_puzzles) in counts {
            let bucket = (appearances / bucket_size) * bucket_size;
            *bucketed.entry(bucket).or_insert(0) += num_puzzles;
        }

        let max_puzzles = bucketed.values().copied().max().unwrap_or(0);
        let max_bar_width = 30;

        for (bucket, num_puzzles) in bucketed {
            let bar_len = if max_puzzles > 0 {
                (num_puzzles as f64 / max_puzzles as f64 * max_bar_width as f64).round() as usize
            } else {
                0
            };
            let bar = "∎".repeat(bar_len);
            
            if bucket_size == 1 {
                println!("    {:>3} appearances: {:<30} ({} puzzles)", bucket, bar, num_puzzles);
            } else {
                println!("    {:>3}-{:<3} appearances: {:<30} ({} puzzles)", bucket, bucket + bucket_size - 1, bar, num_puzzles);
            }
        }
      }
    };

  let moderate_count = complexity_distribution
    .get(&Complexity::Moderate)
    .copied()
    .unwrap_or(0);
  print_fact_histogram(
    "Fact Type Histograms (Moderate Puzzles):",
    moderate_count,
    &fact_histograms_moderate,
  );

  let complex_count = complexity_distribution
    .get(&Complexity::Complex)
    .copied()
    .unwrap_or(0);
  print_fact_histogram(
    "Fact Type Histograms (Complex Puzzles):",
    complex_count,
    &fact_histograms_complex,
  );

  // ANOVA calculation
  let overall_mean = all_complexities.iter().sum::<f64>() / all_complexities.len() as f64;

  let mut sst = 0.0;
  for &comp in &all_complexities {
    sst += (comp - overall_mean).powi(2);
  }

  let mut ssb = 0.0;
  for &day_mean in &day_means {
    ssb += args.puzzles_per_day as f64 * (day_mean - overall_mean).powi(2);
  }

  let ssw = sst - ssb; // Within-group variance

  let r_squared = if sst > 0.0 { ssb / sst } else { 0.0 };

  println!("\nIntra-day Similarity Analysis (1-way ANOVA on Complexity):");
  println!("  Total Variance (SST): {:.2}", sst);
  println!("  Between-Day Variance (SSB): {:.2}", ssb);
  println!("  Within-Day Variance (SSW): {:.2}", ssw);
  println!(
    "  Variance explained by Day (R^2): {:.2}%",
    r_squared * 100.0
  );
  if r_squared > 0.1 {
    println!("  (Conclusion: Puzzles generated on the same day are significantly more similar in complexity to each other than to puzzles from other days.)");
  } else {
    println!("  (Conclusion: The day a puzzle is generated does not have a large impact on its complexity.)");
  }
}
