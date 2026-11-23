# AI Detect & Auto Measure

Implemented on `feat/ai-detect-auto-measure`, based on `27d560f` (checked against `origin/main` on 2026-11-23).

## Using the feature

1. Open `MicroCAD_Vision.html`, import images or a folder, and calibrate once. The existing calibration workflow applies the scale to all images.
2. Use **AI Detect & Measure · Tất cả ảnh** in the top toolbar. For one image, open the AI inspector and choose **Ảnh hiện tại**.
3. Circles, diameters and adjacent edge gaps are saved directly in each image's measurement list. The results dialog opens after processing; select an image name to open its dimensions.
4. Use the existing CSV / PNG / Save All ZIP / JSON controls. Reports include an appendix with every AI measurement and its quality status, in both quick and technical templates.

The AI server must report `model_ready: true` at `http://127.0.0.1:8000/health`. Offline AI disables the AI actions; manual measurement remains available. Optional proposal-only preview and acceptance remain under **AI Preview / duyệt thủ công** in the inspector.

## Geometry and quality policy

- Circle and gap records keep the existing `circle` / `circleGap` schema. Gap generation calls the existing `makeCircleGap`, which calls `circleGapGeometry`. No new edge-distance formula, YOLO training, checkpoint or backend changes were introduced.
- Invalid numeric centers/radii or centers outside the image are rejected and listed. An invalid detection suppresses automatic pairing for that image, because a rejected hole may lie between otherwise valid detections.
- Valid geometry with low confidence, excessive fit residual, low coverage, malformed polygon, an API review flag, inconsistent diameter or a clipped boundary is stored with `reviewRequired` and explicit reasons. Its dependent automatic gaps inherit the warning.
- Review values remain visible in the measurement list, CSV and PDF. Analytics means, distributions and tolerance pass/fail populations exclude review measurements. A manually constructed gap referencing a review circle is also excluded. Uncalibrated measurements remain in pixels and never enter mm statistics.
- Auto row grouping considers competing directions, groups centers by perpendicular position, fits each row direction, and sorts by projection. Only consecutive centers are paired. An ambiguous layout, such as a square grid, produces an exception; choose Horizontal or Vertical to resolve it. An isolated hole or unusually long pitch is reported without inventing a pair.
- Intersecting, tangent, contained and coincident circles preserve the application's existing geometric relations. Such gaps are marked for review; intersections/tangencies do not produce a positive gap. A contained circle retains the existing boundary distance, explicitly labeled as unsuitable for two separate holes.

### Configurable defaults

| Setting | Default | Meaning |
|---|---:|---|
| Direction | Auto | Auto / Horizontal / Vertical |
| Minimum confidence | 0.60 | Lower confidence is retained for review |
| Maximum fit error / radius | 0.08 | Relative fit quality threshold |
| Minimum angular coverage | 0.55 | Coverage threshold |
| Row tolerance / median radius | 0.60 | Maximum perpendicular spread for a candidate row |
| Maximum pitch ratio | 1.80 | Reject a long step relative to the lower median row pitch |
| Rerun geometry drift / radius | 0.01 | Warn when a reused AI circle differs from new inference, with a 0.5 px floor |

Settings are saved with the project. These filters are screening criteria, not a claim of metrology accuracy. Auto mode cannot infer an entirely missing hole from an otherwise plausible two-hole observation. Ambiguous multi-directional arrangements are intentionally left for a direction setting or manual tools.

## Reruns, cancellation and recovery

Detection matching reuses existing circle IDs, including matching manual circles, without replacing their geometry. Gaps use an unordered source-pair key. A new detection with substantially different geometry flags the reused AI result; it never silently changes saved dimensions. Quality warnings are conservative and are not automatically cleared by a later more confident response.

Images are processed sequentially. Reference images are skipped. Failure on one image is recorded and processing continues. Cancel aborts the current HTTP request, ignores a late response and retains completed images. Successful auto processing clears old preview overlays.

Each changed image supports its normal Undo. The result dialog also has **Hoàn tác lần AI gần nhất · mọi ảnh**, with up to 20 runs in session memory. It removes only the IDs added by that run, restores quality updates and prior result metadata, and retains manual measurements added before or after the batch. If a later manual measurement references an automatic source circle, rollback preserves that circle to avoid a dangling reference. Undo snapshots are sanitized so a later Undo cannot resurrect removed batch objects. Loading another project resets the in-memory batch undo history.

AI centers/radii in JSON are authoritative. Polygon / `edgePts` data is validated as evidence and never used to refit an AI circle during load. Legacy manual multipoint circle fitting remains unchanged. Source image IDs are remapped during load only for records that use that metadata.

## Verification

Install test-only dependencies with `npm ci` and, if needed, `npx playwright install chromium`. The application itself has no new runtime package dependency and still works from a local file.

```powershell
npm test
npm run test:ui
npm run test:real-fixtures
```

The test suites cover:

| Requirement | Evidence |
|---|---|
| 2 / 3 / N holes | Unit tests assert N diameters, N−1 gaps and no first-to-last shortcut |
| Multiple / inclined / vertical rows | Shuffled and tilted fixtures; no cross-row pairs; ambiguous grid exceptions |
| Geometric relations | Intersection, tangency and containment use real application geometry |
| Missing/invalid detection | Rejection, insufficient-hole and pitch-outlier tests |
| Low confidence, fit and coverage | Configurable policy, warning propagation and statistical exclusion |
| No calibration | Browser and unit checks show only px; CSV mm fields stay empty |
| Rerun | Stable objects/pairs, poorer-quality reruns and geometric drift warnings |
| Batch failure | Browser HTTP error on the middle image; last image still measured |
| JSON roundtrip | Exact centers/radii/endpoints, including empty/noisy polygon samples and real annotations |
| Undo / Cancel | Whole-batch recovery, retained manual work, late response rejection and preview restoration |
| CSV / PDF | CSV includes all 16 fixture measurements; PDF includes all 15 AI measurements (9 diameters, 6 gaps) |
| PNG / ZIP | Original-size dimension PNG and ZIP downloads through real browser controls |
| UI | Folder import, global calibration, current-image action, quality dashboard, both report templates, zoom/pan, narrow dialog, reduced motion and Escape |
| Existing tools | Selection, manual geometry, row spacing, calibration, Undo, old JSON, Analytics and export regression suites |

The numerical fixture uses centers `(100,200)`, `(380,200)`, `(660,200)`, radii `60 px` and `0.005 mm/px`: **3 × Ø0.600 mm, Gap 1–2 = 0.800 mm, Gap 2–3 = 0.800 mm**.

The test runner reports **29 unit/integration tests** and **42 browser tests**, plus **4 real annotation fixtures**. The real fixtures are the four `MicroCAD_AI/dataset/images/val` photos with their human polygon labels. Each produces three diameters and two adjacent gaps, with exact Save/Load geometry. They are explicitly marked for review and are not represented as model predictions.

### Artifacts

Generated in `output/qa/ai-auto-measure/` (ignored by Git):

- `three-holes.png`, `batch-results.png`, `batch-narrow.png`
- `measurements.csv`, `dimensions.png`, `measurements.zip`
- `auto-measure-report.pdf` (4 A4 pages), `review-technical-report.pdf` (6 A4 pages)
- `roundtrip-before.json`, `roundtrip-after.json`, `repeat.json`, `undo.json`, `cancel-undo.json`
- `folder-calibrated.json`, `uncalibrated.json`, `zoom-pan.json`
- `ui-results.json`, `real-annotation-results.json`

PDF text was independently extracted with pypdf to confirm 9 AI diameters and 6 gaps. PDF pages were rendered with Poppler and checked visually; browser assertions also verify that page content does not overflow.

### Environment limitation

Live YOLO inference could not be run: the default checkpoint `MicroCAD_AI/runs/segment/hole_inner-2/weights/best.pt` is absent and no service responds on port 8000. Browser tests mock only the external detection HTTP response; all application measurement, persistence, rendering and export code runs normally. The real-photo test uses existing human annotations, not YOLO. Model accuracy remains unverified in this environment. No replacement checkpoint was downloaded or trained.

## UI guidance applied

- Modern Web Guidance `progress`: use a labeled native progress bar; “Announce completion without stealing focus”. Batch updates keep one status region and do not repeatedly move focus to Cancel.
- `dialog`: native `showModal()` and browser Escape/focus containment; “DON'T add role=\"dialog\", aria-modal, a focus trap”. Dialog/backdrop overscroll containment is progressive enhancement; no root scroll-lock workaround.
- `html`: optional settings and preview use native disclosure; “DO place <summary> as the first child of <details>”. Results use native table headers and buttons, with warning text in addition to color.
- UI/UX Pro Max: preserved CAD colors and dimensions, visible keyboard focus, primary batch action, accessible field labels, explicit Cancel and undo recovery.
