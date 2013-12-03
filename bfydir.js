module.exports = bfydir
bfydir.inlineEntryStream = inlineEntryStream

var url = require('url')
var path = require('path')
var fs = require('fs')
var http = require('http')
var EE = require('events').EventEmitter
var util = require('util')

var watchify = require('watchify')
var esm = require('esmangle')
var esp = require('esprima')
var esc = require('escodegen')
var st = require('st')
var mkdirp = require('mkdirp')
var through = require('through')

function bfydir(opts) {
  if (!(this instanceof bfydir)) return new bfydir(opts)
  EE.call(this)
  opts = opts || {}
  var self = this
  self.server = null
  self.bundleWatchers = {}
  self.dirPath = path.resolve(process.cwd(), opts.dir)
  self.bundlesPath = opts.bundles
                     || path.join(self.dirPath, '.bfydir-bundles')
  mkdirp.sync(self.bundlesPath)
  var url_ = opts.url || '/'
  self.dirMount = st({path:self.dirPath, url:url_, dot:true, cache:false})
  self.bundlesMount = st({path:self.bundlesPath, dot:true, cache:false})
  self.bundling = {}
  return this
}
util.inherits(bfydir,EE)

bfydir.prototype.listen = function() {
  this.server = http.createServer(this.handleRequest.bind(this))
  this.server.listen.apply(this.server,arguments)
  return this.server
}

bfydir.prototype.handleRequest = function(req, res, next){
  var self = this
  var parsedUrl = url.parse(req.url, true)
  var entry = parsedUrl.query.entry
  var min = parsedUrl.query.min !== undefined ? true : false
  var filePath = path.resolve(path.join(self.dirPath, parsedUrl.pathname))
  var isJs = /\.js$/i.test(filePath) && parsedUrl.query.raw === undefined
  var bundleName = filePath.replace(/\//g,'_')+'.bfydir-bundle.js'
  var bundleNameMin = filePath.replace(/\//g,'_')+'.bfydir-bundle.min.js'
  var bundlePath = path.join(self.bundlesPath, bundleName)
  var bundlePathMin = path.join(self.bundlesPath, bundleNameMin)

  if (!isJs) {
    if (!next) return self.dirMount(req, res)
    return next()
  }

  if (self.bundleWatchers[bundlePath]) {
    var e = entry !== undefined
    var b = this.bundling[bundlePath]
    var p = min ? bundlePathMin : bundlePath
    var split = p.split('/')
    req.url = '/'+split[split.length-1]
    if ((!b.min && b) || (min && b.min)) {
      if (e) return b.pipe(inlineEntryStream()).pipe(res)
      return self.bundlesMount(req, res, next)
    }
    if (e) return inlineEntryStream(p).pipe(res)
    return self.bundlesMount(req, res, next)
  }

  fs.exists(filePath,function(e){
    if (!e) {
      if (!next) return self.dirMount(req, res)
      return next()
    }
    var bw = self.bundleWatchers[bundlePath] = watchify(filePath)
    var opts = {debug:!min}
    var b = bundle(min)
    bw.on('update', function(){bundle(false)})
    if (entry !== undefined)
      return b.pipe(inlineEntryStream()).pipe(res)
    b.pipe(res)

    function bundle(min) {
      var infoB = {entry:filePath,path:bundlePath}
      self.emit('bundling',infoB)
      var buff = ''
      var bytes = 0
      var b = bw.bundle(opts)
      var t = self.bundling[bundlePath] = through(function(c){
        bytes += c.length
        if (!min) return this.queue(c)
        buff += c
      },function(){
        infoB.size = kilo(bytes)+'kB'
        self.emit('bundled',infoB)
        if (!min) return this.queue(null)
        var infoM = {entry:filePath, path:bundlePathMin}
        self.emit('minifying', infoM)
        var ast = esp.parse(buff)
        var res = esm.mangle(ast)
        var code = esc.generate(res, {format:{compact:true}})
        infoM.size = kilo(code.length)+'kB'
        self.emit('minified', infoM)
        this.queue(code)
        this.queue(null)
        self.bundling[bundlePath] = false
      })
      b.pipe(fs.createWriteStream(bundlePath))
      b.pipe(t)
      if (min) {
        t._min = true
        t.pipe(fs.createWriteStream(bundlePathMin))
      }
      return t
    }
  })
}

function inlineEntryStream(bundlePath) {
  var s = bundlePath ? fs.createReadStream(bundlePath) : null
  var i = 0
  var t = through(write,end)
  if (s) s.pipe(t)
  return t

  function write(d){
    if (!i++) this.queue('<html><body><script>')
    this.queue(d)
  }
  function end(){
    this.queue('</script></body></html>')
    this.queue(null)
  }
}

function kilo(l) {return (l/1000).toFixed(2)}

