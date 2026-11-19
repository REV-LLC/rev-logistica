# Frontend Component Ownership

- Keep one implementation for each repeated UI unit or shared workflow, including cards and modals. Reuse its component instead of copying markup, behavior or styles into a page.
- Pages and list containers coordinate data loading, filters and navigation. Presentational components receive typed data and explicit action callbacks; do not duplicate fetching inside individual cards.
- Keep component-specific styles in the component's CSS module. Containers own only their layout and orchestration styles.
- Centralize shared domain types and formatting helpers. Components must not import shared types from the page or list container that renders them.
- Follow existing module boundaries. Extract meaningful units rather than wrapping individual labels or adding abstractions without a concrete reuse or ownership benefit.
- Preserve permissions, Spanish user-facing text, responsive behavior and accessibility. Add focused component tests and verify relevant desktop and mobile flows when extracting or changing shared UI.
