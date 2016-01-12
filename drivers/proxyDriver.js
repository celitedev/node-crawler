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
  var stats;

  var fn = function http_driver(ctx, fn) {

    agent
      .get(ctx.url)
      .set(_.defaults(ctx.headers, opts.headers))
      .timeout(opts.timeoutMS || 40000) //have a timeout. Seems by default superagent doesn't set one, which can lead to hands
      .proxy(opts.proxy) //TOR
      .on('error', function(err) {
        if (err.code === "ECONNABORTED") {
          if (this.res) { //sometimes this.res is not set yet. In that case we can't have a Z_BUF_ERROR... hopefully...
            this.res.on("error", function(errInternal) {
              if (errInternal.code !== "Z_BUF_ERROR") {
                console.log(("'Error on Superagent response again..Sigh. See #126").red);
                throw errInternal; //crash this shit
              }
              // See: #126
              //We're ignoring Z_BUF_ERROR in case 'ECONNABORTED' was rootCause. 
              //In that case we only report the root-cause error. 
              //
              //This is a terrible hack to ensure lib error doesn't crash our entire process.
            });
          }
        }

        return fn(err);
      })
      .end(function(err, res) {

        //This includes request errors (4xx and 5xx) as well as node errors, which is what we want. 
        //Result: Job fails in entirety and retry later. 
        //This is preferred since we're not able to do partial retries (we don't want to)
        //
        //See https://github.com/lapwinglabs/x-ray-crawler/pull/1 for the opposite viewpoint
        //which we need share for our particular usecase.
        if (err) { //WAS: (err && !err.status) 
          return fn(err);
        }

        ctx.status = res.status;
        ctx.set(res.headers);

        ctx.body = 'application/json' == ctx.type ? res.body : res.text;

        stats.unzippedInBytes += ctx.body.length;

        // update the URL if there were redirects
        ctx.url = res.redirects.length ? res.redirects.pop() : ctx.url;

        return fn(null, ctx);
      });
  };

  fn.setTotalStats = function(statsObj) {
    stats = statsObj;
  };

  return fn;

}
