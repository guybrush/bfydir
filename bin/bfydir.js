#!/usr/bin/env node

var pkg = require('../package.json')
var path = require('path')
var opti = require('optimist')
var http = require('http')
var dirPath = opti.argv._[0]
              ? path.resolve(process.cwd(), opti.argv._[0])
              : false
var bundlesPath = opti.argv.b ? opti.argv.b : false
var port = opti.argv.p ? opti.argv.p : 8004
var bfydir = require('../')({dirPath:dirPath})
bfydir.listen(port,function(){
  console.log(pkg.name+'@'+pkg.version)
  console.log( { port: port
               , dirPath: bfydir.dirPath
               , bundlesPath: bfydir.bundlesPath 
               , usage: 'bfydir [path/to/dir] [-p 8004] [-b path/to/bundles/dir]'
               } )
})
// require('http').createServer(bfydir.handleRequest.bind(bfydir)).listen(port)
