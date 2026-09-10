const assert = require('node:assert/strict')
const test = require('node:test')

const migration = require('../dist/scripts/migrations/001-add-content-types.js')
const { GeneralDocument } = require('../dist/models/Document.js')
const { ModuleSettings } = require('../dist/models/ModuleSettings.js')
const { StorageSettings } = require('../dist/models/StorageSettings.js')
const { ContentSettings } = require('../dist/models/ContentSettings.js')
const mongoose = require('../node_modules/mongoose')
const visitorMigration = require('../dist/scripts/migrations/002-fix-visitor-index.js')
const canbusMigration = require('../dist/scripts/migrations/004-canbus-head-unit-index.js')
const memberVehicleMigration = require('../dist/scripts/migrations/005-member-vehicle-default-index.js')
const vehicleCatalogMigration = require('../dist/scripts/migrations/006-seed-vehicle-catalog.js')
const { Vehicle } = require('../dist/models/Vehicle.js')

test('legacy content migration preserves existing statuses and indexes', async () => {
  const originals = {
    updateMany: GeneralDocument.updateMany,
    documentIndexes: GeneralDocument.collection.indexes,
    documentCreateIndex: GeneralDocument.collection.createIndex,
    moduleFindOne: ModuleSettings.findOne,
    moduleIndexes: ModuleSettings.collection.indexes,
    moduleCreateIndex: ModuleSettings.collection.createIndex,
    storageFindOne: StorageSettings.findOne,
    storageIndexes: StorageSettings.collection.indexes,
    storageCreateIndex: StorageSettings.collection.createIndex,
    contentFindOne: ContentSettings.findOne,
    contentIndexes: ContentSettings.collection.indexes,
    contentCreateIndex: ContentSettings.collection.createIndex,
  }
  let capturedFilter

  try {
    GeneralDocument.updateMany = async filter => {
      capturedFilter = filter
      return { modifiedCount: 0 }
    }
    GeneralDocument.collection.indexes = async () => [
      { key: { documentType: 1, status: 1 } },
      { key: { category: 1, status: 1 } },
      { key: { createdAt: -1 } },
      { key: { updatedAt: -1 } },
      { key: { _fts: 'text', _ftsx: 1 }, weights: { title: 10 } },
    ]
    GeneralDocument.collection.createIndex = async () => {
      throw new Error('existing document indexes must not be recreated')
    }

    for (const model of [ModuleSettings, StorageSettings, ContentSettings]) {
      model.findOne = async () => ({ _id: 'existing' })
      model.collection.indexes = async () => [{ key: { updatedAt: -1 } }]
      model.collection.createIndex = async () => {
        throw new Error('existing settings index must not be recreated')
      }
    }

    await migration.up()
    assert.deepEqual(capturedFilter, {
      documentType: { $exists: true },
      status: { $exists: false },
    })
    assert.equal(await migration.validate(), true)
    await migration.down()
  } finally {
    GeneralDocument.updateMany = originals.updateMany
    GeneralDocument.collection.indexes = originals.documentIndexes
    GeneralDocument.collection.createIndex = originals.documentCreateIndex
    ModuleSettings.findOne = originals.moduleFindOne
    ModuleSettings.collection.indexes = originals.moduleIndexes
    ModuleSettings.collection.createIndex = originals.moduleCreateIndex
    StorageSettings.findOne = originals.storageFindOne
    StorageSettings.collection.indexes = originals.storageIndexes
    StorageSettings.collection.createIndex = originals.storageCreateIndex
    ContentSettings.findOne = originals.contentFindOne
    ContentSettings.collection.indexes = originals.contentIndexes
    ContentSettings.collection.createIndex = originals.contentCreateIndex
  }
})

test('CANBus migration removes only the production legacy index', async () => {
  const originalDb = mongoose.connection.db
  const dropped = []
  let createCalls = 0
  mongoose.connection.db = {
    collection(name) {
      assert.equal(name, 'canbussettings')
      return {
        indexes: async () => [
          { name: '_id_', key: { _id: 1 } },
          { name: 'vehicleId_1', key: { vehicleId: 1 }, unique: true },
          { name: 'vehicleId_1_headUnitTypeId_1', key: { vehicleId: 1, headUnitTypeId: 1 }, unique: true, sparse: true },
        ],
        dropIndex: async name => dropped.push(name),
        createIndex: async () => { createCalls += 1 },
      }
    },
  }

  try {
    await canbusMigration.up()
    await canbusMigration.down()
    assert.deepEqual(dropped, ['vehicleId_1'])
    assert.equal(createCalls, 0)
  } finally {
    mongoose.connection.db = originalDb
  }
})

test('visitor migration skips scans when the production unique index is ready', async () => {
  const originalDb = mongoose.connection.db
  let scanCalls = 0
  let writeCalls = 0
  mongoose.connection.db = {
    listCollections: () => ({ hasNext: async () => true }),
    collection(name) {
      assert.equal(name, 'visitorsummaries')
      return {
        indexes: async () => [
          { name: 'visitorId_1', key: { visitorId: 1 }, unique: true },
          { name: 'ip_1', key: { ip: 1 } },
        ],
        find: () => { scanCalls += 1; throw new Error('production indexes must bypass visitor scans') },
        aggregate: () => { scanCalls += 1; throw new Error('production indexes must bypass visitor scans') },
        createIndex: async () => { writeCalls += 1 },
        dropIndex: async () => { writeCalls += 1 },
      }
    },
  }

  try {
    await visitorMigration.up()
    assert.equal(scanCalls, 0)
    assert.equal(writeCalls, 0)
  } finally {
    mongoose.connection.db = originalDb
  }
})

test('member vehicle migration skips scans when production indexes are ready', async () => {
  const originalDb = mongoose.connection.db
  let aggregateCalls = 0
  let writeCalls = 0
  mongoose.connection.db = {
    collection(name) {
      assert.equal(name, 'member_vehicles')
      return {
        indexes: async () => [
          { name: 'memberId_1_vehicleId_1', key: { memberId: 1, vehicleId: 1 }, unique: true },
          {
            name: 'member_one_default_vehicle',
            key: { memberId: 1 },
            unique: true,
            partialFilterExpression: { isDefault: true },
          },
        ],
        aggregate: () => { aggregateCalls += 1; throw new Error('production indexes must bypass aggregation') },
        createIndex: async () => { writeCalls += 1 },
        dropIndex: async () => { writeCalls += 1 },
      }
    },
  }

  try {
    await memberVehicleMigration.up()
    assert.equal(aggregateCalls, 0)
    assert.equal(writeCalls, 0)
  } finally {
    mongoose.connection.db = originalDb
  }
})

test('vehicle catalog migration limits MongoDB writes to batches of 25', async () => {
  const originals = {
    find: Vehicle.find,
    findOne: Vehicle.findOne,
    insertMany: Vehicle.insertMany,
  }
  const batches = []

  Vehicle.find = () => ({
    select() { return this },
    lean: async () => [],
  })
  Vehicle.findOne = () => ({
    sort() { return this },
    select() { return this },
    lean: async () => null,
  })
  Vehicle.insertMany = async (documents, options) => {
    batches.push({ size: documents.length, ordered: options?.ordered })
    return documents
  }

  try {
    await vehicleCatalogMigration.up()
    assert.ok(batches.length > 1)
    assert.ok(batches.every(batch => batch.size > 0 && batch.size <= 25))
    assert.ok(batches.every(batch => batch.ordered === true))
  } finally {
    Vehicle.find = originals.find
    Vehicle.findOne = originals.findOne
    Vehicle.insertMany = originals.insertMany
  }
})
