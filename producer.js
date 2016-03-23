var _ = require("lodash");
var Xray = require('x-ray');
var JSONStream = require('JSONStream');
var h = require("highland");
var uuid = require("uuid");
var argv = require('yargs').argv;
var path = require("path");
var colors = require('colors');
var redis = require("redis");
var kue = require('kue');
var Promise = require("bluebird");
var utils = require("./utils");

var config = require("./config");
var redisClient = redis.createClient(config.redis);

/////////
//init //
/////////

if (!argv.source) {
  throw new Error("command-line arg 'source' not defined");
}
if (!argv.type) {
  throw new Error("command-line arg 'type' not defined");
}

var crawlConfig = utils.fetchCrawlConfig({
  source: argv.source,
  type: argv.type
});

var queue = kue.createQueue({
  prefix: utils.KUE_PREFIX,
  redis: config.redis
});

var hashObj = {
  source: crawlConfig.source.name,
  type: crawlConfig.entity.type,
};

var lastbatchIdObj = utils.lastBatchIdHash(hashObj);
var lastBatchIdEpochObj = utils.lastBatchIdEpoch(hashObj);

var newEpoch = new Date().getTime();
redisClient.hget(lastBatchIdEpochObj[0], lastBatchIdEpochObj[1], function (err, epoch) {
  if (err) {
    return getToWork(err);
  }

  epoch = epoch ? +epoch : epoch; //if epoch set, conver to number, otherwise leave the same
  var periodInSec = crawlConfig.scheduler.runEveryXSeconds || 24 * 60 * 60; //default to 24 hours

  if (epoch !== null && !argv.forceNewBatch && newEpoch < epoch + (periodInSec * 1000)) {

    //it's too soon
    getToWork(undefined, {
      doSkip: true
    });
    return;
  }

  //////////////////////////
  //STATE: all systems go //
  //////////////////////////

  //set new batchid and get it in 1 go
  redisClient.zincrby(lastbatchIdObj[0], 1, lastbatchIdObj[1], function (err, result) {
    if (err) {
      return getToWork(err);
    }

    //update epoch
    redisClient.hset(lastBatchIdEpochObj[0], lastBatchIdEpochObj[1], newEpoch, function (err) {
      if (err) {
        return getToWork(err);
      }

      getToWork(undefined, {
        batchId: Math.floor(+result),
        isFixed: false
      });
    });
  });
});

function getToWork(err, config) {
  if (err) {
    throw err;
  }

  var batchId = config.batchId;

  if (config.doSkip) {
    console.log(("shortcircuit because batch has been run too recently. " +
      "Overwrite with --forceNewBatch or just wait until auto-rescheduled").red);
    setTimeout(function () {
      doQuit(true);
    }, 100);
    return;
  } else {

    console.log(("Processing " + ((config.isFixed) ? "fixed" : "auto-incremented") +
      " batch with (source, type, batchId) " +
      "(" + hashObj.source + "," + hashObj.type + "," + batchId + ")").yellow);

    crawlConfig.isFixed = config.isFixed; //pass-along, so it's avail on consumer

    //create urls that need to be seeded
    var urlsOrFN = crawlConfig.schema.seed.seedUrls,
      urls = _.isFunction(urlsOrFN) ? urlsOrFN() : urlsOrFN;

    urls = _.isArray(urls) ? urls : [urls];

    var promises = _.map(urls, function (url) {
      return new Promise(function (resolve, reject) {
        utils.addCrawlJob(queue, batchId, crawlConfig, url, function (err) {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });
    });

    Promise.all(promises).finally(doQuit);
  }

  function doQuit(doSkip) {
    redisClient.quit();
    queue.shutdown(5000, function (err) {
      console.log('Kue shutdown: ', err || '');
      if (!doSkip) {
        console.log("done seeding (source, type, batchid)", crawlConfig.source.name,
          utils.calculated.getCrawlerName(crawlConfig.source.name, crawlConfig.entity.type), batchId);
      }
    });
  }


}
