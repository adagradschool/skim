# Dynamic Chunking Strategy - UPDATED IMPLEMENTATION

## Status
- ✅ Phase 1: Backend Refactor (Complete)
- ✅ Phase 2: Chunker Refactor (Complete)
- 🔄 Phase 3: Import Pipeline Update (Next)
- ⏳ Phase 4: Reader UI Refactor with Sliding Window
- ⏳ Phase 5: Testing & Polish

## Key Architecture Decisions

### 1. **Lazy Sliding Window Chunking** (UPDATED)
Instead of chunking entire book upfront, use a sliding window approach:

**Window Size:** `[prev 5] [current] [next 5]` = 11 slides total

**Benefits:**
- ✅ O(1) performance regardless of book size
- ✅ Low memory footprint (~11 slides in memory)
- ✅ Instant navigation within window
- ✅ Efficient config change handling

### 2. **Character-Based Progress** (UPDATED)
Track progress by character position instead of slide count:

```typescript
function calculateProgress(state: ReaderState, allChapters: Chapter[]): number {
  const totalCharsBefore = allChapters
    .slice(0, state.chapterIndex)
    .reduce((sum, ch) => sum + ch.text.length, 0)

  const currentPosition = totalCharsBefore + state.characterOffset
  const totalChars = allChapters.reduce((sum, ch) => sum + ch.text.length, 0)

  return (currentPosition / totalChars) * 100
}
```

**Benefits:**
- ✅ Accurate progress tracking
- ✅ Stable across config changes
- ✅ No need to estimate total slides
- ✅ Slider naturally aligns with chapters

### 3. **Memoized Window Updates**
Detect config changes and only recompute when necessary:

```typescript
interface CachedSlideWindow {
  slides: string[]           // Array of slide texts
  currentIndex: number       // Index of current slide (usually 5)
  startCharOffset: number    // Where slides[0] starts
  chapterIndex: number       // Which chapter
}

function updateSlidesWindow(state: ReaderState): CachedSlideWindow {
  const configChanged = !deepEqual(state.chunkConfig, state.lastChunkConfig)

  if (configChanged) {
    // Recompute entire window (11 slides)
    return computeWindow(chapter, state.characterOffset, state.chunkConfig)
  }

  // Check if still within cached window
  if (withinWindow(state, cached)) {
    // Just update index, no recomputation
    return { ...cached, currentIndex: newIndex }
  }

  // Outside window, shift and recompute
  return computeWindow(chapter, state.characterOffset, state.chunkConfig)
}
```

## Data Model (Implemented)

```typescript
// ✅ DONE
export interface Chapter {
  bookId: string
  chapterIndex: number
  title: string
  text: string      // Full chapter text
  words: number
}

// ✅ DONE
export interface Progress {
  bookId: string
  chapterIndex: number
  characterOffset: number
  updatedAt: number
}

// ✅ DONE
export interface ChunkConfig {
  maxWords: number  // Default: 50
}
```

## Implementation Phases

### Phase 1: Backend Refactor ✅ COMPLETE
- ✅ Created Chapter interface
- ✅ Updated Progress to use (chapterIndex, characterOffset)
- ✅ Bumped DB version to 2 with hard migration
- ✅ Added chapter CRUD methods to StorageService
- ✅ Build passes

### Phase 2: Chunker Refactor ✅ COMPLETE
- ✅ Implemented sentence-aware chunking with simple regex
- ✅ Added ChunkConfig interface
- ✅ Wrote 19 comprehensive tests (all passing)
- ✅ Handles edge cases: empty text, long sentences, punctuation
- ✅ Build passes

### Phase 3: Import Pipeline Update 🔄 IN PROGRESS
Tasks:
1. Update ImportService to store chapters directly (no chunking)
2. Calculate word count per chapter
3. Remove old slide-based import logic
4. Test import flow

### Phase 4: Reader UI Refactor ⏳ NEXT
**Sliding Window Implementation:**

```typescript
interface ReaderState {
  bookId: string
  chapterIndex: number
  characterOffset: number
  chunkConfig: ChunkConfig
  cachedWindow: CachedSlideWindow
  lastChunkConfig: ChunkConfig
}

// Navigation
function goToNext() {
  // Move characterOffset forward by current slide length
  // If currentIndex >= 8: shift window forward
  // Otherwise: just increment index
}

function goToPrevious() {
  // Move characterOffset backward by prev slide length
  // If currentIndex <= 2: shift window backward
  // Otherwise: just decrement index
}

// Config change
function handleChunkSizeChange(newMaxWords: number) {
  setChunkConfig({ maxWords: newMaxWords })
  // Recompute window (11 slides)
  // Maintain characterOffset to preserve position
}
```

**Progress Slider (Character-Based):**
- Show chapter markers as notches
- Dragging seeks to character position
- Display: "Chapter X · YY%" or just percentage
- No "Slide X of Y" needed

**Chunk Size Slider:**
```
┌─────────────────────────────────┐
│       Reader Settings           │
├─────────────────────────────────┤
│ Slide Size                      │
│ ◄─────●─────────────────────► │
│  Smaller   Medium   Larger      │
│  (20w)     (50w)    (100w)      │
└─────────────────────────────────┘
```

### Phase 5: Testing & Polish ⏳
- Test sliding window edge cases (chapter boundaries)
- Test config changes preserve position
- Test with various book sizes
- Performance profiling
- Handle chapter transitions smoothly

## Technical Details

### Sentence Splitting (Implemented)
Simple regex: `/[^.!?]+[.!?]+(?:\s+|$)/g`
- Matches sentences ending with . ! ?
- Can be swapped for NLP library later
- Good enough for 95% of cases

### Window Shifting Strategy
- **Shift forward** when currentIndex >= 8 (approaching end)
- **Shift backward** when currentIndex <= 2 (approaching start)
- Keeps current slide roughly centered

### Chapter Boundaries
When navigating beyond window:
- **At chapter end**: Load next chapter, create new window
- **At chapter start**: Load prev chapter, create new window
- Character offset wraps to 0 or chapter.text.length

### Performance Expectations
- **Window computation**: 11 slides ≈ 1-2ms
- **Config change**: Recompute 11 slides ≈ 1-2ms
- **Navigation within window**: <1ms (just index change)
- **Book size**: O(1) - doesn't matter!

## Migration Strategy
**Hard migration** (implemented):
- DB version bump to 2 nukes all existing data
- Users must re-import EPUBs
- Clean slate, no backward compatibility

## Benefits Summary
✅ Instant navigation (within window)
✅ Config changes only recompute 11 slides
✅ Memory efficient (O(1) slides in memory)
✅ Scales to any book size
✅ Accurate character-based progress
✅ Simple architecture, easy to debug
