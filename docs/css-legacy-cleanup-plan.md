# CSS Legacy Cleanup Plan

Branch: `refactor/css-structure`

This document tracks the gradual cleanup of `css/legacy.css` after the CSS modules have been split out.

## Current import strategy

`legacy.css` has been moved before the new CSS modules in `style.css`.

```css
@import "./css/tokens.css";
@import "./css/legacy.css";
@import "./css/base.css";
@import "./css/layout.css";
@import "./css/components.css";
@import "./css/home.css";
@import "./css/home-token-overrides.css";
@import "./css/vote.css";
@import "./css/admin.css";
@import "./css/final-vote.css";
@import "./css/results.css";
```

This means legacy CSS remains as fallback, but the new modular files now win in the cascade.

---

## Phase 1: Safe removal candidates

These sections are already covered by `base.css` and `layout.css` and can be removed first from `css/legacy.css`.

### 1. Global base styles

Remove the following selectors from the top of `legacy.css`:

```css
* { ... }
html { ... }
body { ... }
a { ... }
button,
a { ... }
```

Covered by:

```text
css/base.css
```

### 2. Navigation styles

Remove the following selectors from `legacy.css`:

```css
.site-nav { ... }
.nav-logo { ... }
.nav-links { ... }
.nav-links a { ... }
.nav-links a:hover { ... }
.mobile-menu-button { ... }
```

Covered by:

```text
css/layout.css
```

---

## Phase 1 test checklist

After removing the above section locally, test:

```text
Home page
Navigation bar
Mobile menu
Text color / background
Buttons hover transition
```

If everything is normal, commit with:

```bash
git add css/legacy.css
git commit -m "Remove base and nav styles from legacy CSS"
git push
```

---

## Next phases

### Phase 2: Shared layout and components

Candidates:

```css
.section
.section h2
.section h3
.section-desc
.section-title-row
.section-title-row > div:first-child
.section-header-center
.primary-link-button
.secondary-link-button
.vote-link-button
.admin-link-button
.contestant-card
.info-card
.rule-card
.special-prize-card
.score-main-card
.final-info-card
.timeline-item
.form-card
.rules-section
```

Covered by:

```text
css/layout.css
css/components.css
```

### Phase 3: Page-specific styles

Candidates:

```text
Home page styles       -> css/home.css + css/home-token-overrides.css
Vote page styles       -> css/vote.css
Admin page styles      -> css/admin.css
Final vote styles      -> css/final-vote.css
Results / big screen   -> css/results.css
```

Clean one page group at a time and test after every removal.
