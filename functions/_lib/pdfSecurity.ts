// PDF Standard Security Handler (V=4, R=4, AES-128) applied byte-level to a
// generated PDF. pdf-lib cannot write encrypted PDFs, so the file is
// re-assembled here: every string and stream is AES-128-CBC encrypted with an
// object-specific key, the xref table and trailer are rebuilt, and an
// /Encrypt dictionary is added.
//
// References: ISO 32000-1 §7.6.2 (Algorithm 1), §7.6.3.3 (padding),
// §7.6.3.4 (Algorithms 2–4). Pure JS + WebCrypto: Workers and Node both work.

// ---------------------------------------------------------------------------
// MD5 (pure JS)
// ---------------------------------------------------------------------------

const MD5_K = new Uint32Array([
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
])

const MD5_S = new Uint32Array([
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
])

export function md5(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8
  const paddedLen = (((data.length + 8) >> 6) + 1) << 6
  const buf = new Uint8Array(paddedLen)
  buf.set(data)
  buf[data.length] = 0x80
  const dv = new DataView(buf.buffer)
  dv.setUint32(paddedLen - 8, bitLen >>> 0, true)
  dv.setUint32(paddedLen - 4, Math.floor(bitLen / 4294967296), true)
  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const w = new Uint32Array(16)
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, true)
    let a = a0, b = b0, c = c0, d = d0
    for (let i = 0; i < 64; i++) {
      let f: number, g: number
      if (i < 16) { f = (b & c) | (~b & d); g = i }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16 }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16 }
      else { f = c ^ (b | ~d); g = (7 * i) % 16 }
      const tmp = (d + f + MD5_K[i] + w[g]) >>> 0
      const rot = (a + tmp) >>> 0
      const shifted = (rot << MD5_S[i]) | (rot >>> (32 - MD5_S[i]))
      const next = (b + shifted) >>> 0
      a = d; d = c; c = b; b = next
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0
  }
  const out = new Uint8Array(16)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, a0, true)
  odv.setUint32(4, b0, true)
  odv.setUint32(8, c0, true)
  odv.setUint32(12, d0, true)
  return out
}

export function md5Hex(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input
  return Array.from(md5(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------------------------------------------------------------------------
// Latin-1 byte helpers (the PDF file itself is handled byte-exact)
// ---------------------------------------------------------------------------

function latin1Encode(s: string): Uint8Array {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

function latin1Decode(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return s
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, b) => a + b.length, 0)
  const out = new Uint8Array(len)
  let p = 0
  for (const part of parts) { out.set(part, p); p += part.length }
  return out
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
}

// ---------------------------------------------------------------------------
// Security handler math (ISO 32000-1 §7.6.3.4, Algorithms 1–4)
// ---------------------------------------------------------------------------

const PAD_STR = Uint8Array.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
])
const SALT = Uint8Array.from([0x73, 0x41, 0x6c, 0x54]) // 'sAlT'

function padPassword(password: string): Uint8Array {
  const bytes = new TextEncoder().encode(String(password || ''))
  if (bytes.length >= 32) return bytes.slice(0, 32)
  return concat(bytes, PAD_STR.slice(0, 32 - bytes.length))
}

function pdfPad(data: Uint8Array): Uint8Array {
  const rem = data.length % 16
  return rem ? concat(data, PAD_STR.slice(0, 16 - rem)) : data
}

function intermediateKey(paddedPassword: Uint8Array, ownerHash: Uint8Array, p: number, id0: Uint8Array): Uint8Array {
  const pLe = new Uint8Array(4)
  new DataView(pLe.buffer).setInt32(0, p, true)
  let k = md5(concat(paddedPassword, ownerHash, pLe, id0)).slice(0, 21)
  for (let i = 0; i < 50; i++) {
    const round = new Uint8Array(17)
    round.set(k.slice(0, 16))
    round[16] = i
    k = md5(round).slice(0, 21)
  }
  return k
}

function objectKey(k: Uint8Array, objNum: number, genNum: number): Uint8Array {
  const buf = new Uint8Array(16 + 3 + 2 + 4)
  buf.set(k.slice(0, 16), 0)
  buf[16] = objNum & 0xff
  buf[17] = (objNum >> 8) & 0xff
  buf[18] = (objNum >> 16) & 0xff
  buf[19] = genNum & 0xff
  buf[20] = (genNum >> 8) & 0xff
  buf.set(SALT, 21)
  return md5(buf)
}

function random16(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16))
}

// WebCrypto AES-CBC always PKCS#7 pads, but PDF AES does its own padding
// (no padding when the plaintext already fills the final block). Because the
// caller passes data already padded to a 16-byte multiple, PKCS#7 adds
// exactly one block — encrypt, then drop that block from the ciphertext.
async function aesCbc(key: Uint8Array, iv: Uint8Array, plain: Uint8Array): Promise<Uint8Array> {
  const padded = concat(plain, new Uint8Array(16).fill(16))
  const k = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC' }, false, ['encrypt'])
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, k, padded))
  return out.slice(0, out.length - 16)
}

// ---------------------------------------------------------------------------
// Object-level encryption
// ---------------------------------------------------------------------------

async function encryptBytes(k: Uint8Array, objNum: number, genNum: number, plain: Uint8Array): Promise<Uint8Array> {
  const key = objectKey(k, objNum, genNum)
  const iv = random16()
  const ct = await aesCbc(key, iv, pdfPad(plain))
  return concat(iv, ct)
}

function unescapeLiteral(s: string): Uint8Array {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && i + 1 < s.length) {
      const nxt = s[i + 1]
      if (nxt >= '0' && nxt <= '7') {
        let oct = nxt
        let j = i + 2
        while (j < s.length && oct.length < 3 && s[j] >= '0' && s[j] <= '7') { oct += s[j]; j++ }
        out += String.fromCharCode(parseInt(oct, 8))
        i = j - 1
      } else {
        out += nxt === 'n' ? '\n' : nxt === 'r' ? '\r' : nxt === 't' ? '\t' : nxt === 'b' ? '\b' : nxt === 'f' ? '\f' : nxt
        i++
      }
    } else out += ch
  }
  return latin1Encode(out)
}

async function processObject(k: Uint8Array, num: number, gen: number, body: string): Promise<string> {
  const streamRe = /stream\r?\n([\s\S]*?)endstream/
  const sm = body.match(streamRe)
  let dict = body
  if (sm) {
    const streamBytes = latin1Encode(sm[1])
    const enc = await encryptBytes(k, num, gen, streamBytes)
    dict = body.slice(0, sm.index) + 'stream\r\n' + latin1Decode(enc) + '\r\nendstream'
    dict = dict.replace(/\/Length\s+\d+/, `/Length ${enc.length}`)
  }
  const strRe = /\(((?:\\.|[^\\()])*)\)|<([0-9a-fA-F]{2}(?:\s*[0-9a-fA-F]{2})*)>/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = strRe.exec(dict))) {
    const literal = m[1] !== undefined
    const raw = literal ? m[1] : m[2]
    const bytes = literal ? unescapeLiteral(raw) : Uint8Array.from((raw || '').replace(/\s/g, '').match(/.{2}/g) || [], (h) => parseInt(h, 16))
    const enc = await encryptBytes(k, num, gen, bytes)
    out += dict.slice(last, m.index) + `<${toHex(enc)}>`
    last = m.index + m[0].length
  }
  out += dict.slice(last)
  return out
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function protectPdf(plain: Uint8Array, userPassword: string, ownerPassword?: string): Promise<Uint8Array> {
  const text = latin1Decode(plain)
  const startxrefIdx = text.lastIndexOf('startxref')
  if (startxrefIdx < 0) throw new Error('Invalid PDF: startxref not found')
  const objectsPart = text.slice(0, startxrefIdx)
  const trailerPart = text.slice(startxrefIdx)

  const rootMatch = trailerPart.match(/\/Root\s+(\d+\s+\d+\s+R)/)
  const infoMatch = trailerPart.match(/\/Info\s+(\d+\s+\d+\s+R)/)
  if (!rootMatch) throw new Error('Invalid PDF: Root not found')

  const id0 = md5(plain)
  const owner = ownerPassword || userPassword
  const paddedUser = padPassword(userPassword)
  const oRaw = md5(padPassword(owner))
  const k = intermediateKey(paddedUser, oRaw, -4, id0)
  const k16 = k.slice(0, 16)
  const zeros = new Uint8Array(16)
  const oEnc = await aesCbc(k16, zeros, oRaw)
  const uHash = md5(concat(paddedUser, k)).slice(0, 16)
  const uEnc = await aesCbc(k16, zeros, uHash)
  const O = concat(oEnc, PAD_STR.slice(0, 16))
  const U = concat(uEnc, PAD_STR.slice(0, 16), PAD_STR.slice(0, 16))

  const objects: { num: number; gen: number; body: string; start: number }[] = []
  const headRe = /(\d+)\s+(\d+)\s+obj\b/g
  let hm: RegExpExecArray | null
  while ((hm = headRe.exec(objectsPart))) {
    const num = Number(hm[1])
    const gen = Number(hm[2])
    let i = hm.index + hm[0].length
    let bodyEnd = -1
    let scan = i
    while (scan < text.length) {
      const streamIdx = text.indexOf('stream', scan)
      const endObjIdx = text.indexOf('endobj', scan)
      if (endObjIdx === -1) break
      if (streamIdx !== -1 && streamIdx < endObjIdx && /^\r?\n/.test(text.slice(streamIdx + 6, streamIdx + 8))) {
        const afterLf = text[streamIdx + 6] === '\r' ? streamIdx + 8 : streamIdx + 7
        const es = text.indexOf('endstream', afterLf)
        if (es === -1) { bodyEnd = endObjIdx; break }
        scan = es + 'endstream'.length
      } else { bodyEnd = endObjIdx; break }
    }
    if (bodyEnd === -1) break
    objects.push({ num, gen, body: text.slice(i, bodyEnd), start: hm.index })
    headRe.lastIndex = bodyEnd + 'endobj'.length
  }

  const prefix = objects.length ? objectsPart.slice(0, objects[0].start) : objectsPart
  const parts: string[] = [prefix]
  let pos = prefix.length
  const offsets: number[] = []
  for (const obj of objects) {
    offsets.push(pos)
    const rebuilt = await processObject(k, obj.num, obj.gen, obj.body)
    parts.push(`${obj.num} ${obj.gen} obj${rebuilt}endobj`)
    pos += parts[parts.length - 1].length
  }

  const encObjNum = objects.length + 1
  const encObj = `${encObjNum} 0 obj\n<< /Filter /Standard /V 4 /R 4 /Length 128 /O <${toHex(O)}> /U <${toHex(U)}> /P -4 /EncryptMetadata true >>\nendobj`
  offsets.push(pos)
  parts.push(encObj)
  pos += encObj.length

  const idHex = toHex(id0)
  const xref = `xref\n0 ${objects.length + 2}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  const trailer = `trailer\n<< /Size ${objects.length + 2} /Root ${rootMatch[1]}${infoMatch ? ` /Info ${infoMatch[1]}` : ''} /ID [<${idHex}> <${idHex}>] /Encrypt ${encObjNum} 0 R >>\nstartxref\n${pos + xref.length}\n%%EOF`
  return latin1Encode(parts.join('') + xref + trailer)
}