# bfydir (WORK IN PROGRESS)

http-server which [watchify](https://github.com/substack/watchify)'s
all the `*.js` in a dir uppon request.

    $ npm i -g guybrush/bfydir
    $ echo "document.body.innerHTML = require('url').parse(window.location.href).hostname" > ~/a.js
    $ echo "if (require('assert').equal(1,1)) console.log('browserified assert')" > ~/b.js
    $ bfydir ~ -p 8005
    $ curl http://localhost:8005/a.js
    $ curl http://localhost:8005/b.js

