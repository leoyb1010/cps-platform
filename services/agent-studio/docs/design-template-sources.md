# Design Template Sources

This project absorbs design rules from three local/reference systems instead of relying on a generic prompt.

## frontend-slides-editable
Source: https://github.com/archlizheng/frontend-slides-editable

Absorbed rules:
- Preserve preset layout grammar, not just color tokens.
- Treat template slots, grid, decorations, and chrome as distinct layers.
- Keep viewport fitting and density limits explicit.
- Render previews to validate style choices.

## huashu-design
Source: /Users/leoyuan/.claude/skills/huashu-design

Absorbed rules:
- HTML is an execution tool; the output medium determines the designer role.
- Information graphics need print-level hierarchy, spacing, and verification.
- Motion uses physical weight, pauses, and a Slow-Fast-Boom-Stop rhythm.
- Prefer precise information architecture for data-heavy visuals.

## html-anything
Source: https://github.com/nexu-io/html-anything

Absorbed rules:
- HTML is the final reader-facing artifact, not a markdown intermediate.
- Skills are organized by mode/scenario and selected by platform surface.
- XHS carousel: cover + content pages + CTA; one idea per card; platform image limits.
- Swiss International: 16-column grid, saturated single accent, hairlines, no soft generic cards.
- Magazine Poster: dateline, oversized headline, columns, numbered sections.
- Hyperframes: frame sections with duration/transition metadata for video export.
- NYT data frame: editorial data headline, hand-authored SVG chart, footnote/source line.

Runtime representation lives in `src/lib/designGrammar.js`.
