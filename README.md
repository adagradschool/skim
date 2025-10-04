# Skim - EPUB Reader PWA

A TikTok-style EPUB reader PWA with ~50-word slides, auto-advance, offline support, and dark/light modes.

## Development

Install dependencies:
```bash
bun install
```

Start dev server:
```bash
bun dev
```

Run tests:
```bash
bun test         # Unit tests
bun run e2e      # E2E tests
```

Lint and format:
```bash
bun run lint
bun run format
```

## Build

```bash
bun run build
bun run preview
```

## Project Status

### ✅ Milestone 0 - Repo Bootstrap & Quality Gates (COMPLETE)

- React + TypeScript + Vite + Bun setup
- Tailwind CSS with dark mode support
- IndexedDB (idb) and epub.js dependencies
- TypeScript strict mode with path aliases
- ESLint + Prettier
- Vitest + Testing Library
- Playwright E2E testing
- GitHub Actions CI/CD with Lighthouse
- PWA manifest and service worker (Workbox)
- **Bundle size**: ~61KB gzipped (target: <500KB) ✓
- **Preview works offline**: Service worker configured ✓

### ✅ Milestone 1 - Domain Model & IndexedDB Schema (COMPLETE)

**Database Schema**:
- 5 IndexedDB object stores: `books`, `bookAssets`, `slides`, `progress`, `kv`
- Composite keys for `bookAssets` and `slides`
- Indexes for efficient querying: `by-modified`, `by-book`, `by-chapter`
- Versioned migrations (v1)

**StorageService** (`src/db/StorageService.ts`):
- Full CRUD operations for all stores
- Cascade delete (removing a book deletes all related data)
- Batch operations with chunked inserts (100 slides per chunk)
- Progress tracking with auto-timestamps
- KV store for app settings
- Storage quota estimation

**StorageMock** (`src/db/StorageMock.ts`):
- In-memory implementation for fast unit tests
- Data isolation (returns copies, not references)

**Testing**:
- 64 tests, all passing (121 expect() calls)
- `db.test.ts`: Schema and low-level operations (23 tests)
- `StorageMock.test.ts`: Mock implementation (18 tests)
- `StorageService.test.ts`: Integration tests (23 tests)
- Performance verified: 500 slides insert in <2 seconds

### ✅ Milestone 2 - EPUB Parsing Spike (COMPLETE)

**ParserService** (`src/parser/ParserService.ts`):
- EPUB loading from ArrayBuffer (no network required)
- Chapter enumeration via epub.js spine
- XHTML extraction with visible text parsing
- HTML stripping using DOMPurify (removes scripts, styles, layout tags)
- Text normalization (collapse whitespace, remove zero-width chars)
- Paragraph boundary preservation (`\n\n`)
- Performance measurement with progress callbacks

**Text Quality**:
- Deterministic output for identical input
- Stable line breaks across runs
- No CSS/layout artifacts in extracted text
- Chapter titles extracted from heading elements

**Performance**:
- Parser tested with real EPUBs (Alice in Wonderland, Cyropaedia)
- Browser-based test harness: `parser-test.html`
- Meets performance targets (<1500ms desktop, <3000ms mobile)
- Progress tracking for long operations

**Key Finding**:
- epub.js requires browser environment (uses DOM APIs)
- Works well in browser context with Vite dev server
- Suitable for PWA deployment model

**Test Harness**:
- Manual validation page at `/parser-test.html`
- Upload EPUB → view parsed chapters, metadata, performance
- Console logging for detailed inspection

### ✅ Milestone 3 - Chunking Engine (~50 words/slide) (COMPLETE)

**ChunkerService** (`src/chunker/ChunkerService.ts`):
- Deterministic chunking into ~50-word slides
- Unicode-aware word tokenization (handles hyphens, apostrophes, punctuation)
- Paragraph-aware splitting (prefers breaks at `\n\n` boundaries)
- Hard-wrap at 50 words for long paragraphs
- Chapter metadata preserved in each slide
- Flexible target word count (50 ±5 words)
- Short last slide handling

**Algorithm**:
- Split text into paragraphs by `\n\n`
- Fill slides to target word count, preferring paragraph boundaries
- Hard-wrap long paragraphs at exactly 50 words
- Sequential slide indexing across all chapters
- No empty or duplicate slides

**Testing**:
- 34 unit tests, all passing (74 expect() calls)
- Tests cover: basic chunking, paragraph awareness, long paragraphs, target word count, Unicode/punctuation, edge cases, statistics, deterministic output, real-world scenarios
- Performance verified: fast chunking (<50ms for typical books)

**ImportService** (`src/importer/ImportService.ts`):
- Orchestrates full EPUB import pipeline: parse → chunk → store
- Generates unique book IDs
- Bulk insert slides via StorageService (100 slides per chunk)
- Initializes reading progress
- Progress callbacks throughout import

**Integration**:
- ChunkerService works with ParserService output
- Slides stored in IndexedDB via StorageService
- Test harness shows slides in table format (slide #, word count, text)

**Test Harness**:
- Enhanced `/parser-test.html` with chunking results
- Displays total slides, avg words/slide, chunk time
- Expandable chapters show slides in table format
- Console logging for detailed inspection

### Next: Milestone 4 - UI Shell (Home + Library)
