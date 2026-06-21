# Final Results CSS Cleanup Notes

## Done

- `css/results.css` import area has been grouped by feature.
- `css/final-results-foundation.css` has been created and now bundles:
  - `css/final-results-display-move.css`
  - `css/final-results-screen-fix.css`
- `css/final-results-winners.css` has been created and now bundles:
  - `css/final-results-all-winners-fix.css`
  - `css/final-results-all-winners-title-fix.css`
- `css/final-results-flow.css` has been created as the planned formal entry for flow/custom-message screens.

## Current state

`css/results.css` currently imports:

- `final-results-foundation.css`
- award reveal fix files
- star scout fix files
- `final-results-winners.css`
- `final-results-flow-fix.css`

## Notes

Some GitHub write attempts were blocked when creating wrapper files that import multiple award or star-scout fix files. To avoid breaking stable screens, those groups are intentionally left as direct imports for now.

## Next cleanup targets

1. Replace `final-results-flow-fix.css` import with `final-results-flow.css` once tooling permits.
2. Create a safe formal entry for star scout styles.
3. Create a safe formal entry for award reveal styles.
4. After every wrapper import is stable, move CSS bodies into formal files and turn old fix files into temporary compatibility wrappers.
5. Delete old fix files only after final visual regression testing.
