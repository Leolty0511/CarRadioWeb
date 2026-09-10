const assert = require('node:assert/strict')
const test = require('node:test')
const { discoverDockerContainer, mongoDatabaseFromUri } = require('../dist/utils/updateBackupDiscovery.js')

function createContainer({ id, name, image, running = true, labels = {}, environment = [] }) {
  return {
    Id: id,
    Name: `/${name}`,
    Config: { Image: image, Labels: labels, Env: environment },
    State: { Running: running },
  }
}

function createDockerMock(containers) {
  return (_command, args) => {
    if (args[0] === 'inspect') {
      const target = args[args.length - 1]
      const container = containers.find(candidate => candidate.Id === target || candidate.Name === `/${target}`)
      return container
        ? { status: 0, stdout: JSON.stringify([container]), stderr: '' }
        : { status: 1, stdout: '', stderr: 'not found' }
    }
    if (args[0] === 'ps') {
      return { status: 0, stdout: `${containers.filter(container => container.State.Running).map(container => container.Id).join('\n')}\n`, stderr: '' }
    }
    return { status: 1, stdout: '', stderr: 'unexpected command' }
  }
}

test('uses the standard MongoDB container and reads its existing configuration', () => {
  const containers = [createContainer({
    id: 'mongo-id',
    name: 'automotivehu-mongo',
    image: 'mongo:6',
    environment: [
      'MONGO_INITDB_DATABASE=knowledge-base',
      'MONGO_INITDB_ROOT_USERNAME=admin',
      'MONGO_INITDB_ROOT_PASSWORD=secret',
    ],
  })]
  const result = discoverDockerContainer({
    docker: 'docker',
    repoRoot: '/opt/CarRadioWeb',
    kind: 'mongo',
    defaultNames: ['automotivehu-mongo'],
    spawn: createDockerMock(containers),
  })
  assert.equal(result?.name, 'automotivehu-mongo')
  assert.equal(result?.environment.MONGO_INITDB_DATABASE, 'knowledge-base')
  assert.equal(result?.environment.MONGO_INITDB_ROOT_PASSWORD, 'secret')
})

test('reads the production database name from a MongoDB connection URI', () => {
  assert.equal(
    mongoDatabaseFromUri('mongodb://admin:secret@127.0.0.1:27017/official-website?authSource=admin'),
    'official-website'
  )
  assert.equal(mongoDatabaseFromUri('mongodb://127.0.0.1:27017'), undefined)
})

test('discovers a renamed Flarum database through Docker Compose labels', () => {
  const containers = [createContainer({
    id: 'flarum-db-id',
    name: 'custom-forum-database',
    image: 'mariadb:10.5',
    labels: {
      'com.docker.compose.project.working_dir': '/opt/CarRadioWeb',
      'com.docker.compose.service': 'db',
    },
    environment: ['MYSQL_DATABASE=flarum', 'MYSQL_USER=flarum', 'MYSQL_PASSWORD=secret'],
  })]
  const result = discoverDockerContainer({
    docker: 'docker',
    repoRoot: '/opt/CarRadioWeb',
    kind: 'flarumDatabase',
    defaultNames: ['flarum_db'],
    spawn: createDockerMock(containers),
  })
  assert.equal(result?.name, 'custom-forum-database')
  assert.equal(result?.environment.MYSQL_USER, 'flarum')
})

test('does not select an unrelated database container', () => {
  const containers = [createContainer({
    id: 'unrelated-id',
    name: 'another-project-db',
    image: 'mariadb:10.5',
    labels: {
      'com.docker.compose.project.working_dir': '/srv/another-project',
      'com.docker.compose.service': 'db',
    },
    environment: ['MYSQL_DATABASE=another'],
  })]
  const result = discoverDockerContainer({
    docker: 'docker',
    repoRoot: '/opt/CarRadioWeb',
    kind: 'flarumDatabase',
    defaultNames: ['flarum_db'],
    spawn: createDockerMock(containers),
  })
  assert.equal(result, null)
})
