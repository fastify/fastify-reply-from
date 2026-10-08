'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')

// RFC 7230 Section 6.1 - hop-by-hop headers are consumed by the immediate
// connection and MUST NOT be forwarded by a proxy. The http2 downstream path
// already stripped these from the upstream response via
// stripHttp1ConnectionHeaders; these cover the http1 downstream path, where
// they used to leak to the client.

// Read the response the proxy sends downstream over raw HTTP/1 so we can see
// exactly which headers the client receives (undici hides some of them).
function makeRequest (port) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'GET',
      hostname: 'localhost',
      port,
      path: '/'
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }))
    })
    req.on('error', reject)
    req.end()
  })
}

t.test('strips hop-by-hop headers from the upstream response (undici)', async (t) => {
  t.plan(6)
  const instance = Fastify()
  instance.register(From)

  t.after(() => instance.close())

  const target = http.createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/plain',
      'keep-alive': 'timeout=5, max=1000',
      'proxy-connection': 'keep-alive',
      // a custom header the upstream lists in its own Connection header
      connection: 'keep-alive, x-hop-secret',
      'x-hop-secret': 'leaked-value',
      'x-normal': 'keep-me'
    })
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port)

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
  // The upstream keep-alive/proxy-connection describe the proxy<->upstream hop
  // and must not reach the client. The value would be 'timeout=5, max=1000' if
  // it leaked; the downstream server may still add its own keep-alive, so we
  // assert the leaked value specifically is gone.
  t.assert.notStrictEqual(result.headers['keep-alive'], 'timeout=5, max=1000', 'upstream Keep-Alive should be stripped')
  t.assert.strictEqual(result.headers['proxy-connection'], undefined, 'Proxy-Connection should be stripped')
  t.assert.strictEqual(result.headers['x-hop-secret'], undefined, 'a header listed in the upstream Connection header should be stripped')
  t.assert.strictEqual(result.headers['x-normal'], 'keep-me', 'an end-to-end header should be preserved')
})

t.test('strips hop-by-hop headers from the upstream response (http)', async (t) => {
  t.plan(6)
  const instance = Fastify()
  instance.register(From, { undici: false })

  t.after(() => instance.close())

  const target = http.createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/plain',
      'keep-alive': 'timeout=5, max=1000',
      'proxy-connection': 'keep-alive',
      connection: 'keep-alive, x-hop-secret',
      'x-hop-secret': 'leaked-value',
      'x-normal': 'keep-me'
    })
    res.end('ok')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))
  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await makeRequest(instance.server.address().port)

  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(result.body, 'ok')
  t.assert.notStrictEqual(result.headers['keep-alive'], 'timeout=5, max=1000', 'upstream Keep-Alive should be stripped')
  t.assert.strictEqual(result.headers['proxy-connection'], undefined, 'Proxy-Connection should be stripped')
  t.assert.strictEqual(result.headers['x-hop-secret'], undefined, 'a header listed in the upstream Connection header should be stripped')
  t.assert.strictEqual(result.headers['x-normal'], 'keep-me', 'an end-to-end header should be preserved')
})
