# Advanced Single-Digit Facts Design

This document outlines the architecture, integration, and visual presentation strategy for introducing advanced single-digit eliminations ("Facts") to the Luke-doku solver and review page.

## 1. Overview and Scope

We are expanding Luke-doku's logical vocabulary to include more advanced single-digit patterns. Multi-digit patterns are explicitly excluded unless they demonstrably outperform standard speculative trails.

### Included Patterns
The following patterns will be added. We are adopting the clear, structured terminology used by Hodoku (while acknowledging that SudokuWiki typically categorizes these as variants of Alternating Inference Chains, or AICs):

*   **Basic Fish:** X-Wing, Swordfish, Jellyfish
*   **Finned / Sashimi Fish:** The finned variants of the basic fish structures
*   **Single-Digit Patterns:**
    *   Empty Rectangles
    *   Skyscrapers
    *   2-String Kites

## 2. Solver Integration and Fact Searching

These new patterns must be deeply integrated into the existing architecture, playing a role in both the deduction module (which translates a puzzle's solution into human-comprehensible facts) and the frontend review experience.

### 2.1 Integration with Trails & Disproofs
The new Facts will be treated identically to existing elementary facts (like overlaps and subsets). 
*   **Antecedents:** They will serve as valid antecedents within implications that lead to assignments.
*   **Disproofs:** They will appear as logical steps along the way to a disproof when evaluating speculative trails. They seamlessly join the mix of deductions rather than acting as a separate class of "super-hints".

### 2.2 Complexity Grading
The puzzle complexity evaluator uses a 5-level scale (Simple, Moderate, Complex, Expert, Lunatic). The baseline definitions are:
*   **Simple:** Solved with singles.
*   **Moderate & Complex:** Solved with existing elementary elimination facts (overlaps, subsets).
*   **Expert:** Require single-level disproofs.
*   **Lunatic:** Require nested (recursive) disproofs.

The new facts will be incorporated into this grading logic as follows:
*   **Complex:** Most of these new advanced patterns will default to a "Complex" rating.
*   **Moderate:** Simple, easy-to-spot forms of these patterns (e.g., standard X-Wings or 2-String Kites) may be classified as "Moderate".

## 3. Visual Presentation Strategy

> **The Core Visual Constraint**
> Unlike traditional Sudoku software (e.g., Hodoku, SudokuWiki), Luke-doku **does not** automatically populate or display all remaining pencil marks for every cell. 
> 
> A traditional "sea of candidates" visualization strategy will look jarring and cluttered in Luke-doku. Visualizations must effectively communicate the logic while remaining **candidate-sparse**.

### 3.1 Interaction Model
*   **Selected Cell View:** When a cell is selected, the list of relevant facts for that cell will display these advanced patterns. Clicking on them will trigger the bespoke visualization for that specific deduction.
*   **Global Hints:** When no cell is selected, the board will provide subtle global hints indicating the presence of these patterns (similar to how overlaps and subsets are currently hinted).

### 3.2 Candidate-Sparse Visualizations
To clearly present these facts without relying on a grid full of pencil marks, we will use layered highlighting, strong links, and explicit target markers.

#### Basic Fish (X-Wing, Swordfish, Jellyfish)
*   **Base Sets (Defining lines):** Highlight the defining rows or columns with a soft, translucent background color (e.g., pale blue).
*   **Cover Sets (Intersecting lines):** Highlight the intersecting columns or rows with a contrasting soft color (e.g., pale yellow).
*   **Intersection Nodes:** Explicitly draw the candidate digit *only* in the intersection cells where it must exist to form the fish. These nodes should visually "pop" (e.g., a bolder font or glowing background) to show they are restricted.
*   **Elimination Target:** The cell(s) where the candidate is eliminated will have an animated, harsh marker (e.g., a red X or a striking slash) drawn over it, with faint red lines tracing back to the Fish nodes that cause the elimination.

#### Finned / Sashimi Fish
*   **Visualizing the Fin:** Uses the same Base/Cover set highlighting as Basic Fish, but the "fin" cell(s) will be distinctly highlighted (e.g., with a pulsing outline or a specific "fin" color).
*   **Logic Link:** A visual connector (e.g., an animated dashed line) will demonstrate how the fin *also* sees the eliminated target, bridging the gap between the standard fish structure and the fin's influence.

#### Empty Rectangles
*   **The ER Block:** Highlight the 3x3 block containing the "empty rectangle" structure. Explicitly render the specific digit candidates that form the cross/intersection within that block.
*   **Conjugate Pair:** Highlight the conjugate pair outside the block.
*   **Intersection & Elimination:** Draw strong, animated geometric lines originating from the ER block and the conjugate pair, meeting at the intersection cell outside the block to illustrate the elimination.

#### Skyscrapers & 2-String Kites
*   **Strong Links:** These patterns rely heavily on strong links (conjugate pairs). We will visualize this by drawing a bold, animated connection line (e.g., a glowing tether) between the two cells that share the strong link.
*   **Shared Influence:** Highlight the two end-point cells (the "roofs" of the skyscraper or the ends of the kite strings). Draw converging lines from these two cells to the target cell(s) sharing their influence, demonstrating the tension that causes the elimination.
