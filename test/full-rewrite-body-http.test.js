'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From, {
  http: true
})

t.plan(8)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'POST')
  t.equal(req.headers['content-type'], 'application/json')
  t.equal(req.headers['content-length'], '20')
  let data = ''
  req.setEncoding('utf8')
  req.on('data', (d) => {
    data += d
  })
  req.on('end', () => {
    t.same(JSON.parse(data), { something: 'else' })
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ hello: 'fastify' }))
  })
})

instance.post('/', (_request, reply) => {
  reply.from(`http://localhost:${target.address().port}`, {
    body: {
      something: 'else'
    }
  })
})

t.teardown(target.close.bind(target))

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen({ port: 0 }, async (err) => {
    t.error(err)

    const result = await fetch(`http://localhost:${instance.server.address().port}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ hello: 'world' }),
    })

    t.same(await result.json(), { hello: 'fastify' })
  })
})
