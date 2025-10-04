import JSZip from 'jszip'

/**
 * Create a minimal valid EPUB for testing
 */
export async function createTestEpub(chapters: Array<{ title: string; content: string }>): Promise<ArrayBuffer> {
  const zip = new JSZip()

  // mimetype must be first and uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // META-INF/container.xml
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  )

  // Create spine entries
  const spineItems = chapters
    .map((_, idx) => `<itemref idref="chapter${idx + 1}"/>`)
    .join('\n    ')

  // Create manifest entries
  const manifestItems = chapters
    .map(
      (_, idx) =>
        `<item id="chapter${idx + 1}" href="chapter${idx + 1}.xhtml" media-type="application/xhtml+xml"/>`
    )
    .join('\n    ')

  // OEBPS/content.opf
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test Book</dc:title>
    <dc:creator>Test Author</dc:creator>
    <dc:identifier id="bookid">test-book-001</dc:identifier>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`
  )

  // Create chapter files
  chapters.forEach((chapter, idx) => {
    zip.file(
      `OEBPS/chapter${idx + 1}.xhtml`,
      `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${chapter.title}</title>
</head>
<body>
  <h1>${chapter.title}</h1>
  ${chapter.content}
</body>
</html>`
    )
  })

  const blob = await zip.generateAsync({ type: 'arraybuffer' })
  return blob
}

/**
 * Load a fixture EPUB file for testing
 */
export async function loadFixtureEpub(filename: string): Promise<ArrayBuffer> {
  const response = await fetch(`/src/parser/fixtures/${filename}`)
  if (!response.ok) {
    throw new Error(`Failed to load fixture: ${filename}`)
  }
  return response.arrayBuffer()
}
