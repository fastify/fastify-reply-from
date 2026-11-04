'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const fs = require('node:fs')
const http2 = require('node:http2')
const https = require('node:https')
const path = require('node:path')

const certs = {
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'localhost.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'localhost.cert'))
}

t.test('built-in transports verify upstream TLS certificates by default', async (t) => {
  let http1Requests = 0
  let http2Requests = 0

  const http1Target = https.createServer(certs, (_req, res) => {
    http1Requests++
    res.end('ok')
  })
  t.after(() => http1Target.close())
  await new Promise(resolve => http1Target.listen({ port: 0 }, resolve))

  const http2Target = http2.createSecureServer(certs)
  http2Target.on('stream', (stream) => {
    http2Requests++
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })
  t.after(() => http2Target.close())
  await new Promise(resolve => http2Target.listen({ port: 0 }, resolve))

  const http1Base = `https://localhost:${http1Target.address().port}`
  const http2Base = `https://localhost:${http2Target.address().port}`
  const cases = [
    { name: 'undici defaults', base: http1Base, options: {} },
    {
      name: 'undici partial options',
      base: http1Base,
      options: { undici: { connections: 2 } }
    },
    {
      name: 'undici empty TLS options',
      base: http1Base,
      options: { undici: { tls: {} } }
    },
    { name: 'node:https defaults', base: http1Base, options: { http: true } },
    {
      name: 'node:https partial options',
      base: http1Base,
      options: { http: { requestOptions: { timeout: 1000 } } }
    },
    {
      name: 'node:https global agent',
      base: http1Base,
      options: { undici: false, globalAgent: true }
    },
    {
      name: 'HTTP/2 defaults',
      base: http2Base,
      options: { http2: true },
      expectedStatusCode: 503
    },
    {
      name: 'HTTP/2 partial options',
      base: http2Base,
      options: { http2: { sessionOptions: {}, requestTimeout: 1000 } },
      expectedStatusCode: 503
    }
  ]

  for (const testCase of cases) {
    await t.test(testCase.name, async (t) => {
      const previousHttp1Requests = http1Requests
      const previousHttp2Requests = http2Requests
      const proxy = Fastify()
      t.after(() => proxy.close())

      proxy.register(From, {
        base: testCase.base,
        ...testCase.options
      })
      proxy.get('/', (_request, reply) => reply.from('/'))

      const response = await proxy.inject('/')

      t.assert.strictEqual(response.statusCode, testCase.expectedStatusCode || 500)
      t.assert.strictEqual(http1Requests, previousHttp1Requests)
      t.assert.strictEqual(http2Requests, previousHttp2Requests)
    })
  }
})

t.test('TLS verification can be explicitly disabled', async (t) => {
  const http1Target = https.createServer(certs, (_req, res) => res.end('ok'))
  t.after(() => http1Target.close())
  await new Promise(resolve => http1Target.listen({ port: 0 }, resolve))

  const http2Target = http2.createSecureServer(certs)
  http2Target.on('stream', (stream) => {
    stream.respond({ ':status': 200 })
    stream.end('ok')
  })
  t.after(() => http2Target.close())
  await new Promise(resolve => http2Target.listen({ port: 0 }, resolve))

  const http1Base = `https://localhost:${http1Target.address().port}`
  const cases = [
    {
      name: 'undici',
      base: http1Base,
      options: { undici: { tls: { rejectUnauthorized: false } } }
    },
    {
      name: 'node:https',
      base: http1Base,
      options: { http: { requestOptions: { rejectUnauthorized: false } } }
    },
    {
      name: 'HTTP/2',
      base: `https://localhost:${http2Target.address().port}`,
      options: { http2: { sessionOptions: { rejectUnauthorized: false } } }
    }
  ]

  for (const testCase of cases) {
    await t.test(testCase.name, async (t) => {
      const proxy = Fastify()
      t.after(() => proxy.close())

      proxy.register(From, {
        base: testCase.base,
        ...testCase.options
      })
      proxy.get('/', (_request, reply) => reply.from('/'))

      const response = await proxy.inject('/')

      t.assert.strictEqual(response.statusCode, 200)
      t.assert.strictEqual(response.body, 'ok')
    })
  }
})
