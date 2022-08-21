'use strict'

const Fastify = require('fastify')

const target = Fastify({
  logger: true
})

target.get('/', (request, reply) => {
  reply.send('hello world')
})

const proxy = Fastify({
  logger: true
})

// proxy.register(require('fastify-reply-from'), {
proxy.register(require('..'), {
  base: 'http://localhost:3001/'
})

proxy.get('/', (request, reply) => {
  reply.from('/')
})

target.listen({ port: 3001 }, (err) => {
  if (err) {
    throw err
  }

  proxy.listen({ port: 3000 }, (err) => {
    if (err) {
      throw err
    }
  })
})
