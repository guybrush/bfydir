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
  self.minifying = {}
  self.minified = {}
  return this
}
util.inherits(bfydir, EE)

bfydir.prototype.listen = function() {
  this.server = http.createServer(this.handleRequest.bind(this))
  this.server.listen.apply(this.server, arguments)
  return this.server
}

bfydir.prototype.handleRequest = function(req, res, next){
  var self = this
  var opts = {}
  var parsedUrl = url.parse(req.url, true)
  var min = parsedUrl.query.min !== undefined ? true : false
  var entry = parsedUrl.query.entry
  var entryPath = path.resolve(path.join(self.dirPath, parsedUrl.pathname))
  var isJs = /\.js$/i.test(entryPath) && parsedUrl.query.raw === undefined
  var bundleName = entryPath.replace(/\//g,'_')+'.bfydir-bundle.js'
  var bundleNameMin = entryPath.replace(/\//g,'_')+'.bfydir-bundle.min.js'

  opts.debug = !min
  opts.pathname = parsedUrl.pathname
  opts.entryPath = entryPath
  opts.bundlePath = path.join(self.bundlesPath, bundleName)
  opts.bundlePathMin = path.join(self.bundlesPath, bundleNameMin)

  if (!isJs) {
    if (!next) return self.dirMount(req, res)
    return next()
  }

  var e = entry !== undefined

  if (self.bundleWatchers[opts.pathname]) {
    var n = opts.pathname
    var bp = opts.bundlePath
    var ing = min ? this.minifying[n] : this.bundling[n]
    if (min && !ing && !this.minified[n]) {
      if (this.bundling[n])
        return self.once('bundled:'+n, function(){
          fs.createReadStream(bp).pipe(this.minifyStream(opts)).pipe(res)
        })
      var s = fs.createReadStream(bp).pipe(this.minifyStream(opts))
      if (e) return s.pipe(inlineEntryStream()).pipe(res)
      return s.pipe(res)
    }

    if (ing) {
      var ev = min ? 'minified:'+n : 'bundled:'+n
      return self.once(ev, function(){serve()})
    }
    return serve()
  }

  function serve() {
    var p = min ? opts.bundlePathMin : opts.bundlePath
    var split = p.split('/')
    req.url = '/'+split[split.length-1]
    if (e) return inlineEntryStream(p).pipe(res)
    self.bundlesMount(req, res, next)
  }

  fs.exists(entryPath, function(e){
    if (!e) {
      if (!next) return self.dirMount(req, res)
      return next()
    }
    var bw = self.bundleWatchers[opts.pathname] = watchify(entryPath)
    var b = self.bundleStream(opts)
    var _b = min ? b.pipe(self.minifyStream(opts)) : b
    bw.on('update', function(){ _b = self.bundleStream(opts) })
    if (entry !== undefined)
      return _b.pipe(inlineEntryStream()).pipe(res)
    _b.pipe(res)
  })
}

bfydir.prototype.bundleStream = function(opts) {
  var self = this
  var info = { pathname: opts.pathname, entry: opts.entryPath, bundle: opts.bundlePath }
  self.minified[opts.pathname] = false
  self.emit('bundling', info)
  self.emit('bundling:'+opts.pathname, info)
  var bw = self.bundleWatchers[opts.pathname]
  var b = self.bundling[opts.pathname] = bw.bundle({debug:opts.debug})
  var f = fs.createWriteStream(opts.bundlePath)
  var t = through(write, end)
  var first = false
  var len = 0
  b.on('error', onError)
  b.pipe(f)
  b.pipe(t)
  return t
  function onError(e) {
    self.bundling[opts.pathname] = null
    var err = {message:String(e),entry:opts.entryPath,bundle:opts.bundlePath}
    console.error({error:err})
    b.destroy()
  }
  function write(c) {
    len += c.length
    this.queue(c)
  }
  function end() {
    this.queue(null)
    self.bundling[opts.pathname] = null
    info.size = kB(len)
    self.emit('bundled', info)
    self.emit('bundled:'+opts.pathname, info)
  }
}

bfydir.prototype.minifyStream = function(opts) {
  var self = this
  var f = fs.createWriteStream(opts.bundlePathMin)
  var info = { pathname: opts.pathname, entry: opts.entryPath, bundleMin: opts.bundlePathMin }
  var t = through(write, end)
  var buff = ''
  t.pipe(f)
  self.minifying[opts.pathname] = t
  self.emit('minifying', info)
  self.emit('minifying:'+opts.pathname, info)
  return t
  function write(c) {buff += c}
  function end() {
    var ast = esp.parse(buff)
    var res = esm.mangle(ast)
    code = esc.generate(res, {format:{compact:true}})
    this.queue(code)
    this.queue(null)
    self.minifying[opts.pathname] = false
    self.minified[opts.pathname] = true
    info.size = kB(code.length)
    self.emit('minified', info)
    self.emit('minified:'+opts.pathname, info)
  }
}

function inlineEntryStream(bundlePath) {
  var s = bundlePath ? fs.createReadStream(bundlePath) : null
  var head = true
  var t = through(write,end)
  if (s) s.pipe(t)
  return t

  function write(d){
    if (head) {
      this.queue('<html><head>'
        +'<meta content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0" name="viewport" />'
        +'<meta charset=utf-8></head><body><script>')
      head = false
    }
    this.queue(d)
  }
  function end(){
    this.queue('</script></body></html>')
    this.queue(null)
  }
}

function kB(l) {return (l/1000).toFixed(2)+'kB'}

