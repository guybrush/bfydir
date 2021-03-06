var assert = require('assert')
var fs = require('fs')
var path = require('path')
var vm = require('vm')
var request = require('request')
var bfydir = require('../.')({dir:__dirname})
var port = 40000+~~(Math.random()*10000)

var srcEntry = 'done(require("./moduleA"),require("./moduleB"));'
var srcModuleA = 'module.exports = 1;'
var srcModuleB = 'module.exports = 2;'

var pathEntry = path.join(__dirname,'entry.js')
var pathModuleA = path.join(__dirname,'moduleA.js')
var pathModuleB = path.join(__dirname,'moduleB.js')

fs.writeFileSync(pathEntry, srcEntry)
fs.writeFileSync(pathModuleA, srcModuleA)
fs.writeFileSync(pathModuleB, srcModuleB)

var bfyserver = bfydir.createServer().listen(port,function(){
  var name = '/entry.js'
  var uri = 'http://localhost:'+port+name+'?bundle'
  bfydir.once('bundled:'+name, function(d){
    assert.equal(d.urlPath, name)
    assert.equal(d.entryPath, pathEntry)
    bfydir.once('bundled:'+name, function(){
      run(uri, function(a,b){
        assert.equal(a,3)
        assert.equal(b,2)
        exit()
      })
    })
    setTimeout(function(){
      fs.writeFile(pathModuleA,'module.exports = 3;',function(err){
        if (err) throw err
      })
    },500)
  })
  run(uri, function(a,b){
    assert.equal(a,1)
    assert.equal(b,2)
  })
})

function run(uri, fn) {
  request(uri, function(err,res,body){
    var c = { done: function(a, b){
      fn(a, b)
    } }
    vm.runInNewContext(body, c)
  })
}

function exit(err) {
  if (err) throw new Error(err)
  console.log('all done')
  bfydir.close()
  bfyserver.close()
  process.exit()
}

