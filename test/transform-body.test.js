'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')
const Transform = require('node:stream').Transform

const instance = Fastify()
instance.register(From)

t.test('transform body', async (t) => {
  t.plan(6)
  t.after(() => instance.close())

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
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

  t.after(() => target.close())

  await new Promise((resolve) => instance.listen({ port: 0 }, resolve))

  await new Promise((resolve) => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.assert.strictEqual(result.headers['content-type'], 'text/plain')
  t.assert.strictEqual(result.headers['x-my-header'], 'hello!')
  t.assert.strictEqual(result.statusCode, 205)
  t.assert.strictEqual(await result.body.text(), 'HELLO WORLD')
})
