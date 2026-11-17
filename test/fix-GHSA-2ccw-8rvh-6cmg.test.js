'use strict'

const { test } = require('node:test')
const http = require('node:http')
const Fastify = require('fastify')
const replyFrom = require('..')

// Simulates an upstream that percent-decodes the request path before
// resolving dot-segments (e.g. python http.server), so `%2e%2e%2f` acts as
// `../` once it reaches the upstream.
function normalizeDecodedPath (path) {
  const out = []
  for (const segment of decodeURIComponent(path).split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return '/' + out.join('/')
}

test('rejects scheme-prefixed encoded dot-segment traversal (GHSA-2ccw-8rvh-6cmg)', async (t) => {
  let upstreamRequests = 0
  const upstream = http.createServer((req, res) => {
    upstreamRequests++
    res.setHeader('connection', 'close')
    const normalized = normalizeDecodedPath(req.url.split('?')[0])
    if (normalized.startsWith('/v1/public/')) {
      res.end('PUBLIC')
    } else if (normalized === '/v1/secret.txt') {
      res.end('SECRET')
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

  // Only /v1/public/ on the upstream is meant to be exposed through the proxy.
  await app.register(replyFrom, {
    base: `http://127.0.0.1:${upstream.address().port}/v1/public/`
  })
  app.get('/files/*', (request, reply) => {
    return reply.from(request.params['*'])
  })
  await app.listen({ host: '127.0.0.1', port: 0 })

  const origin = `http://127.0.0.1:${app.server.address().port}`

  // Intended content is still reachable.
  let response = await fetch(origin + '/files/ok.txt')
  t.assert.strictEqual(response.status, 200)
  t.assert.strictEqual(await response.text(), 'PUBLIC')
  t.assert.strictEqual(upstreamRequests, 1)

  // find-my-way decodes the wildcard parameter once, hence double encoding.
  for (const path of [
    '/files/http:%252e%252e%252fsecret.txt',
    '/files/http:%252E%252E%252Fsecret.txt',
    '/files/HTTP:%252e%252e%252fsecret.txt',
    '/files/http:.%252e%252fsecret.txt'
  ]) {
    response = await fetch(origin + path)
    t.assert.strictEqual(response.status, 400, path)
    t.assert.strictEqual((await response.text()).includes('SECRET'), false, path)
    t.assert.strictEqual(upstreamRequests, 1, path)
  }
})

// Simulates a Java-based upstream (Tomcat/Jetty/WildFly/Spring Boot): matrix
// parameters (`;...`) are treated as a path-parameter delimiter and removed per
// segment, then dot-segments are resolved. The scheme-prefix (this advisory)
// and semicolon (GHSA-6mph-mjg3-f943) fixes must compose: `http:..;%2f` is
// caught by neither alone, only once the `;` stripping lives in the shared
// hasDotSegment() so the post-parse check applies it too.
function normalizeJavaPath (path) {
  const cleaned = decodeURIComponent(path).split('/').map(s => s.split(';')[0])
  const out = []
  for (const segment of cleaned) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return '/' + out.join('/')
}

test('rejects scheme-prefixed semicolon dot-segment traversal (GHSA-2ccw-8rvh-6cmg)', async (t) => {
  let upstreamRequests = 0
  const upstream = http.createServer((req, res) => {
    upstreamRequests++
    res.setHeader('connection', 'close')
    const normalized = normalizeJavaPath(req.url.split('?')[0])
    if (normalized.startsWith('/v1/public/')) res.end('PUBLIC')
    else if (normalized === '/v1/secret.txt') res.end('SECRET')
    else { res.statusCode = 404; res.end('not found') }
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))

  const app = Fastify()
  t.after(async () => {
    if (app.server.listening) await app.close()
    if (upstream.listening) await new Promise(resolve => upstream.close(resolve))
  })

  await app.register(replyFrom, {
    base: `http://127.0.0.1:${upstream.address().port}/v1/public/`
  })
  app.get('/files/*', (request, reply) => reply.from(request.params['*']))
  await app.listen({ host: '127.0.0.1', port: 0 })

  const origin = `http://127.0.0.1:${app.server.address().port}`

  let response = await fetch(origin + '/files/ok.txt')
  t.assert.strictEqual(response.status, 200)
  t.assert.strictEqual(await response.text(), 'PUBLIC')
  t.assert.strictEqual(upstreamRequests, 1)

  for (const path of [
    '/files/..;%252fsecret.txt',
    '/files/%2e%2e;%252fsecret.txt',
    '/files/http:..;%252fsecret.txt',
    '/files/http:%252e%252e;%252fsecret.txt'
  ]) {
    response = await fetch(origin + path)
    t.assert.strictEqual(response.status, 400, path)
    t.assert.strictEqual((await response.text()).includes('SECRET'), false, path)
    t.assert.strictEqual(upstreamRequests, 1, path)
  }
})
