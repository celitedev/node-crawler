var _ = require("lodash");
var dateUtils = require("./utils/dateUtils");
var config = require("../../config");

//crawlSchema for:
//source: Eventful
//type: events
module.exports = {
  _meta: {
    name: "Eventful Events",
    description: "Distributed Crawler for Eventful.com Events"
  },
  source: {
    name: "Eventful"
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
    //x concurrent kue jobs
    //
    //NOTE: depending on the type of crawl this can be a master page, which
    //within that job will set off concurrent detail-page fetches.
    //In that case total concurrency is higher than specified here.
    //
    //#6: distribute concurrency per <source,type> or <source>
    //for more controlled throttling.
    concurrentJobs: 4,

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
    proxy: 'http://' + config.proxy.host + ':' + config.proxy.port,

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

      seedUrls: [{url:"http://newyorkcity.eventful.com/events/categories?page_number=1", dataType:'html'}],
      
      nextUrlFN: function (el) {
        return el.find("#pagination > li.next a").attr("href");
      },


      // STOP CRITERIA when processing nextUrlFN
      // When processing one page after another using nextUrlFN, we need a way to check if we're done.
      // A couple of standard checks are always performed to this end: 
      //
      // - check if nextUrl is the same as currentUrl. This is often employed by sites and is 
      //  used as a sure sign we're done
      // - nextUrl is not an url (i.e if nexturl() finds a 'href' that isn't there anymore)
      //
      // Besides that a crawler may implement specific stop criteria based on domain knowledge:
      // - Templated functions (referenced by string or object with attrib name = name of template function)
      // - custom function. Signature : function(el, cb) TO BE IMPLEMENTED
      //
      // Available Templated functions: 
      // - zeroResults: uses `results.selector` + optional `selectorPostFilter` to check for 0 results. 
      //
      // Below is a working example. 
      // It's superfloous for this crawler through, since general checks desribed above are enough.
      stop: [{
        name: "zeroResults", //zeroResults
        selectorPostFilter: function (result) {
          //as described above this is s
          return result.attribs.itemscope !== undefined;
        }
      }]
    },
    results: {
      //WEIRD: selector: ".search-results > li[itemscope]" produces 9 instead of 10 results
      //We use the more wide selector and are able to correcty do a generic post filter on 'id' exists.
      selector: ".search-results > li", //selector for results

      //does detailPage pruning. For this to work: 
      //- _sourceUrl should exist and should equal detail page visisted
      //- 'detail page visited' is the page on which the detailObj is attached.
      detailPageAware: true,

      schema: function (x, detailObj) { //schema for each individual result

        return {
          _sourceUrl: "a.tn-frame@href",
          _sourceId: "a.tn-frame@href",
          _detail: x("a.tn-frame@href", {
            name: "[itemprop=name] > span",
            description: "[itemprop=description]",
            location: x("[itemprop=location]", "> a@href"), //no array. This way we omit a fault google maps location
            performer: x("[itemprop=performer]", ["> a@href"]),
            startDate: "[itemprop=startDate]@content",

            image: x(".image-viewer li", [{
              _ref: { //notice: _ref here.
                contentUrl: "a@href",
                url: "a@href",
                caption: "@title",
              }
            }]),

            //No way to get this with css, so let's do sone text munging
            _genreHref: function (el, cb) {
              var genreHref;
              _.each(el(".section-block.description > p"), function(val){

                if(genreHref) return;

                var tag = el(val);
                var txt = tag.text().trim();
                if(!txt || txt.indexOf("Categories") !== 0) return;

                genreHref = el(tag.find("> a")).attr("href");
              });
              cb(undefined, genreHref);
            },

          }, undefined, detailObj)
        };
      },

      mapping: {
        "_detail.description": function (desc, obj) {
          if (desc === "There is no description for this event.") {
            return undefined;
          }
          return desc;
        },
        "_detail.location": function (location, obj) {
          if (!location) return undefined;
          return location.length ? location : undefined;
        },
        "_detail.performer": function (performer, obj) {
          if (!performer) return undefined;
          return performer.length ? performer : undefined;
        },
        "_detail.startDate": function(timeWithoutTimezone){

          //Eventful incorrectly returns a *local time* as a UTC time. 
          //This needs to be tansposed to the correct timezone and then translated to UTC
          return dateUtils.transposeTimeToUTC(timeWithoutTimezone, "America/New_York");
          //out: "2016-06-10T14:00:00-04:00" || false
        },
        "_detail.image": function removeFallbackFromImage(val) {

          if (!val) return val;
          var imageArr = _.compact(_.map(val, function (imgObj) {

            var url = imgObj._ref.contentUrl;

            if (!url || ~url.indexOf("fallback")) {
              return undefined;
            }

            return imgObj;
          }));

          if (!imageArr.length) {
            return undefined;
          }

          return imageArr;
        },
      },

      reducer: function (obj) {

        var factArr = [];

        //based on url we infer genre, e.g.: music, singles_social
        if (obj._detail._genreHref) {
          var genreHref = obj._detail._genreHref;
          var val = genreHref.substring(genreHref.lastIndexOf("/") + 1);

          factArr.push({
            name: "genre",
            val: [val] //needs to be array!
          });

          //We also want to map eventful.event genres to be subtypes
          //NOTE: subtypes can be freely assigned to as opposed to _type
          obj.subtypes = [val];

        }

        if (factArr.length) {
          obj.fact = (obj.fact || []).concat(factArr);
        }
        return obj;
      },

      pruner: function (result) {
        if (!result._detail.startDate) {
          return undefined;
        }
        return result;
      }

    }
  }
};
