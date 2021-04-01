'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat

const instance = Fastify()

t.plan(7)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.fail('this should never get called')
  res.end('hello world')
})

instance.head('/', (request, reply) => {
  try {
    reply.from(null, { body: 'this is the new body' })
  } catch (e) {
    t.equal(e.message, 'Rewriting the body when doing a HEAD is not allowed')
    reply.header('x-http-error', '1')
    reply.send('hello world')
  }
})

t.teardown(target.close.bind(target))

target.listen(0, (err) => {
  t.error(err)

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.listen(0, (err) => {
    t.error(err)

    get({
      url: `http://localhost:${instance.server.address().port}`,
      method: 'HEAD'
    }, (err, res, data) => {
      t.error(err)
      t.equal(res.statusCode, 200)
      t.equal(res.headers['x-http-error'], '1')
      t.equal(data.toString(), '')
    })
  })
})
