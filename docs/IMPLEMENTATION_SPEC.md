# Skim — Implementation Plan for a Coding Agent

> Objective: Build a TikTok‑style EPUB reader PWA (“Skim”) with ~50‑word slides, auto‑advance, manual navigation, progress, offline support, dark/light modes, and local storage only.

---

## Working Agreements for the Agent

* **Stack**: React + TypeScript, Tailwind CSS, Bun, Vite, epub.js (or epubjs-rn/web, see spike), IndexedDB (via `idb` wrapper).
* **Constraints**: Initial bundle < **500 KB** (gzipped) excluding epub.js worker if needed; time‑to‑first‑slide < **3s** for 5 MB EPUB on modern mobile; smooth 60 fps animations.
* **PWA**: Fully client‑side, installable, offline after first load.
* **Testing**: Unit (Vitest), E2E (Playwright), Lighthouse CI for PWA/perf.
* **Definition of Done** per milestone includes: code + docs + tests + demo build + self‑check checklist.

---

## Milestone 0 — Repo Bootstrap & Quality Gates (0.5–1 day)

**Goal**: Create a clean, fast dev environment with CI and basic scaffolding.

**Tasks**

1. Initialize project

   * `bun create vite skim --template react-ts` (or `bun init` + Vite manually)
   * Add Tailwind: `bun add -d tailwind postcss autoprefixer` + standard config; include system dark mode class strategy.
   * Install libs: `bun add idb` and `bun add epubjs` (spike; might swap later).
2. Tooling & Scripts

   * Configure `tsconfig.json` strict mode; path aliases `@/`.
   * Add ESLint + Prettier; CI lint/test steps.
   * Vitest + Testing Library + jsdom; Playwright for E2E.
3. CI/CD

   * GitHub Actions: build, test, Lighthouse CI (using temporary preview build), and artifact upload.
4. PWA shell skeleton

   * Add manifest.json, basic service worker (Workbox recommended), app icons (placeholder), and offline fallback page.

**Deliverables**: repo, CI passing badges, preview build artifact.

**Self‑Checks**

* `bun run build` succeeds; preview loads blank app offline (skeleton).
* Lighthouse PWA checks report “Installable” and offline‑ready for shell.

**Acceptance Criteria**

* New dev can clone, `bun i`, `bun dev`, and load app.

---

## Milestone 1 — Domain Model & IndexedDB Schema (0.5 day)

**Goal**: Persistent, versioned local storage for books and reading position.

**Schema (IndexedDB via idb)**

* `books` store: `{ id: string, title: string, author?: string, modifiedAt: number, sizeBytes: number, coverBlob?: Blob }`
* `bookAssets` store: `{ bookId: string, spineIndex: number, href: string, text: string }` (chunked-at-chapter granularity before slide split)
* `slides` store: `{ bookId: string, slideIndex: number, chapter: number, words: number, text: string }`
* `progress` store: `{ bookId: string, slideIndex: number, updatedAt: number }`
* `kv` store: generic settings `{ key: string, value: any }` e.g., auto‑advance seconds.

**Tasks**

1. Implement `db.ts` helper using `openDB` with versioned migrations.
2. Add typed service `StorageService` with CRUD and transactional upserts.
3. Add `StorageMock` for unit tests.

**Deliverables**: DB layer + tests.

**Self‑Checks**

* Can insert a fake book and retrieve slides & progress.
* Upgrade path tested (bump schema version in a test).

---

## Milestone 2 — EPUB Parsing Spike (1 day)

**Goal**: Choose parsing approach and prove extraction fidelity & performance.

**Tasks**

1. Implement `ParserService` with epub.js (or alternative) to:

   * Load uploaded EPUB (ArrayBuffer) without network.
   * Enumerate spine/chapters; extract raw XHTML per chapter.
   * Strip HTML to visible text (preserve semantic breaks for chapters).
2. Normalize text

   * Remove scripts/styles, resolve entities, collapse whitespace; keep paragraph boundaries as `\n\n`.
3. Performance probe

   * Measure parse time and memory for 5 MB sample.
4. Fallback plan

   * If epub.js size/perf is an issue, evaluate a lighter HTML extraction path using `JSZip` + DOMPurify + custom XHTML walker.

**Deliverables**: spike report (MD), ParserService API, unit tests with fixture EPUBs.

**Self‑Checks**

* Chapters preserved; no layout/CSS junk in output.
* Parse < 1500 ms for 5 MB on desktop; mobile budget < 3 s.

**Acceptance Criteria**

* Deterministic text output for given fixture; line breaks stable across runs.

---

## Milestone 3 — Chunking Engine (~50 words/slide) (0.5 day)

**Goal**: Deterministic chunking into ~50‑word slides with chapter awareness.

**Algorithm**

* Tokenize by words (Unicode aware). Aim for 50 ±5 words per slide.
* Prefer breaks at paragraph boundaries; if long paragraph, hard‑wrap at 50.
* Preserve chapter index in slide metadata; add short last slide handling.

**Tasks**

1. Implement `Chunker.split(textByChapter: Array<{chapter:number,text:string}>, target=50)` → slides[]
2. Add unit tests for Unicode, hyphens, long quotes, footnotes artifacts.
3. Store slides in IndexedDB (bulk transaction), compute counts.

**Deliverables**: Chunker + tests; performance log.

**Self‑Checks**

* Word counts within tolerance; no empty or duplicate slides.

---

## Milestone 4 — Upload & Import Flow (0.5 day)

**Goal**: User can upload an EPUB and see import progress.

**Tasks**

1. **UploadComponent** (drag‑drop + file input) with file size/type checks.
2. Import pipeline

   * Read file → ParserService → Chunker → DB writes.
   * Progress UI (steps: unzip/parse/chunk/store).
3. Save basic metadata + cover if available.

**Deliverables**: Interactive import screen + spinner with precise steps.

**Self‑Checks**

* Cancel import mid‑way doesn’t corrupt DB (transaction boundaries).
* Large (5 MB) EPUB imports without blocking UI (use `requestIdleCallback` / chunked transactions if needed).

**Acceptance Criteria**

* After successful import, the book appears and is selectable for reading.

---

## Milestone 5 — Reader MVP (Auto‑Advance & Manual Controls) (1–1.5 days)

**Goal**: Vertical, full‑screen slides with auto‑advance and manual navigation.

**Tasks**

1. **ReaderComponent**

   * Full‑screen slide view; large, readable typography; clamp width.
   * Render slide text only (no images for MVP).
   * Smooth swipe (vertical) + tap zones (top=prev, bottom=next).
   * Auto‑advance timer (default 9s) with pause/resume.
   * Persist `progress.slideIndex` on change (debounced).
2. **ProgressIndicator**

   * Simple progress bar based on `currentSlide / totalSlides` with chapter tick marks.
3. **Settings** (minimal)

   * Toggle auto‑advance; set duration 8–10s.

**Deliverables**: Reader UI + navigation + progress + persisted position.

**Self‑Checks**

* Rapid swipes don’t stutter; 60 fps transitions verified in DevTools.
* Resume returns to correct slide; auto‑advance pauses on interactions.

**Acceptance Criteria**

* QA script: import fixture → read for 2 minutes → pause → resume → refresh → continue from same slide.

---

## Milestone 6 — PWA & Offline (0.5–1 day)

**Goal**: Installable app; offline reading of imported books.

**Tasks**

1. Manifest fields (name, short_name, icons, theme, scope, start_url).
2. Service Worker (Workbox)

   * Precache app shell; runtime cache IndexedDB access safe.
   * Cache‑first for static assets; network‑only for nothing else.
3. “Add to Home Screen” prompt UX.

**Deliverables**: Installable PWA; offline works for shell + content from IndexedDB.

**Self‑Checks**

* Flight‑mode test: app opens, can read an imported book end‑to‑end.
* Lighthouse PWA score ≥ 90; installability passes.

---

## Milestone 7 — UI/UX Polish & Theming (0.5 day)

**Goal**: Minimal, distraction‑free visuals with dark/light.

**Tasks**

1. Tailwind theme tokens for typography scale, line length, spacing.
2. Dark/light using `prefers-color-scheme` + manual toggle.
3. Motion: single transform‑based slide transition (no layout thrash).

**Deliverables**: Consistent typography, color modes, smooth transitions.

**Self‑Checks**

* Avoid `box-shadow`/filters in animations; use `will-change: transform`.
* No layout shifts (CLS ~0).

---

## Milestone 8 — Performance Hardening (0.5 day)

**Goal**: Meet bundle and runtime budgets.

**Tasks**

1. Code‑split heavy deps (epub.js) behind dynamic import.
2. Use `react-virtual`/windowing if needed for lists (library view).
3. Measure TBT/TTI; avoid long tasks >50ms (split work with `setTimeout`/`IdleDeadline`).
4. Gzip & brotli; ensure images are SVG/PNG tiny.

**Deliverables**: Bundle report, perf notes, Lighthouse CI configured with budgets.

**Self‑Checks**

* Initial JS < 500 KB gz (excluding user EPUB file); TTI < 3s on mobile emulation.

---

## Milestone 9 — QA, E2E, and Packaging (0.5 day)

**Goal**: Robust tests, sample EPUBs, and deploy scripts.

**Tasks**

1. Unit: Chunker, Parser normalization, StorageService.
2. E2E: import → read → pause → resume → reinstall PWA → continue.
3. Accessibility pass: semantic landmarks, keyboard nav, font scaling.
4. Deploy scripts for GitHub Pages/Netlify; versioned release notes.

**Deliverables**: Test suite, sample EPUB fixtures, one‑click deploy.

**Self‑Checks**

* Playwright runs headless in CI with recorded traces.
* Basic a11y checks (axe) have 0 critical issues.

---

## User Stories → Tickets

1. **Upload EPUB**: As a reader, I can upload an EPUB to the app so I can read it offline.

   * DoD: accepts `.epub`, shows progress, persists book in DB.
2. **Chunk to Slides**: As a reader, I see ~50 words per slide preserving chapters.

   * DoD: slides reflect chapter changes; word counts within 50 ±5.
3. **Auto‑Advance**: As a reader, slides progress automatically.

   * DoD: default 9s; pause/resume; persists position.
4. **Manual Navigation**: As a reader, I can swipe/tap to navigate.

   * DoD: swipe up/down; tap zones; no frame drops.
5. **Progress Indicator**: As a reader, I see where I am in the book.

   * DoD: linear bar + chapter ticks; accessible text.
6. **PWA Install**: As a reader, I can install and read offline.

   * DoD: Lighthouse PWA pass; flight‑mode read works.
7. **Dark/Light Mode**: As a reader, I can match system theme.

   * DoD: theme toggle; colors meet contrast AA.

---

## API/Service Contracts

* `ParserService.parse(epubArrayBuffer): Promise<{ meta: { title, author?, coverBlob? }, chapters: Array<{ index:number, text:string }> }>`
* `Chunker.split(chapters, targetWords=50): Slide[]` where `Slide = { bookId, slideIndex, chapter, words, text }`
* `StorageService` methods: `saveBook(meta)`, `saveSlides(slides[])`, `getSlide(bookId, index)`, `countSlides(bookId)`, `getProgress(bookId)`, `setProgress(bookId, index)`

---

## UI Components (React)

* `<UploadScreen />` — drag‑drop, progress list.
* `<LibraryScreen />` — minimal list of imported books.
* `<Reader />` — full‑screen slide; receives `bookId`.
* `<ProgressBar />` — shows total, current, chapter ticks.
* `<Controls />` — pause/play, settings sheet.

---

## Commands & Scripts

* Dev: `bun dev`
* Build: `bun run build`
* Preview: `bun run preview`
* Test: `bun test`
* E2E: `bun run e2e`
* Lint/format: `bun run lint` / `bun run format`

---

## Risk Register & Mitigations

* **epub.js size/perf** → Dynamic import; or JSZip + custom XHTML parser.
* **Long tasks during import** → Chunked transactions + idle callbacks.
* **Mobile jank on transitions** → Transform‑only animations; reduce reflows.
* **Storage quota** → Store text only; avoid images in MVP.

---

## Checklists the Agent Must Fill

**Per PR**

* [ ] Added/updated tests
* [ ] Updated docs/README
* [ ] Bundle size report attached
* [ ] Lighthouse report attached
* [ ] Manual test notes (device + steps)

**Release Readiness**

* [ ] Import 5 MB EPUB < 3 s to first slide (mobile emu)
* [ ] Bundle < 500 KB gz
* [ ] PWA installable & offline read OK

---

## Validation Plan for You (Human Overseer)

* After Milestone 2: Review spike report and decide epub.js vs custom.
* After Milestone 5: Do a guided read session; verify UX feel.
* After Milestone 6: Install on phone; flight‑mode test.
* Final: Run Lighthouse and E2E in CI artifacts; sign off.

---

## Post‑MVP Roadmap (Nice‑to‑Have)

* Adjustable word count, speed; bookmarks/highlights; multiple book library view; reading stats; share progress.

---

## File/Folder Structure (proposed)

```
/ (repo)
  ├─ src/
  │  ├─ app/
  │  │  ├─ routes (Upload, Library, Reader)
  │  │  └─ providers (Theme, SW)
  │  ├─ components/ (ProgressBar, Controls, etc.)
  │  ├─ services/ (ParserService, Chunker, StorageService)
  │  ├─ db/ (schema, migrations)
  │  ├─ styles/
  │  ├─ tests/
  │  └─ sw/ (service worker)
  ├─ public/ (manifest, icons)
  └─ .github/workflows/
```

---

### End of Plan
