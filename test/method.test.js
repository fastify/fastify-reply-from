'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()

t.test('method', async (t) => {
  t.plan(6)
  t.after(() => instance.close())

  const bodyString = JSON.stringify({ hello: 'world' })

  const parsedLength = Buffer.byteLength(bodyString)

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.deepEqual(req.method, 'POST')
    t.assert.deepEqual(req.headers['content-type'], 'application/json')
    t.same(req.headers['content-length'], parsedLength)
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (d) => {
      data += d
    })
    req.on('end', () => {
      t.same(JSON.parse(data), { hello: 'world' })
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ something: 'else' }))
    })
  })

  instance.patch('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, { method: 'POST' })
  })

  t.after(() => target.close())

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  instance.addContentTypeParser('application/json', function (_req, payload, done) {
    done(null, payload)
  })

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    undici: true
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json'
    },
    body: bodyString
  })

  t.same(await result.body.json(), { something: 'else' })
})
