const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const migrationsDirectory = path.join(__dirname, '..', 'dist', 'scripts', 'migrations')

for (const filename of fs.readdirSync(migrationsDirectory).filter(file => file.endsWith('.js')).sort()) {
  test(`${filename} exposes the standard migration contract`, () => {
    const migration = require(path.join(migrationsDirectory, filename))
    assert.equal(typeof migration.up, 'function')
    assert.equal(typeof migration.down, 'function')
    assert.equal(typeof migration.migrationInfo, 'object')
    assert.match(migration.migrationInfo.version, /^\d{3}$/)
    assert.equal(typeof migration.migrationInfo.name, 'string')
  })
}
