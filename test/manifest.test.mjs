import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

function source(relative) {
  return readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
}

function exists(relative) {
  return existsSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)))
}

test('package identity is publishable', () => {
  assert.equal(manifest.name, 'dsh-balance-pill')
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.type, 'module')
  assert.notEqual(manifest.private, true)
  assert.equal(manifest.main, 'index.js')
  assert.match(manifest.repository.url, /github\.com\/Jayve\/dsh-balance-pill/)
  assert.match(manifest.homepage, /github\.com\/Jayve\/dsh-balance-pill/)
  assert.match(manifest.bugs.url, /github\.com\/Jayve\/dsh-balance-pill\/issues/)
  assert.equal(typeof manifest.author, 'string')
})

test('the bundle manifest points at a shipped patch', () => {
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.ok(manifest.files.includes('cordis.patch.yml'))
  assert.ok(exists('cordis.patch.yml'))

  const patch = source('cordis.patch.yml')
  assert.match(patch, /name: dsh-balance-pill/)
  assert.doesNotMatch(patch, /@local\//)
  assert.match(patch, /id: balance-pill/)
})

test('the client manifest points at a shipped bundle', () => {
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.dsh.client.immediately, true)
  assert.equal(manifest.exports['./client'], './client.js')
  assert.ok(manifest.files.includes('client.js'))
  assert.ok(exists('client.js'))

  for (const dependency of [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-conversation',
  ]) {
    assert.ok(manifest.dsh.client.inject.includes(dependency), `missing inject edge ${dependency}`)
  }

  const client = source('client.js')
  assert.match(client, /id: 'dsh-balance-pill'/)
  assert.match(client, /\/dsh-balance-pill\/state/)
  assert.match(client, /conversation\.composer\.dock/)
  assert.doesNotMatch(client, /dshbm_|@local\//)
})

test('every static export target exists', () => {
  for (const [key, target] of Object.entries(manifest.exports)) {
    if (key.includes('*')) continue
    assert.ok(exists(target), `${key} -> ${target}`)
  }
})

test('the npm tarball carries every runtime and README asset', () => {
  for (const required of [
    'index.js',
    'client.js',
    'cordis.patch.yml',
    'locale/*.json',
    'icon.svg',
    'README.md',
    'README.zh-CN.md',
    'LICENSE',
    'docs/preview.svg',
    'docs/architecture.md',
  ]) {
    assert.ok(manifest.files.includes(required), `files is missing ${required}`)
  }

  for (const locale of ['locale/en.json', 'locale/zh.json']) {
    const parsed = JSON.parse(source(locale))
    assert.equal(typeof parsed.meta.title, 'string')
    assert.equal(typeof parsed.meta.description, 'string')
  }
})

test('both READMEs carry visual and text previews', () => {
  for (const readme of ['README.md', 'README.zh-CN.md']) {
    const text = source(readme)
    assert.match(text, /docs\/preview\.svg/, `${readme} does not reference the preview`)
    assert.match(text, /##\s*(Preview|预览)/, `${readme} lacks a preview section`)
    assert.match(text, /```text/, `${readme} lacks a text-art preview`)
  }
})

test('the package does not retain local-only identifiers', () => {
  for (const file of ['package.json', 'cordis.patch.yml', 'index.js', 'client.js', 'locale/en.json', 'locale/zh.json']) {
    assert.doesNotMatch(source(file), /@local\//, `${file} still contains @local/`)
  }
  assert.doesNotMatch(source('index.js'), /dsh-balance-meter/)
})

test('engines declare the supported Harness and Node ranges', () => {
  assert.match(manifest.engines.dsh, /^>=0\.2\.1-rc\.2 <0\.3\.0$/)
  assert.match(manifest.engines.node, /22\.19\.0/)
})
