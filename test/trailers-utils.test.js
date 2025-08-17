'use strict'

const { test } = require('tap')
const {
  filterForbiddenTrailers,
  copyTrailers,
  clientSupportsTrailers
} = require('../lib/utils')

test('filterForbiddenTrailers', t => {
  t.plan(4)

  t.test('should filter forbidden trailer fields', t => {
    const trailers = {
      'x-custom': 'value',
      'content-length': '100',
      'transfer-encoding': 'chunked',
      authorization: 'Bearer token',
      'x-timing': '500ms',
      trailer: 'x-custom'
    }

    const filtered = filterForbiddenTrailers(trailers)

    t.equal(filtered['x-custom'], 'value')
    t.equal(filtered['x-timing'], '500ms')
    t.notOk(filtered['content-length'])
    t.notOk(filtered['transfer-encoding'])
    t.notOk(filtered.authorization)
    t.notOk(filtered.trailer)
    t.end()
  })

  t.test('should filter HTTP/2 pseudo-headers', t => {
    const trailers = {
      'x-custom': 'value',
      ':status': '200',
      ':method': 'GET'
    }

    const filtered = filterForbiddenTrailers(trailers)

    t.equal(filtered['x-custom'], 'value')
    t.notOk(filtered[':status'])
    t.notOk(filtered[':method'])
    t.end()
  })

  t.test('should handle empty trailers', t => {
    const filtered = filterForbiddenTrailers({})
    t.same(filtered, {})
    t.end()
  })

  t.test('should preserve case of allowed headers', t => {
    const trailers = {
      'X-Custom-Header': 'value',
      'x-timing': '500ms'
    }

    const filtered = filterForbiddenTrailers(trailers)

    t.equal(filtered['X-Custom-Header'], 'value')
    t.equal(filtered['x-timing'], '500ms')
    t.end()
  })
})

test('clientSupportsTrailers', t => {
  t.plan(4)

  t.test('should return true when TE header includes trailers', t => {
    const request = {
      headers: { te: 'trailers' }
    }

    t.ok(clientSupportsTrailers(request))
    t.end()
  })

  t.test('should return true when TE header includes trailers with other values', t => {
    const request = {
      headers: { te: 'gzip, trailers' }
    }

    t.ok(clientSupportsTrailers(request))
    t.end()
  })

  t.test('should return false when TE header does not include trailers', t => {
    const request = {
      headers: { te: 'gzip, deflate' }
    }

    t.notOk(clientSupportsTrailers(request))
    t.end()
  })

  t.test('should return false when TE header is missing', t => {
    const request = {
      headers: {}
    }

    t.notOk(clientSupportsTrailers(request))
    t.end()
  })
})

test('copyTrailers', t => {
  t.plan(2)

  t.test('should call reply.trailer for allowed headers', t => {
    const trailers = {
      'x-custom': 'value',
      'x-timing': '500ms',
      'content-length': '100' // Should be filtered out
    }

    const mockReply = {
      trailerCalls: [],
      trailer: function (key, fn) {
        this.trailerCalls.push({ key, fn })
      }
    }

    copyTrailers(trailers, mockReply)

    t.equal(mockReply.trailerCalls.length, 2)
    t.equal(mockReply.trailerCalls[0].key, 'x-custom')
    t.equal(mockReply.trailerCalls[1].key, 'x-timing')

    // Test that the functions return the correct values
    t.resolves(mockReply.trailerCalls[0].fn(), 'value')
    t.resolves(mockReply.trailerCalls[1].fn(), '500ms')

    t.end()
  })

  t.test('should handle empty trailers', t => {
    const mockReply = {
      trailerCalls: [],
      trailer: function (key, fn) {
        this.trailerCalls.push({ key, fn })
      }
    }

    copyTrailers({}, mockReply)

    t.equal(mockReply.trailerCalls.length, 0)
    t.end()
  })
})
