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
    t.equal(this.req.headers.host, 'httpbin.org')
    return { origin: '127.0.0.1' }
  })

t.plan(6)
t.teardown(instance.close.bind(instance))

instance.get('/', (request, reply) => {
  reply.from('http://httpbin.org/ip')
})

instance.register(From, {
  undici: false
})

instance.listen(0, (err) => {
  t.error(err)

  get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
    t.error(err)
    t.equal(res.statusCode, 200)
    t.equal(res.headers['content-type'], 'application/json')
    t.equal(typeof JSON.parse(data).origin, 'string')
  })
})
