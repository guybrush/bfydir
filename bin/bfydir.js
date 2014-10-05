#!/usr/bin/env node

var pkg = require('../package.json')
var path = require('path')
var opti = require('optimist')
var http = require('http')
var https = require('https')
var fs = require('fs')
var dir = opti.argv._[0]
          ? path.resolve(process.cwd(), opti.argv._[0])
          : process.cwd()
var bundles = opti.argv.b || opti.argv.bundles || false
var port    = opti.argv.p || opti.argv.port || 8001
var debug   = opti.argv.d || opti.argv.debug || false
var bfydir  = require('../')({dir:dir})

if (debug) {
  bfydir.on('bundling'  , function(d){ console.log({bundling  : d}) })
  bfydir.on('bundled'   , function(d){ console.log({bundled   : d}) })
  bfydir.on('minifying' , function(d){ console.log({minifying : d}) })
  bfydir.on('minified'  , function(d){ console.log({minified  : d}) })
}

if (!opti.argv.https)
  http.createServer(bfydir.requestHandler()).listen(port)
else {
  var opts = {}
  opts.key = fs.readFileSync(__dirname+'/privatekey.pem').toString()
  opts.cert = fs.readFileSync(__dirname+'/certificate.pem').toString()
  https.createServer(opts, bfydir.requestHandler()).listen(port)
}

var usage =
  ['bfydir [<dir>] [-p,--port <port>] [-b,--bundles <bundles>] [-d,--debug] [--https]'
  ,''
  ,'    <dir>     .. serve files from that directory (default: pwd)'
  ,'    <port>    .. listen on that port (default: 8001)'
  ,'    <bundles> .. write bundled files into that directory (default: pwd/.bfydir-bundles)'
  ,'    debug     .. write infos about bundling/minifying to stdout'
  ,'    https     .. if set, start https-server'
  ,''
  ].join('\n')
console.log(usage)
console.log( { module: pkg.name+'@'+pkg.version
             , port: port
             , debug: debug
             , https: opti.argv.https ? true : false
             , dirPath: bfydir.dirPath
             , bundlesPath: bfydir.bundlesPath
             } )

