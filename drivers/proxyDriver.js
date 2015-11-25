/**
 * Module Dependencies
 */

var _ = require("lodash");
var superagent = require('superagent');

require('superagent-proxy')(superagent);

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

  //TODO: passing options is for certificate and cookies only 
  var agent = superagent.agent();

  var fn = function http_driver(ctx, fn) {

    agent
      .get(ctx.url)
      .set(_.defaults(ctx.headers, opts.headers))
      .timeout(opts.timeoutMS || 20000) //have a timeout. Seems by default superagent doesn't set one, which can lead to hands
      .proxy(opts.proxy) //TOR
      .end(function(err, res) {
        if (err && !err.status) {
          return fn(err);
        }

        //TODO: #14
        //Driver continues when err with status code

        ctx.status = res.status;
        ctx.set(res.headers);

        ctx.body = 'application/json' == ctx.type ? res.body : res.text;

        // update the URL if there were redirects
        ctx.url = res.redirects.length ? res.redirects.pop() : ctx.url;

        return fn(null, ctx);
      });
  };

  fn.redisCache = redisCache;

  return fn;

}
