'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.plan(8)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'POST')
  t.equal(req.headers['content-type'].startsWith('application/json'), true)
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

instance.post('/', (_request, reply) => {
  reply.from(`http://localhost:${target.address().port}`)
})

t.teardown(target.close.bind(target))

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen({ port: 0 }, async (err) => {
    t.error(err)

    const result = await fetch(`http://localhost:${instance.server.address().port}`, {
      method: 'POST',
      body: JSON.stringify({
        hello: 'world'
      }),
      headers: {
        'content-type': 'application/json;charset=utf-8'
      }
    })

    t.equal(result.headers.get('content-type'), 'application/json')
    t.same(await result.json(), { something: 'else' })
  })
})
