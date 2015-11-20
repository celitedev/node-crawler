/**
 * Module Dependencies
 */

var _ = require("lodash");
var superagent = require('superagent');

///////////////////
//TODO: S3 cache //
///////////////////
var redisModule = require('cache-service-redis');

var redisCache = new redisModule({
  redisData: {
    port: 6379,
    hostname: "127.0.0.1"
  },
});

require('superagent-proxy')(superagent);
require('superagent-cache')(superagent, redisCache);

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

  var fn = function http_driver(ctx, fn) {

    //allow to input headers etc
    _.defaults(ctx, ctxDefaults);
    ctx.headers = _.defaults(ctx.headers, ctxDefaults.headers);
    agent
      .get(ctx.url)
      .set(ctx.headers)
      .proxy("socks://localhost:5566")
      .end(function(err, res) {
        if (err && !err.status) return fn(err);

        ctx.status = res.status;
        ctx.set(res.headers);

        ctx.body = 'application/json' == ctx.type ? res.body : res.text;

        // console.log("body", ctx.body.length);

        // update the URL if there were redirects
        ctx.url = res.redirects.length ? res.redirects.pop() : ctx.url;

        return fn(null, ctx);
      });
  };

  fn.redisCache = redisCache;

  return fn;

}
