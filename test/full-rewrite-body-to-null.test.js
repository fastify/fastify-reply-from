'use strict'

const t = require('tap')
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
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'POST')
    t.notOk('content-type' in req.headers)
    t.equal(req.headers['content-length'], '0')
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (d) => {
      data += d
    })
    req.on('end', () => {
      t.equal(data.length, 0)
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

  t.teardown(target.close.bind(target))

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ hello: 'world' }),
  })

  t.same(await result.body.json(), { hello: 'fastify' })
})
