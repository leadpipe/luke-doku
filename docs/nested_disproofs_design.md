# Design Doc: Disproof Search v2 (Productivity-First & Nested)

This document outlines the revised architecture for discovering and presenting disproofs (speculative logical trails) in the review page. It replaces the previous [combination-based search approach](review_page_disproofs_design.md) with a productivity-driven, nested search architecture.

## 1. Overview & Objectives

The primary goal of the disproof engine remains finding logical contradictions resulting from speculative assignments. However, the revised approach shifts the focus to maximize utility and simplify the cognitive load on the user:

- **Productivity-First**: We care most about how useful a disproof is. We will calculate the productivity of all erroneous assignments *before* searching for the disproofs.
- **Sequential Search**: We will search for disproofs one speculative assignment at a time, ordered from highest productivity to lowest.
- **Richer Trail Representation**: Intermediate logical steps (implied assignments, subsets, overlaps) will be explicitly included as antecedents to the contradiction, making the step-by-step UI walkthrough clearer.
- **Single Disproof per Assignment**: We will limit ourselves to a single, optimal disproof for each speculative assignment.
- **Nested Disproofs for Lunatic Puzzles**: Instead of producing multi-antecedent constraints (e.g., "Not both A and B"), Lunatic puzzles will be solved via **nested disproofs**. We will prove an assignment false by resolving sub-disproofs within its hypothetical context.

---

## 2. Erroneous Assignments & Productivity

Since the engine has access to the solved grid(s), we can easily identify all **erroneous assignments**—candidates currently on the board that do not appear in any valid solution. Because they are not in the solution, we know with certainty that assuming them will eventually lead to a contradiction.

### Workflow:
1. **Identify Erroneous Assignments**: Compare the remaining candidates on the board against the known puzzle solutions to isolate the assignments that must be false.
2. **Calculate Productivity Upfront**: For every erroneous assignment, calculate its productivity (how many additional cells get solved if this candidate is eliminated). This relies on the highly optimized `Ledger` bitwise propagation.
3. **Sort Candidates**: Sort the erroneous assignments descending by their productivity score.

---

## 3. Sequential Disproof Search

Using the sorted list of erroneous assignments, the engine will search for a disproof for each assignment in turn. Since the list is ordered by productivity, the highest-value disproofs are naturally discovered first.

### Search Rules & Filtering:
- **Single Disproof per Assignment**: The engine only needs to retain one valid disproof per speculative assignment.
- **Optimizing for Trail Length**: If multiple logical paths lead to a contradiction for the same assignment, we will discard the longer ones in favor of the shortest logical trail.
- **Tie-Breaking**: If multiple disproofs for the same assignment have the exact same length, ties will be broken using the deterministic order we currently use for sorting errors in the UI.

---

## 4. Richer Antecedents in the Implication Tree

To improve the UI's Trail Preview Mode and make the logical progression easier to follow, the error fact (the consequent of the disproof) must explicitly reference its **immediate logical precursors**.

- **Currently**: The error may only loosely link back to the root speculation.
- **Revised**: We should be including implied assignments, as well as overlaps and subsets, directly in the `antecedents` of the error. 
- **Example**: If a row has a `Conflict` because two cells are forced to be the number 5, the antecedents of that `Conflict` should be the two specific *implied assignments* of 5, rather than just the root speculative assignment. 
- This creates a rich implication tree that the UI can traverse step-by-step, showing exactly how the overlaps, subsets, and implied assignments cascaded together to form the contradiction.

---

## 5. Nested Disproofs (Lunatic Complexity)

For Lunatic-complexity puzzles, direct deductions following a single speculative assignment may exhaust without reaching a contradiction. 

Instead of searching for multi-antecedent combinations ($A \wedge B \implies \bot$) that require the engine to manage persistent N-ary constraints, we will use **nested disproofs**.

### Mechanism:
1. **Assume A**: Make the root speculative assignment $A$.
2. **Deduce**: Exhaust all standard direct deductions under $A$.
3. **Recurse**: If no contradiction is found, identify a new erroneous assignment $B$ within the current hypothetical state.
4. **Assume B under A**: Make the nested speculative assignment $B$.
5. **Deduce**: If this leads to a contradiction, we have proved that $B$ is false *given* $A$. We can now apply the elimination $\neg B$ to the hypothetical state of $A$.
6. **Continue**: The elimination of $B$ might unlock further direct deductions under $A$, eventually leading to a contradiction for $A$ itself.

### End State & UI Impact:
This approach guarantees that every disproof presented on the main board is ultimately a **single-antecedent disproof** ($\neg A$). The complexity of Lunatic puzzles is entirely encapsulated within the implication tree (which will contain sub-implications representing the nested disproofs). The user will experience a unified UI where they apply a single elimination to the board, even if the proof behind it required recursive hypothetical reasoning.

---

## 6. Implementation Status & Progress

- [x] **Productivity-First Candidate Selection**: Implemented `calculateErroneousProductivity` in the Rust library, which compares possible grid assignments against solutions, computes downstream productivity of eliminating erroneous candidates using optimized `Ledger` propagation, and returns them sorted descending. Exposes TypeScript definitions and WASM bindings.
- [x] **Nested Disproof Search (Rust Library)**: Implemented `disprove_erroneous_assignment` and recursive helper `disprove_recursive` to disprove erroneous assignments using time-bounded nested disproofs. Speculative deductions are propagated through implied assignments (hidden/naked singles) as well, forming a rich implication tree. Covered by unit tests on Lunatic puzzles.
- [x] **TypeScript & Web Worker Integration**: Exposed both `calculateErroneousProductivity` and `disproveErroneousAssignment` to TypeScript. Set up parallel web worker queues (`disproveQueue` and `disproveLongQueue`) to support simultaneous short and long-running disproof calls without blocking responsive paths. Covered by worker unit tests.
- [x] **Frontend Review Page Integration**: Connected the sequential nested disproof search to the client-side playback review UI. Disproofs are displayed in descending order of productivity, and users can scrub step-by-step through the rich, deduplicated trail of intermediate logical deductions.

