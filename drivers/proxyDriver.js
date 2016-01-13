/**
 * Module Dependencies
 */

var _ = require("lodash");
var superagent = require('superagent');
var debugUrls = require('debug')('kwhen-crawler-urls');
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

    // return processUrl();

    // var opts = ctx.opts;

    // //if opts.batchId exists, we're processing a DETAIL PAGE. 
    // //This is not enforced in any way, but opts should be supplied by crawler on the correct place. 
    // //THIS IS BRITTLE BUT WORKS. 

    // //if detailpage is being processed, check if it's already (being) processed before. 
    // //Depending on semantics.pruneEntity we prune as follows: 
    // //semantics.pruneEntity = true -> prune if processed once before, regardless of batch
    // //semantics.pruneEntity = batch -> prune if processed during this batch already 
    // if (opts.batchId !== undefined) {

    //   console.log("ASDASD");
    //   var redisClient = opts.redisClient;
    //   var utils = opts.utils;
    //   var sortedSetname = utils.addedUrlsSortedSet(opts);

    //   //get the last time (batchId) nextUrl was added to queue
    //   redisClient.zscore(sortedSetname, ctx.url, function(err, score) {
    //     if (err) {
    //       return fn(err);
    //     }

    //     if (score === null) {
    //       return processUrl();
    //     }

    //     console.log("ASDASDASD");
    //     var pruneEntity = _.isFunction(opts.semantics.pruneEntity) ? opts.semantics.pruneEntity(+opts.batchId) : opts.semantics.pruneEntity;

    //     switch (pruneEntity) {
    //       case "batch":
    //         if (+opts.batchId > +score) { //process in case of semantics.pruneEntity = batch
    //           return processUrl();
    //         }
    //         break;
    //       case false:
    //         //never prune
    //         return processUrl();
    //       case true:
    //         //prune if url already processed, which is the case since score !== null
    //         break;
    //       default:
    //         throw new Error("pruneEntity value not supported. Must be (true, false, batch) " + pruneEntity);
    //     }

    //     console.log("EMPTY");
    //     ctx.body = "";
    //     fn(null, ctx); //empty result set... So what happens now? 

    //   });
    // } else {
    //   processUrl();
    // }


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
