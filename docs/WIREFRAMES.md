# Skim UI/UX Wireframes

Mobile-first, TikTok-inspired reading experience for Gen Z.

---

## Home/Upload Screen
```
┌─────────────────────┐
│ ☰                 ⚙ │ ← Menu & Settings
│                     │
│     📚 Skim         │
│     Your Library    │
│                     │
│  ┌───────────────┐  │
│  │ 📖            │  │
│  │ The Great     │  │
│  │ Gatsby        │  │
│  │               │  │
│  │ F. Scott      │  │
│  │ Fitzgerald    │  │
│  │               │  │
│  │ ▶ Resume 67%  │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ 📖 Book 2     │  │
│  │ Author Name   │  │
│  │ ▶ Resume 23%  │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ 📖 Book 3     │  │
│  │ Author Name   │  │
│  │ ▶ Start       │  │
│  └───────────────┘  │
│                     │
│               ┌───┐ │
│               │ + │ │ ← FAB (upload)
│               └───┘ │
└─────────────────────┘
```

**Features**:
- FAB (Floating Action Button) for upload
- Card-based book list with progress
- Top bar with menu and settings icons
- Clean, familiar app layout

---

## Reading View
```
┌─────────────────────┐
│ ▓▓▓▓▓░░░░░░░░░ 45% │ ← Thin progress (in-chapter)
├─────────────────────┤
│                     │
│                     │
│                     │
│   The old clock     │
│   tower stood       │
│   silent in the     │
│   moonlight, its    │
│   hands frozen at   │
│   midnight. Nobody  │
│   knew why it had   │
│   stopped ticking   │
│   exactly fifty     │
│   years ago today.  │
│                     │
│                     │
│                     │
│                     │
│                     │
├─────────────────────┤
│     Chapter 3       │ ← Chapter name only
└─────────────────────┘
```

---

## Reading View - Settings Overlay (Tap)
```
┌─────────────────────┐
│ ▓▓▓▓▓░░░░░░░░░ 45% │
├─────────────────────┤
│  ╔═══════════════╗  │ ← Modal overlay
│  ║   Settings    ║  │
│  ╠═══════════════╣  │
│  ║               ║  │
│  ║  Text Size    ║  │
│  ║  [A-] [A] [A+]║  │
│  ║               ║  │
│  ║  Auto-Swipe   ║  │
│  ║  [OFF] [ON]   ║  │
│  ║               ║  │
│  ║  Duration     ║  │
│  ║  ●────────○   ║  │
│  ║  8s       10s ║  │
│  ║               ║  │
│  ║    [Close]    ║  │
│  ╚═══════════════╝  │
│                     │
│                     │
│     Chapter 3       │
└─────────────────────┘
```

---

## Chapter Index (Swipe Right from Reading View)
```
┌─────────────────────┐
│ ← Back to Reading   │
│                     │
│  Chapter Index      │
│                     │
│  ┌───────────────┐  │
│  │ 1. Beginning  │  │
│  │    ✓ Complete │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ 2. The Call   │  │
│  │    ✓ Complete │  │
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ 3. Midnight   │  │
│  │ ▶ 45% (here)  │  │ ← Current chapter
│  └───────────────┘  │
│                     │
│  ┌───────────────┐  │
│  │ 4. Discovery  │  │
│  │    Not read   │  │
│  └───────────────┘  │
│                     │
└─────────────────────┘
```

---

## Interaction Model

### Reading View Gestures

**Vertical Swipes** (Primary Navigation):
- **Swipe UP** → Next slide
- **Swipe DOWN** → Previous slide

**Horizontal Swipes** (Screen Navigation):
- **Swipe LEFT** → Back to Home/Library
- **Swipe RIGHT** → Open Chapter Index

**Tap Interactions**:
- **Single Tap (anywhere)** → Show/hide Settings overlay
- **Hold (long press)** → Pause auto-swipe (resume on release)

**Settings Overlay Controls**:
- **Text Size**: A-, A, A+ buttons (16px, 20px, 24px)
- **Auto-Swipe Toggle**: OFF/ON switch
- **Duration Slider**: 8s to 10s range
- **Close Button**: Dismiss overlay

**Progress Indicators**:
- **Top Bar**: Thin progress bar showing position within current chapter (0-100%)
- **Bottom Bar**: Current chapter name (e.g., "Chapter 3")

**Auto-Swipe Behavior**:
- Advances to next slide after configured duration (default 9s)
- Pauses when user holds screen
- Pauses when settings overlay is open
- Resets timer on manual swipe navigation
- Resumes automatically when overlay closes (if enabled)

---

## Animation Specs (60fps Target)

```
Slide Transition:  transform: translateY()
                   Duration: 300ms
                   Easing: cubic-bezier(0.4, 0, 0.2, 1)

Progress Update:   width transition
                   Duration: 200ms
                   Easing: ease-out

Modal Enter:       transform: translateY(100%) → 0
                   Duration: 250ms
                   Easing: cubic-bezier(0.32, 0.72, 0, 1)

Fade Controls:     opacity transition
                   Duration: 150ms
                   Easing: ease-in-out
```

All animations use `transform` and `opacity` only (GPU-accelerated).

---

## Technical Implementation Notes

**Swipe Detection**:
```typescript
// Vertical: Math.abs(deltaY) > Math.abs(deltaX)
// Horizontal: Math.abs(deltaX) > Math.abs(deltaY)
// Threshold: 50px minimum swipe distance
```

**Progress Calculation**:
```typescript
// In-chapter progress
const progress = (currentSlideInChapter / totalSlidesInChapter) * 100

// Store in IndexedDB:
// progress: { bookId, currentSlide, currentChapter, lastRead }
```

**Text Size Storage**:
```typescript
// Store in KV store:
// key: 'textSize', value: 16 | 20 | 24 (px)
// key: 'autoSwipe', value: boolean
// key: 'swipeDuration', value: 8-10 (seconds)
```

**Gesture Priority** (highest to lowest):
1. Long press (pause)
2. Horizontal swipe (navigation)
3. Vertical swipe (slide navigation)
4. Tap (settings)

---

## Implementation Priorities

### Phase 1: Core Reading Experience
1. Vertical swipe navigation (up/down)
2. Thin progress bar (in-chapter)
3. Chapter label at bottom
4. Basic text rendering (20px, system font)

### Phase 2: Navigation
5. Swipe left → Home
6. Swipe right → Chapter index
7. Chapter index screen with current position
8. Tap to jump to chapter

### Phase 3: Settings & Polish
9. Tap to show settings overlay
10. Text size controls (A-, A, A+)
11. Auto-swipe toggle
12. Duration slider
13. Hold to pause auto-swipe

### Phase 4: Auto-Advance
14. Timer implementation
15. Auto-advance with pause on interaction
16. Visual timer indicator (optional)
