// 双设备同步验证：用模拟 Supabase 后端，真跑两套独立的 localStorage/IndexedDB
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createMockSupabase } from './mock-supabase.mjs'

const require = createRequire(import.meta.url)
const { JSDOM, VirtualConsole } = require('jsdom')
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb')

const repo = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (f) => readFileSync(join(repo, f), 'utf8')

let failures = 0
const check = (ok, label, detail = '') => {
    if (!ok) failures++
    console.log(`${ok ? '  OK  ' : ' FAIL '} ${label}${detail ? '  → ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const HTML = read('index.html').replace(/<script\b[^>]*><\/script>/gi, '')

async function createDevice(port, label) {
    const dom = new JSDOM(HTML, {
        url: `http://127.0.0.1:${port}/`,
        runScripts: 'dangerously',
        pretendToBeVisual: true,
        virtualConsole: (() => { const vc = new VirtualConsole(); vc.on('jsdomError', () => {}); return vc })(),
    })
    const w = dom.window
    await new Promise((r) => (w.document.readyState === 'complete' ? r() : w.addEventListener('load', r)))

    // 每台设备一套独立的存储，等价于两台手机
    w.indexedDB = new IDBFactory()
    w.IDBKeyRange = IDBKeyRange
    w.Blob = Blob
    w.fetch = (u, init) => fetch(u, init)
    w.CLOUD_CONFIG = { url: `http://127.0.0.1:${port}`, anonKey: 'test-anon-key', bucket: 'mistake-images' }
    w.cloudConfigured = () => true
    w.scrollTo = () => {}
    w.confirm = () => true
    w.alert = () => {}
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })
    w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
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

    w.eval([
        read('practice-data.js'),
        read('knowledge-data.js'),
        read('image-store.js'),
        read('account.js'),
        read('app.js'),
        read('cloud-sync.js'),
        `
        window.__t = {
            init, openAddForm, handleFormSubmit, deleteMistake, viewMistake,
            account: window.account, cloudSync: window.cloudSync, imageStore: window.imageStore,
            get mistakes() { return mistakes; },
            set uploadedImage(v) { uploadedImage = v; },
            set imageDirty(v) { imageDirty = v; }
        };
        `,
    ].join('\n;\n'))

    const t = w.__t
    t.label = label
    return { w, t }
}

async function sync(device, tries = 25) {
    for (let i = 0; i < tries; i++) {
        const r = await device.t.cloudSync.syncNow('test')
        if (!r || !r.skipped) return r
        await sleep(120)
    }
    throw new Error(device.t.label + ' 的同步一直没结束')
}

async function addMistake(device, title, withImage) {
    const t = device.t
    t.openAddForm()
    device.w.document.getElementById('inputTitle').value = title
    device.w.document.getElementById('inputLang').value = 'python'
    device.w.document.getElementById('inputWrongCode').value = 'print(1)'
    if (withImage) { t.uploadedImage = PNG; t.imageDirty = true }
    await t.handleFormSubmit({ preventDefault() {} })
    await sleep(120)
    return t.mistakes[t.mistakes.length - 1]
}

// ================= 开始 =================
const mock = createMockSupabase()
const port = await mock.listen()
console.log(`模拟后端已启动: http://127.0.0.1:${port}\n`)

console.log('[A] 设备 A：注册并上传一条带图错题')
const A = await createDevice(port, 'A')
A.t.init()
await A.t.account.signUp('a@example.com', 'secret1')
await sleep(250)
check(!!A.t.account.session(), 'A 注册后拿到会话', A.t.account.session()?.user.email)
const uidA = A.t.account.session().user.id

const m1 = await addMistake(A, 'A 的第一条错题', true)
check(!!m1 && !!m1.imageId, 'A 本地记录已带 imageId', m1 && m1.imageId)
await sync(A)
check(mock.mistakes.size === 1, '服务端有 1 条错题', String(mock.mistakes.size))
check(mock.files.size === 1, '服务端有 1 张图片', String(mock.files.size))
check([...mock.mistakes.values()][0].user_id === uidA, '记录归属 A 的账号')

console.log('\n[B] 设备 B：同账号登录后下拉数据')
const B = await createDevice(port, 'B')
B.t.init()
await B.t.account.signIn('a@example.com', 'secret1')
await sleep(250)
await sync(B)
check(B.t.mistakes.length === 1, 'B 拉到 1 条错题', String(B.t.mistakes.length))
check(B.t.mistakes[0] && B.t.mistakes[0].title === 'A 的第一条错题', '标题一致', B.t.mistakes[0] && B.t.mistakes[0].title)

const imgId = B.t.mistakes[0].imageId
const localBefore = await B.t.imageStore.getLocal(imgId)
check(localBefore === null, 'B 本机原本没有这张图')
const downloaded = await B.t.imageStore.get(imgId)
check(typeof downloaded === 'string' && downloaded.startsWith('data:image/'), 'B 从云端取回图片', downloaded ? downloaded.slice(0, 22) + '…' : 'null')
check((await B.t.imageStore.getLocal(imgId)) !== null, '取回的图片已缓存进本机 IndexedDB')

console.log('\n[C] 冲突：两台设备改同一条，新版应该赢')
const aRec = A.t.mistakes.find((x) => x.id === m1.id)
aRec.title = 'A 改的新标题'
aRec.updatedAt = Date.now() + 5000
A.t.cloudSync.schedule()
await sleep(50)
await sync(A)

const bRec = B.t.mistakes.find((x) => x.id === m1.id)
bRec.title = 'B 改的旧标题'
bRec.updatedAt = Date.now() + 1000
await sync(B)
await sync(A)
await sync(B)

const titleOnA = A.t.mistakes.find((x) => x.id === m1.id).title
const titleOnB = B.t.mistakes.find((x) => x.id === m1.id).title
check(titleOnA === 'A 改的新标题', 'A 上保留较新的版本', titleOnA)
check(titleOnB === 'A 改的新标题', 'B 上也收敛到较新的版本', titleOnB)

console.log('\n[D] 删除：墓碑要能传播到另一台设备')
A.t.deleteMistake(m1.id)
await sleep(300)
await sync(A)
check(A.t.mistakes.length === 0, 'A 本地已删除')
check(mock.files.size === 0, '云端图片对象也一起删掉了', String(mock.files.size))
await sync(B)
check(B.t.mistakes.length === 0, 'B 拉到墓碑后也删除', String(B.t.mistakes.length))

console.log('\n[E] 账号隔离：另一个账号看不到上面的数据')
const C = await createDevice(port, 'C')
C.t.init()
await C.t.account.signUp('c@example.com', 'secret1')
await sleep(250)
await sync(C)
const realForC = C.t.mistakes.filter((m) => !m.sample)
check(realForC.length === 0, 'C 的账号没有真实数据（只剩本机演示样本）', 'real=' + realForC.length + ' total=' + C.t.mistakes.length)
const rowsForC = [...mock.mistakes.values()].filter((r) => r.user_id === C.t.account.session().user.id)
check(rowsForC.length === 0, '服务端没有把 A 的数据记到 C 名下')

console.log('\n[F] 换账号保护：本机数据不会静默推进别人账号')
const D = await createDevice(port, 'D')
D.w.localStorage.setItem('code_mistake_book_v1', JSON.stringify([{
    id: 'local-only-1', title: 'D 本机私货', lang: 'c', wrongCode: 'int main(){}', rightCode: '',
    tags: [], desc: '', note: '', source: '其他', imageId: null, status: 'pending',
    reviewCount: 0, lastReviewAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(),
}]))
D.w.localStorage.setItem('code_cloud_meta_v1', JSON.stringify({ ownerId: uidA, cursor: '', synced: {}, uploadedImages: {}, lastSyncAt: 0 }))
D.t.init()
check(D.t.mistakes.length === 1, 'D 载入了本机数据')
await D.t.account.signIn('c@example.com', 'secret1')
await sleep(250)
const guard = await sync(D)
check(guard && guard.adopted === false, '同步引擎识别出归属不符，仅拉取不上传')
const rowsForCa = [...mock.mistakes.values()].filter((r) => r.user_id === C.t.account.session().user.id)
check(rowsForCa.length === 0, 'C 的账号没有被写入 D 的本机数据')

console.log('\n[G] 用户确认后可显式并入')
await D.t.cloudSync.adoptLocalData()
await sleep(300)
await sync(D)
const rowsForCb = [...mock.mistakes.values()].filter((r) => r.user_id === C.t.account.session().user.id)
check(rowsForCb.length === 1, '确认并入后 C 的账号有 1 条', String(rowsForCb.length))

console.log(failures === 0 ? '\n全部通过 ✓' : `\n${failures} 项失败 ✗`)
await mock.close()
A.w.close(); B.w.close(); C.w.close(); D.w.close()
process.exitCode = failures === 0 ? 0 : 1
