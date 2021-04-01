'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat
const Transform = require('stream').Transform

const instance = Fastify()
instance.register(From)

t.plan(9)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.statusCode = 205
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('x-my-header', 'hello!')
  res.end('hello world')
})

instance.get('/', (request, reply) => {
  reply.from(`http://localhost:${target.address().port}`, {
    onResponse: (request, reply, res) => {
      reply.send(
        res.pipe(
          new Transform({
            transform: function (chunk, enc, cb) {
              this.push(chunk.toString().toUpperCase())
              cb()
            }
          })
        )
      )
    }
  })
})

t.teardown(target.close.bind(target))

instance.listen(0, err => {
  t.error(err)

  target.listen(0, err => {
    t.error(err)

    get(
      `http://localhost:${instance.server.address().port}`,
      (err, res, data) => {
        t.error(err)
        t.equal(res.headers['content-type'], 'text/plain')
        t.equal(res.headers['x-my-header'], 'hello!')
        t.equal(res.statusCode, 205)
        t.equal(data.toString(), 'HELLO WORLD')
      }
    )
  })
})
