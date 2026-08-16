import { describe, expect, it } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import { createHash, createCipheriv } from 'node:crypto'
import { md5, md5Hex, protectPdf } from '../functions/_lib/pdfSecurity'
import { buildDocx, crc32, parseHtml, sanitizeFilename, zipStore } from '../functions/_lib/officeExport'
import { buildPdf } from '../functions/_lib/documentExport'

const TINY_PNG = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
)

const SAMPLE_HTML = `
<h1>Inspection Summary</h1>
<p>This is a <strong>bold</strong> and <i>italic</i> line with a <a href="https://example.com">link</a>.</p>
<ul><li>First item</li><li>Second item</li></ul>
<ol><li>Numbered one</li><li>Numbered two</li></ol>
<blockquote>A quoted note.</blockquote>
<hr>
<p>Final paragraph.</p>
`

function zipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let i = Math.max(0, bytes.byteLength - 65557); i <= bytes.byteLength - 22; i++) {
    if (view.getUint32(i, true) === 0x06054b50) eocd = i
  }
  expect(eocd).toBeGreaterThan(-1)
  const count = view.getUint16(eocd + 10, true)
  const cdOffset = view.getUint32(eocd + 16, true)
  const out = new Map<string, Uint8Array>()
  let p = cdOffset
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50)
    const method = view.getUint16(p + 10, true)
    const crc = view.getUint32(p + 16, true)
    const size = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = new TextDecoder().decode(bytes.slice(p + 46, p + 46 + nameLen))
    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + localNameLen + localExtraLen
    const data = bytes.slice(start, start + size)
    expect(crc32(data)).toBe(crc)
    expect(method).toBe(0)
    out.set(name, data)
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

describe('crypto primitives', () => {
  it('computes known MD5 vectors', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72')
    expect(md5Hex('The quick brown fox jumps over the lazy dog')).toBe('9e107d9d372bb6826bd81d3542a419d6')
    expect(md5(new Uint8Array([0x61, 0x62, 0x63])).length).toBe(16)
  })

  it('computes CRC32 correctly', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new TextEncoder().encode(''))).toBe(0)
  })

  it('builds a well-formed stored ZIP', () => {
    const enc = new TextEncoder()
    const zip = zipStore([
      { name: 'hello.txt', data: enc.encode('Hello, world!') },
      { name: 'dir/nested.txt', data: enc.encode('nested content here') },
    ])
    const entries = zipEntries(zip)
    expect([...entries.keys()]).toEqual(['hello.txt', 'dir/nested.txt'])
    expect(new TextDecoder().decode(entries.get('hello.txt'))).toBe('Hello, world!')
    expect(zip[0]).toBe(0x50)
    expect(zip[1]).toBe(0x4b)
  })
})

describe('sanitizeFilename', () => {
  it('strips filesystem-hostile characters', () => {
    expect(sanitizeFilename('Lease: Agreement "Final" / 2026?')).toBe('Lease Agreement Final  2026')
    expect(sanitizeFilename('   ')).toBe('document')
  })
})

describe('parseHtml', () => {
  it('extracts headings, paragraphs, lists, quotes and rules', () => {
    const blocks = parseHtml(SAMPLE_HTML)
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 1 })
    expect(blocks[1].kind).toBe('paragraph')
    const para = blocks[1] as { runs: { bold?: boolean; italic?: boolean; href?: string }[] }
    expect(para.runs.some((r) => r.bold)).toBe(true)
    expect(para.runs.some((r) => r.italic)).toBe(true)
    expect(para.runs.some((r) => r.href === 'https://example.com')).toBe(true)
    expect(blocks.filter((b) => b.kind === 'listitem')).toHaveLength(4)
    const firstList = blocks.filter((b) => b.kind === 'listitem')
    expect((firstList[0] as { ordered: boolean }).ordered).toBe(false)
    expect((firstList[2] as { ordered: boolean }).ordered).toBe(true)
    expect((firstList[2] as { index: number }).index).toBe(1)
    expect(blocks.some((b) => b.kind === 'quote')).toBe(true)
    expect(blocks.some((b) => b.kind === 'hr')).toBe(true)
  })

  it('turns <br> into a line break run and drops empty paragraphs', () => {
    const blocks = parseHtml('<p>Line one<br>Line two</p><p> </p><p>Keep me</p>')
    const para = blocks[0] as { runs: { text: string }[] }
    expect(para.runs.map((r) => r.text).join('|')).toContain('Line two')
    expect(blocks.some((b) => (b as { runs?: { text: string }[] }).runs?.some((r) => r.text.includes('\n')))).toBe(true)
    expect(blocks).toHaveLength(2)
  })
})

describe('DOCX export', () => {
  it('builds a real OOXML package with letterhead, styles and content', async () => {
    const bytes = await buildDocx({ title: 'Inspection Summary', html: SAMPLE_HTML, branded: true, logoBytes: TINY_PNG })
    expect(bytes.byteLength).toBeGreaterThan(2000)
    const entries = zipEntries(bytes)
    expect(entries.has('[Content_Types].xml')).toBe(true)
    expect(entries.has('word/document.xml')).toBe(true)
    expect(entries.has('word/_rels/document.xml.rels')).toBe(true)
    expect(entries.has('word/styles.xml')).toBe(true)
    expect(entries.has('word/footer1.xml')).toBe(true)
    expect(entries.has('word/media/image1.png')).toBe(true)
    const doc = new TextDecoder().decode(entries.get('word/document.xml')!)
    expect(doc).toContain('<w:tbl>')
    expect(doc).toContain('Pinnacle Management Ventures')
    expect(doc).toContain('Heading1')
    expect(doc).toContain('<w:b/>')
    expect(doc).toContain('<w:hyperlink')
    expect(doc).toContain('r:embed="rId4"')
    expect(doc).toContain('<w:footerReference')
    expect(doc).toContain('Inspection Summary')
    const footer = new TextDecoder().decode(entries.get('word/footer1.xml')!)
    expect(footer).toContain('Confidential')
    const rels = new TextDecoder().decode(entries.get('word/_rels/document.xml.rels')!)
    expect(rels).toContain('https://example.com')
    expect(rels).toContain('TargetMode="External"')
  })

  it('omits branding for blank documents', async () => {
    const bytes = await buildDocx({ title: 'Plain Note', html: '<p>Body only</p>', branded: false })
    const doc = new TextDecoder().decode(zipEntries(bytes).get('word/document.xml')!)
    expect(doc).not.toContain('<w:tbl>')
    expect(doc).toContain('Body only')
  })
})

describe('PDF export', () => {
  it('renders a loadable letterhead PDF with content', async () => {
    const bytes = await buildPdf({ title: 'Inspection Summary', html: SAMPLE_HTML, branded: true, logoBytes: TINY_PNG })
    expect(bytes.byteLength).toBeGreaterThan(1500)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(pdf.getTitle()).toBe('Inspection Summary — Pinnacle Management Ventures')
    const content = await pdf.getForm() // no-op: ensures doc parsed
    void content
    // Verify the drawn text by inflating the page content stream.
    const text = new TextDecoder().decode(bytes)
    const objRe = /(\d+) 0 obj\b([\s\S]*?)endobj/g
    let m: RegExpExecArray | null
    let found = ''
    while ((m = objRe.exec(text))) {
      if (m[2].includes('/FlateDecode')) {
        const sm = m[2].match(/stream\r?\n([\s\S]*?)endstream/)
        if (!sm) continue
        try {
          found += new TextDecoder().decode(inflateSync(Buffer.from(sm[1], 'latin1')))
        } catch {
          /* not a content stream */
        }
      }
    }
    expect(found).toContain('Inspection Summary')
    expect(found).toContain('bold')
    expect(found).toContain('Pinnacle')
  })

  it('handles a long multi-page document', async () => {
    const longHtml = Array.from({ length: 80 }, (_, i) => `<p>Paragraph number ${i} with enough words to wrap across the line width comfortably.</p>`).join('')
    const bytes = await buildPdf({ title: 'Long Document', html: longHtml, branded: true })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })
})

describe('Protected PDF (R=4 AES-128)', () => {
  function padPassword(password: string): Buffer {
    const PAD = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex')
    const bytes = Buffer.from(password, 'utf8')
    if (bytes.length >= 32) return bytes.slice(0, 32)
    return Buffer.concat([bytes, PAD.slice(0, 32 - bytes.length)])
  }

  it('produces a structurally valid encrypted PDF and hides the plaintext', async () => {
    const plain = await buildPdf({ title: 'Secret Memo', html: '<p>UltraTopSecretContent</p>', branded: true, logoBytes: TINY_PNG })
    const protectedBytes = await protectPdf(plain, 'hunter22', 'owner22')
    const text = new TextDecoder().decode(protectedBytes)

    expect(() => PDFDocument.load(protectedBytes)).toThrow()
    const pdf = await PDFDocument.load(protectedBytes, { ignoreEncryption: true })
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(text).not.toContain('UltraTopSecretContent')
    expect(text).not.toContain('(Pinnacle Management Ventures)')

    const enc = text.match(/<<[\s\S]*?\/Encrypt\s+(\d+)\s+0\s+R[\s\S]*?>>/) ?? text.match(/\/Encrypt\s+(\d+)\s+0\s+R/)
    expect(enc).toBeTruthy()
    const encObj = text.match(/\/Filter\s+\/Standard\s+\/V\s+4\s+\/R\s+4\s+\/Length\s+128[\s\S]*?\/P\s+-4[\s\S]*?\/EncryptMetadata\s+true/)
    expect(encObj).toBeTruthy()
    const o = text.match(/\/O\s+<([0-9A-F]{64})>/)
    const u = text.match(/\/U\s+<([0-9A-F]{96})>/)
    expect(o).toBeTruthy()
    expect(u).toBeTruthy()
    expect(text.match(/\/ID\s+\[<([0-9A-F]{32})> <\1>\]/)).toBeTruthy()
  })

  it('derives spec-correct O/U entries that decrypt with an independent implementation', async () => {
    const plain = await buildPdf({ title: 'Cross Check', html: '<p>Check me</p>' })
    const protectedBytes = await protectPdf(plain, 'userpass123', 'ownerpass456')
    const text = new TextDecoder().decode(protectedBytes)

    const oHex = text.match(/\/O\s+<([0-9A-F]{64})>/)?.[1]
    const uHex = text.match(/\/U\s+<([0-9A-F]{96})>/)?.[1]
    const idHex = text.match(/\/ID\s+\[<([0-9A-F]{32})>/)?.[1]
    expect(oHex && uHex && idHex).toBeTruthy()

    const P = -4
    const pLe = Buffer.alloc(4)
    pLe.writeInt32LE(P, 0)
    const id0 = Buffer.from(idHex!, 'hex')
    const K = Buffer.alloc(21)

    // Algorithm 2 (independent re-implementation with node:crypto)
    const step1 = createHash('md5').update(padPassword('userpass123')).update(Buffer.from(oHex!, 'hex').subarray(0, 16)).update(pLe).update(id0).digest()
    step1.copy(K)
    for (let i = 0; i < 50; i++) {
      const round = Buffer.concat([K.subarray(0, 16), Buffer.from([i])])
      const next = createHash('md5').update(round).digest()
      next.copy(K)
    }

    // Algorithm 3: O[0:16] must AES-decrypt (key K[0:16], zero IV) to MD5(pad(owner))
    const oRaw = createHash('md5').update(padPassword('ownerpass456')).digest()
    const decipherO = createCipheriv('aes-128-cbc', K.subarray(0, 16), Buffer.alloc(16))
    decipherO.setAutoPadding(false)
    const oDec = Buffer.concat([decipherO.update(Buffer.from(oHex!, 'hex').subarray(0, 16)), decipherO.final()])
    expect(oDec.equals(oRaw)).toBe(true)

    // Algorithm 4: U[0:16] must AES-decrypt (key K[0:16], zero IV) to MD5(pad(user)+K)[0:16]
    const uHash = createHash('md5').update(padPassword('userpass123')).update(K).digest().subarray(0, 16)
    const decipherU = createCipheriv('aes-128-cbc', K.subarray(0, 16), Buffer.alloc(16))
    decipherU.setAutoPadding(false)
    const uDec = Buffer.concat([decipherU.update(Buffer.from(uHex!, 'hex').subarray(0, 16)), decipherU.final()])
    expect(uDec.equals(uHash)).toBe(true)
  })

  it('encrypts object strings with the object-specific AES key (full round trip)', async () => {
    const plain = await buildPdf({ title: 'Round Trip', html: '<p>SecretBodyText42</p>' })
    const protectedBytes = await protectPdf(plain, 'passw0rd!')
    const text = new TextDecoder().decode(protectedBytes)

    const idHex = text.match(/\/ID\s+\[<([0-9A-F]{32})>/)?.[1]
    const uHex = text.match(/\/U\s+<([0-9A-F]{96})>/)?.[1]
    const oHex = text.match(/\/O\s+<([0-9A-F]{64})>/)?.[1]
    expect(idHex && uHex && oHex).toBeTruthy()

    // Recompute K independently, then AES-decrypt the Info-dict /Title string
    // in object 2 (pdf-lib writes Info as object 2) using the object key.
    const P = -4
    const pLe = Buffer.alloc(4)
    pLe.writeInt32LE(P, 0)
    const id0 = Buffer.from(idHex!, 'hex')
    const K = Buffer.alloc(21)
    const step1 = createHash('md5').update(padPassword('passw0rd!')).update(Buffer.from(oHex!, 'hex').subarray(0, 16)).update(pLe).update(id0).digest()
    step1.copy(K)
    for (let i = 0; i < 50; i++) {
      const round = Buffer.concat([K.subarray(0, 16), Buffer.from([i])])
      createHash('md5').update(round).digest().copy(K)
    }

    const objRe = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g
    let m: RegExpExecArray | null
    let decrypted = ''
    const SALT = Buffer.from('sAlT')
    while ((m = objRe.exec(text))) {
      const num = Number(m[1])
      const gen = Number(m[2])
      const numBuf = Buffer.from([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff])
      const genBuf = Buffer.from([gen & 0xff, (gen >> 8) & 0xff])
      const objKey = createHash('md5').update(K.subarray(0, 16)).update(numBuf).update(genBuf).update(SALT).digest()
      const strRe = /<([0-9A-F]+)>/g
      let sm: RegExpExecArray | null
      while ((sm = strRe.exec(m[3]))) {
        const hex = sm[1]
        if (hex.length < 32) continue
        const ct = Buffer.from(hex, 'hex')
        const iv = ct.subarray(0, 16)
        const body = ct.subarray(16)
        if (body.length === 0 || body.length % 16 !== 0) continue
        const d = createDecipher(objKey, iv)
        try {
          decrypted += d.update(body).toString('latin1') + d.final().toString('latin1')
        } catch {
          /* not a string we can decrypt */
        }
      }
    }
    function createDecipher(key: Buffer, iv: Buffer) {
      const dc = createCipheriv('aes-128-cbc', key, iv)
      dc.setAutoPadding(false)
      return dc
    }
    expect(decrypted).toContain('Round Trip')
  })
})