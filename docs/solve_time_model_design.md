# Machine Learning Solve Time Estimator Design

This document specifies the end-to-end architecture, machine learning specification, data pipeline, and user experience for estimating personalized puzzle solve times in Luke-doku.

---

## 1. Overview & Objectives

Luke-doku generates Sudoku puzzles across five complexity tiers: **Simple**, **Moderate**, **Complex**, **Expert**, and **Lunatic**. While the 5-star complexity rating indicates intrinsic logical difficulty, human solve times vary substantially depending on a player's individual speed, deduction preferences, and experience.

The objective of this feature is to provide a **personalized solve time estimate** for every puzzle (e.g., `★★★☆☆ Moderate • ~5 min`) learned directly from each player's local gameplay history.

### Key Tenets
1. **Purely Personalized:** The model learns the individual player's solve pace rather than a generic or global average.
2. **Zero-Backend & Privacy-Preserving:** Training and inference run entirely in the user's browser using WebAssembly (Rust) and Web Workers. No gameplay data or telemetry leaves the device.
3. **High-Performance Random Forest:** A lightweight, dependency-minimal Random Forest regressor implemented in Rust (`crate/`) and compiled to WASM delivers fast (<5 ms) client-side training and sub-millisecond inference.
4. **Explicit Cold-Start Lifecycle:** Time estimates remain hidden until the player completes a calibration set of 15 puzzles, after which personalized predictions unlock automatically.
5. **Skill-Adaptive Recency Window:** As players solve hundreds or thousands of puzzles, training operates on a sliding window of recent games to adapt to the player's evolving speed.

---

## 2. System Architecture

The solve time estimation system spans four key layers: the **Rust Core Engine**, **Web Worker Service**, **IndexedDB Storage**, and the **Lit-HTML UI**.

```mermaid
flowchart TD
    subgraph Frontend ["Lit-HTML Frontend (UI)"]
        PP["puzzles-page.ts<br/>(Cold-start banner & puzzle cards)"]
        PR["puzzle-rating.ts<br/>(Stars + Estimated Time)"]
        SP["solve-page.ts<br/>(Game completion trigger)"]
    end

    subgraph Worker ["Web Worker (puzzle-worker.ts)"]
        PS["puzzle-service.ts<br/>(Evaluate & Train Queues)"]
        PW["puzzle-worker.ts<br/>(Background execution)"]
    end

    subgraph RustWasm ["Rust Crate (WASM)"]
        EV["wasm.evaluate()<br/>(Feature Extraction)"]
        RF_T["wasm.train_model()<br/>(Random Forest Regressor)"]
        RF_P["wasm.predict_time()<br/>(Tree Ensemble Inference)"]
    end

    subgraph Storage ["IndexedDB (luke-doku)"]
        DB_P["'puzzles' store<br/>(History, elapsedMs, features)"]
        DB_M["'models' store<br/>(Serialized forest bytes, version)"]
    end

    SP -->|Game Completed| PS
    PS --> PW
    PW -->|Collect completed games (recent window)| DB_P
    PW -->|Train with (X, y)| RF_T
    RF_T -->|Serialized model| DB_M
    
    PP -->|Request rating & estimate| PS
    PW -->|Evaluate puzzle| EV
    EV -->|Feature vector| RF_P
    DB_M -.->|Load cached model| RF_P
    RF_P -->|estimatedTimeMs| PR
    PR --> PP
```

### Flow of Operations

1. **Evaluation & Feature Extraction:** When a puzzle is generated or viewed, `evaluate()` in the Rust crate analyzes the grid, deduces all logical steps, and extracts a structural feature vector $X \in \mathbb{R}^d$.
2. **Game Completion:** When the player completes a puzzle on `solve-page.ts`, the solve duration (`elapsedMs`) is recorded in IndexedDB.
3. **Background Training:** If $\ge 15$ valid completed games exist, the Web Worker selects an appropriate sample window (up to the most recent 300–500 games), invokes `train_model()` in Rust WASM, and persists the serialized decision trees to IndexedDB.
4. **Inference & UI Display:** For unstarted puzzles, the evaluator uses the trained model to predict `estimatedTimeMs`, which `<puzzle-rating>` displays on puzzle cards.

---

## 3. Feature Engineering & Extraction

Features are computed deterministically during the logical evaluation phase in `crate/src/evaluate/`. The feature vector $X$ captures puzzle topology, deduction requirements, and disproof metrics without relying on transient UI state.

```
+------------------------------------------------------------------------------------+
|                             Puzzle Feature Vector X (28-D)                         |
+------------------------------------+-----------------------------------------------+
| Category                           | Features Included                             |
+------------------------------------+-----------------------------------------------+
| 1. Grid & Clue Topology            | • Clue count (e.g., 22–38)                    |
|                                    | • Clue variance across rows, cols, blocks     |
|                                    | • Symmetry conformance ratio                  |
|                                    | • Solution count (1, 2, or 3 valid solutions) |
|                                    | • Initial open candidate count                |
+------------------------------------+-----------------------------------------------+
| 2. Elementary Deductions           | • SingleLoc count (Hidden singles)            |
|                                    | • SingleNum count (Naked singles)             |
|                                    | • Overlap count (Pointing / Claiming lines)   |
|                                    | • Total deduction steps to solve or stall     |
+------------------------------------+-----------------------------------------------+
| 3. Subset & Intersections          | • Naked Pairs count                           |
|                                    | • Hidden Pairs count                          |
|                                    | • Naked Triples / Quads count                 |
|                                    | • Hidden Triples / Quads count                |
+------------------------------------+-----------------------------------------------+
| 4. Advanced Single-Digit Facts     | • Basic Fish count (X-Wing, Swordfish, Jelly) |
|                                    | • Finned / Sashimi Fish count                 |
|                                    | • Skyscraper count                            |
|                                    | • 2-String Kite count                         |
|                                    | • Empty Rectangle count                       |
+------------------------------------+-----------------------------------------------+
| 5. Trail / Disproof Complexity     | • Evaluated Complexity tier (1 to 5)          |
|                                    | • Sequential disproofs required (series count)|
|                                    | • Disproof availability (distinct productive  |
|                                    |   disproofs available at stall: 1 vs 30)      |
|                                    | • Max disproof productivity (elimination yield)|
|                                    | • Average disproof productivity               |
|                                    | • Search depth to reach disproof contradiction|
|                                    | • Nested disproof depth (for Lunatic)         |
|                                    | • Disproof candidate search space size        |
+------------------------------------+-----------------------------------------------+
```

### 3.1 Handling Multiple Solutions
Approximately **10% of Luke-doku puzzles have 2 or 3 solutions**, strictly constrained by Luke-doku's generator such that **no more than 7 cells may differ among the solutions**. Empirically, these improper puzzles are not inherently more complicated than unique-solution puzzles, and uniquely solvable puzzles can exhibit just as much ambiguous internal structure. The solution count (1, 2, or 3) is included in the feature vector simply as a topological property of the puzzle rather than an assumption of added difficulty.

### 3.2 Detailed Disproof Metrics
In Expert and Lunatic puzzles, solve times are heavily dominated by trail exploration. We extract two distinct dimensions of disproof complexity:
1. **Series Length (Sequential Disproofs):** How many disproofs must be performed in series (e.g. 1 isolated disproof vs. 3 chained disproofs) to unlock direct deductions.
2. **Ease of Discovery (Disproof Availability):** The number of valid, productive disproofs available at the stall point. A state with 30 distinct productive disproofs is quickly cracked by random trail exploration, whereas a "needle in a haystack" state with exactly 1 productive disproof requires exhaustive testing and consumes significantly more human time.
3. **Productivity Yield:** The maximum and mean number of candidates eliminated once a contradiction is found.

---

## 4. Machine Learning Specification: Rust Random Forest

### 4.1 Target Transformation

Human solve times are strictly positive and follow a right-skewed log-normal distribution. The regressor trains on log-transformed durations:

$$y_i = \ln(\text{elapsed\_ms}_i)$$

During inference, predictions are mapped back to milliseconds via exponentiation:

$$\widehat{\text{time}}_{\text{ms}} = \exp(\hat{y}) = \exp\left(\frac{1}{B} \sum_{b=1}^{B} T_b(X)\right)$$

This ensures predictions are strictly positive and prevents extreme high-end solve times from skewing the tree split criteria.

### 4.2 Algorithm Parameters

| Parameter | Default Value | Rationale |
| :--- | :--- | :--- |
| **Number of Trees ($B$)** | `30` | Sufficient ensemble variance reduction while keeping memory footprint under 50 KB. |
| **Max Depth ($D_{\text{max}}$)** | `5` | Prevents leaf overfitting on small sample sizes ($N \approx 15\text{--}100$). |
| **Min Samples per Leaf ($n_{\text{min}}$)** | `2` | Guarantees generalization on sparse difficulty subsets. |
| **Feature Subsampling ($m$)** | $\lfloor\sqrt{p}\rfloor \approx 5$ | Decorrelates individual trees in the ensemble. |
| **Bootstrap Sampling** | $N$ with replacement | Standard bagging for robust variance reduction. |
| **Split Criterion** | Mean Squared Error (MSE) | Maximizes variance reduction across partitions $S_L$ and $S_R$. |

The variance reduction criterion used during split selection is:

$$\Delta I = \text{Var}(S) - \frac{N_L}{N}\text{Var}(S_L) - \frac{N_R}{N}\text{Var}(S_R)$$

where $N = |S|$, $N_L = |S_L|$, and $N_R = |S_R|$.

### 4.3 Evaluation of Existing Rust ML Crates vs. In-Tree Implementation

Before writing a bespoke regressor, we evaluated existing Rust ML crates for suitability in a client-side WASM environment:

| Crate | Pros | Cons / Net Assessment |
| :--- | :--- | :--- |
| **`smartcore`** | Feature-rich random forest regressor; supports feature importance. | **Heavy dependencies** (`nalgebra`, BLAS bindings); noticeably balloons the WASM binary (+1–2 MB); can encounter build friction on `wasm32-unknown-unknown`. |
| **`linfa` / `linfa-trees`** | Clean modular architecture ("scikit-learn for Rust"). | Dependent on `ndarray`; the ensemble sub-crate is still in active flux and brings excess abstraction for a tabular decision tree regressor. |
| **Lightweight crates** (e.g. `decision-tree`) | Smaller surface area. | Often unmaintained, lack `serde` compatibility out of the box, or lack regression support (classification only). |
| **Tailored In-Tree Engine** (`crate/src/evaluate/forest.rs`) | **Zero external dependencies**; compiled size < 10 KB; 100% deterministic; perfect `wasm-bindgen` / `serde` integration; trivial to maintain and test. | Requires maintaining ~250 lines of idiomatic Rust. |

**Recommendation:** Implement the core Random Forest regressor in-tree under `crate/src/evaluate/forest.rs`. Its minimal footprint and zero external dependencies ensure fast compilation, small WASM download sizes, and deterministic execution.

### 4.4 Rust Data Structures

```rust
// crate/src/evaluate/forest.rs

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TreeNode {
  pub feature_index: usize,
  pub threshold: f32,
  pub left_child: Option<Box<TreeNode>>,
  pub right_child: Option<Box<TreeNode>>,
  pub leaf_value: Option<f32>, // ln(elapsed_ms) if leaf
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DecisionTree {
  pub root: TreeNode,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RandomForestModel {
  pub trees: Vec<DecisionTree>,
  pub training_sample_count: usize,
  pub model_version: u32,
}

impl RandomForestModel {
  pub fn train(x: &[Vec<f32>], y: &[f32], config: &ForestConfig) -> Self { ... }
  pub fn predict(&self, features: &[f32]) -> f64 {
    let avg_log_time: f32 = self.trees.iter()
      .map(|t| t.predict(features))
      .sum::<f32>() / (self.trees.len() as f32);
    (avg_log_time as f64).exp()
  }
}
```

---

## 5. Lifecycle: Cold-Start, Scaling & Data Management

The application operates in two distinct phases depending on how many valid puzzles the player has completed.

```
       +-----------------------------------------------------------+
       | Player completes games locally (stored in IndexedDB)      |
       +-----------------------------------------------------------+
                                     |
                                     v
                        [ Completed Games Count ]
                                     |
             +-----------------------+-----------------------+
             |                                               |
             v (< 15 games)                                  v (>= 15 games)
  +-------------------------------------+   +-------------------------------------+
  |          COLD-START PHASE           |   |            TRAINED PHASE            |
  | • Puzzle cards: stars only          |   | • Puzzle cards: stars + est. time   |
  | • Cold-start banner: progress shown |   | • Background model retraining       |
  |   (e.g., "Unlocks in 4 games")      |   | • Sliding recency window (300-500)  |
  | • Features cached in IndexedDB      |   | • Dynamic time formatting           |
  +-------------------------------------+   +-------------------------------------+
```

### 5.1 Phase 1: Cold-Start ($N < 15$)

Before 15 games are completed:
* **Puzzle Cards:** `<puzzle-rating>` renders complexity stars and category text only (e.g., `★★★☆☆ Moderate`). No time estimate or blank placeholder is shown on individual cards.
* **Progress Banner:** A subtle progress chip or banner appears on the [Puzzles Page](file:///Users/luke/code/luke-doku/www/src/app/puzzles-page.ts):
  > *"Personalized solve time estimates unlock in **4** games (11/15 completed)."*
* **Data Ingestion:** As each puzzle is solved, its feature vector $X$ and `elapsedMs` are saved in the `puzzles` IndexedDB object store so they are ready for instant training when the threshold is hit.

### 5.2 Phase 2: Trained State ($N \ge 15$)

Once the player completes their 15th valid puzzle:
1. **Trigger:** The Web Worker automatically launches `train_model()`.
2. **Model Persistence:** The trained forest is saved to the `models` store in IndexedDB.
3. **Banner Dismissal:** The cold-start banner disappears from the Puzzles Page.
4. **Active Predictions:** Unstarted and daily puzzles are evaluated against the model, and estimated solve times appear across all puzzle cards.
5. **Incremental Retraining:** The model retrains in the background on every subsequent puzzle completion.

### 5.3 Large Dataset Scaling & Recency Windows ($N = 500\text{ to }20{,}000+$)

As dedicated players accumulate hundreds or thousands of completed puzzles:

1. **The Skill Evolution Challenge:** A player who has completed 5,000 puzzles solves significantly faster than when they started. Training on all-time history introduces stale, slower predictions.
2. **Sliding Recency Window:** The training pipeline selects a window of the **most recent 300 to 500 valid completed games** ($K_{\text{max}} = 500$). This ensures the model tracks the user's current solving proficiency.
3. **Stratified Fallback for Rare Tiers:** If a player rarely plays Lunatic or Expert puzzles, a strict 500-game recency cutoff might starve the training set of rare complexity tiers. The dataset builder enforces a **stratified minimum** (e.g., retaining the most recent $\ge 15$ samples of each complexity tier even if they fall outside the 500-game window).
4. **Execution Performance:** With $K \le 500$, training 30 trees in Rust WASM takes $< 3\text{ ms}$, ensuring zero impact on UI responsiveness even after 20,000 games.

### 5.4 Data Quality & Outlier Filtering

To avoid training on skewed data:
* **First-Attempt Only:** Only games completed on their initial attempt (`previousAttempts` is empty or 0) are used. Restarts and replayed attempts are excluded.
* **Idle & Pause Filtering:** Games with prolonged pauses or idle gaps where $\text{elapsedMs} > 3.5 \times \text{median}(\text{complexity tier})$ are trimmed or excluded from the training set.
* **Abandoned Games:** Unfinished or abandoned games (`attemptState != COMPLETED`) are never included in the training set.

---

## 6. Frontend & UI Integration

### 6.1 Puzzle Card Presentation

On [puzzles-page.ts](file:///Users/luke/code/luke-doku/www/src/app/puzzles-page.ts), the `<puzzle-rating>` component displays the stars, difficulty name, and formatted estimate:

```
[ Unstarted Puzzle Card ]
+-----------------------------------------------------------+
|  #1  2026-08-16                                           |
|  ★★★☆☆ Moderate • ~5 min                                  |
+-----------------------------------------------------------+
```

### 6.2 Duration Formatting Rules

Estimated durations are rounded to avoid false precision:

| Predicted Milliseconds | Formatted Output |
| :--- | :--- |
| $< 60{,}000\text{ ms}$ | `< 1 min` |
| $1\text{ to }10\text{ minutes}$ | `~M min` (rounded to nearest minute, e.g. `~4 min`) |
| $10\text{ to }60\text{ minutes}$ | `~M min` (rounded to nearest 5 minutes, e.g. `~25 min`) |
| $> 60\text{ minutes}$ | `~H hr M min` (e.g. `~1 hr 15 min`) |

### 6.3 Lit Component Integration

[puzzle-rating.ts](file:///Users/luke/code/luke-doku/www/src/app/puzzle-rating.ts) is updated to read `estimatedTimeMs` from the puzzle rating:

```typescript
// www/src/app/puzzle-rating.ts
override render() {
  if (!this.game?.complexity) return undefined;
  
  const complexity = this.game.complexity;
  const estimatedMs = this.game.estimatedTimeMs;
  const timeText = formatEstimatedTime(estimatedMs);

  return html`
    ${iota(5).map(i => html`
      <mat-icon name=${i < complexity ? 'star' : 'star_border'}></mat-icon>
    `)}
    <span class="complexity-text">
      ${complexityText(complexity)}${timeText ? ` • ${timeText}` : ''}
    </span>
  `;
}
```

---

## 7. Storage & Database Schema

The IndexedDB schema (`luke-doku`) in [database.ts](file:///Users/luke/code/luke-doku/www/src/system/database.ts) is extended:

### Database Schema Changes

```typescript
export interface LukeDokuDb extends DBSchema {
  puzzles: {
    key: string;
    value: {
      clues: string;
      solutions: string[];
      symmetryMatches: DbSymMatch[];
      puzzleId?: [string, number, number];
      complexity?: wasm.Complexity;
      estimatedTimeMs?: number;       // <--- NEW: Cached prediction
      features?: Float32Array;         // <--- NEW: Cached 28-D feature vector
      attemptState: AttemptState;
      lastUpdated: Date;
      elapsedMs?: number;
      history?: Int8Array;
      previousAttempts?: Int8Array[];
    };
    indexes: {
      byPuzzleId: [string, number, number];
      byStateAndDate: [AttemptState, Date];
    };
  };

  models: {                           // <--- NEW Object Store
    key: string;                      // e.g., 'solve_time_forest'
    value: {
      key: string;
      version: number;
      serializedModel: Uint8Array;    // Compact binary serialized Rust forest
      trainingSampleCount: number;
      lastTrained: Date;
    };
  };
}
```

---

## 8. Implementation Roadmap

### Phase A: Rust Core Engine & ML Regressor
1. Create `crate/src/evaluate/forest.rs` implementing decision tree training, split search (MSE variance reduction), bootstrap sampling, and ensemble prediction.
2. Implement feature extraction in `crate/src/evaluate/internals.rs` returning a fixed-width `Vec<f32>` (28-D vector with detailed disproof & topology metrics).
3. Expose `train_model(x, y)` and `predict_time(model_bytes, features)` via `wasm-bindgen` in `crate/src/evaluate.rs`.
4. Add unit tests and cargo benchmarks in `crate/tests/` to guarantee training time $< 5\text{ ms}$ on 500 samples.

### Phase B: Worker Service & Data Pipeline
1. Upgrade IndexedDB schema in `www/src/system/database.ts` to add the `models` store and `features` fields.
2. Implement dataset assembly with sliding recency window ($K \le 500$) and stratified tier minimums.
3. Add background training queue and evaluation handling in `www/src/worker/puzzle-worker.ts`.
4. Implement outlier rejection in `www/src/system/puzzle-service.ts`.

### Phase C: Frontend & UI
1. Add cold-start progress banner to `www/src/app/puzzles-page.ts`.
2. Update `<puzzle-rating>` in `www/src/app/puzzle-rating.ts` to render formatted `estimatedTimeMs`.
3. Verify that ratings and time predictions update reactively upon background worker completion.

---

## 9. Verification & Testing Strategy

1. **Rust Unit & Regression Tests:**
   * Test decision tree splitting logic against synthetic datasets with known linear and non-linear boundaries.
   * Verify deterministic behavior with fixed PRNG seeds.
   * Validate serialization / deserialization round-trip integrity.
2. **Worker Integration Tests:**
   * Test training triggering at exactly 15 completed games.
   * Verify sliding window and stratified tier selection on synthetic 1,000+ game databases.
   * Verify outlier filtering (ignoring abandoned or abnormally paused games).
3. **UI / Visual Verification:**
   * Inspect clean card layout with and without time estimates.
   * Verify cold-start banner counting down correctly from 15 games.
