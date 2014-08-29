# bfydir

a http-server which [watchify](https://github.com/substack/watchify)'s
all the files in a dir simultaneously uppon request. also it supports
minifying js-files and inlining it into html-tags:
`<html><body><script>/* inline content here */</script></body></html>`.

## example

```
$ npm i -g bfydir
$ bfydir ~ -p 8006 --https # spawn https server
$ bfydir ~ -p 8005         # spawn http server

$ echo "module.exports = 'a'" > ~/a.js
$ echo "module.exports = 'b'" > ~/b.js
$ echo "console.log(require('./a'), require('./b'))" > ~/c.js
$ node -e `curl http://localhost:8005/c.js?bundle`
a b

$ echo "module.exports = 'foo'" > ~/a.js
$ node -e `curl http://localhost:8005/c.js?bundle`
foo b

$ curl http://localhost:8005/c.js?bundle&inline
<html><body><script>/* bundled source */</script></body></html>

$ curl http://localhost:8005/c.js?bundle&inline&min
<html><body><script>/* bundled source minified */</script></body></html>

$ curl http://localhost:8005/a.js
module.exports = 'a'
```

## cli

```
bfydir [<dir>] [-p,--port <port>] [-b,--bundles <bundles>] [-d,--debug] [--https]

    <dir>     .. serve files from that directory (default: pwd)
    <port>    .. listen on that port (default: 8001)
    <bundles> .. write bundled files into that directory (default: pwd/.bfydir-bundles)
    debug     .. write infos about bundling/minifying to stdout
    https     .. if set, start https-server
```
## api

### `var bfydir = require('bfydir')([opts])`

`opts` is optional

* `opts.dir` - serve files from that directory (default: `process.cwd()`)
* `opts.bundles` - write bundled files into that directory
  (default: `process.cwd()+'/.bfydir-bundles'`)

`bfydir` is an eventemitter which emits following events:

* `bundling`
* `bundling:<path>`
* `bundled`
* `bundled:<path>`
* `minifying`
* `minifying:<path>`
* `minified`
* `minified:<path>`

`<path>` is the url-pathname of the served bundle

all the events emit with a info-object:

```
bfydir.on('bundled', function(info){
  // info.urlPath
  // info.entryPath
  // info.bundlePath
  // info.bundlePathMin (only when minifying)
  // info.bundleSize
  // info.bundleSizeMin
})
```

### `var server = bfydir.createServer()`

`server` is a http-server, its a shortcut for
`http.createServer(this.requestHandler())`

### `var handler = bfydir.requestHandler()`

this is a shortcut for `var handler = bfydir.handleRequest.bind(bfydir)`

### `bfydir.handleRequest(req, res[, next])`

this will look for `require('url').parse(req.url).{bundle,inline,min}`

* `bundle` - if set pipe a browserify-bundle-stream into `res` (or if the
  bundle exists on disk pipe it directly from disk)
* `inline` - if set pipe the content through `bfydir.inlineStream()`
* `min` - if set pipe the content through `bfydir.minifyStream()`

### `var bStream = bfydir.bundleStream(opts)`

* `bStream` is a through-stream in which a browserify-bundle-stream gets
  piped into. the result gets piped to disk.
* `opts` must be an object
  * `opts.urlPath` is used to identify the bundle-watcher
  * `opts.entryPath` 
  * `opts.bundlePath`
  * `opts.bundleOpts`

### `var mStream = bfydir.minifyStream(opts)`

* `mStream` is a through-stream which buffers all content and then minifys it.
  then it writes the result to disk.
* `opts` must be an object
  * `opts.urlPath`
  * `opts.bundlePathMin`
  * `opts.entryPath`

### `var iStream = require('bfydir').inlineStream([sourcePath])`

* if `sourcePath` is set, `fs.createReadStream(bundlePath)` gets piped through
  the stream
* `iStream` is a through-stream which envelops the content into html-tags:

```
<html>
  <head>
    <meta content="width=device-width,
                   initial-scale=1.0,
                   maximum-scale=1.0,
                   user-scalable=0"
          name="viewport" />
    <meta charset=utf-8>
  </head>
  <body>
    <script>
      /* here is the content */
    </script>
  </body>
</html>
```

### `bfydir.close()`

close all the watchify-bundle-watchers

