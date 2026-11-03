'use strict'

const { test } = require('node:test')
const http = require('node:http')
const Fastify = require('fastify')
const replyFrom = require('..')

// Simulates a Java-based upstream (Tomcat/Jetty/WildFly/Spring Boot): matrix
// parameters (`;...`) are treated as a path-parameter delimiter and removed per
// segment, then dot-segments are resolved. Without a fix, `..;` bypasses the
// proxy's config detection and reaches a context the proxy never exposed.
function normalizeJavaPath (path) {
  const cleaned = path.split('/').map(s => s.split(';')[0])
  const out = []
  for (const segment of cleaned) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return '/' + out.join('/')
}

test('rejects semicolon dot-segment path traversal (GHSA-6mph-mjg3-f943)', async (t) => {
  const upstream = http.createServer((req, res) => {
    res.setHeader('connection', 'close')
    const normalized = normalizeJavaPath(req.url.split('?')[0])
    if (normalized.startsWith('/appB/')) {
      res.end('SECRET-ADMIN')
    } else if (normalized.startsWith('/appA/')) {
      res.end('PUBLIC')
    } else {
      res.statusCode = 404
      res.end('not found')
    }
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
  // Only the /appA/ context is meant to be exposed through the proxy.
  app.get('/public/*', (request, reply) => {
    return reply.from(`/appA/${request.params['*']}`)
  })
  await app.listen({ host: '127.0.0.1', port: 0 })

  const origin = `http://127.0.0.1:${app.server.address().port}`

  // Intended content is still reachable.
  let response = await fetch(origin + '/public/index.html')
  t.assert.strictEqual(response.status, 200)
  t.assert.strictEqual(await response.text(), 'PUBLIC')

  // Semicolon dot-segment variants must be rejected before reaching upstream.
  for (const path of [
    '/public/..;/appB/index.html',
    '/public/..;jsessionid=abc/appB/index.html',
    '/public/..%3b/appB/index.html',
    '/public/..%3B/appB/index.html',
    '/public/%2e%2e%3b/appB/index.html'
  ]) {
    response = await fetch(origin + path)
    t.assert.strictEqual(response.status, 400, path)
    t.assert.strictEqual((await response.text()).includes('SECRET-ADMIN'), false, path)
  }
})
