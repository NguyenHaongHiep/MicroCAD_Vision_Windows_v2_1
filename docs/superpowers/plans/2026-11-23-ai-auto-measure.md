# AI Detect & Auto Measure Implementation Plan

> For agentic workers: execute with superpowers:executing-plans, using test-driven development and verification-before-completion.

**Goal:** Complete the user's attached one-click detection, adjacent-hole measurement, batch recovery, persistence and reporting workflow.

**Architecture:** Keep the existing authoritative circle-gap geometry, renderer and measurement records. Add a browser/CommonJS module for detection validation, conservative row grouping, idempotent measurement generation and batch transactions. Wire this into the existing single-page CAD UI, with optional preview retained. Review measurements retain their numeric values but are excluded from statistical populations and tolerance assessment.

**Tech stack:** Plain JavaScript/HTML/CSS, Node test runner, Playwright/Chromium. Existing Python YOLO backend remains unchanged.

**Spec:** User attachment `Pasted text.txt`, MICROCAD VISION — ONE-CLICK AI DETECT & AUTO MEASURE (2026-11-23).

## Constraints and decisions

- Work on `feat/ai-detect-auto-measure` in the user's existing checkout. Preserve the pre-existing deletion of `Launch-MicroCAD.ps1`.
- No checkpoint, training or backend changes. Geometry remains in `circleGapGeometry` / `makeCircleGap`.
- Invalid numeric/out-of-image geometry is rejected and recorded. Valid but poor-quality circles are retained with explicit review reasons; their derived gaps inherit review status. Unknown invalid detections suppress pairing rather than silently bridging a possible missing hole.
- Auto direction uses competing line hypotheses; tied incompatible row layouts remain unpaired. Explicit horizontal/vertical settings resolve grid ambiguity. Rows are sorted by projection; no cross-row pairs. Spacing outliers are exceptions, not inferred adjacency.
- Repeated inference reuses existing circles and unordered pairs; manual measurements are never replaced. Each batch tracks only added IDs for a safe multi-image rollback. Cancel aborts the current request and preserves completed images.
- JSON stores AI geometry without refitting polygon points. Legacy manual circles still use their original validation path.
- Raw review values appear in CSV/PDF and trace tables; distributions, means and pass/fail counts exclude them.

## Tasks

- [x] 1. Added unit/integration tests (`tests/ai-auto-measure.test.cjs`), observed missing behavior, then completed red/green cycles for geometry, grouping, policy, recovery and reruns.
- [x] 2. Implemented `ai-auto-measure.js`: `normalize`, `groupRows`, `measure`, `runBatch`, `rollback`, `summary`. Tests inject real HTML geometry functions.
- [x] 3. Integrated auto actions/settings/progress/results in `MicroCAD_Vision.html` and `ai-auto-measure.css`; preserved normal Undo and added whole-batch rollback; preview remains optional.
- [x] 4. Fixed authoritative AI geometry/metadata roundtrip, CSV quality columns, Analytics exclusions, and complete AI report appendices. Review counts are disclosed on report overview pages.
- [x] 5. Added browser workflows and captured screenshots/PDF/exports. `npm test`: 29 passed. `npm run test:ui`: 42 passed. Targeted browser suites were rerun after the final report disclosure change.
- [x] 6. Verified four real photos with their human annotations: each 3 diameters + 2 gaps, exact roundtrip. Live inference is unavailable because the checkpoint and running server are absent. Documented this limit and reproduction commands in `docs/AI_AUTO_MEASURE.md`; backend/checkpoint files and the user's existing launcher deletion are untouched.
