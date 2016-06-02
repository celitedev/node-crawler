var _ = require("lodash");
var moment = require("moment");
require("moment-timezone");

module.exports = {
  _meta: {
    name: "Eventbrite Events",
    description: "Distributed Crawler for Eventbrite.com Events"
  },
  source: {
    name: "Eventbrite"
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

    //Can't use proxy (see below)
    //Also hitting 429: Too many requests, while crawling from single ip. 
    //Therefore concurrentJobs = 1; 
    //TODO: revisit with payed rotating proxies that support https + redirects
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
    //Eventbrite has redirects over https which don't seem to be supported through tor proxy
    proxy: null,

    //Default Headers for all requests
    headers: {
      "Accept-Encoding": 'gzip, deflate'
    },

    //cache to simple fileCache. 
    //NOT FIT FOR PRODUCTION SINCE This doesn't do any TTL or whatever  
    doCache: true
  },
  schema: {
    version: "0.1", //version of this schema
    type: "masterDetail", //signifies overall type of scroll. For now: only 'masterDetail'
    requiresJS: false, //If true, use PhantomJS
    seed: {
      disable: false, //for testing. Disabled nextUrl() call

      //Eventbrite caps to 500 list pages
      seedUrls: function () {
        var urls = [];
        for (var i = 1; i < 500; i++) { //
          urls.push("https://www.eventbrite.com/d/ny--new-york/events/?page=" + i);
        }
        return urls;
      },

      stop: [{
        name: "zeroResults", //zeroResults
      }]
    },
    results: {
      //WEIRD: selector: ".search-results > li[itemscope]" produces 9 instead of 10 results
      //We use the more wide selector and are able to correcty do a generic post filter on 'id' exists.
      selector: ".list-card-v2", //selector for results

      //does detailPage pruning. For this to work: 
      //- _sourceUrl should exist and should equal detail page visisted
      //- 'detail page visited' is the page on which the detailObj is attached.
      detailPageAware: true,

      schema: function (x, detailObj) { //schema for each individual result

        return {

          _sourceUrl: "a.list-card__main@href",
          _sourceId: "a.list-card__main@href",

          name: ".list-card__title",
          startDate: ".list-card__date",
          // location: ".list-card__venue", //only has a name instead of link so can't hook up reliably

          _genre: [".list-card__tags > a"],

          image: x(".list-card__image", [{
            _ref: { //notice: _ref here.
              contentUrl: "img@src",
              url: "img@src",
            }
          }]),
        };
      },

      mapping: {
        startDate: function (sDate) {

          //start: Sat, Jun 4 10:00 PM

          if (!sDate) return undefined;

          sDate = sDate.substring(sDate.indexOf(",") + 1).trim();
          //sdate: Jun 4 10:00 PM

          //NOTE/TODO: when we find a recurring event we only process the first. 
          //sdate: Jun 4 10:00 PM & 31 more
          if (~sDate.indexOf("&")) {
            sDate = sDate.substring(0, sDate.indexOf("&")).trim();
          }

          // Convoluted way to get a date in NYC timezone
          // Root cause in unsafe date construction not longer supported: 
          // https://github.com/moment/moment/issues/1407

          var date = moment(new Date(sDate));
          if (!date.isValid()) {
            console.log("invalid date", sDate);
            return undefined;
          }

          var dtCurrentZone = date.format();
          dtCurrentZone = dtCurrentZone.substring(0, dtCurrentZone.length - 6);
          return moment.tz(dtCurrentZone, "America/New_York").format();

          //out: "2016-06-10T14:00:00-04:00"
        }
      },

      reducer: function (obj) {

        var factArr = [];

        //based on url we infer genre, e.g.: music, singles_social
        if (obj._genre.length) {

          var genres = _.map(obj._genre, function (genre) {
            return genre.substring(1);
          });

          factArr.push({
            name: "genre",
            val: genres
          });
        }

        if (factArr.length) {
          obj.fact = (obj.fact || []).concat(factArr);
        }
        return obj;
      },
    }
  }
};
