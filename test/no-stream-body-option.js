'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat
const Readable = require('stream').Readable

const instance = Fastify()
instance.register(From)

t.plan(5)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.fail('the target server should never be called')
  res.end()
})

instance.post('/', (request, reply) => {
  const body = new Readable({
    read: function () {
      t.fail('the read function should never be called')
    }
  })

  t.throws(() => {
    reply.from(`http://localhost:${target.address().port}`, {
      body
    })
  })

  // return a 500
  reply.code(500).send({ an: 'error' })
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
    }, (err, res) => {
      t.error(err)
      t.equal(res.statusCode, 500)
    })
  })
})
