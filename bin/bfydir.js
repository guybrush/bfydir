#!/usr/bin/env node

var path = require('path')
var opti = require('optimist')
var http = require('http')
var https = require('https')
var fs = require('fs')
var Bfydir  = require('../')
var pkg = require('../package.json')

var dir = opti.argv._[0]
          ? path.resolve(process.cwd(), opti.argv._[0])
          : process.cwd()
var bundles = opti.argv.b || opti.argv.bundles || false
var port    = opti.argv.p || opti.argv.port    || 8001
var debug   = opti.argv.d || opti.argv.debug   || false
var auth    = opti.argv.a || opti.argv.auth    || false
var help    = opti.argv.h || opti.argv.help    || false
var key     = opti.argv.key  || false
var cert    = opti.argv.cert || false
var pfx     = opti.argv.pfx  || false

if (help) {
  console.log('this is '+pkg.name+'@'+pkg.version+'\n')
  fs.createReadStream(path.join(__dirname,'usage.txt')).pipe(process.stdout)
}
else {
  var bfydir  = Bfydir({dir:dir,auth:auth})

  if (!opti.argv.key && !opti.argv.pfx)
    http.createServer(bfydir.requestHandler()).listen(port)
  else {
    var opts = {}
    opts.key = fs.readFileSync(key)
    opts.cert = fs.readFileSync(cert)
    opts.pfx = fs.readFileSync(cert)
    https.createServer(opts, bfydir.requestHandler()).listen(port)
  }

  if (debug) {
    bfydir.on('bundling'  , function(d){ console.log({bundling  : d}) })
    bfydir.on('bundled'   , function(d){ console.log({bundled   : d}) })
    bfydir.on('minifying' , function(d){ console.log({minifying : d}) })
    bfydir.on('minified'  , function(d){ console.log({minified  : d}) })
  }

  console.log( { module: pkg.name+'@'+pkg.version
               , port: port
               , debug: debug
               , https: opti.argv.https ? true : false
               , key: key, cert: cert, pfx: pfx
               , auth: bfydir.auth
               , dirPath: bfydir.dirPath
               , bundlesPath: bfydir.bundlesPath
               } )
}

