// 静态校验：语法、引用路径存在性、SRI 一致性
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (ok, label, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${label}${detail ? '  ' + detail : ''}`)
}

// 1. 语法
console.log('\n[1] JS 语法')
for (const f of ['app.js', 'image-store.js', 'sw.js', 'knowledge-data.js', 'practice-data.js']) {
  try {
    execFileSync(process.execPath, ['--check', join(root, f)], { stdio: 'pipe' })
    check(true, f)
  } catch (e) {
    check(false, f, String(e.stderr || e.message).slice(0, 300))
  }
}

// 2. index.html 里的本地引用
console.log('\n[2] index.html 本地引用是否都存在')
const html = readFileSync(join(root, 'index.html'), 'utf8')
const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:|data:|#|mailto:)/.test(u))
for (const ref of refs) {
  const clean = ref.split('?')[0]
  check(existsSync(join(root, clean)), ref)
}

// 3. 不再有外链 CDN（只检查真正会发起请求的标签，输入框里的默认值不算）
console.log('\n[3] 是否还残留外链 CDN')
const resourceTags = [...html.matchAll(/<(script|link|img|iframe)\b[^>]*>/gi)].map((m) => m[0])
const cdn = resourceTags
  .flatMap((tag) => [...tag.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]))
check(cdn.length === 0, 'index.html 无外部资源依赖', cdn.join(', '))

// 4. sw.js 的 CORE_ASSETS 都存在
console.log('\n[4] sw.js 预缓存清单')
const sw = readFileSync(join(root, 'sw.js'), 'utf8')
const coreBlock = sw.match(/const CORE_ASSETS = \[([\s\S]*?)\];/)
check(!!coreBlock, 'CORE_ASSETS 可解析')
if (coreBlock) {
  const assets = [...coreBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  for (const a of assets) {
    const clean = a.replace(/^\.\//, '').split('?')[0]
    if (clean === '') { check(existsSync(join(root, 'index.html')), a + ' (根路径)'); continue }
    check(existsSync(join(root, clean)), a)
  }
}

// 5. manifest 与图标
console.log('\n[5] manifest 与图标')
const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'))
check(manifest.icons.length >= 2, 'icons 数量', String(manifest.icons.length))
check(manifest.icons.some((i) => i.purpose === 'maskable'), '有 maskable 图标')
for (const icon of manifest.icons) {
  check(existsSync(join(root, icon.src)), icon.src + ' ' + icon.sizes)
}
check(html.includes('rel="manifest"'), 'index.html 引用 manifest')
check(html.includes('apple-touch-icon'), 'index.html 有 apple-touch-icon')

// 6. SRI 与实际文件一致
console.log('\n[6] SRI 完整性标记')
for (const m of html.matchAll(/<(?:script|link)[^>]*?(?:src|href)="([^"?]+)\?[^"]*"[^>]*?integrity="sha384-([^"]+)"/g)) {
  const [, file, expected] = m
  const actual = createHash('sha384').update(readFileSync(join(root, file))).digest('base64')
  check(actual === expected, file, actual === expected ? '' : `expected ${expected} got ${actual}`)
}

// 7. 缓存版本号一致（index.html 与 sw.js 必须同步，否则发版后会新旧混用）
console.log('\n[7] 缓存版本号一致性')
const htmlVersions = new Set([...html.matchAll(/\?v=(\d+)/g)].map((m) => m[1]))
const swVersions = new Set([...sw.matchAll(/\?v=(\d+)/g)].map((m) => m[1]))
check(htmlVersions.size === 1, 'index.html 只有一个版本号', [...htmlVersions].join(','))
check(swVersions.size === 1, 'sw.js 只有一个版本号', [...swVersions].join(','))
check([...htmlVersions][0] === [...swVersions][0], 'index.html 与 sw.js 版本号一致',
  `html=${[...htmlVersions]} sw=${[...swVersions]}`)
const cacheName = (sw.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1]
check(/v\d+$/.test(cacheName || ''), 'CACHE_NAME 带版本后缀', cacheName)
check((cacheName || '').endsWith('v' + [...htmlVersions][0]), 'CACHE_NAME 版本与资源版本对齐',
  `${cacheName} vs v${[...htmlVersions][0]}`)

// 8. index.html 引用的每个本地脚本/样式都必须进 SW 预缓存清单（否则离线会缺件）
console.log('\n[8] 离线完整性：本地脚本是否都在预缓存里')
const swAssets = coreBlock
  ? [...coreBlock[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\.\//, '').split('?')[0])
  : []
const localScripts = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^":]+\.(?:js|css))[^"]*"/g)]
  .map((m) => m[1])
for (const asset of localScripts) {
  check(swAssets.includes(asset), asset + ' 已预缓存')
}

console.log(failures === 0 ? '\n全部通过 ✓' : `\n${failures} 项失败 ✗`)
process.exitCode = failures === 0 ? 0 : 1
