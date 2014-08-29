module.exports = bfydir
bfydir.inlineStream = inlineStream

var url = require('url')
var path = require('path')
var fs = require('fs')
var http = require('http')
var EE = require('events').EventEmitter
var util = require('util')

var browserify = require('browserify')
var watchify = require('watchify')
var esm = require('esmangle')
var esp = require('esprima')
var esc = require('escodegen')
var st = require('st')
var mkdirp = require('mkdirp')
var through = require('through')
var jade = require('jade')

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
  self.dirMount = st({path:self.dirPath, dot:true, cache:false})
  self.bundlesMount = st({path:self.bundlesPath, dot:true, cache:false})
  self.bundling = {}
  self.minifying = {}
  self.minified = {}
  self.error = {}
  return this
}
util.inherits(bfydir, EE)

bfydir.prototype.createServer = function() {
  return http.createServer(this.requestHandler())
}

bfydir.prototype.requestHandler = function() {
  return this.handleRequest.bind(this)
}

bfydir.prototype.handleRequest = function(req, res, next){
  var self = this
  var opts = {}
  var parsedUrl = url.parse(req.url, true)
  var doMin = parsedUrl.query.min !== undefined ? true : false
  var doBundle = parsedUrl.query.bundle !== undefined ? true : false
  var doInline = parsedUrl.query.inline !== undefined ? true : false
  var doJade = parsedUrl.query.jade !== undefined
  var optNoparse = parsedUrl.query.noparse !== undefined 
    ? parsedUrl.query.noparse.split(',')
    : false
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
  if (optNoparse) opts.bundleOpts.noparse = optNoparse
  opts.bundleOpts.cache = {}
  opts.bundleOpts.packageCache = {}
  opts.bundleOpts.fullPaths = true
  
  if (doJade) {
    return fs.readFile(entryPath, function(err, str){
      if (err) return res.end(err.stack)
      var fn
      try {
        fn = jade.compile(str)
      } catch(err) {
        return res.end(err.stack)
      }
      res.end(fn())
    })
  }
  
  if (!doBundle && !doInline && !doMin) {
    if (!next) return self.dirMount(req, res)
    return next()
  }

  if (self.bundleWatchers[opts.urlPath]) {
    var up = opts.urlPath
    var bp = opts.bundlePath
    var ing = doMin ? this.minifying[up] : this.bundling[up]
    if (this.error[up]) res.end(this.error[up].stack)
    if (doMin && !ing && !this.minified[up]) {
      if (this.bundling[up])
        return this.once('bundled:'+up, function(err){
          if (err) return res.end(err.stack)
          fs.createReadStream(bp).pipe(this.minifyStream(opts)).pipe(res)
        })
      var s = fs.createReadStream(bp).pipe(this.minifyStream(opts))
      if (doInline) return s.pipe(inlineStream()).pipe(res)
      return s.pipe(res)
    }

    if (ing) {
      var ev = doMin ? 'minified:'+up : 'bundled:'+up
      return self.once(ev, function(){serve()})
    }
    return serve()
  }

  function serve() {
    var p = doMin ? opts.bundlePathMin : opts.bundlePath
    if (doInline) return inlineStream(p).pipe(res)
    var split = p.split('/')
    req.url = '/'+split[split.length-1]
    self.bundlesMount(req, res, next)
  }

  fs.exists(entryPath, function(e){
    if (!e) {
      if (!next) return self.dirMount(req, res)
      return next()
    }
    // var bw = self.bundleWatchers[opts.urlPath] = watchify(entryPath)
    var b = self.bundleStream(opts)
    // var _b = doMin ? b.pipe(self.minifyStream(opts)) : b
    // bw.on('update', function(){ _b = self.bundleStream(opts) })
    self.once('bundled:'+opts.urlPath,function(err){
      if (err) res.end(err.message)
    })
    if (doInline) return b.pipe(inlineStream()).pipe(res)
    b.pipe(res)
  })
}

function err2str(err) {return err.toString()}

bfydir.prototype.bundleStream = function(opts) {
  var self = this
  console.log('---------',opts.bundleOpts)
  var B = self.bundling[opts.urlPath] = browserify(opts.entryPath,opts.bundleOpts)
  var bw = self.bundleWatchers[opts.urlPath] = watchify(B)
  var b = bw.bundle()
  
  var info = { urlPath: opts.urlPath
             , entryPath: opts.entryPath
             , bundlePath: opts.bundlePath 
             , bundleOpts: opts.bundleOpts }
  
  self.error[opts.urlPath] = false
  bw.on('update', bundle)
  var t = through(write, end)
  var first = false
  var len = 0
  bundle().pipe(t)
  
  bw.on('log',function(x){
    console.log('bundled',opts.bundlePath,x)
  })
  return t
  
  function bundle() {
    console.log('bundling',opts.bundlePath)
    var b = bw.bundle()
    var f = fs.createWriteStream(opts.bundlePath)
    b.pipe(f)
    
    return b
  }
  
  function write(c) {
    len += c.length
    this.queue(c)
  }
  
  function end() {
    this.queue(null)
    self.bundling[opts.urlPath] = null
    info.bundleSize = len
    self.emit('bundled', null, info)
    self.emit('bundled:'+opts.urlPath, null, info)
  }
  
  function onError(e) {
    var err = { message: String(e)
              , stack: e.stack
              , entry: opts.entryPath
              , bundle: opts.bundlePath }
    self.bundling[opts.urlPath] = null
    self.minified[opts.urlPath] = null
    self.error[opts.urlPath] = err
    console.error({error: err})
    //self.emit('error:'+opts.urlPath,err)
    self.emit('bundled:'+opts.urlPath,err)
    // bw.close()
    // b.end(JSON.stringify({error: err}))
  }
  /* * /
  var self = this
  var info = { urlPath: opts.urlPath
             , entryPath: opts.entryPath
             , bundlePath: opts.bundlePath 
             , bundleOpts: opts.bundleOpts }
  console.log('bo',opts.bundleOpts)
  self.minified[opts.urlPath] = false
  self.emit('bundling', opts)
  self.emit('bundling:'+opts.urlPath, opts)
  var bw = self.bundleWatchers[opts.urlPath]
  var b = self.bundling[opts.urlPath] = bw.bundle(opts.bundleOpts)
  self.error[opts.urlPath] = false
  var f = fs.createWriteStream(opts.bundlePath)
  var t = through(write, end)
  var first = false
  var len = 0
  b.on('error', onError)
  b.pipe(f)
  b.pipe(t)
  return t
  function onError(e) {
    var err = { message: String(e)
              , stack: e.stack
              , entry: opts.entryPath
              , bundle: opts.bundlePath }
    self.bundling[opts.urlPath] = null
    self.minified[opts.urlPath] = null
    self.error[opts.urlPath] = err
    console.error({error: err})
    //self.emit('error:'+opts.urlPath,err)
    self.emit('bundled:'+opts.urlPath,err)
    b.destroy()
    // b.end(JSON.stringify({error: err}))
  }
  function write(c) {
    len += c.length
    this.queue(c)
  }
  function end() {
    this.queue(null)
    self.bundling[opts.urlPath] = null
    info.bundleSize = len
    self.emit('bundled', null, info)
    self.emit('bundled:'+opts.urlPath, null, info)
  }
  /* */
}

bfydir.prototype.minifyStream = function(opts) {
  var self = this
  var f = fs.createWriteStream(opts.bundlePathMin)
  var info = { urlPath: opts.urlPath
             , entryPath: opts.entryPath
             , bundlePathMin: opts.bundlePathMin }
  var t = through(write, end)
  var buff = ''
  var len = 0
  t.pipe(f)
  self.minifying[opts.urlPath] = t
  self.emit('minifying', info)
  self.emit('minifying:'+opts.urlPath, info)
  return t
  function write(c) {buff += c; len += c.length}
  function end() {
    var ast = esp.parse(buff)
    var res = esm.mangle(ast)
    code = esc.generate(res, {format:{compact:true}})
    this.queue(code)
    this.queue(null)
    self.minifying[opts.urlPath] = false
    self.minified[opts.urlPath] = true
    info.bundleSize = len
    info.bundleSizeMin = code.length
    self.emit('minified', info)
    self.emit('minified:'+opts.urlPath, info)
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
  var t = through(write,end)
  if (s) s.pipe(t)
  return t

  function write(d){
    if (head) {
      this.queue('<html><head>'
        +'<meta content="width=device-width, initial-scale=1.0, '
        +'maximum-scale=1.0, user-scalable=0" name="viewport" />'
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

