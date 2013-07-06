# bfydir (work in progress)

http-server which [watchify](https://github.com/substack/watchify)'s
all the `*.js` in a dir uppon request.

    $ npm i -g guybrush/bfydir
    $ bfydir ~ -p 8005

    $ echo "module.exports = 'a'" > ~/a.js
    $ echo "module.exports = 'b'" > ~/b.js
    $ echo "console.log(require('./a'), require('./b'))" > ~/entry.js
    $ node -e `curl http://localhost:8005/entry.js`    # a b
    $ echo "module.exports = 'foo'" > ~/a.js
    $ node -e `curl http://localhost:8005/entry.js`    # foo b

    $ curl http://localhost:8005?entry=a.js
    $ # <html><body><script src="a.js"></script></body></html>

    $ curl http://localhost:8005/entry.js?entry
    $ # <html><body><script src="entriy.js"></script></body></html>

