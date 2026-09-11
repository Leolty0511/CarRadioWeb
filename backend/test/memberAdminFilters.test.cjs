const assert = require('node:assert/strict')
const test = require('node:test')

const {
  buildMemberSearchConditions,
  buildMemberVehicleFilter,
} = require('../dist/utils/memberAdminFilters.js')

test('member search escapes regular-expression input and includes recent IP', () => {
  const conditions = buildMemberSearchConditions('member+test@example.com')
  assert.equal(conditions.length, 4)
  assert.equal(conditions[0].email.$regex, 'member\\+test@example\\.com')
  assert.equal(conditions[3].lastSeenIp.$options, 'i')
})

test('vehicle selector filters an entire model when no exact vehicle is selected', () => {
  assert.deepEqual(buildMemberVehicleFilter({ brand: 'Ford', modelName: 'Focus' }), {
    brand: 'Ford',
    modelName: 'Focus',
  })
})

test('an exact vehicle selection takes precedence over snapshot labels', () => {
  const vehicleId = { objectId: 'test' }
  assert.deepEqual(buildMemberVehicleFilter({ vehicleId, brand: 'Ford', modelName: 'Focus' }), { vehicleId })
  assert.equal(buildMemberVehicleFilter({}), null)
})
