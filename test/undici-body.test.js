'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()

t.test('undici body', async (t) => {
  t.plan(6)
  t.after(() => instance.close())

  const bodyString = JSON.stringify({ hello: 'world' })

  const parsedLength = Buffer.byteLength(bodyString)

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'POST')
    t.assert.strictEqual(req.headers['content-type'], 'application/json')
    t.assert.deepStrictEqual(req.headers['content-length'], `${parsedLength}`)
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (d) => {
      data += d
    })
    req.on('end', () => {
      t.assert.deepStrictEqual(JSON.parse(data), { hello: 'world' })
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ something: 'else' }))
    })
  })

  instance.post('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`)
  })

  t.after(() => target.close())

  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  instance.addContentTypeParser('application/json', function (_req, payload, done) {
    done(null, payload)
  })

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: true
  })

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: bodyString
  })

  t.assert.deepStrictEqual(await result.body.json(), { something: 'else' })
})
