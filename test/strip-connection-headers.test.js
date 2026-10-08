'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')

// RFC 7230 Section 6.1 - Connection header handling
// A proxy MUST parse the Connection header and remove any headers listed within it

// Helper to make HTTP request with Connection header (undici doesn't allow this)
function makeRequest (port, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'GET',
      hostname: 'localhost',
      port,
      path: '/',
      headers
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

t.test('strips headers listed in Connection header (undici)', async (t) => {
  t.plan(4)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-custom-header'], undefined, 'X-Custom-Header should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Custom-Header': 'some-value',
    Connection: 'X-Custom-Header'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('strips multiple headers listed in Connection header (undici)', async (t) => {
  t.plan(5)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-custom-one'], undefined, 'X-Custom-One should be stripped')
    t.assert.strictEqual(req.headers['x-custom-two'], undefined, 'X-Custom-Two should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Custom-One': 'value1',
    'X-Custom-Two': 'value2',
    Connection: 'X-Custom-One, X-Custom-Two'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('preserves headers not listed in Connection header (undici)', async (t) => {
  t.plan(5)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-keep-header'], 'keep-me', 'X-Keep-Header should be preserved')
    t.assert.strictEqual(req.headers['x-strip-header'], undefined, 'X-Strip-Header should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Keep-Header': 'keep-me',
    'X-Strip-Header': 'strip-me',
    Connection: 'X-Strip-Header'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('strips headers listed in Connection header (http)', async (t) => {
  t.plan(4)
  const instance = Fastify()
  instance.register(From, { undici: false })

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-custom-header'], undefined, 'X-Custom-Header should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Custom-Header': 'some-value',
    Connection: 'X-Custom-Header'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('strips multiple headers listed in Connection header (http)', async (t) => {
  t.plan(5)
  const instance = Fastify()
  instance.register(From, { undici: false })

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-custom-one'], undefined, 'X-Custom-One should be stripped')
    t.assert.strictEqual(req.headers['x-custom-two'], undefined, 'X-Custom-Two should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Custom-One': 'value1',
    'X-Custom-Two': 'value2',
    Connection: 'X-Custom-One, X-Custom-Two'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('handles Connection header with keep-alive and custom headers (undici)', async (t) => {
  t.plan(4)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers['x-custom-header'], undefined, 'X-Custom-Header should be stripped')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    'X-Custom-Header': 'some-value',
    Connection: 'keep-alive, X-Custom-Header'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('does not strip headers added by rewriteRequestHeaders (undici)', async (t) => {
  t.plan(4)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  let seenForwardedBy
  const target = http.createServer((req, res) => {
    seenForwardedBy = req.headers['x-forwarded-by']
    t.assert.ok('request proxied')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      rewriteRequestHeaders: (_request, headers) => {
        return { ...headers, 'x-forwarded-by': 'fastify-proxy' }
      }
    })
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    Connection: 'X-Forwarded-By'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
  t.assert.strictEqual(seenForwardedBy, 'fastify-proxy', 'X-Forwarded-By should not be stripped')
})

t.test('does not strip headers added by rewriteRequestHeaders (http)', async (t) => {
  t.plan(4)
  const instance = Fastify()
  instance.register(From, { undici: false })

  t.after(() => instance.close())

  let seenForwardedBy
  const target = http.createServer((req, res) => {
    seenForwardedBy = req.headers['x-forwarded-by']
    t.assert.ok('request proxied')
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      rewriteRequestHeaders: (_request, headers) => {
        return { ...headers, 'x-forwarded-by': 'fastify-proxy' }
      }
    })
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    Connection: 'X-Forwarded-By'
  })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
  t.assert.strictEqual(seenForwardedBy, 'fastify-proxy', 'X-Forwarded-By should not be stripped')
})

t.test('destroys http agents when destroyAgent is enabled', async (t) => {
  let httpDestroyed = false
  let httpsDestroyed = false

  const httpAgent = {
    destroy () {
      httpDestroyed = true
    }
  }

  const httpsAgent = {
    destroy () {
      httpsDestroyed = true
    }
  }

  const instance = Fastify()

  instance.register(From, {
    undici: false,
    destroyAgent: true,
    http: {
      agents: {
        'http:': httpAgent,
        'https:': httpsAgent
      }
    }
  })

  await instance.ready()
  await instance.close()

  t.assert.strictEqual(httpDestroyed, true)
  t.assert.strictEqual(httpsDestroyed, true)
})

t.test('strips Connection headers added by rewriteRequestHeaders (http)', async (t) => {
  t.plan(5)

  const instance = Fastify()

  instance.register(From, {
    undici: false
  })

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(
      req.headers['x-remove-header'],
      undefined,
      'X-Remove-Header should be stripped'
    )
    t.assert.strictEqual(
      req.headers['x-keep-header'],
      'keep-me',
      'X-Keep-Header should be preserved'
    )

    res.statusCode = 200
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      rewriteRequestHeaders: (_request, headers) => {
        return {
          ...headers,
          connection: 'x-remove-header',
          'x-remove-header': 'remove-me',
          'x-keep-header': 'keep-me'
        }
      }
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => target.listen({ port: 0 }, resolve))
  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await makeRequest(
    instance.server.address().port,
    {}
  )

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})

t.test('strips headers listed in Connection header before undici request', async (t) => {
  t.plan(3)

  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.strictEqual(req.headers['x-secret'], undefined)
    t.assert.strictEqual(req.headers['x-keep'], 'yes')

    res.end('ok')
  })

  t.after(() => target.close())

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      rewriteRequestHeaders: (_request, headers) => ({
        ...headers,
        connection: 'x-secret',
        'x-secret': 'secret',
        'x-keep': 'yes'
      })
    })
  })

  await instance.listen({ port: 0 })

  const result = await require('undici').request(
    `http://localhost:${instance.server.address().port}`
  )

  t.assert.strictEqual(result.statusCode, 200)
})

// RFC 7230 Section 6.1 - hop-by-hop headers are consumed by the proxy and must
// not be forwarded to the upstream. The http2 request path already dropped
// these via stripHttp1ConnectionHeaders; these cover the default (undici) and
// core-http transports, where they used to leak.

t.test('strips hop-by-hop headers (undici)', async (t) => {
  t.plan(6)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers.te, undefined, 'TE should be stripped')
    t.assert.strictEqual(req.headers['keep-alive'], undefined, 'Keep-Alive should be stripped')
    t.assert.strictEqual(req.headers['proxy-connection'], undefined, 'Proxy-Connection should be stripped')
    t.assert.strictEqual(req.headers['x-keep'], 'keep-me', 'a normal header should be preserved')
    res.statusCode = 200
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    TE: 'gzip',
    'Keep-Alive': 'timeout=5',
    'Proxy-Connection': 'keep-alive',
    'X-Keep': 'keep-me'
  })

  t.assert.strictEqual(result.statusCode, 200)
})

t.test('strips hop-by-hop headers (http)', async (t) => {
  t.plan(6)
  const instance = Fastify()
  instance.register(From, { undici: false })

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.headers.te, undefined, 'TE should be stripped')
    t.assert.strictEqual(req.headers['keep-alive'], undefined, 'Keep-Alive should be stripped')
    t.assert.strictEqual(req.headers['proxy-connection'], undefined, 'Proxy-Connection should be stripped')
    t.assert.strictEqual(req.headers['x-keep'], 'keep-me', 'a normal header should be preserved')
    res.statusCode = 200
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, {
    TE: 'gzip',
    'Keep-Alive': 'timeout=5',
    'Proxy-Connection': 'keep-alive',
    'X-Keep': 'keep-me'
  })

  t.assert.strictEqual(result.statusCode, 200)
})

t.test('preserves TE: trailers, which is not hop-by-hop (undici)', async (t) => {
  // Node treats `TE: trailers` as legal to forward (see stripHttp1ConnectionHeaders),
  // so it must survive while other TE values are dropped.
  t.plan(3)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.strictEqual(req.headers.te, 'trailers', 'TE: trailers should be preserved')
    res.statusCode = 200
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port, { TE: 'trailers' })

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
})
