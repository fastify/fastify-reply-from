'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { Pool, request, Client } = require('undici')
const http = require('node:http')
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

  await new Promise((resolve, reject) => target.listen({ port: 0 }, err => err ? reject(err) : resolve()))

  t.test('custom Pool', async t => {
    const instance = Fastify()
    t.teardown(instance.close.bind(instance))
    instance.register(From, {
      base: `http://localhost:${target.address().port}`,
      undici: new Pool(`http://localhost:${target.address().port}`)
    })

    instance.get('/', (_request, reply) => {
      reply.from()
    })

    await new Promise(resolve => instance.listen({ port: 0 }, resolve))

    const result = await request(`http://localhost:${instance.server.address().port}`)

    t.equal(result.headers['content-type'], 'text/plain')
    t.equal(result.headers['x-my-header'], 'hello!')
    t.equal(result.statusCode, 205)
    t.equal(await result.body.text(), 'hello world')
  })

  t.test('custom Client', async t => {
    const instance = Fastify()
    t.teardown(instance.close.bind(instance))
    instance.register(From, {
      base: `http://localhost:${target.address().port}`,
      undici: new Client(`http://localhost:${target.address().port}`)
    })

    instance.get('/', (_request, reply) => {
      reply.from()
    })

    await new Promise(resolve => instance.listen({ port: 0 }, resolve))

    const result = await request(`http://localhost:${instance.server.address().port}`)

    t.equal(result.headers['content-type'], 'text/plain')
    t.equal(result.headers['x-my-header'], 'hello!')
    t.equal(result.statusCode, 205)
    t.equal(await result.body.text(), 'hello world')
  })
})
