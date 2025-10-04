import { ParserService } from './parser/ParserService'
import type { ParseProgress, ParseResult } from './parser/types'

const parser = new ParserService()

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

    // Show results
    status.className = 'status success'
    status.textContent = '✅ Parse complete!'
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

    // Display chapters
    displayChapters(result)

    // Log to console for detailed inspection
    console.group('📊 Detailed Results')
    console.log('Metadata:', result.metadata)
    console.log('Total chapters:', result.chapters.length)
    console.log('Total words:', result.totalWords)
    console.log('Parse time:', result.parseTimeMs, 'ms')
    console.log('Words/ms:', (result.totalWords / result.parseTimeMs).toFixed(2))
    console.groupEnd()

    console.group('📄 Chapter Details')
    result.chapters.forEach((chapter, idx) => {
      const wordCount = chapter.text.split(/\s+/).filter(w => w).length
      console.log(`\n${idx + 1}. ${chapter.title}`)
      console.log(`   Words: ${wordCount}`)
      console.log(`   Preview: ${chapter.text.slice(0, 100)}...`)
    })
    console.groupEnd()

    console.log('\n💡 Full chapter texts available in result.chapters array')
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

function displayChapters(result: ParseResult) {
  chaptersListEl.innerHTML = result.chapters
    .map((chapter, idx) => {
      const wordCount = chapter.text.split(/\s+/).filter(w => w).length
      const id = `chapter-${idx}`

      return `
        <div class="chapter">
          <div class="chapter-header">
            <div>
              <div class="chapter-title">${idx + 1}. ${chapter.title}</div>
              <div class="chapter-meta">${wordCount.toLocaleString()} words · Chapter ${chapter.chapter}</div>
            </div>
            <button class="toggle-btn" onclick="toggleChapter('${id}')">
              Show Text
            </button>
          </div>
          <div class="chapter-text" id="${id}" style="display: none;">
${chapter.text}
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
    if (btn) btn.textContent = 'Hide Text'
  } else {
    el.style.display = 'none'
    if (btn) btn.textContent = 'Show Text'
  }
}
