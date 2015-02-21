# bfydir

a http-server which [watchify](https://github.com/substack/watchify)'s
all the files in a dir simultaneously uppon request. also it supports
minifying js-files and inlining it into html-tags:
`<html><body><script>/* bundled source here */</script></body></html>`.

## cli

```
bfydir [<dir>] [-p,--port <port>] [-b,--bundles <bundles>] [-d,--debug]
       [--key <key>] [--cert <cert>] [--pfx <pfx>]
       [-a,--auth <user>:<pwd>[,<user>:<pwd>]]
       [-h,--help]

    <dir>     .. serve files from that directory (default: pwd)
    <port>    .. listen on that port (default: 8001)
    <bundles> .. write bundles into that directory (default: <dir>/.bfydir-bundles)
    debug     .. write infos about bundling/minifying to stdout
    <key>     .. path to ssl-key-file
    <cert>    .. path to cert-key-file
    <pfx>     .. path to pfx-file
    auth      .. basic auth (comma separated list of user:pwd
    help      .. only show this message, otherwise just start bfydir

querystring-parameters:

    bundle, b    .. bundles the requested file instead of serving it
    min, m       .. minifies the bundle (sets b automatically)
    inline, i    .. inlines the bundle into html (sets b)
    transform, t .. comma-separated list of transforms (sets b)
    ignore       .. comma-separated list of modules to ignore (sets b)

example:

    $ bfydir ~ -p 8080 -a user1:pwd1,user2:pwd2
    $ echo "module.exports = 'a'" > ~/a.js
    $ echo "module.exports = 'b'" > ~/b.js
    $ echo "console.log(require('./a'), require('./b'))" > ~/c.js
    $ node -e `curl "http://user1:pwd1@localhost:8005/c.js?b"`
    a b
```

## usage

install bfydir and start the server:
```
$ npm i -g bfydir
$ bfydir ~ -p 8005
```

write code:
```
$ echo "module.exports = 'a'" > ~/a.js
$ echo "module.exports = 'b'" > ~/b.js
$ echo "console.log(require('./a'), require('./b'))" > ~/c.js
```

create a bundle:
```
$ node -e `curl http://localhost:8005/c.js?bundle`
a b
```

when you change the code it will update the bundles:
```
$ echo "module.exports = 'foo'" > ~/a.js
$ node -e `curl http://localhost:8005/c.js?bundle`
foo b
```

with the `inline` querystring-parameter it wrap the bundle with html-tags:
```
$ curl http://localhost:8005/c.js?inline
<html><body><script>/* bundled source */</script></body></html>
```

inline and minify:
```
$ curl http://localhost:8005/c.js?inline&min
<html><body><script>/* bundled source minified */</script></body></html>
```

use one or multiple transforms:
```
$ curl http://localhost:8005/some-file.js?transform=glslify,otherTransform
< transformed bundle >
```

without any querystring-parameters it will serve the source without bundling:
```
$ curl http://localhost:8005/a.js
module.exports = 'foo'
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

this will look at the query-string object `require('url').parse(req.url)`
for various member attributes:

* `bundle` or `b` - if set pipe a browserify-bundle-stream into `res` (or if the
  bundle exists on disk pipe it directly from disk)
* `inline` or `i` - if set pipe the content through `bfydir.inlineStream()`
* `min` or `m` - if set pipe the content through `bfydir.minifyStream()`
* `transform` or `t` - (comma-separated list) if set use these transforms
* `ignore` - (comma-separated list) if set tell browserify to ignore

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
  then it writes the result to disk (so actually its just uglifyjs pretending
  to be streaming :D).
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

