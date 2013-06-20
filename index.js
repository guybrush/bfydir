module.exports = bfydir

var url = require('url')
var path = require('path')
var fs = require('fs')

var watchify = require('watchify')
var st = require('st')
var qs = require('qs')
var mkdirp = require('mkdirp')
var through = require('through')

function bfydir(opts) {
  if (!(this instanceof bfydir)) return new bfydir(opts)
  opts = opts || {}
  var self = this
  self.dirPath = path.resolve(process.cwd(), opts.dirPath) 
  self.bundlesPath = opts.bundlesPath
                     || path.join(self.dirPath, '.bfydir-bundles')
  self.bundlesMount = st({path:self.bundlesPath, url:'/', dot:true, cache:false})
  self.bundleWatchers = {}
  mkdirp.sync(self.bundlesPath)
  return this
}

bfydir.prototype.handleRequest = function(req, res, next){
  var self = this
  var parsedUrl = url.parse(req.url)
  var filePath = path.resolve(path.join(self.dirPath, parsedUrl.pathname))
  var isJs = /\.js$/i.test(filePath)
  if (!isJs) return self.bundlesMount(req, res)
  var bundleName = filePath.replace(/\//g,'_')+'.bfy-bundle.js'
  var bundlePath = path.join(self.bundlesPath, bundleName)
  if (self.bundleWatchers[bundlePath]) {
    var split = bundlePath.split('/')
    req.url = '/'+split[split.length-1]
    return self.bundlesMount(req, res)
  }
  fs.exists(filePath,function(e){
    if (!e) return self.bundlesMount(req, res)
    self.bundleWatchers[bundlePath] = watchify(filePath)
    self.bundleWatchers[bundlePath].on('update', function(){
      self.bundle(self.bundleWatchers[bundlePath], bundlePath)
    })
    var b = self.bundle(self.bundleWatchers[bundlePath], bundlePath)
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
  b.pipe(through(write,end))
  function write(buf) { bytes += buf.length }
  function end() {
    fs.rename(dotPath, bundlePath, function(err){
      if (err) return console.error(err)
      console.log(bytes+' bytes written to '+bundlePath)
    })
  }
  return b
}
