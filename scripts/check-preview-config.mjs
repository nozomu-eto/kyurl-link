import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { unstable_readConfig } from 'wrangler'

const source = unstable_readConfig({ config: 'wrangler.jsonc' })
const migration = unstable_readConfig({ config: 'wrangler.preview-migrations.jsonc' })
const pendingId = '00000000-0000-0000-0000-000000000000'
let config = source

if (process.argv.includes('--built')) {
  const redirect = '.wrangler/deploy/config.json'
  const { configPath } = JSON.parse(readFileSync(redirect, 'utf8'))
  config = unstable_readConfig({ config: resolve(dirname(redirect), configPath) })
}

assert.equal(config.name, 'kyurl-link')
const preview = config.previews
assert.ok(preview, 'Wrangler設定に previews が必要です')
assert.deepEqual(Object.keys(preview).sort(), [
  'analytics_engine_datasets', 'browser', 'd1_databases', 'r2_buckets', 'ratelimits', 'vars',
], '未レビューのPreview設定やバインディングがあります')
assert.ok(
  preview.vars?.APP_ENV === 'preview' &&
  preview.vars?.TURNSTILE_SITE_KEY === '1x00000000000000000000AA' &&
  Object.keys(preview.vars).length === 2,
  'Previewのvarsには環境名とテスト用サイトキーだけを指定してください',
)
assert.deepEqual(preview.browser, { binding: 'BROWSER' })

assert.equal(preview.d1_databases.length, 1)
assert.equal(migration.d1_databases.length, 1)
const [db] = preview.d1_databases
const [migrationDb] = migration.d1_databases
assert.equal(db.binding, 'DB')
assert.equal(db.database_name, 'kyurl-link-staging')
assert.match(db.database_id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
assert.ok(!source.d1_databases.some(({ database_id }) => database_id === db.database_id))
assert.deepEqual(migrationDb, {
  binding: 'PREVIEW_DB',
  database_name: db.database_name,
  database_id: db.database_id,
  migrations_dir: './drizzle',
})
assert.notEqual(db.database_id, pendingId, 'Preview D1の実際のIDを2つの設定に反映してください')

assert.deepEqual(preview.r2_buckets, [{ binding: 'POSTER_CACHE', bucket_name: 'kyurl-link-posters-staging' }])
assert.ok(!source.r2_buckets.some(({ bucket_name }) => bucket_name === preview.r2_buckets[0].bucket_name))
assert.deepEqual(preview.analytics_engine_datasets, [{ binding: 'LINK_CLICKS', dataset: 'link_clicks_staging' }])
assert.ok(!source.analytics_engine_datasets.some(({ dataset }) => dataset === preview.analytics_engine_datasets[0].dataset))

const namespaceIds = new Set(preview.ratelimits.map(({ namespace_id }) => namespace_id))
assert.equal(namespaceIds.size, preview.ratelimits.length)
assert.deepEqual(
  preview.ratelimits.map(({ name, simple }) => ({ name, simple })),
  source.ratelimits.map(({ name, simple }) => ({ name, simple })),
)
assert.ok(!source.ratelimits.some(({ namespace_id }) => namespaceIds.has(namespace_id)))

console.log('Preview設定、マイグレーション先、本番とのバインディング差分を確認しました。')
