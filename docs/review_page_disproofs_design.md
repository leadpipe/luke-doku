# Design Doc: Review Page Disproofs & Logical Trails

This document outlines the architecture, data models, and user experience for introducing **disproofs** (speculative logical trails) to the review page. This will allow players to analyze Expert and Lunatic puzzles when direct deductions run out of information.

---

## 1. Overview & Objective

The review page allows players to see what logical steps they missed during their puzzle-solving attempts.

- **Simple, Moderate, Complex**: Puzzles can be solved with direct deductions (naked/hidden singles, subsets, overlaps).
- **Expert**: Puzzles require following one speculative trail at a time to find a contradiction (disproof of a single speculative assignment).
- **Lunatic**: Puzzles require nested or multiple simultaneous speculative trails (disproofs with multiple simultaneous speculative assignments as antecedents).

A **disproof** is a proof by contradiction:

1. Make one or more speculative assignments.
2. Follow standard deductions from those assignments.
3. If they lead to an error (conflict, empty cell, or empty candidate unit), the speculative assignments are proved false.
4. Eliminate the speculative candidate(s) or combination of candidates from the board to make progress.

The distinction between Expert and Lunatic puzzles:

- **Expert puzzles** will never need multi-antecedent disproofs: a single speculative assignment antecedent is always sufficient.
- **Lunatic puzzles** may still be solved by single-antecedent disproofs at certain steps, but will require multi-antecedent disproofs (multiple simultaneous speculative assignments) at key bottleneck points in their solution.

---

## 2. Fact Representation & Data Model

We will reuse the existing `Fact::Implication` variant to avoid breaking changes to the serialization layer or existing UI components.

### Speculative Assignments

A speculative assignment is represented as:

```typescript
{
  type: 'SpeculativeAssignment',
  loc: number,
  num: number
}
```

### Disproof Representation

A disproof is represented as a `Fact::Implication` where:

- **`antecedents`**: A list of one or more `SpeculativeAssignment` facts.
  - _Expert_: Exactly 1 antecedent.
  - _Lunatic_: 1 or more antecedents (multiple simultaneous assignments will be needed at some point).
- **`consequent`**: A fact indicating an error/contradiction, or another implication whose ultimate consequent (the **nub**) is an error fact:
  - `Conflict { num, unit, locs }`
  - `NoLoc { num, unit }`
  - `NoNum { loc }`

```json
{
  "type": "Implication",
  "antecedents": [{ "type": "SpeculativeAssignment", "loc": 12, "num": 5 }],
  "consequent": {
    "type": "Conflict",
    "num": 5,
    "unit": { "type": "Row", "index": 1 },
    "locs": [10, 11]
  }
}
```

---

## 3. Resumable & Stateless Backend Search

Searching for multi-antecedent disproofs can be computationally expensive. We will implement a progressive, stateless search model.

### Triggering the Search

- Search is **lazy**: It only runs when standard direct deductions are completely stuck on the current board state.
- Search starts automatically whenever the playback stops (e.g. paused or scrubbed).

### Stateless Resumption

To keep the UI responsive and respect CPU time budgets, the Web Worker executes the search in small time slices (e.g., 500ms).

- When a search times out, the worker returns any disproofs found so far, along with a serializable **progress object** (`SearchProgress`).
- The client stores this progress state.
- If the user remains on the same playback step, the client requests the next batch of search on subsequent idle ticks, passing the `SearchProgress` back to the worker.
- If the user scrubs to a different step or alters the board, the stored progress is invalidated.

### Multi-Dimensional Search Progress

The search progress is represented generally to support arbitrary depths (antecedent counts) without hardcoding logic for specific levels:

```typescript
interface SearchProgress {
  depth: number; // Current number of simultaneous speculative assignments
  currentIndices: number[]; // Index offsets into the list of possible candidate assignments
  invalidSubsets: number[][]; // Serialized antecedent combinations that led to contradictions
  isComplete: boolean; // Whether the search space at this depth has been exhausted
}
```

If the board has $K$ remaining candidate assignments (pairs of cell and candidate number), we order them $C = [c_0, c_1, \dots, c_{K-1}]$.
For depth $D$, we search combinations of size $D$:
$$0 \le i_0 < i_1 < \dots < i_{D-1} < K$$
The `currentIndices` vector is incremented lexicographically. To avoid combinatorial explosion at depth $\ge 2$, the search incorporates **aggressive pruning**:

- The worker maintains a set of `invalidSubsets` (representing antecedent combinations that already led to a contradiction). This set is serialized and passed back and forth within the `SearchProgress` state.
- When a new combination of indices is generated, the worker checks if any subset of those indices is in `invalidSubsets`.
- If a subset is invalid, the search immediately skips evaluating the current combination and advances the lexicographical index past all combinations containing that subset.
  If the indices overflow, the search advances to `depth + 1` or reports completion.

---

## 4. User Interface & Interaction Flow

### A. The "Logical Trails" Side Panel

- A new section is added to the review page UI: **Logical Trails / Disproofs**.
- **Search Status Indicator**: Since searches (especially at depth $\ge 2$) may take time, a status indicator (e.g., "Searching Depth 2... (45% complete)") and a loading spinner are displayed while the Web Worker runs.
- The panel displays all independent disproofs found for the current playback step, sorted and grouped.
- **Sorting**: Disproofs are sorted primarily by **Productivity** (highest first), and secondarily by **Trail Length** (fewest steps first).
- Each item displays:
  - The speculative assignment(s) and the contradiction it leads to (e.g., _"Speculating 5 at R2C3 leads to a conflict for 5 in Row 2"_).
  - **Productivity**: An indicator showing how many cells can be solved using standard direct deductions once this disproof's elimination is applied (e.g., _"Productivity: +12 cells"_).
    - _Note on Productivity Calculation_: Because calculating downstream productivity for every found trail is computationally expensive, this is done **asynchronously in the background**. Disproofs initially appear with a loading state for their productivity score, and are re-sorted as the worker finishes calculating them.
    - _WASM Optimization_: This is computed by calling the WASM function `calculateProductivity(grid, loc, num)`. This function is highly optimized via `Ledger` bitwise propagation and does not construct logical implication trees.


```
+--------------------------------------------------+
| LOGICAL TRAILS                                   |
+--------------------------------------------------+
| [ ] Speculating 5 at R2C3 leads to conflict      |
|     (Productivity: +12 cells)                    |
|     [ Preview ]  [ Apply ]                       |
+--------------------------------------------------+
```

### B. Trail Preview Mode

When the user clicks **Preview** on a disproof:

1. The page enters **Trail Preview Mode**.
2. The board shows the starting state of the trail.
3. The main playback scrubber and controls are temporarily replaced with a **Trail Scrubber**.
4. The user can step forward/backward through the chain of implications that leads to the contradiction.
5. Cells involved in the trail are highlighted:
   - **Green**: Starting speculative assignment cell(s).
   - **Yellow/Orange**: Intermediate derived assignments.
   - **Red**: Cell(s) where the error/contradiction occurs.

### C. Exiting the Preview

The user automatically exits Trail Preview Mode when:

- They click an explicit **Exit Preview** button.
- They scrub the main timeline scrubber.
- They select a different disproof to preview.
- They click **Apply** on the disproof.

### D. Applying a Single-Antecedent Disproof

Because Luke-doku operates on assigned single values and does not auto-trim candidate lists visually:

- Applying a single-antecedent disproof ($A \implies \bot$) records the disproof logic as a `Fact` at the current step in the timeline. The engine accepts a list of these eliminations alongside the grid in its forward-deduction passes.
- **UI Indication**: The UI will place a visual indicator—a red X on the clock position for that numeral in the cell—to persistently show that this value has been logically disproven.
- **Pencil Marks**: If the user had $A$ penciled into that cell as a multi-valued mark, the UI automatically erases it for convenience.
- Once recorded, the engine uses $\neg A$ to unlock downstream direct deductions (e.g., if $\neg A$ leaves only one valid value for a cell, the engine deduces the Naked Single).

### E. Handling Multi-Antecedent Application (Combinations)

For multi-antecedent disproofs (e.g., $A \wedge B \implies \bot$), the constraint $\neg(A \wedge B)$ is applied:

- **Engine Support**: The engine must accept a list of sets of eliminations (binary or N-ary constraints) alongside the grid when computing facts. Clicking "Apply" adds this constraint to the engine's known state.
- **UI Indication**: A persistent visual indicator is added to show the linked constraint between the affected cells, so the player remembers the "Not both A and B" rule.
- If the player subsequently assigns $A$ in a trail, the engine immediately knows $\neg B$ and factors that into its deductions. If the player assigns both $A$ and $B$, the engine instantly flags a contradiction based on the recorded constraint.

---

## 5. Implementation Status: Rust Backend (Completed)

The core logic for finding disproofs has been successfully implemented in the Rust backend (`crate/src/deduce.rs` and `crate/src/deduce/internals.rs`). This lays the foundation for the frontend to consume and display these logical trails.

### What is Completed:
1. **Fact Representation**: 
   - Added `Fact::SpeculativeAssignment` to model hypothetical assignments.
   - Reused `Fact::Implication` for disproofs, where `antecedents` are the speculative assignments and the ultimate `consequent` is always a base error fact (e.g., `Conflict`, `NoNum`).
2. **Stateful Search Engine (`search_disproofs_native`)**:
   - Implemented an iterative combination search across remaining possible assignments.
   - Designed to be resumable via the `SearchProgress` struct (tracking `depth`, `current_indices`, `invalid_subsets`, and `is_complete`).
   - Limits search execution using `max_time_ms` (time-slicing) and `max_depth` parameters.
3. **Aggressive Pruning**:
   - The search generates combinations lexicographically.
   - When a contradiction is found, its specific causal `SpeculativeAssignment`s are extracted into a subset.
   - Any future combinations that contain an already `invalid_subset` are aggressively skipped, drastically reducing the search space for depth >= 2.
4. **WASM Bindings**:
   - Exported `searchDisproofs` to WASM, which accepts the `Grid`, a `SearchProgress` object, `maxDepth`, and `maxTimeMs`.
   - Exported `calculateProductivity` to WASM to calculate a single-antecedent disproof's productivity asynchronously.
   - `ts-rs` macros automatically export TypeScript definitions (`SearchProgress`, `SearchDisproofsResult`, etc.) to the `www/src/facts/` directory.
5. **Testing**:
   - Covered by a full suite of unit tests, including tests for combinations at depth 1 and depth 2 (conflicts), and a test for `calculateProductivity` verifying downstream propagation counts.

### What Remains (Frontend & Integration):
- Integrating `searchDisproofs` in a Web Worker (or equivalent) in the TS frontend to prevent blocking the UI.
- Managing the `SearchProgress` state between worker calls based on the active step in the review timeline.
- Integrating the asynchronous `calculateProductivity` calls on the Web Worker background thread.
- Building the UI panels ("Logical Trails"), Trail Preview Mode, and applying multi-antecedent constraints visually to the board.
