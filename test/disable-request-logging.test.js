'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const split = require('split2')

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
  t.plan(3)
  t.teardown(target.close.bind(target))

  await new Promise((resolve, reject) => target.listen({ port: 0 }, err => err ? reject(err) : resolve()))

  t.test('disableRequestLogging is set to true', t => {
    const logStream = split(JSON.parse)
    const instance = Fastify({
      logger: {
        level: 'info',
        stream: logStream
      }
    })
    t.teardown(instance.close.bind(instance))
    instance.register(From, {
      base: `http://localhost:${target.address().port}`,
      disableRequestLogging: true
    })

    instance.get('/', (_request, reply) => {
      reply.from()
    })

    logStream.on('data', (log) => {
      if (
        log.level === 30 &&
        (
          !log.msg.match('response received') ||
          !log.msg.match('fetching from remote server')
        )
      ) {
        t.pass('request log message does not logged')
      }
    })

    instance.listen({ port: 0 }, async (err) => {
      t.error(err)

      const result = await fetch(`http://localhost:${instance.server.address().port}`)
      t.equal(result.headers.get('content-type'), 'text/plain')
      t.equal(result.headers.get('x-my-header'), 'hello!')
      t.equal(result.status, 205)
      t.equal(await result.text(), 'hello world')
      t.end()
    })
  })

  t.test('disableRequestLogging is set to false', t => {
    const logStream = split(JSON.parse)
    const instance = Fastify({
      logger: {
        level: 'info',
        stream: logStream
      }
    })
    t.teardown(instance.close.bind(instance))
    instance.register(From, {
      base: `http://localhost:${target.address().port}`,
      disableRequestLogging: false
    })

    instance.get('/', (_request, reply) => {
      reply.from()
    })

    logStream.on('data', (log) => {
      if (
        log.level === 30 &&
        (
          log.msg.match('response received') ||
          log.msg.match('fetching from remote server')
        )
      ) {
        t.pass('request log message does not logged')
      }
    })

    instance.listen({ port: 0 }, async (err) => {
      t.error(err)

      const result = await fetch(`http://localhost:${instance.server.address().port}`)
      t.equal(result.headers.get('content-type'), 'text/plain')
      t.equal(result.headers.get('x-my-header'), 'hello!')
      t.equal(result.status, 205)
      t.equal(await result.text(), 'hello world')
      t.end()
    })
  })

  t.test('disableRequestLogging is not defined', t => {
    const logStream = split(JSON.parse)
    const instance = Fastify({
      logger: {
        level: 'info',
        stream: logStream
      }
    })
    t.teardown(instance.close.bind(instance))
    instance.register(From, {
      base: `http://localhost:${target.address().port}`
    })

    instance.get('/', (_request, reply) => {
      reply.from()
    })

    logStream.on('data', (log) => {
      if (
        log.level === 30 &&
        (
          log.msg.match('response received') ||
          log.msg.match('fetching from remote server')
        )
      ) {
        t.pass('request log message does not logged')
      }
    })

    instance.listen({ port: 0 }, async (err) => {
      t.error(err)

      const result = await fetch(`http://localhost:${instance.server.address().port}`)
      t.equal(result.headers.get('content-type'), 'text/plain')
      t.equal(result.headers.get('x-my-header'), 'hello!')
      t.equal(result.status, 205)
      t.equal(await result.text(), 'hello world')
      t.end()
    })
  })
})
