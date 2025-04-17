'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From, {
  http: true
})

t.test('full rewrite body to null', async (t) => {
  t.plan(6)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'POST')
    t.assert.ok(!('content-type' in req.headers))
    t.assert.strictEqual(req.headers['content-length'], '0')
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (d) => {
      data += d
    })
    req.on('end', () => {
      t.assert.strictEqual(data.length, 0)
      res.statusCode = 200
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ hello: 'fastify' }))
    })
  })

  instance.post('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      body: null
    })
  })

  t.after(() => target.close())

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ hello: 'world' }),
  })

  t.assert.deepStrictEqual(await result.body.json(), { hello: 'fastify' })
})
