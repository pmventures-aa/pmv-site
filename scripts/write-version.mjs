import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

function sha() {
  try { return execSync('git rev-parse --short=12 HEAD').toString().trim() } catch { return 'dev' }
}

const payload = { sha: sha(), built_at: new Date().toISOString() }
writeFileSync('dist/version.json', JSON.stringify(payload) + '\n', 'utf8')
console.log(`wrote dist/version.json: ${payload.sha} @ ${payload.built_at}`)
