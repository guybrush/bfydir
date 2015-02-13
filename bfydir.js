module.exports = bfydir
bfydir.inlineStream = inlineStream

var url = require('url')
var path = require('path')
var fs = require('fs')
var http = require('http')
var EE = require('events').EventEmitter
var util = require('util')
var auth = require('basic-auth')

var browserify = require('browserify')
var watchify = require('watchify')
var mkdirp = require('mkdirp')
var through = require('through')
var finalhandler = require('finalhandler')
var serveStatic = require('serve-static')
var serveIndex = require('serve-index')
var compression = require('compression')
var bundleCollapser = require('bundle-collapser')
var uglifyjs = require('uglify-js')

function bfydir(opts) {
  if (!(this instanceof bfydir)) return new bfydir(opts)
  EE.call(this)
  opts = opts || {}
  var self = this
  self.bundleWatchers = {}
  self.dirPath = path.resolve(process.cwd(), opts.dir)
  self.bundlesPath = opts.bundles
                     || path.join(self.dirPath, '.bfydir-bundles')
  mkdirp.sync(self.bundlesPath)
  var url_ = opts.url || '/'
  self.bundling = {}
  self.minifying = {}
  self.minified = {}
  self.error = {}

  self.serveBundlesIndex  = serveIndex (self.bundlesPath)
  self.serveBundlesStatic = serveStatic(self.bundlesPath)
  self.serveDirIndex  = serveIndex (self.dirPath)
  self.serveDirStatic = serveStatic(self.dirPath,{index:false})
  self.compression = compression()

  if (opts.auth) {
    self.auth = {}
    var users = opts.auth.split(',')
    users.forEach(function(str){
      var s = str.split(':')
      if (s.length<2) throw new Error('invalid option: auth')
      self.auth[s[0]] = s[1]
    })
  }
  
  return this
}
util.inherits(bfydir, EE)

bfydir.prototype.createServer = function() {
  return http.createServer(this.requestHandler())
}

bfydir.prototype.requestHandler = function() {
  return this.handleRequest.bind(this)
}

bfydir.prototype.serveDir = function(req,res){
  var self = this
  var done = finalhandler(req,res)
  self.serveDirStatic(req,res,function(err){
    if (err) return done(err)
    self.serveDirIndex(req,res,done)
  })
}

bfydir.prototype.serveBundles = function(req,res){
  var self = this
  var done = finalhandler(req,res)
  self.compression(req,res,function(err){
    if (err) return done(err)
    self.serveBundlesStatic(req,res,function(err){
      if (err) return done(err)
      self.serveBundlesIndex(req,res,done)
    })
  })
}

bfydir.prototype.handleRequest = function(req, res, next){
  if (this.auth) {
    var cred = auth(req)
    if (!cred || !this.auth[cred.name] || cred.pass !== this.auth[cred.name]) {
      res.writeHead(401, {'WWW-Authenticate': 'Basic realm="hello"'})
      return res.end()
    }
  }
  
  var self = this
  var opts = {}
  var parsedUrl = url.parse(req.url, true)
  var doMin, doBundle, doInline, doTransform
  if (parsedUrl.query) {
    doMin = parsedUrl.query.min !== undefined
      ? true
      : parsedUrl.query.m !== undefined
        ? true : false
    doBundle = parsedUrl.query.bundle !== undefined
      ? true
      : parsedUrl.query.b !== undefined
        ? true : false
    doInline = parsedUrl.query.inline !== undefined
      ? true
      : parsedUrl.query.i !== undefined
        ? true : false
    doTransform = parsedUrl.query.transform !== undefined
      ? parsedUrl.query.transform.split(',')
      : parsedUrl.query.t !== undefined
        ? parsedUrl.query.t.split(',')
        : false
  }

  var entryPath = path.resolve(path.join(self.dirPath, parsedUrl.pathname))
  var bundleName = entryPath.replace(/\//g,'_')+'.bfydir-bundle.js'
  var bundleNameMin = entryPath.replace(/\//g,'_')+'.bfydir-bundle.min.js'

  // var isJs = /\.js$/i.test(parsedUrl.pathname)
  // if (isJs) doBundle = true
  opts.urlPath = parsedUrl.pathname
  opts.entryPath = entryPath
  opts.bundlePath = path.join(self.bundlesPath, bundleName)
  opts.bundlePathMin = path.join(self.bundlesPath, bundleNameMin)
  opts.bundleOpts = {}
  opts.bundleOpts.debug = !doMin
  opts.bundleOpts.cache = {}
  opts.bundleOpts.packageCache = {}
  opts.bundleOpts.fullPaths = false

  opts.transform = doTransform

  if (!doBundle && !doInline && !doMin) {
    // if (!next) return self.dirMount(req, res)
    if (!next) return self.serveDir(req, res)
    return next()
  }

  if (self.bundleWatchers[opts.urlPath]) {
    var up = opts.urlPath
    var bp = opts.bundlePath
    var ing = doMin ? self.minifying[up] : self.bundling[up]
    if (self.error[up])
      return res.end(self.error[up].toString())
    if (doMin && !ing && !self.minified[up]) {
      if (self.bundling[up])
        return self.once('bundled:'+up, function(err){
          if (self.error[up]) return res.end(self.error[up].stack)
          var s = fs.createReadStream(bp).pipe(self.minifyStream(opts))
          if (doInline) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            return s.pipe(inlineStream(bp)).pipe(res)
          }
          res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
          return s.pipe(res)
        })
      var s = fs.createReadStream(bp).pipe(self.minifyStream(opts))
      if (doInline) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        return s.pipe(inlineStream(bp)).pipe(res)
      }
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
      return s.pipe(res)
    }

    if (ing) {
      var ev = doMin ? 'minified:'+up : 'bundled:'+up
      return self.once(ev, serve)
    }
    return serve()
  }

  function serve() {
    var p = doMin ? opts.bundlePathMin : opts.bundlePath
    if (doInline) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return inlineStream(p).pipe(res)
    }
    var split = p.split('/')
    req.url = '/'+split[split.length-1]
    self.serveBundles(req,res)
  }

  fs.exists(entryPath, function(e){
    if (!e) {
      if (!next) return self.serveDir(req, res)
      return next()
    }
    var b = self.bundleStream(opts)
    var _b = doMin ? b.pipe(self.minifyStream(opts)) : b
    self.once('bundled:'+opts.urlPath,function(d){
      if (d.error) res.end(d.error.toString())
    })
    if (doInline) return _b.pipe(inlineStream()).pipe(res)
    _b.pipe(res)
  })
}

bfydir.prototype.bundleStream = function(opts) {
  var self = this
  var B = browserify(opts.entryPath,opts.bundleOpts)
  var bw = self.bundleWatchers[opts.urlPath] = watchify(B)

  var info = { urlPath: opts.urlPath
             , entryPath: opts.entryPath
             , bundlePath: opts.bundlePath
             , bundleOpts: opts.bundleOpts }

  self.emit('bundling', info)
  self.emit('bundling:'+opts.urlPath, info)

  self.error[opts.urlPath] = false
  bw.on('update', bundle)
  var t = through(write, end)
  var first = false
  var len = 0

  bundle().pipe(t)

  bw.on('log',function(x){
    self.emit('bundled', x)
    self.emit('bundled:'+opts.urlPath, x)
  })

  return t

  function bundle() {
    self.bundling[opts.urlPath] = B
    delete self.error[opts.urlPath]
    delete self.minified[opts.urlPath]
    if (opts.transform)
      opts.transform.forEach(function(t){bw.transform(t)})

    var b = bw.bundle()
    var f = fs.createWriteStream(opts.bundlePath)
    b.pipe(f)
    b.on('error',onError)
    f.on('finish',onFinish)
    function onFinish(){
      self.bundling[opts.urlPath] = null
      info.bundleSize = len
      self.emit('bundled', info)
      self.emit('bundled:'+opts.urlPath, info)
    }
    return b
  }

  function write(c) {
    len += c.length
    this.queue(c)
  }

  function end() {
    this.queue(null)

  }

  function onError(e) {
    delete self.bundling[opts.urlPath]
    delete self.minified[opts.urlPath]
    self.error[opts.urlPath] = e
    info.error = e
    self.emit('bundled',info)
    self.emit('bundled:'+opts.urlPath,info)
  }
}

bfydir.prototype.minifyStream = function(opts) {
  var self = this
  var info = { urlPath: opts.urlPath
             , entryPath: opts.entryPath
             , bundlePathMin: opts.bundlePathMin }

  var t = through(write, end)
  var buff = ''
  
  self.minifying[opts.urlPath] = t
  self.emit('minifying', info)
  self.emit('minifying:'+opts.urlPath, info)
  return t
  function write(c) {buff += c}
  function end() {
    var t1 = this
    var len1 = buff.length
    var buff2 = ''
    var f = fs.createWriteStream(opts.bundlePathMin)
    var len2 = 0
    var result
    var t2 = through(write2,end2)
    var bc = bundleCollapser(buff)

    bc.pipe(t2).pipe(f)

    f.on('finish',onFinish)
    function onFinish(){
      self.minifying[opts.urlPath] = false
      self.minified[opts.urlPath] = true
      info.bundleSize = len1
      info.bundleSizeCollapsed = len2
      info.bundleSizeMin = result.code.length
      self.emit('minified', info)
      self.emit('minified:'+opts.urlPath, info)
    }

    function write2(d) {buff2+=d}
    function end2() {
      len2 = buff2.length
      result = uglifyjs.minify
        (buff2,{fromString:true
               ,output:{ascii_only:true}
               })
      this.queue(result.code)
      this.queue(null)
      t1.queue(result.code)
      t1.queue(null)
    }
  }
}

bfydir.prototype.close = function() {
  var self = this
  Object.keys(this.bundleWatchers).forEach(function(urlPath){
    self.bundleWatchers[urlPath].close()
    delete self.bundleWatchers[urlPath]
  })
}

function inlineStream(bundlePath) {
  var s = bundlePath ? fs.createReadStream(bundlePath) : null
  var head = true
  var reScript = /<\/script>/g
  var t = through(write,end)
  if (s) s.pipe(t)
  return t

  function write(d){
    if (head) {
      this.queue('<html><head>'
        +'<meta content="width=device-width, initial-scale=1.0, '
        +'maximum-scale=1.0, user-scalable=0" name="viewport" />'
        +'<meta charset="utf-8"></head><body><script>')
      head = false
    }
    // if (d.toString().match(reScript)) console.log(d.toString())
    var str = d.toString().replace(reScript,'')
    this.queue(str)
    //this.queue((d+'').replace(reScript,''))
  }
  function end(){
    this.queue('</script></body></html>')
    this.queue(null)
  }
}

