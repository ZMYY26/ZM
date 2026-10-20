// 行为验证：在 jsdom 里真跑 app.js
// 覆盖：旧图片迁移 / 并发迁移安全性 / 带图新增 / 详情水合 / 删除清理 / 高亮降级
// 依赖（装在临时目录，不进仓库）：jsdom fake-indexeddb
//
// 注意：app.js 的状态是 let/const，间接 eval 会随作用域销毁，
// 所以脚本必须在「同一次 eval」里加载，并在末尾挂桥接对象。
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { JSDOM, VirtualConsole } = require('jsdom')
const { indexedDB, IDBKeyRange } = require('fake-indexeddb')

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => readFileSync(join(repo, f), 'utf8')

let failures = 0
const check = (ok, label, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? '  OK  ' : ' FAIL '} ${label}${detail ? '  → ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const html = read('index.html').replace(/<script\b[^>]*><\/script>/gi, '')
const vc = new VirtualConsole()
vc.on('jsdomError', () => {})

const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc })
const w = dom.window

// 等 JSDOM 解析完再注入脚本，这样 app 里的 DOMContentLoaded 监听器不会在之后被自动触发
// （否则 init 会被调用两次，测的就不是真实场景了）
await new Promise((resolve) => {
  if (w.document.readyState === 'complete') resolve()
  else w.addEventListener('load', resolve)
})

w.indexedDB = indexedDB
w.IDBKeyRange = IDBKeyRange
w.fetch = async () => { throw new Error('测试环境无网络') }
w.scrollTo = () => {}
w.confirm = () => true
w.alert = () => {}
w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }

// jsdom 没有 canvas：给一个能接住所有调用的假 context
w.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({ canvas: { width: 300, height: 150 } }, {
    get: (t, k) => {
      if (k in t) return t[k]
      if (k === 'measureText') return () => ({ width: 10 })
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} })
      if (k === 'getLineDash') return () => []
      return () => {}
    },
    set: (t, k, v) => { t[k] = v; return true },
  })
}
w.HTMLCanvasElement.prototype.toDataURL = function () { return PNG }
w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new w.Blob([''], { type: 'image/png' })) }

// 旧版数据：图片内联在 localStorage 里
w.localStorage.setItem('code_mistake_book_v1', JSON.stringify([{
  id: 'legacy-1', title: '旧版带图错题', lang: 'javascript',
  wrongCode: 'console.log(1)', rightCode: '', tags: ['数组'], desc: '', note: '',
  source: '其他', image: PNG, status: 'pending', reviewCount: 0,
  lastReviewAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
}]))

console.log('\n[A] 脚本加载（故意不加载 highlight.js）')
const bundle = [
  read('knowledge-data.js'),
  read('practice-data.js'),
  read('image-store.js'),
  read('app.js'),
  `
  window.__t = {
    init, highlightCode, openAddForm, handleFormSubmit, viewMistake, deleteMistake,
    migrateLegacyImages, imageStore: window.imageStore,
    get mistakes() { return mistakes; },
    set uploadedImage(v) { uploadedImage = v; },
    set imageDirty(v) { imageDirty = v; }
  };
  `,
].join('\n;\n')

try {
  w.eval(bundle)
  check(true, '4 个脚本 + 桥接一起加载成功')
} catch (e) {
  check(false, '脚本加载', e.message)
}
const t = w.__t

console.log('\n[B] 无 hljs 时的降级')
check(typeof w.hljs === 'undefined', '测试环境确实没有 hljs')
const fb = t.highlightCode('<b>alert(1)</b>', 'javascript')
check(fb.startsWith('&lt;b&gt;'), '无 hljs 时返回转义纯文本', fb)

console.log('\n[C] 启动与旧数据迁移')
try {
  t.init()
  check(true, 'init() 未抛异常')
} catch (e) {
  check(false, 'init() 未抛异常', e.message)
}
await sleep(400)

check(t.mistakes.length === 1, '读到 1 条旧数据')
let rec = t.mistakes[0]
check(!!rec.imageId, '旧记录已分配 imageId', rec.imageId)
check(rec.image === undefined, '内联 base64 已从记录中移除')
check(!JSON.stringify(t.mistakes).includes('base64'), '记录里不再有 base64')
const storedLen = await t.imageStore.get(rec.imageId).then((v) => (v ? v.length : 0))
check(storedLen > 100, '图片已写入 IndexedDB 且可读回', `${storedLen} 字节`)

console.log('\n[C2] 并发迁移不会互删（回归测试）')
// 在现有数据（legacy-1 已迁移成 imageId）基础上再加一条带内联图片的旧记录
const seeded = t.mistakes.map((m) => ({ ...m }))
seeded.push({
  id: 'legacy-2', title: '并发迁移错题', lang: 'python', wrongCode: 'x', rightCode: '',
  tags: [], desc: '', note: '', source: '其他', image: PNG, status: 'pending',
  reviewCount: 0, lastReviewAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
})
w.localStorage.setItem('code_mistake_book_v1', JSON.stringify(seeded))
t.init()
await sleep(100)
await Promise.all([t.migrateLegacyImages(), t.migrateLegacyImages()])
await sleep(300)
const rec2 = t.mistakes.find((m) => m.id === 'legacy-2')
const rec1 = t.mistakes.find((m) => m.id === 'legacy-1')
check(!!rec2 && !!rec2.imageId, '并发迁移后新记录带 imageId', rec2 && rec2.imageId)
check(!!rec2 && (await t.imageStore.get(rec2.imageId)) !== null, '并发迁移后新图片没被误删')
check(!!rec1 && (await t.imageStore.get(rec1.imageId)) !== null, '已有图片也没有被误删')
const keysAfterRace = await t.imageStore.keys()
check(keysAfterRace.length === 2, '两条记录的图片都在', keysAfterRace.length + ' 张')

console.log('\n[D] 新增错题（带图）')
t.openAddForm()
w.document.getElementById('inputTitle').value = '测试新增'
w.document.getElementById('inputLang').value = 'python'
w.document.getElementById('inputWrongCode').value = 'print(1)'
t.uploadedImage = PNG
t.imageDirty = true
const before = t.mistakes.length
await t.handleFormSubmit({ preventDefault() {} })
await sleep(200)

check(t.mistakes.length === before + 1, '错题数量 +1')
const added = t.mistakes[t.mistakes.length - 1]
check(added.title === '测试新增', '标题正确', added.title)
check(!!added.imageId, '新记录带 imageId', added.imageId)
check(added.image === undefined, '新记录不含内联 base64')
check((await t.imageStore.get(added.imageId)) !== null, '新图片在 IndexedDB 中')
const raw = w.localStorage.getItem('code_mistake_book_v1')
check(!raw.includes('base64'), 'localStorage 整体不含 base64')
check(raw.length < 6000, 'localStorage 体积受控', `${raw.length} 字节`)

console.log('\n[E] 详情页从 IndexedDB 水合图片')
t.viewMistake(added.id)
await sleep(200)
const imgs = w.document.querySelectorAll('#detailContainer img[data-image-id]')
check(imgs.length === 1, '详情页出现 data-image-id 占位图')
check(imgs.length === 1 && imgs[0].src.startsWith('data:image/png'), 'src 已被填入', imgs.length ? imgs[0].src.slice(0, 24) + '…' : '无')

console.log('\n[F] 编辑替换图片时清理旧 blob')
const oldId = added.imageId
t.viewMistake(added.id)
w.eval(`openEditForm(${JSON.stringify(added.id)})`)
await sleep(150)
t.uploadedImage = PNG
t.imageDirty = true
await t.handleFormSubmit({ preventDefault() {} })
await sleep(250)
const edited = t.mistakes.find((m) => m.id === added.id)
check(!!edited && edited.imageId && edited.imageId !== oldId, '换图后 imageId 已更新')
check((await t.imageStore.get(oldId)) === null, '旧图片 blob 已删除')

console.log('\n[G] 删除错题时清理图片')
const delId = edited.imageId
t.deleteMistake(added.id)
await sleep(250)
check((await t.imageStore.get(delId)) === null, '图片 blob 已随之删除')
check(t.mistakes.length === before, '错题数量回到删除前')

console.log('\n[H] 孤儿清理不误伤在用图片')
await t.imageStore.prune(t.mistakes.map((m) => m.imageId).filter(Boolean))
check((await t.imageStore.get(rec.imageId)) !== null, '仍被引用的图片没有被误删')

console.log(failures === 0 ? '\n全部通过 ✓' : `\n${failures} 项失败 ✗`)
dom.window.close()
process.exitCode = failures === 0 ? 0 : 1
