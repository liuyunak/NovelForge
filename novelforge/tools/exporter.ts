/**
 * NovelForge Exporter — Multi-format novel export (TXT, DOCX, PDF, EPUB)
 *
 * Uses pure Node.js built-in modules (zlib for ZIP, fs for file I/O).
 * No external dependencies required.
 *
 * - TXT: Plain text with formatting
 * - DOCX: Office Open XML (ZIP of XML files)
 * - PDF: HTML wrapper with print-ready CSS (renders via browser print-to-PDF)
 * - EPUB: EPUB 3.0 (ZIP of XHTML + OPF + NCX)
 */
import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'

export type ExportFormat = 'txt' | 'docx' | 'pdf' | 'epub'

export interface ExportOptions {
  format: ExportFormat
  includeMetadata?: boolean
  chapterRange?: { start: number; end: number }
}

interface ChapterData {
  number: number
  title: string
  content: string
}

interface NovelMetadata {
  title: string
  author: string
  genre: string
  corePremise: string
}

export class Exporter {
  private workspacePath: string

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath
  }

  async export(options: ExportOptions): Promise<string> {
    const chapters = await this.loadChapters(options.chapterRange)
    const metadata = this.getMetadata()

    const outputDir = path.join(this.workspacePath, 'exports')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const filename = `novel_export_${Date.now()}.${options.format}`
    const outputPath = path.join(outputDir, filename)

    switch (options.format) {
      case 'txt':
        await this.saveAsTxt(chapters, metadata, options, outputPath)
        break
      case 'docx':
        await this.saveAsDocx(chapters, metadata, options, outputPath)
        break
      case 'pdf':
        await this.saveAsPdf(chapters, metadata, options, outputPath)
        break
      case 'epub':
        await this.saveAsEpub(chapters, metadata, options, outputPath)
        break
    }

    return outputPath
  }

  // ==================== Chapter Loading ====================

  private async loadChapters(range?: { start: number; end: number }): Promise<ChapterData[]> {
    const chaptersDir = path.join(this.workspacePath, 'chapters')
    if (!fs.existsSync(chaptersDir)) {
      return []
    }

    const files = fs.readdirSync(chaptersDir)
      .filter(f => f.endsWith('.md'))
      .sort()

    const chapters: ChapterData[] = []

    for (const file of files) {
      const match = file.match(/chapter_(\d+)\.md/)
      if (!match) continue

      const chapterNum = parseInt(match[1])

      if (range && (chapterNum < range.start || chapterNum > range.end)) {
        continue
      }

      const rawContent = fs.readFileSync(path.join(chaptersDir, file), 'utf-8')
      // Extract title from first line (## Title or # Title)
      const lines = rawContent.split('\n')
      let title = `第${chapterNum}章`
      let content = rawContent

      const firstLine = lines[0]?.trim()
      if (firstLine?.startsWith('#')) {
        title = firstLine.replace(/^#+\s*/, '')
        content = lines.slice(1).join('\n').trim()
      }

      chapters.push({ number: chapterNum, title, content })
    }

    return chapters
  }

  private getMetadata(): NovelMetadata {
    try {
      const settingPath = path.join(this.workspacePath, 'state', 'MASTER_SETTING.json')
      if (fs.existsSync(settingPath)) {
        const setting = JSON.parse(fs.readFileSync(settingPath, 'utf-8'))
        return {
          title: setting.title || '未命名小说',
          author: setting.author || 'NovelForge',
          genre: setting.genre || '',
          corePremise: setting.core_premise || '',
        }
      }
    } catch {}
    return { title: '未命名小说', author: 'NovelForge', genre: '', corePremise: '' }
  }

  // ==================== TXT Export ====================

  private async saveAsTxt(chapters: ChapterData[], metadata: NovelMetadata, options: ExportOptions, outputPath: string): Promise<void> {
    let content = ''

    if (options.includeMetadata !== false) {
      content += `《${metadata.title}》\n`
      if (metadata.author) content += `作者：${metadata.author}\n`
      if (metadata.genre) content += `题材：${metadata.genre}\n`
      if (metadata.corePremise) content += `核心设定：${metadata.corePremise}\n`
      content += '\n' + '='.repeat(50) + '\n\n'
    }

    for (const chapter of chapters) {
      content += `第${chapter.number}章 ${chapter.title}\n\n`
      content += chapter.content
      content += '\n\n' + '-'.repeat(30) + '\n\n'
    }

    fs.writeFileSync(outputPath, content, 'utf-8')
  }

  // ==================== DOCX Export ====================

  private async saveAsDocx(chapters: ChapterData[], metadata: NovelMetadata, _options: ExportOptions, outputPath: string): Promise<void> {
    const docxFiles = this.buildDocxFiles(chapters, metadata)
    await this.createZip(docxFiles, outputPath)
  }

  private buildDocxFiles(chapters: ChapterData[], metadata: NovelMetadata): Map<string, string> {
    const files = new Map<string, string>()

    // [Content_Types].xml
    files.set('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`)

    // _rels/.rels
    files.set('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)

    // word/_rels/document.xml.rels
    files.set('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)

    // Build document body
    let bodyXml = ''
    bodyXml += `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${this.escapeXml(metadata.title)}</w:t></w:r></w:p>`
    if (metadata.author) {
      bodyXml += `<w:p><w:pPr><w:pStyle w:val="Subtitle"/></w:pPr><w:r><w:t>作者：${this.escapeXml(metadata.author)}</w:t></w:r></w:p>`
    }
    if (metadata.genre) {
      bodyXml += `<w:p><w:r><w:t>题材：${this.escapeXml(metadata.genre)}</w:t></w:r></w:p>`
    }
    bodyXml += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`

    for (const chapter of chapters) {
      // Chapter heading
      bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>第${chapter.number}章 ${this.escapeXml(chapter.title)}</w:t></w:r></w:p>`

      // Chapter content — split by paragraphs
      const paragraphs = chapter.content.split(/\n\s*\n/)
      for (const para of paragraphs) {
        const trimmed = para.trim()
        if (!trimmed) continue
        // Split long lines into sentences for better formatting
        const lines = trimmed.split('\n').filter(l => l.trim())
        if (lines.length > 1) {
          for (const line of lines) {
            bodyXml += `<w:p><w:r><w:t xml:space="preserve">${this.escapeXml(line.trim())}</w:t></w:r></w:p>`
          }
        } else {
          bodyXml += `<w:p><w:r><w:t xml:space="preserve">${this.escapeXml(trimmed)}</w:t></w:r></w:p>`
        }
      }
    }

    // word/document.xml
    files.set('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
            xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
            xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${bodyXml}</w:body>
</w:document>`)

    // word/styles.xml
    files.set('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle">
    <w:name w:val="Subtitle"/>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:line="360" w:lineRule="auto" w:after="120"/><w:ind w:firstLine="480"/></w:pPr>
    <w:rPr><w:sz w:val="24"/><w:rFonts w:eastAsia="宋体"/></w:rPr>
  </w:style>
</w:styles>`)

    return files
  }

  // ==================== PDF Export (HTML wrapper) ====================

  private async saveAsPdf(chapters: ChapterData[], metadata: NovelMetadata, _options: ExportOptions, outputPath: string): Promise<void> {
    const html = this.buildPdfHtml(chapters, metadata)
    fs.writeFileSync(outputPath, html, 'utf-8')
  }

  private buildPdfHtml(chapters: ChapterData[], metadata: NovelMetadata): string {
    let chapterHtml = ''
    for (const chapter of chapters) {
      const contentHtml = chapter.content
        .split('\n')
        .map(line => {
          const trimmed = line.trim()
          if (!trimmed) return '<p>&nbsp;</p>'
          return `<p>${this.escapeHtml(trimmed)}</p>`
        })
        .join('\n')

      chapterHtml += `
    <section class="chapter">
      <h2>第${chapter.number}章 ${this.escapeHtml(chapter.title)}</h2>
      ${contentHtml}
    </section>`
    }

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${this.escapeHtml(metadata.title)}</title>
  <style>
    @page {
      size: A4;
      margin: 2cm 2.5cm;
      @bottom-center {
        content: counter(page);
        font-size: 10pt;
        color: #999;
      }
    }
    @page :first {
      @bottom-center { content: none; }
    }
    body {
      font-family: "宋体", "SimSun", "Noto Serif CJK SC", serif;
      font-size: 12pt;
      line-height: 1.8;
      color: #333;
      max-width: 100%;
    }
    .cover {
      text-align: center;
      padding-top: 30%;
      page-break-after: always;
    }
    .cover h1 {
      font-size: 28pt;
      font-weight: bold;
      margin-bottom: 0.5em;
    }
    .cover .author {
      font-size: 14pt;
      color: #666;
      margin-top: 2em;
    }
    .cover .genre {
      font-size: 12pt;
      color: #999;
      margin-top: 1em;
    }
    .toc {
      page-break-after: always;
    }
    .toc h2 {
      text-align: center;
      font-size: 18pt;
    }
    .toc ul {
      list-style: none;
      padding: 0;
    }
    .toc li {
      padding: 4px 0;
      border-bottom: 1px dotted #ccc;
    }
    .chapter {
      page-break-before: always;
    }
    .chapter h2 {
      font-size: 16pt;
      text-align: center;
      margin-bottom: 1.5em;
    }
    .chapter p {
      text-indent: 2em;
      margin: 0.3em 0;
    }
    .chapter p:first-of-type {
      text-indent: 2em;
    }
  </style>
</head>
<body>
  <div class="cover">
    <h1>${this.escapeHtml(metadata.title)}</h1>
    ${metadata.author ? `<p class="author">作者：${this.escapeHtml(metadata.author)}</p>` : ''}
    ${metadata.genre ? `<p class="genre">题材：${this.escapeHtml(metadata.genre)}</p>` : ''}
  </div>
  <div class="toc">
    <h2>目录</h2>
    <ul>
      ${chapters.map(ch => `<li>第${ch.number}章 ${this.escapeHtml(ch.title)}</li>`).join('\n      ')}
    </ul>
  </div>
  ${chapterHtml}
</body>
</html>`
  }

  // ==================== EPUB Export ====================

  private async saveAsEpub(chapters: ChapterData[], metadata: NovelMetadata, _options: ExportOptions, outputPath: string): Promise<void> {
    const epubFiles = this.buildEpubFiles(chapters, metadata)
    await this.createZip(epubFiles, outputPath)
  }

  private buildEpubFiles(chapters: ChapterData[], metadata: NovelMetadata): Map<string, string> {
    const files = new Map<string, string>()
    const bookId = `novelforge-${Date.now()}`
    const modifiedDate = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

    // mimetype (must be first, uncompressed)
    files.set('mimetype', 'application/epub+zip')

    // META-INF/container.xml
    files.set('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

    // Build chapter XHTML files
    const manifestItems: string[] = []
    const spineItems: string[] = []
    const navItems: string[] = []

    // Cover page
    const coverHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" lang="zh-CN">
<head><title>封面</title></head>
<body>
  <div style="text-align:center; padding-top:30%;">
    <h1>${this.escapeXml(metadata.title)}</h1>
    ${metadata.author ? `<p>作者：${this.escapeXml(metadata.author)}</p>` : ''}
    ${metadata.genre ? `<p>题材：${this.escapeXml(metadata.genre)}</p>` : ''}
  </div>
</body>
</html>`
    files.set('OEBPS/cover.xhtml', coverHtml)
    manifestItems.push('<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>')
    spineItems.push('<itemref idref="cover"/>')

    // Chapter files
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i]
      const chId = `ch${chapter.number}`
      const chFile = `chapter_${String(chapter.number).padStart(3, '0')}.xhtml`

      const contentHtml = chapter.content
        .split('\n')
        .map(line => {
          const trimmed = line.trim()
          if (!trimmed) return '<p>&#160;</p>'
          return `<p>${this.escapeXml(trimmed)}</p>`
        })
        .join('\n')

      const chHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" lang="zh-CN">
<head><title>第${chapter.number}章 ${this.escapeXml(chapter.title)}</title></head>
<body>
  <h2>第${chapter.number}章 ${this.escapeXml(chapter.title)}</h2>
  ${contentHtml}
</body>
</html>`
      files.set(`OEBPS/${chFile}`, chHtml)
      manifestItems.push(`<item id="${chId}" href="${chFile}" media-type="application/xhtml+xml"/>`)
      spineItems.push(`<itemref idref="${chId}"/>`)
      navItems.push(`<li><a href="${chFile}">第${chapter.number}章 ${this.escapeXml(chapter.title)}</a></li>`)
    }

    // TOC (nav.xhtml)
    const navHtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">
<head><title>目录</title></head>
<body>
  <nav epub:type="toc">
    <h2>目录</h2>
    <ol>
      ${navItems.join('\n      ')}
    </ol>
  </nav>
</body>
</html>`
    files.set('OEBPS/nav.xhtml', navHtml)
    manifestItems.push('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')

    // content.opf
    const opfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${this.escapeXml(metadata.title)}</dc:title>
    <dc:creator>${this.escapeXml(metadata.author || 'NovelForge')}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <dc:date>${modifiedDate}</dc:date>
    <dc:identifier id="book-id">urn:uuid:${bookId}</dc:identifier>
    <meta property="dcterms:modified">${modifiedDate}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spineItems.join('\n    ')}
  </spine>
</package>`
    files.set('OEBPS/content.opf', opfXml)

    return files
  }

  // ==================== ZIP Utility ====================

  /**
   * Create a ZIP file from a Map of virtual paths to content strings.
   * Uses Node.js zlib for DEFLATE compression.
   * The mimetype entry (if present) is stored uncompressed per EPUB spec.
   */
  private async createZip(files: Map<string, string>, outputPath: string): Promise<void> {
    const chunks: Buffer[] = []
    const centralDir: Buffer[] = []
    let offset = 0

    for (const [filename, content] of files) {
      const nameBuf = Buffer.from(filename, 'utf-8')
      const contentBuf = Buffer.from(content, 'utf-8')

      // mimetype must be stored uncompressed
      const shouldCompress = filename !== 'mimetype'

      let compressedBuf: Buffer
      let compressionMethod: number

      if (shouldCompress && contentBuf.length > 0) {
        compressedBuf = zlib.deflateRawSync(contentBuf)
        compressionMethod = 8 // DEFLATE
      } else {
        compressedBuf = contentBuf
        compressionMethod = 0 // STORE
      }

      // CRC-32 calculation
      const crc = this.crc32(contentBuf)

      // Local file header
      const localHeader = Buffer.alloc(30 + nameBuf.length)
      localHeader.writeUInt32LE(0x04034b50, 0)            // signature
      localHeader.writeUInt16LE(20, 4)                     // version needed
      localHeader.writeUInt16LE(0x0800, 6)                 // general purpose bit flag (UTF-8)
      localHeader.writeUInt16LE(compressionMethod, 8)       // compression method
      localHeader.writeUInt32LE(0, 10)                     // DOS date/time (unused)
      localHeader.writeUInt32LE(crc, 14)                   // CRC-32
      localHeader.writeUInt32LE(compressedBuf.length, 18)  // compressed size
      localHeader.writeUInt32LE(contentBuf.length, 22)     // uncompressed size
      localHeader.writeUInt16LE(nameBuf.length, 26)        // filename length
      localHeader.writeUInt16LE(0, 28)                     // extra field length
      nameBuf.copy(localHeader, 30)

      chunks.push(localHeader)
      chunks.push(compressedBuf)

      // Central directory entry
      const cdEntry = Buffer.alloc(46 + nameBuf.length)
      cdEntry.writeUInt32LE(0x02014b50, 0)                // signature
      cdEntry.writeUInt16LE(20, 4)                         // version made by
      cdEntry.writeUInt16LE(20, 6)                         // version needed
      cdEntry.writeUInt16LE(0x0800, 8)                     // flags (UTF-8)
      cdEntry.writeUInt16LE(compressionMethod, 10)         // compression method
      cdEntry.writeUInt32LE(0, 12)                        // DOS time
      cdEntry.writeUInt32LE(crc, 16)                       // CRC-32
      cdEntry.writeUInt32LE(compressedBuf.length, 20)      // compressed size
      cdEntry.writeUInt32LE(contentBuf.length, 24)         // uncompressed size
      cdEntry.writeUInt16LE(nameBuf.length, 28)            // filename length
      cdEntry.writeUInt16LE(0, 30)                        // extra field length
      cdEntry.writeUInt16LE(0, 32)                        // file comment length
      cdEntry.writeUInt16LE(0, 34)                        // disk number start
      cdEntry.writeUInt16LE(0, 36)                        // internal file attributes
      cdEntry.writeUInt32LE(0, 38)                        // external file attributes
      cdEntry.writeUInt32LE(offset, 42)                   // relative offset of local header
      nameBuf.copy(cdEntry, 46)

      centralDir.push(cdEntry)
      offset += localHeader.length + compressedBuf.length
    }

    // End of central directory record
    const cdOffset = offset
    const cdSize = centralDir.reduce((sum, e) => sum + e.length, 0)
    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)                     // signature
    eocd.writeUInt16LE(0, 4)                               // disk number
    eocd.writeUInt16LE(0, 6)                               // disk with CD
    eocd.writeUInt16LE(files.size, 8)                     // entries on disk
    eocd.writeUInt16LE(files.size, 10)                     // total entries
    eocd.writeUInt32LE(cdSize, 12)                         // CD size
    eocd.writeUInt32LE(cdOffset, 16)                       // CD offset
    eocd.writeUInt16LE(0, 20)                              // comment length

    // Write all chunks to file
    const allBuffers = [...chunks, ...centralDir, eocd]
    const totalLength = allBuffers.reduce((sum, b) => sum + b.length, 0)
    const output = Buffer.concat(allBuffers, totalLength)
    fs.writeFileSync(outputPath, output)
  }

  /**
   * CRC-32 checksum (used by ZIP format).
   */
  private crc32(data: Buffer): number {
    let crc = 0xFFFFFFFF
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i]
      for (let j = 0; j < 8; j++) {
        if (crc & 1) {
          crc = (crc >>> 1) ^ 0xEDB88320
        } else {
          crc >>>= 1
        }
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
  }

  // ==================== XML/HTML Escaping ====================

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
}
