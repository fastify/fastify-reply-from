'use strict'

const { test } = require('node:test')
const http = require('node:http')
const net = require('node:net')
const Fastify = require('fastify')
const replyFrom = require('..')

function rawGet (port, path) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
    })
    let response = ''
    socket.setTimeout(5000, () => socket.destroy(new Error('request timed out')))
    socket.on('data', chunk => { response += chunk })
    socket.on('end', () => resolve(response))
    socket.on('error', reject)
  })
}

test('rejects paths that URL parsing would reinterpret', async (t) => {
  let upstreamRequests = 0
  const upstream = http.createServer((req, res) => {
    upstreamRequests++
    res.setHeader('connection', 'close')
    res.end(req.url)
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))

  const app = Fastify()
  t.after(async () => {
    if (app.server.listening) await app.close()
    if (upstream.listening) {
      await new Promise(resolve => upstream.close(resolve))
    }
  })

  await app.register(replyFrom, {
    base: `http://127.0.0.1:${upstream.address().port}`
  })
  app.get('/files/*', (request, reply) => {
    return reply.from(`/v1/public/${request.params['*']}`)
  })
  app.all('/admin/*', (_request, reply) => reply.code(403).send('blocked'))
  app.all('/master-keys', (_request, reply) => reply.code(403).send('blocked'))
  app.all('/*', (_request, reply) => reply.from())
  await app.listen({ host: '127.0.0.1', port: 0 })

  const origin = `http://127.0.0.1:${app.server.address().port}`
  const encodedPaths = [
    '/admin%5cmaster-keys',
    '/files/x%5c..%5c..%5c..%5cadmin%5cmaster-keys',
    '/files/x/%09..%09/%09..%09/%09..%09/admin/master-keys',
    '/files/x/%0a..%0a/%0a..%0a/%0a..%0a/admin/master-keys',
    '/files/x/%0d..%0d/%0d..%0d/%0d..%0d/admin/master-keys'
  ]

  for (const path of encodedPaths) {
    const response = await fetch(origin + path)
    t.assert.strictEqual(response.status, 400, path)
    await response.text()
    t.assert.strictEqual(upstreamRequests, 0, path)
  }

  for (const path of ['/admin\\master-keys', '/./master-keys']) {
    const response = await rawGet(app.server.address().port, path)
    t.assert.match(response, /^HTTP\/1\.1 400 /, path)
    t.assert.strictEqual(upstreamRequests, 0, path)
  }
})
