import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('src')
const extensions = new Set(['.ts', '.tsx'])
let changed = 0

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walk(full)
      continue
    }
    if (!extensions.has(path.extname(entry.name))) continue
    const before = await fs.readFile(full, 'utf8')
    if (!before.includes('—')) continue

    let after = before
    // A standalone em dash was historically used as a missing-value glyph.
    // Make absence explicit and readable instead of leaving a cryptic symbol.
    after = after.replace(/'—'/g, "'Not provided'")
    after = after.replace(/"—"/g, '"Not provided"')
    // For prose, labels, comments, and template-string separators, a colon is
    // clearer and matches the user's requested writing style.
    after = after.replace(/\s—\s/g, ': ')
    after = after.replace(/—/g, ':')

    if (after !== before) {
      await fs.writeFile(full, after)
      changed += 1
      console.log(`normalized ${path.relative(process.cwd(), full)}`)
    }
  }
}

await walk(root)
console.log(`normalized ${changed} source file${changed === 1 ? '' : 's'}`)
