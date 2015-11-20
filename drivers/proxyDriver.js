/**
 * Module Dependencies
 */

var _ = require("lodash");
var superagent = require('superagent');

var nodeCacheModule = require('cache-service-node-cache');
var cs = require('cache-service');

//TODO: make S3 Cache
var nodeCache = new nodeCacheModule({
  defaultExpiration: 500
});

//Instantiate cache-service
var cacheService = new cs({
  verbose: false
}, [nodeCache]);

// require('superagent-proxy')(superagent);
// require('superagent-cache')(superagent, cacheService);

/**
 * Export `driver`
 */

module.exports = driver;

/**
 * Default HTTP driver
 *
 * @param {Object} opts
 * @return {Function}
 */

function driver(opts) {
  var ctxDefaults = opts.ctx || {};
  delete opts.ctx;

  var agent = superagent.agent(opts || {});

  return function http_driver(ctx, fn) {

    //allow to input headers etc
    _.defaults(ctx, ctxDefaults);
    ctx.headers = _.defaults(ctx.headers, ctxDefaults.headers);

    agent
      .get(ctx.url)
      .set(ctx.headers)
      .end(function(err, res) {
        if (err && !err.status) return fn(err);

        ctx.status = res.status;
        ctx.set(res.headers);

        ctx.body = 'application/json' == ctx.type ? res.body : res.text;

        // update the URL if there were redirects
        ctx.url = res.redirects.length ? res.redirects.pop() : ctx.url;

        return fn(null, ctx);
      });
  };
}
