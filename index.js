module.exports = bfydir

var watchify = require('watchify')
var http = require('http')
var url = require('url')
var path = require('path')
var fs = require('fs')
var st = require('st')
var qs = require('qs')

function bfydir(opts) {
  opts = opts || {}
  opts.path = opts.path || process.cwd()
  var mount = st({path:opts.path,url:'/'})
  var server = http.createServer(handleRequest)
  return server
  
  function handleRequest(req, res) {
    var parsedUrl = url.parse(req.url)
    var filePath = path.resolve(path.join(opts.path,parsedUrl.pathname))
    var isJs = /\.js$/i.test(filePath)
    fs.exists(filePath, function(e){
      if (!e || !isJs) return mount(req, res)
      var stat = fs.lstatSync(filePath)
      if (stat.isDirectory()) return mount(req, res)
      handleBrowserify(req, res, filePath, parsedUrl)
    })
  }
  
  function handleBrowserify(req, res, filePath, parsedUrl) {
    console.log(qs.parse(parsedUrl.query))
    watchify(filePath).bundle().pipe(res)
  }
}
