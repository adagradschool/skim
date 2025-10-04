import { ParserService } from './parser/ParserService'
import { ChunkerService } from './chunker/ChunkerService'
import type { ParseProgress, ParseResult } from './parser/types'
import type { ChapterInput } from './chunker/types'

const parser = new ParserService()
const chunker = new ChunkerService()

// Get DOM elements
const uploadArea = document.getElementById('uploadArea')!
const fileInput = document.getElementById('fileInput')!
const status = document.getElementById('status')!
const results = document.getElementById('results')!

// Metric elements
const titleEl = document.getElementById('title')!
const authorEl = document.getElementById('author')!
const fileSizeEl = document.getElementById('fileSize')!
const parseTimeEl = document.getElementById('parseTime')!
const chapterCountEl = document.getElementById('chapterCount')!
const totalWordsEl = document.getElementById('totalWords')!
const performanceEl = document.getElementById('performanceAssessment')!
const chaptersListEl = document.getElementById('chaptersList')!

// Upload interactions
uploadArea.addEventListener('click', () => fileInput.click())

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault()
  uploadArea.classList.add('dragover')
})

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover')
})

uploadArea.addEventListener('drop', (e) => {
  e.preventDefault()
  uploadArea.classList.remove('dragover')
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleFile(files[0]!)
  }
})

fileInput.addEventListener('change', (e) => {
  const files = (e.target as HTMLInputElement).files
  if (files && files.length > 0) {
    handleFile(files[0]!)
  }
})

async function handleFile(file: File) {
  console.log('📖 Parsing EPUB:', file.name)

  // Reset UI
  results.style.display = 'none'
  status.className = 'status loading'
  status.textContent = 'Loading EPUB...'

  try {
    // Read file
    const data = await file.arrayBuffer()
    const fileSizeMB = (data.byteLength / (1024 * 1024)).toFixed(2)

    console.log(`File size: ${fileSizeMB} MB`)

    // Parse with progress updates
    const startTime = performance.now()
    const result = await parser.parse(data, (prog: ParseProgress) => {
      status.textContent = prog.message
      console.log(`[${prog.stage}] ${prog.message}`)
    })

    const totalTime = performance.now() - startTime

    console.log('✅ Parse complete!')
    console.log('Results:', result)

    // Chunk into slides
    status.textContent = 'Chunking into slides...'
    const chunkStart = performance.now()

    const chapters: ChapterInput[] = result.chapters.map((ch) => ({
      chapter: ch.chapter,
      text: ch.text,
    }))

    const chunkResult = chunker.split('test-book', chapters)
    const chunkTime = performance.now() - chunkStart

    console.log('✅ Chunking complete!')
    console.log('Chunk result:', chunkResult)

    // Show results
    status.className = 'status success'
    status.textContent = '✅ Complete!'
    results.style.display = 'block'

    // Display metrics
    titleEl.textContent = result.metadata.title || 'Unknown'
    authorEl.textContent = result.metadata.author || 'Unknown'
    fileSizeEl.textContent = `${fileSizeMB} MB`
    parseTimeEl.textContent = `${result.parseTimeMs.toFixed(0)} ms`
    chapterCountEl.textContent = result.chapters.length.toString()
    totalWordsEl.textContent = result.totalWords.toLocaleString()

    // Performance assessment
    displayPerformance(result, fileSizeMB)

    // Display chapters with slides
    displayChapters(result, chunkResult.slides)

    // Log to console for detailed inspection
    console.group('📊 Detailed Results')
    console.log('Metadata:', result.metadata)
    console.log('Total chapters:', result.chapters.length)
    console.log('Total words:', result.totalWords)
    console.log('Parse time:', result.parseTimeMs, 'ms')
    console.log('Words/ms:', (result.totalWords / result.parseTimeMs).toFixed(2))
    console.groupEnd()

    console.group('📊 Chunking Results')
    console.log('Total slides:', chunkResult.totalSlides)
    console.log('Avg words/slide:', chunkResult.averageWordsPerSlide.toFixed(2))
    console.log('Chunk time:', chunkTime.toFixed(2), 'ms')
    console.groupEnd()

    console.group('📄 Sample Slides (first 10)')
    chunkResult.slides.slice(0, 10).forEach((slide, idx) => {
      console.log(`\n${idx + 1}. Slide ${slide.slideIndex} (Chapter ${slide.chapter})`)
      console.log(`   Words: ${slide.wordCount}`)
      console.log(`   Preview: ${slide.text.slice(0, 100)}...`)
    })
    console.groupEnd()

    console.log('\n💡 Full data available in result.chapters and chunkResult.slides')
  } catch (err) {
    console.error('❌ Parse error:', err)
    status.className = 'status error'
    status.textContent = `❌ Error: ${err instanceof Error ? err.message : String(err)}`
  }
}

function displayPerformance(result: ParseResult, fileSizeMB: string) {
  const parseTime = result.parseTimeMs
  const wordsPerMs = result.totalWords / parseTime

  let perfClass = 'perf-excellent'
  let perfText = '🚀 EXCELLENT'
  let perfDesc = 'Parse time < 1500ms (desktop target met)'

  if (parseTime >= 3000) {
    perfClass = 'perf-poor'
    perfText = '⚠️ SLOW'
    perfDesc = 'Parse time > 3000ms (exceeds mobile budget)'
  } else if (parseTime >= 1500) {
    perfClass = 'perf-good'
    perfText = '✓ ACCEPTABLE'
    perfDesc = 'Parse time < 3000ms (mobile target met)'
  }

  performanceEl.innerHTML = `
    <div style="margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 6px;">
      <div style="margin-bottom: 10px;">
        <span class="performance-badge ${perfClass}">${perfText}</span>
      </div>
      <div style="color: #666;">${perfDesc}</div>
      <div style="margin-top: 10px; font-size: 14px; color: #666;">
        Processing speed: ${wordsPerMs.toFixed(2)} words/ms
      </div>
    </div>
  `
}

function displayChapters(result: ParseResult, slides: any[]) {
  chaptersListEl.innerHTML = result.chapters
    .map((chapter, idx) => {
      const wordCount = chapter.text.split(/\s+/).filter((w) => w).length
      const id = `chapter-${idx}`

      // Get slides for this chapter
      const chapterSlides = slides.filter((s) => s.chapter === chapter.chapter)

      // Create table with slides
      const slidesTable = `
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background: #e9ecef;">
              <th style="padding: 10px; text-align: left; border: 1px solid #dee2e6;">Slide #</th>
              <th style="padding: 10px; text-align: left; border: 1px solid #dee2e6;">Words</th>
              <th style="padding: 10px; text-align: left; border: 1px solid #dee2e6;">Text</th>
            </tr>
          </thead>
          <tbody>
            ${chapterSlides
              .map(
                (slide) => `
              <tr>
                <td style="padding: 10px; border: 1px solid #dee2e6; vertical-align: top; font-weight: 600;">${slide.slideIndex}</td>
                <td style="padding: 10px; border: 1px solid #dee2e6; vertical-align: top;">${slide.wordCount}</td>
                <td style="padding: 10px; border: 1px solid #dee2e6; white-space: pre-wrap; line-height: 1.5;">${slide.text}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      `

      return `
        <div class="chapter">
          <div class="chapter-header">
            <div>
              <div class="chapter-title">${idx + 1}. ${chapter.title}</div>
              <div class="chapter-meta">${wordCount.toLocaleString()} words · ${chapterSlides.length} slides · Chapter ${chapter.chapter}</div>
            </div>
            <button class="toggle-btn" onclick="toggleChapter('${id}')">
              Show Slides
            </button>
          </div>
          <div class="chapter-text" id="${id}" style="display: none;">
${slidesTable}
          </div>
        </div>
      `
    })
    .join('')
}

// Make toggleChapter available globally
;(window as any).toggleChapter = (id: string) => {
  const el = document.getElementById(id)!
  const btn = el.previousElementSibling?.querySelector('.toggle-btn')

  if (el.style.display === 'none') {
    el.style.display = 'block'
    if (btn) btn.textContent = 'Hide Slides'
  } else {
    el.style.display = 'none'
    if (btn) btn.textContent = 'Show Slides'
  }
}
