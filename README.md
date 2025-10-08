## Running Node.js code in web browsers

### Getting started

1. `git clone --recurse-submodules git@github.com:adamziel/node-js-in-the-browser.git`
2. `cd node/lib/internal; ln -s ../../deps ./`
3. `npm install build.js`
4. `node build.js`
5. `frankenphp run --config ./frankenphp.Caddyfile` or `php -S 8043`
6. Go to http://127.0.0.1:8043/ and enjoy
