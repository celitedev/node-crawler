var uuid = require("uuid");
var path = require("path");
var _ = require("lodash");

var utils = module.exports = {
  URL_SEED_PREFIX: "url_seed",
  URL_DONE_MASTER_PREFIX: "url_done_master",
  URL_DONE_DETAIL_PREFIX: "url_done_detail",
  KUE_PREFIX: "kwhenqueue2",


  //Given a crawler return the name of the sorted set which contains all urls
  //processed by crawler in history. For each url maintain last batch at which 
  //this url was processed.
  //
  //This sortedset is used for both indexUrls as well as entityUrls.
  //
  //Used by consumer.
  //
  //redis type: sorted set
  addedUrlsSortedSet: function (crawlerName) {
    if (!crawlerName) {
      throw new Error("crawlerName not set in addedUrlsSortedSet");
    }
    return "kwhen--urlsAdded--" + crawlerName.toLowerCase();
  },

  //the last batchid per crawler
  //Used to remove outdated jobs from the queue
  //Used by consumer and producer
  //
  //redis type: hash
  lastBatchIdHash: function (crawlerName) {
    return ["kwhen--lastid", crawlerName.toLowerCase()];
  },

  //used by producer to see if we're not too fast with producing.
  //
  // redis type: hash 
  lastBatchIdEpoch: function (crawlerName) {
    return ["kwhen--lastidEpoch", crawlerName.toLowerCase()];
  },



  //NOTE: config is from commandline. Here type is never an array
  fetchCrawlConfig: function (crawlerName) {
    crawlerName = crawlerName.toLowerCase();
    try {
      var crawlerSchemaPath = path.resolve(__dirname + "/crawlers/" + crawlerName);
      crawlConfig = require(crawlerSchemaPath);

      if (crawlConfig.schema.requiresJS) {
        throw new Error("requiresJS not supported atm, since we've not implemented caching + prxying yet");
        // var phantom = require('x-ray-phantom');
        // x.driver(phantom());
      }

    } catch (err) {
      throw err;
      // console.log(err);
      // throw new Error("crawler not found: " + config.crawler);
    }

    crawlConfig.name = crawlerName;

    return crawlConfig;
  },

  addCrawlJob: function (queue, batchId, crawlConfig, url, cb) {
    if (!crawlConfig.name) {
      throw new Error("Sanity check: crawlConfig.name is undefined!");
    }
    var crawlerQueueName = utils.calculated.getCrawlerQueueName(crawlConfig);

    return queue.create(crawlerQueueName, {
        name: crawlConfig.name,
        batchId: batchId,
        jobId: uuid.v4(), //id of this specific mini batch
        source: crawlConfig.source.name,
        type: crawlConfig.entity.type,
        url: url,
        created: new Date().toISOString(),
        title: crawlConfig.name + "--" + url
      })
      .ttl(crawlConfig.job.ttl)
      //fail means retry: return to queue to be picked up later. Allows us to mimic 'at-least-once'-semantics
      //except for that fact that redis isn't durable. 
      //TODO: look into this as alternative to propert queueing? 
      .attempts(crawlConfig.job.retries)
      .removeOnComplete(true)
      .save(cb || noop);
  },
  calculated: {

    getCrawlerQueueName: function (crawlConfig) {
      return "crawl-" + crawlConfig.name;
    }
  }
};

function noop() {}
