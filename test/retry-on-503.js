'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat

const instance = Fastify()

t.plan(6)
t.teardown(instance.close.bind(instance))
let requestCount = 0
const target = http.createServer((req, res) => {
  if (requestCount++ === 0) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('Retry-After', 1000)
    return res.end('This Service Unavailable')
  }
  res.statusCode = 205
  res.setHeader('Content-Type', 'text/plain')
  return res.end('Hello World Twice!')
})

instance.get('/', (request, reply) => {
  reply.from()
})

t.teardown(target.close.bind(target))

target.listen(0, (err) => {
  t.error(err)

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.listen(0, (err) => {
    t.error(err)

    get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
      t.error(err)
      t.equal(res.headers['content-type'], 'text/plain')
      t.equal(res.statusCode, 205)
      t.equal(data.toString(), 'Hello World Twice!')
    })
  })
})
