var _ = require("lodash");
var moment = require("moment");
var dateUtils = require("./utils/dateUtils");

module.exports = {
  _meta: {
    name: "Seatgeek Events",
    description: "Distributed Crawler for Seatgeek.com Events"
  },
  source: {
    name: "Seatgeek"
  },
  entity: {
    type: "Event",
  },
  scheduler: {
    runEveryXSeconds: 24 * 60 * 60 //each day
  },
  //General logic/behavior for this crawler 
  semantics: {

    //prune ENTITY URL if already processed 
    //options: 
    //- false: never prune
    //- true: prune if url already processed
    //- batch: prune if url already processed for this batch

    pruneEntity: "batch",

    //
    //Example of variable pruneEntity which re-processes 
    //every entity once every x times.
    //
    // pruneEntity: function(batchId) {
    // 	if (batchId % 7 === 0) {
    // 		return "batch"; //every 7 batches let's do an entire rerun
    // 	}
    // 	return "true";
    // },

    //How to check entity is updated since last processed
    // - string (templated functions) 
    // - custom function. Signature: function(el, cb)
    //
    //template options: 
    //- hash: hash of detail contents
    //- headers: based on cache headers
    //- db: check against saved SourceEntity
    dirtyCheckEntity: "hash",


    //Examples: 
    //
    //pruneList = batch + pruntEntity = true -> 
    //Each batch run prunes lists pages when done within the same batch. 
    //However, the next batch run lists aren't pruned to stay up-to-date with changed contents (new entities?)
    //of these list pages. 
    //Regardless, due to pruneEntity=true, the crawler will not recheck entities if they're already processed. 
    //This is the default (and fastest) mode, based on the rationale that entities do not change often if at all. 
    //I.e.: a Place-page on Eventful will rarely update it's contents. 
    //
    //Prunelist = batch + pruneEntity = batch -> 
    //recheck already processed entities for each new batch.
    //
    //A good setting may be: 
    //- EACH HOUR: Run pruneList = batch + pruntEntity = true 
    //- EACH DAY: Run pruneList = batch + pruntEntity = batch 
  },
  job: {

    concurrentJobs: 1,

    //job-level retries before fail. 
    //This is completely seperate for urls that are individually retried by driver
    retries: 5,

    // fail job if not complete in 100 seconds. This is used because a consumer/box can fail/crash
    // In that case the job would get stuck indefinitely in 'active' state. 
    // With this solution, the job is placed back on the queue, and retried according to 'retries'-policy
    // This should be WAY larger then driver.timeoutMS
    ttl: 100 * 1000,
  },
  driver: {

    //timeout on individual request. 
    //Result: fail job and put back in queue as oer config.job.retries
    timeoutMS: 50 * 1000,

    //local proxy, e.g.: TOR
    // proxy: "http://localhost:5566",

    //Default Headers for all requests
    headers: {
      "Accept-Encoding": 'gzip, deflate'
    },

    //cache to simple fileCache. 
    //NOT FIT FOR PRODUCTION SINCE This doesn't do any TTL or whatever  
    doCache: false
  },
  schema: {
    version: "0.1", //version of this schema
    type: "masterDetail", //signifies overall type of scroll. For now: only 'masterDetail'
    requiresJS: false, //If true, use PhantomJS
    seed: {
      disable: false, //for testing. Disabled nextUrl() call

      seedUrls: function () {
        var urls = [];
        for (var i = 1; i < 700; i++) { //
          urls.push({url:"https://seatgeek.com/search?search=new+york&page=" + i, dataType:'html'});
        }
        return urls;
      },

      //Not needed since we are covered completely with above seeds.
      // nextUrlFN: function (el) {
      //  //...
      // },


      stop: [{
        name: "zeroResults", //zeroResults
      }]
    },
    results: {
      selector: ".page-event-listing", //selector for results

      detailPageAware: false,

      schema: function (x, detailObj) { //schema for each individual result

        return {

          _sourceUrl: ".event-listing-title@href",
          _sourceId:".event-listing-title@href",
          name: ".event-listing-title > span",
          startDate: ".event-listing-time@datetime",
          _startDate: ".event-listing-time",
          location: ".event-listing-venue-link@href",
          _subtype: "@itemtype"
        };
      },

      mapping: {
       _type: function (val, obj) {
          var subtype = obj._subtype; 
          subtype = subtype.substring(subtype.lastIndexOf("/") + 1);
          return [subtype];
        }, 
        startDate: function (startDateISO, obj) {

          //seatgeek uses timestamps, but these appear to be in NYC local time WTF. 
          //Therefore we fallback to isoTime in localtime since this is better human checkable. 
          //
          return dateUtils.transposeTimeToUTC(startDateISO, "America/New_York");
        }, 
      },

      // reducer: function (obj) {
      //   var factArr = [];
      //   if (factArr.length) {
      //     obj.fact = (obj.fact || []).concat(factArr);
      //   }
      //   return obj;
      // },
      
      pruner: function (result) {
        if (!result.startDate) {
          return undefined;
        }
        return result;
      }

    }
  }
};
