# Product Specification: Skim

## Overview
A TikTok-style EPUB reader that displays books in bite-sized chunks with automatic progression, making reading more engaging and accessible.

## Core Features

### Reading Experience
- Display 50 words per slide in a vertical, full-screen format
- Auto-swipe to next slide after configurable duration (default: 8-10 seconds)
- Manual swipe controls (up/down or tap) to navigate between slides
- Progress indicator showing position in book
- Pause/resume auto-advance functionality

### Content Management
- Upload any EPUB file from device
- Parse EPUB and extract text content
- Preserve chapter structure
- Store current reading position

### UI/UX
- Minimal, distraction-free interface
- Large, readable typography optimized for mobile
- Dark/light mode support
- Simple progress bar or chapter indicator
- Smooth transitions between slides

## Technical Architecture

### Platform
- **Progressive Web App (PWA)**
  - Completely client-side (no server required)
  - Installable on mobile devices
  - Works offline after initial load
  - Responsive design (mobile-first, desktop-compatible)
  - Can be hosted on static hosting (GitHub Pages, Netlify, etc.)

### Technology Stack
- **Frontend Framework**: React
- **EPUB Parsing**: epub.js or similar lightweight library
- **Storage**: IndexedDB for storing uploaded EPUBs and reading progress (all local)
- **Build Tool**: Bun (for fast bundling and development)
- **Styling**: CSS Modules or Tailwind CSS (keep minimal)

### Key Components
1. **Upload Component**: File input for EPUB upload
2. **Parser Service**: Extract and chunk text into ~50-word segments
3. **Reader Component**: Full-screen slide display with auto-advance
4. **Navigation Controls**: Swipe/tap handlers, pause/play, progress
5. **Storage Service**: Persist books and reading position

### Data Flow
1. User uploads EPUB file
2. Parse EPUB to extract text and metadata
3. Split text into 50-word chunks
4. Store chunks and metadata in IndexedDB
5. Render chunks sequentially with auto-advance timer
6. Save reading position on navigation

## Minimum Viable Product (MVP)

### Must Have
- EPUB file upload
- Text extraction and chunking (50 words/slide)
- Auto-advance slides with timer
- Manual navigation (swipe/tap)
- Pause/resume functionality
- Progress tracking within book

### Nice to Have (Future)
- Adjustable word count per slide
- Adjustable auto-advance speed
- Bookmarks and highlights
- Multiple book library
- Reading statistics
- Social sharing of progress

## Technical Constraints
- Keep bundle size minimal (<500KB initial load)
- Support Chrome, Safari, Firefox mobile browsers
- Handle EPUBs up to 5MB initially
- Smooth 60fps animations

## Success Metrics
- Time to first slide < 3 seconds after upload
- Smooth transitions (no jank)
- Offline functionality working
- Users can complete a book chapter in one session
