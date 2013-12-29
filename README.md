# bfydir (work in progress)

http-server which [watchify](https://github.com/substack/watchify)'s
all the `*.js` in a dir uppon request.

## cli

```
bfydir [<dir>] [-p,--port <port>] [-b,--bundles <bundles>] [-d,--debug] [--https]

    <dir>     .. serve files from that directory (default: pwd)
    <port>    .. listen on that port (default: 8001)
    <bundles> .. write bundled files into that directory (default: pwd)
    debug     .. write infos about bundling/minifying to stdout
    https     .. if set, start https-server
```

## example

    $ npm i -g bfydir
    $ bfydir ~ -p 8006 --https # spawn https server
    $ bfydir ~ -p 8005         # spawn http server

    $ echo "module.exports = 'a'" > ~/a.js
    $ echo "module.exports = 'b'" > ~/b.js
    $ echo "console.log(require('./a'), require('./b'))" > ~/c.js
    $ node -e `curl http://localhost:8005/c.js`    # a b
    $ echo "module.exports = 'foo'" > ~/a.js
    $ node -e `curl http://localhost:8005/c.js`    # foo b

    $ curl http://localhost:8005/c.js?entry
    $ # <html><body><script>/* bundled source */</script></body></html>

    $ curl http://localhost:8005/c.js?entry&min
    $ # <html><body><script>/* bundled source minified */</script></body></html>

    $ curl http://localhost:8005/a.js?raw          # module.exports = 'a'

