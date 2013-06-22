var assert = require('assert')
var fs = require('fs')
var path = require('path')
var vm = require('vm')
var request = require('request')
var destroyer = require('destroyer')
var bfydir = require('../.')({dir:__dirname})
var port = 40000+~~(Math.random()*10000)

var srcEntry = 'done(require("./moduleA"),require("./moduleB"));'
var srcModuleA = 'module.exports = 1;'
var srcModuleB = 'module.exports = 2;'

var pathEntry = path.join(__dirname,'entry.js')
var pathModuleA = path.join(__dirname,'moduleA.js')
var pathModuleB = path.join(__dirname,'moduleB.js')

fs.writeFileSync(pathEntry,srcEntry)
fs.writeFileSync(pathModuleA,srcModuleA)
fs.writeFileSync(pathModuleB,srcModuleB)

var bfyserver = bfydir.listen(port,function(){
  var uri = 'http://localhost:'+port+'/entry.js'
  request(uri, function(err,res,body){
    var c = { done: function(a, b){
      assert.equal(a,1)
      assert.equal(b,2)
      fs.writeFile(pathModuleA,'module.exports = 3;',function(err){
        if (err) throw err
        setTimeout(function(){
          request(uri, function(err,res,body){
            var c2 = { done: function(a, b){
              assert.equal(a,3)
              exit()
            } }
            vm.runInNewContext(body, c2)
          })
        },500)
      })
    } }
    vm.runInNewContext(body, c)
  })
})

function exit(err) {
  console.log('all done')
  if (err) throw new Error(err)
  process.exit()
}

