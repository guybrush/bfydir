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

  var e = entry !== undefined
  var p = min ? bundlePathMin : bundlePath

  if (self.bundleWatchers[p]) {
    var b = this.bundling[p]
    var split = p.split('/')
    req.url = '/'+split[split.length-1]
    if (b) {
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
      self.emit('bundling',{entry:filePath, path:bundlePath})
      var bytes = 0
      var b = self.bundling[bundlePath] = bw.bundle(opts)
      var f = fs.createWriteStream(bundlePath)
      var t = through(write, end)
      b.on('error', function(e){
        self.bundling[bundlePath] = false
        // close the stream so watchify manges listeners
        b.destroy()
        // not sure about emitting errors, if the user doesnt handle the
        // errors it will throw.. so maybe just put em on stdout
        // self.emit('error',e)
        console.log({error:{message:String(e),entry:filePath,path:bundlePath}})
      })
      b.pipe(t)
      b.pipe(f)

      if (!min) return b
      var buff = ''
      var tMin = through(writeMin, endMin)
      var fMin = fs.createWriteStream(bundlePathMin)

      self.bundling[bundlePathMin] = tMin
      var s = b.pipe(tMin).pipe(fMin)
      return tMin

      function write(c) {bytes += c.length}
      function end() {
        self.bundling[bundlePath] = false
        self.emit('bundled',{entry:filePath, path:bundlePath, size:kB(bytes)})
      }

      function writeMin(c) {buff += c}
      function endMin() {
        self.emit('minifying', { entry: filePath, path: bundlePathMin } )
        var ast = esp.parse(buff)
        var res = esm.mangle(ast)
        var code = esc.generate(res, {format:{compact:true}})
        this.queue(code)
        this.queue(null)
        self.bundling[bundlePathMin] = false
        self.emit( 'minified', { entry: filePath
                               , path: bundlePathMin
                               , size: kB(code.length) } )
      }

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

function kB(l) {return (l/1000).toFixed(2)+'kB'}

