import { spawn } from 'node:child_process'
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const npmCli = process.env.npm_execpath
if (!npmCli) {throw new Error('npm_execpath is unavailable; run this command through npm run dev:all')}
const concurrentlyCli = resolve(
  fileURLToPath(new URL('..', import.meta.url)),
  'node_modules/concurrently/dist/bin/concurrently.js'
)

async function responds(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2500) })
    return response.ok
  } catch {
    return false
  }
}

function portAvailable(port) {
  return new Promise(resolve => {
    const server = net.createServer()
    server.once('error', error => resolve(error.code !== 'EADDRINUSE'))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

function run(command, args) {
  const child = spawn(command, args, { stdio: 'inherit', windowsHide: true })
  child.on('error', error => {
    console.error(`Unable to start ${command}: ${error.message}`)
    process.exitCode = 1
  })
  child.on('exit', code => { process.exitCode = code ?? 1 })
}

const [backendHealthy, frontendHealthy, backendPortFree, frontendPortFree] = await Promise.all([
  responds('http://127.0.0.1:3000/health'),
  responds('http://127.0.0.1:3001/'),
  portAvailable(3000),
  portAvailable(3001),
])

if (!backendHealthy && !backendPortFree) {
  console.error('Port 3000 is occupied by another service. Run npm run dev:stop or close that service first.')
  process.exit(1)
}
if (!frontendHealthy && !frontendPortFree) {
  console.error('Port 3001 is occupied by another service. Run npm run dev:stop or close that service first.')
  process.exit(1)
}

if (backendHealthy && frontendHealthy) {
  console.log('Frontend and backend are already running: http://localhost:3001')
} else if (frontendHealthy) {
  console.log('Frontend is already running; starting backend only.')
  run(process.execPath, [npmCli, 'run', 'dev:backend'])
} else if (backendHealthy) {
  console.log('Backend is already running; starting frontend only.')
  run(process.execPath, [npmCli, 'run', 'dev'])
} else {
  run(process.execPath, [
    concurrentlyCli, '--kill-others-on-fail', '-n', 'backend,frontend', '-c', 'blue,green',
    'npm run dev:backend',
    'wait-on http-get://127.0.0.1:3000/health -t 120000 && npm run dev',
  ])
}
