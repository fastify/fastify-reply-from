'use strict'

const semver = require('semver')
const tap = require('tap')

if (semver.gt(process.versions.node, '9.0.0')) {
  require('./http2-http2')
  require('./full-post-http2')
  require('./http-http2')
} else {
  tap.pass('Skip because Node version < 9.0.0')
  tap.end()
}
