/**
 * Module Dependencies
 */

var Promise = require("bluebird");
var _ = require("lodash");

var fs = Promise.promisifyAll(require("fs"));
var mkdirp = Promise.promisify(require('mkdirp'));
var colors = require("colors");

var debugUrls = require('debug')('kwhen-crawler-urls');
var debug = require('debug')('kwhen-crawler');

var superagent = require('superagent');

require('superagent-proxy')(superagent);
require('superagent-retry')(superagent);

var md5 = require('md5');
var cacheUtils = {
  dirDepth: 5,
  charsPerDir: 2,
  cachePrefixDir: "fileCache",
  createHashPath: function (crawlerName, url) {
    var hash = md5(url);
    var path = "";
    for (var i = 1; i <= cacheUtils.dirDepth * cacheUtils.charsPerDir; i++) {
      path += hash.charAt(i);
      if (i % cacheUtils.charsPerDir === 0) {
        path += "/";
      }
    }
    return cacheUtils.cachePrefixDir + "/" + crawlerName + "/" + path + hash;
  },
  get: function (hash) {
    return fs.readFileAsync(hash, "utf8")
      .then(function (dtoStr) {
        var json;
        try {

          json = JSON.parse(dtoStr);
        } catch (err) { //parse error: likely due to kill program while we were writing to file
          json = null;
        }
        return json;
      });
  },
  set: function (hash, dto) {
    var dirPath = hash.substring(0, hash.lastIndexOf("/"));

    return Promise.resolve()
      .then(function () {
        return mkdirp(dirPath);
      })
      .then(function () {
        return fs.writeFileAsync(hash, JSON.stringify(dto), "utf8");
      })
      .then(function () {
        return dto;
      });
  }
};

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

function driver(driverOpts) {

  //TODO: passing options is for certificate and cookies only 
  var agent = superagent.agent();
  var stats;

  var fn = function http_driver(ctx, fn) {

    var opts = ctx.opts;

    var cachePath = cacheUtils.createHashPath(opts.name, ctx.url);

    //if opts.batchId exists, we're processing a DETAIL PAGE. 
    //This is not enforced in any way, but opts should be supplied by crawler on the correct place. 
    //THIS IS A LITTLE BRITTLE BUT WORKS. 

    //if detailpage is being processed, check if it's already (being) processed before. 
    //Depending on semantics.pruneEntity we prune as follows: 
    //semantics.pruneEntity = true -> prune if processed once before, regardless of batch
    //semantics.pruneEntity = batch -> prune if processed during this batch already 
    if (opts.batchId !== undefined) {

      var redisClient = opts.redisClient;
      var utils = opts.utils;
      var sortedSetname = utils.addedUrlsSortedSet(opts.name);

      //get the last time (batchId) nextUrl was added to queue
      redisClient.zscore(sortedSetname, ctx.url, function (err, score) {
        if (err) {
          return fn(err);
        }

        if (score === null) {
          return processUrl(driverOpts);
        }

        var pruneEntity = _.isFunction(opts.semantics.pruneEntity) ? opts.semantics.pruneEntity(+opts.batchId) : opts.semantics.pruneEntity;

        switch (pruneEntity) {
          case "batch":
            if (+opts.batchId > +score) { //process in case of semantics.pruneEntity = batch
              return processUrl(driverOpts);
            }
            break;
          case false:
            //never prune
            return processUrl(driverOpts);
          case true:
            //prune if url already processed, which is the case since score !== null
            break;
          default:
            throw new Error("pruneEntity value not supported. Must be (true, false, batch) " + pruneEntity);
        }

        opts.prunedDetailUrls.push(ctx.url);
        fn(null, {
          body: ""
        });

      });
    } else {
      processUrl(driverOpts);
    }

    var retries = 0;
    var maxRetries = 5;

    //https://github.com/segmentio/superagent-retry is flaky. 
    //DIY retry on following codes
    var retryCodes = [
      404, //not found. On eventful.com this happens under load
      500, //internal server error 
      502, //bad gateway erro
      503, //should be caught by superagent-rety but isn't? 
      504 //bad gateway error
    ];

    function processUrl(driverOpts) {
      if (!driverOpts) {
        throw new Error("driveOpts not passed");
      }
      Promise.resolve()
        .then(function () {
          return processUrlInner();
        })
        .then(function (ctx) {
          return fn(null, ctx);
        })
        .catch(function errorCB(err) {

          if (err.status && ~retryCodes.indexOf(err.status) && retries < maxRetries) {

            retries++;

            debug(JSON.stringify({
              retry: err.url,
              status: err.status,
              url: err.url
            }, null, 2));

            //retry 
            return processUrl(driverOpts);

          } else {
            return fn(err);
          }
        });
    }

    function processUrlInner() {
      return Promise.resolve()
        .then(function conditionalFetchFromCache() {
          if (!driverOpts.doCache) return;

          return cacheUtils.get(cachePath)
            .catch(function (err) {
              if (err.code !== "ENOENT") throw err;
              return null; //return null if not found;
            });
        })
        .then(function (cachedDTO) {

          if (cachedDTO) {
            return cachedDTO;
          }

          var opts = driverOpts;

          return Promise.resolve()
            .then(function () {

              return new Promise(function (resolve, reject) {
                agent
                  .get(ctx.url)
                  .set(_.defaults(ctx.headers, opts.headers))
                  .timeout(opts.timeoutMS || 40000) //have a timeout. Seems by default superagent doesn't set one, which can lead to hands
                  .proxy(opts.proxy) //TOR
                  .on('error', function (err) {
                    if (err.code === "ECONNABORTED") {
                      if (this.res) { //sometimes this.res is not set yet. In that case we can't have a Z_BUF_ERROR... hopefully...
                        this.res.on("error", function (errInternal) {
                          if (errInternal.code !== "Z_BUF_ERROR") {
                            console.log(("'Error on Superagent response again..Sigh. See #126").red);
                            return reject(errInternal);
                          }
                          // See: #126
                          //We're ignoring Z_BUF_ERROR in case 'ECONNABORTED' was rootCause. 
                          //In that case we only report the root-cause error. 
                          //
                          //This is a terrible hack to ensure lib error doesn't crash our entire process.
                        });
                      }
                    }
                    return reject(err);
                  })
                  .end(function (err, res) {

                    //This includes request errors (4xx and 5xx) as well as node errors, which is what we want. 
                    //Result: Job fails in entirety and retry later. 
                    //This is preferred since we're not able to do partial retries (we don't want to)
                    //
                    //See https://github.com/lapwinglabs/x-ray-crawler/pull/1 for the opposite viewpoint
                    //which we need share for our particular usecase.

                    if (err) { //WAS: (err && !err.status) 
                      err.url = ctx.url;
                      return reject(err);
                    }

                    var dto = {
                      status: res.status,
                      headers: res.headers,
                      body: 'application/json' == ctx.type ? res.body : res.text,
                      url: res.redirects.length ? res.redirects.pop() : ctx.url
                    };

                    stats.unzippedInBytes += dto.body.length;

                    resolve(dto);
                  });
              });

            })
            .then(function conditionalAddToCache(dto) {
              if (!driverOpts.doCache) return dto;
              return cacheUtils.set(cachePath, dto);
            });

        })
        .then(function doneCB(dto) {

          ctx.status = dto.status;
          ctx.body = dto.body;
          ctx.url = dto.url;
          ctx.set(dto.headers);

          return ctx;
        });
    }

  };

  fn.setTotalStats = function (statsObj) {
    stats = statsObj;
  };

  return fn;

}
