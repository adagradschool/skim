Plan & Solution Design for Issue #1: Dynamic Chunking Strategy

Current Architecture Analysis

Current Flow:
1. Import EPUB → Parse chapters → Chunk into slides → Store in DB
2. Chunking happens during import with fixed 50-word target
3. Slides stored in IndexedDB with pre-chunked text
4. Reader just displays pre-chunked slides

Key Problem: Chunks are baked into the database at import time,
making it impossible to adjust slide size dynamically.

---
Proposed Solution Architecture

Core Strategy: Lazy Chunking

Instead of chunking during import, store the full chapter text in the
database and chunk on-the-fly during reading.

1. Data Model Changes

Modified Slide interface:

- Remove: Pre-chunked slides table
- Add: Store full chapter text instead

// NEW: Store chapters as-is from parser
export interface Chapter {
bookId: string
chapterIndex: number
title: string
text: string      // Full chapter text (NOT pre-chunked)
words: number     // Total word count for this chapter
}

// KEEP Book, Progress, etc. unchanged

Database Schema:

- Remove: slides object store
- Add: chapters object store with indexes:
- Primary key: [bookId, chapterIndex]
- Index: by-book on bookId

2. ChunkerService Refactor

Transform from "batch chunker" to "streaming chunker":

export class ChunkerService {
/**
    * Chunk a single chapter's text into slides on-the-fly
    * @param text - Full chapter text
    * @param chunkConfig - Dynamic chunking parameters
    * @returns Array of slide texts
    */
chunkText(
    text: string,
    config: ChunkConfig = DEFAULT_CHUNK_CONFIG
): string[] {
    // Implement sentence-aware chunking
    // Priority: Sentence boundaries > Word count target
}

/**
    * Split text into sentences (respecting punctuation)
    */
private splitIntoSentences(text: string): string[] {
    // Handle periods, question marks, exclamation marks
    // Consider abbreviations, ellipses, quotes, etc.
}

/**
    * Group sentences into slides based on config
    * @param config.maxWords - Maximum words per slide (default 50)
    * @param config.sentenceMode - "strict" | "flexible"
    *   - strict: Always end on sentence boundary
    *   - flexible: Can split long sentences
    */
private groupSentencesIntoSlides(
    sentences: string[],
    config: ChunkConfig
): string[] {
    // Logic: Accumulate sentences until hitting word limit
    // If next sentence would exceed limit:
    //   - sentenceMode=strict: End slide, start new
    //   - sentenceMode=flexible: Split sentence if needed
}
}

export interface ChunkConfig {
maxWords: number        // Target words per slide (default 50)
sentenceMode: 'strict' | 'flexible'  // How to handle boundaries
}

3. Progress Tracking Changes

Currently: Progress { bookId, slideIndex, updatedAt }

Problem: Slide indices become meaningless when chunking changes
dynamically.

Solution: Track position by (chapterIndex, characterOffset):

export interface Progress {
bookId: string
chapterIndex: number     // Which chapter
characterOffset: number  // Character position within chapter
updatedAt: number
}

This way:
- Position is stable regardless of chunking parameters
- Can re-calculate slide index when rendering with any chunk size

4. ReaderPage Refactor

Current: Load pre-chunked slides from DBNew: Generate slides
on-the-fly

// Pseudo-code for new reader logic
const [chunkConfig, setChunkConfig] = useState<ChunkConfig>({
maxWords: 50,
sentenceMode: 'strict'
})

// Load chapters (not slides) from DB
const chapters = await storageService.getAllChapters(bookId)

// Chunk all chapters using current config
const allSlides = chapters.flatMap(chapter =>
chunkerService.chunkText(chapter.text, chunkConfig)
    .map((slideText, idx) => ({
    text: slideText,
    chapterIndex: chapter.chapterIndex,
    chapterTitle: chapter.title,
    globalSlideIndex: /* calculate */
    }))
)

// When user adjusts slider, update chunkConfig and re-chunk
const handleChunkSizeChange = (newMaxWords: number) => {
setChunkConfig({ ...chunkConfig, maxWords: newMaxWords })
// Re-chunk happens automatically via state change
// Position preservation handled by (chapterIndex, charOffset)
}

5. UI: Chunk Size Control

Add slider in Settings panel:

┌─────────────────────────────────┐
│       Reader Settings           │
├─────────────────────────────────┤
│ Slide Size                      │
│ ◄─────●─────────────────────► │
│  Larger    Medium    Smaller    │
│ (20w/1s)   (50w/2s)  (100w/4s) │
│                                 │
│ Mode: ⦿ Sentence-aware          │
│       ○ Strict word count       │
└─────────────────────────────────┘

Slider values mapping:
- Min (left): 20 words / ~1 sentence
- Middle: 50 words / ~2 sentences (default)
- Max (right): 100 words / ~4 sentences

6. Sentence-Aware Chunking Logic

Requirement: "Preference is to end the slide on a sentence end rather
than mid sentence. So the chunking logic becomes sentence end or 50
words whichever is sooner."

Implementation:

groupSentencesIntoSlides(sentences: string[], config: ChunkConfig):
string[] {
const slides: string[] = []
let currentSlide: string[] = []
let currentWordCount = 0

for (const sentence of sentences) {
    const sentenceWords = this.countWords(sentence)

    // If adding this sentence exceeds limit
    if (currentWordCount + sentenceWords > config.maxWords) {
    // If we have content, save current slide
    if (currentSlide.length > 0) {
        slides.push(currentSlide.join(' '))
        currentSlide = []
        currentWordCount = 0
    }

    // If single sentence is too long, split it
    if (sentenceWords > config.maxWords && config.sentenceMode ===
'flexible') {
        const chunks = this.splitLongSentence(sentence,
config.maxWords)
        slides.push(...chunks.slice(0, -1))
        currentSlide = [chunks[chunks.length - 1]]
        currentWordCount = this.countWords(chunks[chunks.length - 1])
    } else {
        // Add full sentence to new slide
        currentSlide.push(sentence)
        currentWordCount = sentenceWords
    }
    } else {
    // Sentence fits, add it
    currentSlide.push(sentence)
    currentWordCount += sentenceWords
    }
}

// Flush remaining
if (currentSlide.length > 0) {
    slides.push(currentSlide.join(' '))
}

return slides
}

---
Implementation Plan

Phase 1: Backend Refactor (Core Data Model)

1. Create new Chapter interface and DB schema
2. Add chapters object store to db.ts
3. Update StorageService to handle chapters (not slides)
4. Add migration utility to convert existing slide-based books to
chapter-based

Phase 2: Chunker Refactor (Streaming Chunker)

5. Implement sentence parsing logic
6. Implement chunkText() with sentence-aware grouping
7. Add ChunkConfig interface
8. Write comprehensive tests for edge cases

Phase 3: Import Pipeline Update

9. Update ImportService to store chapters directly (skip chunking)
10. Remove chunking step from import flow
11. Update progress tracking to use (chapterIndex, charOffset)

Phase 4: Reader UI Refactor

12. Update ReaderPage to load chapters (not slides)
13. Implement on-the-fly chunking in reader
14. Add position preservation when re-chunking
15. Add chunk size slider to Settings panel
16. Persist chunk size preference to KV store

Phase 5: Testing & Polish

17. Test with various chunk sizes
18. Test position preservation across re-chunking
19. Test with books of different structures (short/long sentences,
paragraphs, etc.)
20. Performance testing for re-chunking latency

---
Technical Considerations

Performance

Concern: Re-chunking entire book on slider change could be slow

Mitigation:
- Debounce slider changes (wait 300ms after user stops dragging)
- Cache chunks per configuration (memoization)
- Only re-chunk when necessary (config actually changed)
- Consider Web Worker for chunking if needed (unlikely for typical
books)

Expected: For a 100k word book (~200 chapters), sentence parsing and
grouping should take <100ms on modern devices.

Position Preservation

Challenge: When user changes chunk size, maintain reading position

Solution:
1. Before re-chunking, record current (chapterIndex, charOffset)
2. After re-chunking, find new slide that contains that charOffset
3. Navigate to that slide

// Calculate character offset of current slide
const charOffset = getCurrentCharacterOffset(currentSlide,
currentChapter)

// Save to progress
await storageService.setProgress(bookId, {
chapterIndex: currentChapter.index,
characterOffset: charOffset,
updatedAt: Date.now()
})

// After re-chunking with new config
const newSlideIndex = findSlideAtOffset(
newChunkedSlides,
chapterIndex,
charOffset
)
setCurrentIndex(newSlideIndex)

Backward Compatibility

Options:
1. Hard migration: Convert all existing books on app load
2. Dual mode: Support both old (slide-based) and new (chapter-based)
books
3. Force re-import: Ask users to re-import their EPUBs

Recommendation: Option 2 (dual mode) for best UX
- Detect schema version on book load
- If old format, lazy-migrate on first read
- New imports always use chapter-based storage

---
Benefits of This Approach

✅ User Control: Adjust slide size in real-time✅ Sentence-Aware:
Respects natural reading boundaries✅ Flexible: Easy to add more
chunking strategies later✅ Storage Efficient: Store chapters once,
not N slides✅ Future-Proof: Can add features like custom chunking
rules per book

Risks & Mitigation

⚠️ Risk: Performance impact of on-the-fly chunking✅ Mitigation:
Memoization, Web Workers if needed

⚠️ Risk: Complex position tracking logic✅ Mitigation: Comprehensive
tests, character offset approach is robust

⚠️ Risk: Breaking existing books in users' libraries✅ Mitigation:
Dual-mode support + lazy migration

---
Summary

This is a significant refactor that touches:
- Data layer: New schema, migration
- Business logic: Streaming chunker, new progress tracking
- UI layer: On-the-fly chunking, new controls
- Import pipeline: Skip chunking, store raw chapters

Estimated Effort: 2-3 days for full implementation + testing

Key Decision Points:
1. Backward compatibility strategy (dual-mode vs. hard migration)
2. Sentence parsing sophistication (simple regex vs. NLP-lite)
3. UI for chunk size control (slider, presets, or both)

Would you like me to proceed with the implementation? Any changes to
the plan?