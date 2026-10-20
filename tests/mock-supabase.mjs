// 模拟 Supabase 的最小后端：Auth + PostgREST 子集 + Storage 子集
// 只实现前端实际用到的接口，够用来验证同步逻辑；不实现 RLS（用一个用户一个 token 代替）
import http from 'node:http'
import { randomUUID } from 'node:crypto'

export function createMockSupabase() {
    const users = new Map()      // email -> { id, email, password }
    const byId = new Map()       // id -> user
    const access = new Map()     // accessToken -> userId
    const refresh = new Map()    // refreshToken -> userId
    const mistakes = new Map()   // `${uid}|${id}` -> row
    const states = new Map()     // uid -> { payload, updated_at }
    const files = new Map()      // `${bucket}/${path}` -> { bytes, type }
    const requests = []          // 调试用：收到过的请求

    let seq = 0
    const base = Date.now()
    const stamp = () => new Date(base + (++seq)).toISOString()

    let tokenSeq = 0
    function issue(user) {
        const a = `access_${user.id}_${++tokenSeq}`
        const r = `refresh_${user.id}_${tokenSeq}`
        access.set(a, user.id)
        refresh.set(r, user.id)
        return {
            access_token: a,
            refresh_token: r,
            token_type: 'bearer',
            expires_in: 3600,
            user: { id: user.id, email: user.email, app_metadata: { provider: 'email' } },
        }
    }

    function userIdFrom(req) {
        const h = req.headers.authorization || ''
        const m = h.match(/^Bearer\s+(.+)$/i)
        if (!m) return null
        return access.get(m[1]) || null
    }

    function json(res, status, body) {
        const text = JSON.stringify(body)
        res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) })
        res.end(text)
    }

    function empty(res, status = 204) {
        res.writeHead(status, { 'Content-Length': 0 })
        res.end()
    }

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1')
        const p = url.pathname
        const q = url.searchParams

        const chunks = []
        for await (const c of req) chunks.push(c)
        const raw = Buffer.concat(chunks)
        const parse = () => {
            try { return JSON.parse(raw.toString('utf8') || '{}') } catch { return {} }
        }

        requests.push(req.method + ' ' + p)
        try {
            // ---------- Auth ----------
            if (p === '/auth/v1/signup' && req.method === 'POST') {
                const { email, password } = parse()
                if (!email || !password) return json(res, 400, { msg: '缺少邮箱或密码' })
                if (users.has(email)) return json(res, 400, { msg: '该邮箱已注册' })
                const user = { id: randomUUID(), email, password }
                users.set(email, user)
                byId.set(user.id, user)
                return json(res, 200, issue(user))
            }

            if (p === '/auth/v1/token' && req.method === 'POST') {
                const grant = q.get('grant_type')
                const body = parse()
                if (grant === 'password') {
                    const user = users.get(body.email)
                    if (!user || user.password !== body.password) return json(res, 400, { msg: '邮箱或密码错误' })
                    return json(res, 200, issue(user))
                }
                if (grant === 'refresh_token') {
                    const uid = refresh.get(body.refresh_token)
                    if (!uid) return json(res, 400, { msg: 'refresh token 无效' })
                    return json(res, 200, issue(byId.get(uid)))
                }
                return json(res, 400, { msg: '不支持的 grant_type' })
            }

            if (p === '/auth/v1/user' && req.method === 'GET') {
                const uid = userIdFrom(req)
                if (!uid) return json(res, 401, { msg: '未登录' })
                const u = byId.get(uid)
                return json(res, 200, { id: u.id, email: u.email, app_metadata: { provider: 'email' } })
            }

            if (p === '/auth/v1/logout') return empty(res)

            // ---------- PostgREST ----------
            if (p === '/rest/v1/mistakes') {
                const uid = userIdFrom(req)
                if (!uid) return json(res, 401, { msg: '未登录' })

                if (req.method === 'GET') {
                    const gt = q.get('synced_at')
                    const limit = Number(q.get('limit') || 1000)
                    let rows = [...mistakes.values()].filter((r) => r.user_id === uid)
                    if (gt && gt.startsWith('gt.')) {
                        const cursor = gt.slice(3)
                        rows = rows.filter((r) => r.synced_at > cursor)
                    }
                    rows.sort((a, b) => (a.synced_at < b.synced_at ? -1 : 1))
                    return json(res, 200, rows.slice(0, limit))
                }

                if (req.method === 'POST') {
                    const body = Array.isArray(parse()) ? JSON.parse(raw.toString('utf8')) : [parse()]
                    for (const row of body) {
                        if (row.user_id !== uid) return json(res, 403, { msg: '不能写入其他用户的数据' })
                        // 与 PostgREST 的 merge-duplicates 一致：后到的写入直接覆盖（墓碑必须能赢）
                        mistakes.set(`${uid}|${row.id}`, {
                            user_id: uid,
                            id: row.id,
                            payload: row.payload === undefined ? null : row.payload,
                            updated_at: row.updated_at || 0,
                            deleted: !!row.deleted,
                            synced_at: stamp(),
                        })
                    }
                    return empty(res, 201)
                }
            }

            if (p === '/rest/v1/user_state') {
                const uid = userIdFrom(req)
                if (!uid) return json(res, 401, { msg: '未登录' })

                if (req.method === 'GET') {
                    const row = states.get(uid)
                    return json(res, 200, row ? [row] : [])
                }
                if (req.method === 'POST') {
                    const body = parse()
                    if (body.user_id !== uid) return json(res, 403, { msg: '不能写入其他用户的数据' })
                    const prev = states.get(uid)
                    if (!prev || (body.updated_at || 0) >= (prev.updated_at || 0)) {
                        states.set(uid, { payload: body.payload, updated_at: body.updated_at || 0 })
                    }
                    return empty(res, 201)
                }
            }

            // ---------- Storage ----------
            // URL 形如 /storage/v1/object/{bucket}/{path}，RLS 校验的是 path 的第一段
            const splitBucketPath = (rest) => {
                const idx = rest.indexOf('/')
                if (idx < 0) return { bucket: rest, objectPath: '' }
                return { bucket: rest.slice(0, idx), objectPath: rest.slice(idx + 1) }
            }

            const signMatch = p.match(/^\/storage\/v1\/object\/sign\/(.+)$/)
            if (signMatch && req.method === 'POST') {
                const uid = userIdFrom(req)
                if (!uid) return json(res, 401, { msg: '未登录' })
                const { objectPath } = splitBucketPath(decodeURIComponent(signMatch[1]))
                if (!objectPath.startsWith(uid + '/')) return json(res, 403, { msg: '无权访问他人图片' })
                if (!files.has(objectPath)) return json(res, 404, { msg: '文件不存在' })
                return json(res, 200, { signedURL: '/object/signed?p=' + encodeURIComponent(objectPath) })
            }

            if (p === '/storage/v1/object/signed' && req.method === 'GET') {
                const objectPath = q.get('p') || ''
                const f = files.get(objectPath)
                if (!f) return json(res, 404, { msg: '文件不存在' })
                res.writeHead(200, { 'Content-Type': f.type, 'Content-Length': f.bytes.length })
                return res.end(f.bytes)
            }

            // 删除对象：DELETE /storage/v1/object/{bucket}  body { prefixes: [path] }
            const delMatch = p.match(/^\/storage\/v1\/object\/([^/]+)$/)
            if (delMatch && req.method === 'DELETE') {
                const uid = userIdFrom(req)
                if (!uid) return json(res, 401, { msg: '未登录' })
                const body = parse()
                const prefixes = Array.isArray(body.prefixes) ? body.prefixes : []
                let removed = 0
                for (const prefix of prefixes) {
                    if (!String(prefix).startsWith(uid + '/')) return json(res, 403, { msg: '无权删除他人图片' })
                    if (files.delete(prefix)) removed++
                }
                return json(res, 200, { removed: removed })
            }

            const uploadMatch = p.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)
            if (uploadMatch && req.method === 'POST') {
                const uid = userIdFrom(req)
                if (!uid) return json(res, 401, { msg: '未登录' })
                const { bucket, objectPath } = splitBucketPath(
                    decodeURIComponent(uploadMatch[1]) + '/' + decodeURIComponent(uploadMatch[2])
                )
                if (!objectPath.startsWith(uid + '/')) return json(res, 403, { msg: '无权写入他人目录' })
                files.set(objectPath, { bytes: raw, type: req.headers['content-type'] || 'application/octet-stream' })
                return json(res, 200, { Key: bucket + '/' + objectPath })
            }

            return json(res, 404, { msg: 'mock 未实现的接口: ' + req.method + ' ' + p })
        } catch (e) {
            return json(res, 500, { msg: String(e && e.message || e) })
        }
    })

    return {
        server,
        users,
        mistakes,
        states,
        requests,
        files,
        listen() {
            return new Promise((resolve) => {
                server.listen(0, '127.0.0.1', () => resolve(server.address().port))
            })
        },
        close() {
            return new Promise((resolve) => server.close(resolve))
        },
    }
}
