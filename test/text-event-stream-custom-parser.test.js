'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

t.test('text/event-stream proxying with custom content type parser', async (t) => {
  t.plan(6)

  // Target server that sends SSE data
  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'POST')
    t.assert.match(req.headers['content-type'], /^text\/event-stream/)

    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      data += chunk
    })
    req.on('end', () => {
      // Verify the SSE data is received
      t.assert.match(data, /data: test message/)
      t.assert.match(data, /event: custom/)

      res.setHeader('content-type', 'application/json')
      res.statusCode = 200
      res.end(JSON.stringify({ received: 'sse data' }))
    })
  })

  // Fastify instance with custom text/event-stream parser
  const fastify = Fastify()

  // Register custom content type parser for text/event-stream
  // This allows the raw body to be passed through without parsing
  fastify.addContentTypeParser('text/event-stream', function (req, body, done) {
    done(null, body)
  })

  fastify.register(From)

  fastify.post('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => fastify.close())
  t.after(() => target.close())

  await fastify.listen({ port: 0 })
  await target.listen({ port: 0 })

  // Create SSE-like data
  const sseData = 'data: test message\nevent: custom\ndata: another line\n\n'

  // Send request with SSE data
  const result = await request(`http://localhost:${fastify.server.address().port}`, {
    method: 'POST',
    headers: {
      'content-type': 'text/event-stream'
    },
    body: sseData
  })

  t.assert.deepStrictEqual(await result.body.json(), { received: 'sse data' })
})
