#!/usr/bin/env node

var pkg = require('../package.json')
var path = require('path')
var opti = require('optimist')
var http = require('http')
console.log(opti.argv._[0])
var dir = opti.argv._[0]
          ? path.resolve(process.cwd(), opti.argv._[0])
          : false
var bundles = opti.argv.b ? opti.argv.b : false
var port = opti.argv.p ? opti.argv.p : 8004
var bfydir = require('../')({dir:dir})
bfydir.listen(port,function(){
  console.log(pkg.name+'@'+pkg.version)
  console.log( { port: port
               , dirPath: bfydir.dirPath
               , bundlesPath: bfydir.bundlesPath
               , usage: 'bfydir [path/to/dir] [-p 8004] [-b path/to/bundles/dir]'
               } )
})
// require('http').createServer(bfydir.handleRequest.bind(bfydir)).listen(port)
