var _ = require("lodash");
var moment = require("moment");
var dateUtils = require("./utils/dateUtils");

module.exports = {
  _meta: {
    name: "1Ioata.com Events",
    description: "Distributed Crawler for 1Iota.com Events"
  },
  source: {
    name: "1Ioata"
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

    concurrentJobs: 2,

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
      seedUrls: [{url:'http://api.1iota.com/api/events',dataType:'json'}],
      stop: [{
        name: "zeroResults", //zeroResults
      }]
    },
    results: {

      detailPageAware: true,

      parseJSON: function(jsonData) {
        results = JSON.parse(jsonData).list.filter(function(value){
          if(value.where==='New York, NY') return true;
        }).map(function(value){
          return {
            _type: ['Event'],
            _sourceId: value.id,
            _sourceUrl: value.url,
            name: value.title,
            description: value.description,
            startDate: value.startDateUTC,
            subtypes: [value.eventTypeDisplay],
            image: {
              _ref: { //notice: _ref here.
                contentUrl: value.imageUrl,
                url: value.imageUrl
              }
            }
          }
        });

        return {
          results: results
        };
      },

       mapping: {
        "description": function(value){
          if (value) return value;
          return "";
        },
        _sourceUrl: function(value){ //inconsistent formatting of the URLs returned, appears to be only two variations but worth spot checking in the future
          if (value.substring(0,2) == "//") {
            return `http:${value}`;
          } else {
            return `http://1iota.com${value}`;
          }
        }
      }
    }
  }
};