var _ = require("lodash");
var config = require("../../config");

var nycObj = require("../../schemas/domain/_definitions/config").statics.NYC;

//crawlSchema for:
//source: Eventful
//type: events
module.exports = {
  _meta: {
    name: "Fandango Places",
    description: "Distributed Crawler for Fandango.com Places"
  },
  source: {
    name: "fandango"
  },
  entity: {
    type: "PlaceWithOpeninghours",
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
    pruneEntity: true,

    //How to check entity is updated since last processed
    // - string (templated functions)
    // - custom function. Signature: function(el, cb)
    //
    //template options:
    //- hash: hash of detail contents
    //- headers: based on cache headers
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
    concurrentJobs: 1,
    retries: 5,

    // fail job if not complete in 100 seconds. This is used because a consumer/box can fail/crash
    // In that case the job would get stuck indefinitely in 'active' state.
    // With this solution, the job is placed back on the queue, and retried according to 'retries'-policy
    ttl: 100 * 1000,
  },
  driver: {

    //timeout on individual request.
    //Result: fail job and put back in queue as oer config.job.retries
    timeoutMS: 40000,

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

      seedUrls: [
        {url:"http://www.fandango.com/manhattan_+ny_movietimes?pn=1", dataType:'html'},
        {url:"http://www.fandango.com/brooklyn_+ny_movietimes?pn=1", dataType:'html'},
        {url:"http://www.fandango.com/queens_+ny_movietimes?pn=1", dataType:'html'},
        {url:"http://www.fandango.com/bronx_+ny_movietimes?pn=1", dataType:'html'},
        {url:"http://www.fandango.com/staten+island_+ny_movietimes?pn=1", dataType:'html'}
      ],

      nextUrlFN: function (el) {
        return el.find("#GlobalBody_paginationControl_NextLink").attr("href");
      }
    },
    headers: { //Default Headers for all requests
      "Accept-Encoding": 'gzip, deflate'
    },
    results: {
      selector: "[itemtype='http://schema.org/MovieTheater']", //selector for results

      detailPageAware: false,

      schema: function (x) { //schema for each individual result
        return {
          _sourceUrl: "[itemprop=url]@content",
          _sourceId: "[itemprop=url]@content",
          name: "[itemprop=name]@content",
          logo: "[itemprop=logo]@content",
          address: {
            streetAddress: "[itemprop=streetAddress]@content",
            postalCode: "[itemprop=postalCode]@content",
            addressLocality: "[itemprop=addressLocality]@content",
            addressRegion: "[itemprop=addressRegion]@content",
            addressCountry: "[itemprop=addressCountry]@content",
          },
          geo: x(function (el) {
            return el.next().find(".showtimes-theater-map").attr("href");
          }, {
            _latLon: function (el, cb) {
              var html = el.html();
              var latLonIndex = html.indexOf("latLon");
              if (latLonIndex == -1) {
                return undefined;
              }
              var snippet = html.substring(latLonIndex, html.indexOf(";", latLonIndex));
              snippet = snippet.substring(snippet.indexOf("'") + 1, snippet.lastIndexOf("'"));
              cb(undefined, snippet); //format: 40.7333, -73.7946
            }
          })

        };
      },

      mapping: {
        _type: function (val) {
          return ["MovieTheater"];
        },
        containedInPlace: function (val) {
          return nycObj.sourceId; //always grab the sourceId not the id!
        }
      },

      reducer: function (obj) {
        if (obj.geo._latLon) {
          var split = obj.geo._latLon.split(",");
          obj.geo.latitude = parseFloat(split[0]);
          obj.geo.longitude = parseFloat(split[1]);
          delete obj.geo._latLon;
        } else {
          delete obj.geo;
        }
        return obj;
      }

    }
  }
};
