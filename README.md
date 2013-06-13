# bfydir (WORK IN PROGRESS)

http-server which [browserify](https://github.com/substack/node-browserify)'s 
all the `*.js` in a dir uppon request

    $ npm i -g guybrush/bfydir
    $ echo "document.body.innerHTML = require('url').parse(window.location.href).hostname" > ~/a.js
    $ echo "if (require('assert').equal(1,1)) console.log('browserified assert')" > ~/b.js
    $ bfydir ~ -p 8005 -w
    $ curl http://localhost:8005/a.js
    $ curl http://localhost:8005/b.js?d

everytime you request a `*.js` it will try to browserify the bundle if it 
hasnt yet. also you can add a `-w` arg to the cli to tell it to watch for 
changes of files included in the bundle. you can pass options to browserify 
via the querystring, eg. `curl http://localhost:8005/b.js?d` will enable 
browserify's debug-option, `curl http://localhost:8005/b.js?s&d&dg&i=FILE` 
is like passing `--standalone`, `--debug`, `--ignore=FILE` to browserify.

note: there is also [beefy](https://github.com/chrisdickinson/beefy) which is 
similiar to `bfydir` but i wanted to just drop `*.js` files (or entire 
`node_modules`) into a dir and request bundles without having to start a new 
server. also `beefy` comes with reload-magic and alias-feature which is not in 
`bfydir`.

