'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()

t.test('fix for GHSA-2q7r-29rg-6m5h vulnerability', async (t) => {
  t.plan(2)

  const target = http.createServer((_, res) => {
    res.statusCode = 205
    res.end('hi')
  })
  await target.listen({ port: 0 })
  t.after(() => target.close())

  instance.get('/', (_request, reply) => { reply.from('/ho/%2E%2E/hi') })
  instance.register(From, {
    base: `http://localhost:${target.address().port}/hi/`,
    undici: true
  })
  await instance.listen({ port: 0 })
  t.after(() => instance.close())

  const { statusCode, body } = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.strictEqual(statusCode, 400)
  t.assert.strictEqual(await body.text(), '{"statusCode":400,"error":"Bad Request","message":"source/request contain invalid characters"}')
})
