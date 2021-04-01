'use strict'

const t = require('tap')
const Fastify = require('fastify')
const proxyquire = require('proxyquire')

t.plan(1)

class Agent {
  constructor (opts) {
    t.strictSame(opts, {
      connections: 42,
      pipelining: 24,
      keepAliveTimeout: 4242,
      tls: {
        rejectUnauthorized: false
      }
    })
  }
}

// original setup in the undici module
// needed to test a bug
function undici () {}
undici.Agent = Agent

const buildRequest = proxyquire('../lib/request.js', {
  undici
})

const From = proxyquire('..', {
  './lib/request.js': buildRequest
})

const instance = Fastify()

instance.register(From, {
  base: 'http://path/to/somewhere',
  undici: {
    connections: 42,
    pipelining: 24,
    keepAliveTimeout: 4242
  }
})

instance.ready()
