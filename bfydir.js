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
  var url_ = opts.url || 'bfydir/'
  self.dirMount = st({path:self.dirPath, url:url_, dot:true, cache:false})
  self.bundlesMount = st({path:self.bundlesPath, dot:true, cache:false})

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
  var parsedOriginalUrl = url.parse(req.originalUrl,true)
  var filePath = path.resolve(path.join(self.dirPath, parsedUrl.pathname))
  var isJs = /\.js$/i.test(filePath)
  if (parsedUrl.query.entry !== undefined) {
    if (parsedUrl.query.entry == '' && !isJs) {
      if (!next) return self.dirMount(req, res)
      return next()
    }
    var fakePath = url.resolve( parsedOriginalUrl.pathname
                              , parsedUrl.query.entry )
    return res.end(fakeIndex(fakePath))
  }
  if (!isJs) {
    if (!next) return self.dirMount(req, res)
    return next()
  }
  var bundleName = filePath.replace(/\//g,'_')+'.bfydir-bundle.js'
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
      self.bundle(bw, bundlePath, parsedUrl)
    })
    var b = self.bundle(bw, bundlePath, parsedUrl)
    b.pipe(res)
  })
}

bfydir.prototype.bundle = function(bundleWatcher, bundlePath, parsedUrl) {
  console.log('bundling '+parsedUrl.pathname)
  var start = Date.now()
  var self = this
  var dotPath = path.join
    ( path.dirname(bundlePath)
    , '.'+path.basename(bundlePath) )
  var writeDotPath = fs.createWriteStream(dotPath)
  
  var b = bundleWatcher.bundle( { debug: true } )

  b.on('error', function (err) { 
    console.error(String(err)) 
  })
  b.pipe(writeDotPath)
  var bytes = 0
  b.pipe(through(write, end))
  function write(buf) { bytes += buf.length }
  function end() {
    fs.rename(dotPath, bundlePath, function(err){
      if (err) return console.error(err)
      console.log('bundled '+parsedUrl.pathname
                 +' ('+bytes+' bytes written to '+bundlePath
                 +' in '+(Date.now()-start)+'ms)')
    })
  }
  return b
}

