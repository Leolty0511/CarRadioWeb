const assert = require('node:assert/strict')
const test = require('node:test')
const { buildMongoDumpArgs, discoverDockerContainer, mongoDatabaseFromUri, readDockerComposeService } = require('../dist/utils/updateBackupDiscovery.js')

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

test('uses only the explicitly configured MongoDB container name', () => {
  const containers = [createContainer({
    id: 'mongo-id',
    name: 'caradio-mongo',
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
    explicitName: 'caradio-mongo',
    spawn: createDockerMock(containers),
  })
  assert.equal(result?.name, 'caradio-mongo')
  assert.equal(result?.environment.MONGO_INITDB_DATABASE, 'knowledge-base')
  assert.equal(result?.environment.MONGO_INITDB_ROOT_PASSWORD, 'secret')
})

test('reads the production database name from a MongoDB connection URI', () => {
  assert.equal(
    mongoDatabaseFromUri('mongodb://admin:secret@127.0.0.1:27017/production-database?authSource=admin'),
    'production-database'
  )
  assert.equal(mongoDatabaseFromUri('mongodb://127.0.0.1:27017'), undefined)
})

test('builds a single-collection native MongoDB archive command', () => {
  assert.deepEqual(buildMongoDumpArgs({
    container: 'caradio-mongo',
    database: 'knowledge-base',
    username: 'admin',
    password: 'secret',
  }), [
    'exec',
    'caradio-mongo',
    'mongodump',
    '--db=knowledge-base',
    '--archive',
    '--gzip',
    '--numParallelCollections=1',
    '--username=admin',
    '--password=secret',
    '--authenticationDatabase=admin',
  ])
})

test('rejects unsafe container names in MongoDB backup commands', () => {
  assert.throws(() => buildMongoDumpArgs({
    container: 'caradio-mongo;rm',
    database: 'knowledge-base',
  }), /Invalid MongoDB container name/)
})

test('reads resolved service settings from Docker Compose JSON', () => {
  const spawn = (_command, args) => {
    assert.deepEqual(args, [
      'compose', '--file', '/opt/CarRadioWeb/docker-compose.flarum.yml',
      '--env-file', '/opt/CarRadioWeb/.env.flarum', 'config', '--format', 'json',
    ])
    return {
      status: 0,
      stdout: JSON.stringify({
        services: {
          db: {
            container_name: 'flarum_db',
            environment: { MYSQL_DATABASE: 'flarum', MYSQL_USER: 'flarum', MYSQL_PASSWORD: 'secret' },
          },
        },
      }),
      stderr: '',
    }
  }
  const result = readDockerComposeService(
    'docker',
    '/opt/CarRadioWeb',
    '/opt/CarRadioWeb/docker-compose.flarum.yml',
    '/opt/CarRadioWeb/.env.flarum',
    'db',
    spawn
  )
  assert.equal(result?.containerName, 'flarum_db')
  assert.equal(result?.environment.MYSQL_DATABASE, 'flarum')
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
    spawn: createDockerMock(containers),
  })
  assert.equal(result?.name, 'custom-forum-database')
  assert.equal(result?.environment.MYSQL_USER, 'flarum')
})

test('does not guess a container by image or name outside the current Compose project', () => {
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
    spawn: createDockerMock(containers),
  })
  assert.equal(result, null)
})

test('refuses to guess when multiple matching containers have equal project ownership', () => {
  const labels = { 'com.docker.compose.project.working_dir': '/opt/CarRadioWeb' }
  const containers = [
    createContainer({ id: 'db-one', name: 'db-one', image: 'mariadb:10.5', labels }),
    createContainer({ id: 'db-two', name: 'db-two', image: 'mariadb:10.5', labels }),
  ]
  const result = discoverDockerContainer({
    docker: 'docker',
    repoRoot: '/opt/CarRadioWeb',
    kind: 'flarumDatabase',
    spawn: createDockerMock(containers),
  })
  assert.equal(result, null)
})
