'use strict'

const t = require('tap')
const Fastify = require('fastify')
const undici = require('undici')
const http = require('http')
const get = require('simple-get').concat
const From = require('..')

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  t.equal(req.url, '/')
  t.equal(req.headers.connection, 'keep-alive')
  res.statusCode = 205
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('x-my-header', 'hello!')
  res.end('hello world')
})

t.test('use a custom instance of \'undici\'', async t => {
  t.teardown(target.close.bind(target))

  await new Promise((resolve, reject) => target.listen(0, err => err ? reject(err) : resolve()))

  t.test('custom Pool', t => {
    const instance = Fastify()
    t.teardown(instance.close.bind(instance))
    instance.register(From, {
      base: `http://localhost:${target.address().port}`,
      undici: new undici.Pool(`http://localhost:${target.address().port}`)
    })

    instance.get('/', (request, reply) => {
      reply.from()
    })

    instance.listen(0, (err) => {
      t.error(err)

      get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
        t.error(err)
        t.equal(res.headers['content-type'], 'text/plain')
        t.equal(res.headers['x-my-header'], 'hello!')
        t.equal(res.statusCode, 205)
        t.equal(data.toString(), 'hello world')
        t.end()
      })
    })
  })

  t.test('custom Client', t => {
    const instance = Fastify()
    t.teardown(instance.close.bind(instance))
    instance.register(From, {
      base: `http://localhost:${target.address().port}`,
      undici: new undici.Client(`http://localhost:${target.address().port}`)
    })

    instance.get('/', (request, reply) => {
      reply.from()
    })

    instance.listen(0, (err) => {
      t.error(err)

      get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
        t.error(err)
        t.equal(res.headers['content-type'], 'text/plain')
        t.equal(res.headers['x-my-header'], 'hello!')
        t.equal(res.statusCode, 205)
        t.equal(data.toString(), 'hello world')
        t.end()
      })
    })
  })
})
