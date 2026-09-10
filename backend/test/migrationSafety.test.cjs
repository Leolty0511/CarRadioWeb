const assert = require('node:assert/strict')
const test = require('node:test')

const migration = require('../dist/scripts/migrations/001-add-content-types.js')
const { GeneralDocument } = require('../dist/models/Document.js')
const { ModuleSettings } = require('../dist/models/ModuleSettings.js')
const { StorageSettings } = require('../dist/models/StorageSettings.js')
const { ContentSettings } = require('../dist/models/ContentSettings.js')

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
