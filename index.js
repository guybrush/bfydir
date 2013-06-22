module.exports = bfydir

var url = require('url')
var path = require('path')
var fs = require('fs')
var http = require('http')

var watchify = require('watchify')
var st = require('st')
var mkdirp = require('mkdirp')
var through = require('through')

function bfydir(opts) {
  if (!(this instanceof bfydir)) return new bfydir(opts)
  opts = opts || {}
  var self = this
  self.server = null
  self.bundleWatchers = {}
  self.dirPath = path.resolve(process.cwd(), opts.dir)
  self.bundlesPath = opts.bundles
                     || path.join(self.dirPath, '.bfydir-bundles')
  mkdirp.sync(self.bundlesPath)
  self.dirMount = st({path:self.dirPath, url:'/', dot:true, cache:false})
  self.bundlesMount = st({path:self.bundlesPath, url:'/', dot:true, cache:false})
  return this
}

bfydir.prototype.listen = function() {
  this.server = http.createServer(this.handleRequest.bind(this))
  this.server.listen.apply(this.server,arguments)
  return this.server
}

function fakeIndex(path) {
  return '<html><body><script src="'+path+'"></script></body></html>'
}

bfydir.prototype.handleRequest = function(req, res, next){
  var self = this
  var parsedUrl = url.parse(req.url,true)
  if (parsedUrl.query.bfydirEntry) {
    var fakePath = url.resolve( parsedUrl.pathname
                            , parsedUrl.query.bfydirEntry )
    return res.end(fakeIndex(fakePath))
  }
  var filePath = path.resolve(path.join(self.dirPath, parsedUrl.pathname))
  var isJs = /\.js$/i.test(filePath)
  if (!isJs) {
    if (!next) return self.dirMount(req, res)
    return next()
  }
  var bundleName = filePath.replace(/\//g,'_')+'.bfy-bundle.js'
  var bundlePath = path.join(self.bundlesPath, bundleName)
  if (self.bundleWatchers[bundlePath]) {
    var split = bundlePath.split('/')
    req.url = '/'+split[split.length-1]
    return self.bundlesMount(req, res)
  }
  fs.exists(filePath,function(e){
    if (!e) {
      if (!next) return self.dirMount(req, res)
      return next()
    }
    var bw = self.bundleWatchers[bundlePath] = watchify(filePath)
    bw.on('update', function(){
      self.bundle(bw, bundlePath)
    })
    var b = self.bundle(bw, bundlePath)
    b.pipe(res)
  })
}

bfydir.prototype.bundle = function(bundleWatcher, bundlePath) {
  var dotPath = path.join( path.dirname(bundlePath)
                         , '.'+path.basename(bundlePath) )
  var b = bundleWatcher.bundle()
  b.on('error', function (err) { console.error(String(err)) })
  b.pipe(fs.createWriteStream(dotPath))
  var bytes = 0
  b.pipe(through(write, end))
  function write(buf) { bytes += buf.length }
  function end() {
    fs.rename(dotPath, bundlePath, function(err){
      if (err) return console.error(err)
      console.log(bytes+' bytes written to '+bundlePath)
    })
  }
  return b
}

