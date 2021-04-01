'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat
const msgpack = require('msgpack5')()

const instance = Fastify()
instance.register(From)

t.plan(8)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'POST')
  t.equal(req.headers['content-type'], 'application/msgpack')
  const data = []
  req.on('data', (d) => {
    data.push(d)
  })
  req.on('end', () => {
    t.same(msgpack.decode(Buffer.concat(data)), { hello: 'world' })
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ something: 'else' }))
  })
})

instance.post('/', (request, reply) => {
  reply.from(`http://localhost:${target.address().port}`, {
    contentType: 'application/msgpack',
    body: msgpack.encode(request.body)
  })
})

t.teardown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)

  target.listen(0, (err) => {
    t.error(err)

    get({
      url: `http://localhost:${instance.server.address().port}`,
      method: 'POST',
      json: true,
      body: {
        hello: 'world'
      }
    }, (err, res, data) => {
      t.error(err)
      t.same(data, { something: 'else' })
    })
  })
})
