'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const get = require('simple-get').concat
const nock = require('nock')

const instance = Fastify()

nock('http://httpbin.org')
  .get('/ip')
  .reply(200, function (uri, requestBody) {
    t.is(this.req.headers.host, 'httpbin.org')
    return { origin: '127.0.0.1' }
  })

t.plan(6)
t.tearDown(instance.close.bind(instance))

instance.get('*', (request, reply) => {
  reply.from()
})

instance.register(From, {
  base: 'http://httpbin.org'
})

instance.listen(0, (err) => {
  t.error(err)

  get(`http://localhost:${instance.server.address().port}/ip`, (err, res, data) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.headers['content-type'], 'application/json')
    t.strictEqual(typeof JSON.parse(data).origin, 'string')
  })
})
