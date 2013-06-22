# bfydir

http-server which [watchify](https://github.com/substack/watchify)'s
all the `*.js` in a dir uppon request.

    $ npm i -g guybrush/bfydir
    $ echo "module.exports = 'a'" > ~/a.js
    $ echo "module.exports = 'b'" > ~/b.js
    $ echo "console.log(require('./a'), require('./b'))" > ~/entry.js
    $ bfydir ~ -p 8005
    $ node -e `curl http://localhost:8005/entry.js`    # a b
    $ echo "module.exports = 'foo'" > ~/a.js
    $ node -e `curl http://localhost:8005/entry.js`    # foo b
    $ # <html><body><script src="/entry.js"></script></body></html>
    $ curl http://localhost:8005?bfydirEntry=entry.js

