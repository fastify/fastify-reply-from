'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const Transform = require('node:stream').Transform

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

instance.get('/', (_request, reply) => {
  reply.from(`http://localhost:${target.address().port}`, {
    onResponse: (_request, reply, res) => {
      reply.send(
        res.stream.pipe(
          new Transform({
            transform: function (chunk, _enc, cb) {
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

instance.listen({ port: 0 }, err => {
  t.error(err)

  target.listen({ port: 0 }, async err => {
    t.error(err)

    const result = await fetch(`http://localhost:${instance.server.address().port}`)

    t.equal(result.headers.get('content-type'), 'text/plain')
    t.equal(result.headers.get('x-my-header'), 'hello!')
    t.equal(result.status, 205)
    t.equal(await result.text(), 'HELLO WORLD')
  })
})
