'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const fs = require('node:fs')
const querystring = require('node:querystring')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('unix http undici from', { skip: process.platform === 'win32' }, async (t) => {
  t.plan(1)
  t.after(() => instance.close())

  const socketPath = `${__filename}.socket`

  try {
    fs.unlinkSync(socketPath)
  } catch (_) {
  }

  const target = http.createServer((_req, res) => {
    t.fail('no response')
    res.end()
  })

  instance.get('/', (_request, reply) => {
    reply.from(`unix+http://${querystring.escape(socketPath)}/hello`)
  })

  t.after(() => target.close())

  await instance.listen({ port: 0 })

  await new Promise(resolve => target.listen(socketPath, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.assert.strictEqual(result.statusCode, 500)
})
