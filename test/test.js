var url = require('url')
var href = url.parse(window.location.href)
window.document.body.innerHTML = JSON.stringify(href)


