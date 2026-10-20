// 生成 PWA 图标：从 assets/icon.jpg 裁出图形本体，输出 512/192/180 + maskable 512
//
// 依赖 sharp（只在生成图标时需要，不进运行时）：
//   npm i --no-save sharp
//   node scripts/make-icons.mjs
//
// 为什么要裁：原图 1920x1920，四周是深蓝底、图形本体只占约 62% 见方，
// 右下角还有「AI生成」水印。直接用会导致图标带水印、且 maskable 被裁掉一圈。
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { statSync } from 'node:fs'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'assets', 'icon.jpg')
const out = join(root, 'assets')

// 投影法测出的图形本体包围盒（1920x1920 原图坐标系）
const BOX = { left: 355, top: 356, width: 1209, height: 1209 }
// 圆角外的底色，取自包围盒左上角内侧
const BG = { r: 8, g: 11, b: 64, alpha: 1 }

const art = await sharp(src).extract(BOX).toBuffer()

async function writePng(size, file) {
  await sharp(art)
    .resize(size, size, { kernel: 'lanczos3', fit: 'cover' })
    .png({ palette: true, quality: 92, effort: 10, compressionLevel: 9 })
    .toFile(join(out, file))
  const bytes = statSync(join(out, file)).size
  console.log(`  ${file.padEnd(26)} ${size}x${size}  ${(bytes / 1024).toFixed(1)} KB`)
}

console.log('生成 any 图标：')
await writePng(512, 'icon-512.png')
await writePng(192, 'icon-192.png')
await writePng(180, 'icon-180.png')

// maskable：图形缩到 88% 居中，四周补底色，保证落在 80% 安全圆内
const SIZE = 512
const inner = Math.round(SIZE * 0.88)
const off = Math.round((SIZE - inner) / 2)
const innerBuf = await sharp(art)
  .resize(inner, inner, { kernel: 'lanczos3', fit: 'cover' })
  .toBuffer()

await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: BG } })
  .composite([{ input: innerBuf, left: off, top: off }])
  .png({ palette: true, quality: 92, effort: 10, compressionLevel: 9 })
  .toFile(join(out, 'icon-maskable-512.png'))
const maskBytes = statSync(join(out, 'icon-maskable-512.png')).size
console.log(`  icon-maskable-512.png      ${SIZE}x${SIZE}  ${(maskBytes / 1024).toFixed(1)} KB`)
console.log('完成。')
