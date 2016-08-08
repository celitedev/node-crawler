var _ = require("lodash");
var moment = require("moment");
var dateUtils = require("./utils/dateUtils");

module.exports = {
  _meta: {
    name: "Summer Olympics 2016 Schedule",
    description: "Crawler for Summer Olympics 2016 Schedule on ESPN.com"
  },
  source: {
    name: "ESPN"
  },
  entity: {
    type: ["Event", "SportsEvent"],
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
    concurrentJobs: 2,
    retries: 5,

    // fail job if not complete in 100 seconds. This is used because a consumer/box can fail/crash
    // In that case the job would get stuck indefinitely in 'active' state.
    // With this solution, the job is placed back on the queue, and retried according to 'retries'-policy
    ttl: 100 * 1000,
  },
  driver: {

    //timeout on individual request.
    //Result: fail job and put back in queue as oer config.job.retries
    timeoutMS: 40 * 1000, //40 sec

    //local proxy, e.g.: TOR
    //proxy: "http://localhost:5566",

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
        //here we have a fixed number of days, so we're just going to go from the first day to the last in a hard coded array, less code to test
        return [
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160806', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160807', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160808', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160809', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160810', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160811', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160812', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160813', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160814', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160815', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160816', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160817', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160818', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160819', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160820', dataType:'html'},
          {url:'http://www.espn.com/olympics/summer/2016/schedule/_/date/20160821', dataType:'html'},
        ]
      }
    },
    results: {
      selector: "table.schedule > tbody > tr", //selector for results
      detailPageAware: false,
      schema: function (x, detailObj) { //schema for each individual result
        //interesting challenge as each result does not have a url, all other examples there
        // is a url but they are unique, how will it work when the urls are all the same for each day?
        //console.log("x", x);
        var _sourceUrl = detailObj.url;
        return {
          _name: "td:nth-of-type(4)@html", //4th td in the tr
          _sport: "td:nth-of-type(3) a@html",
          startDate: "td:nth-of-type(2)@data-date"
        };
      },

      mapping: { //manipulate the attributes of each result
        _type: function(){
          return ['Event','SportsEvent']
        },
        image: function(){
          return {
            _ref: {
              contentUrl: "https://upload.wikimedia.org/wikipedia/en/thumb/d/df/2016_Summer_Olympics_logo.svg/812px-2016_Summer_Olympics_logo.svg.png",
              url: "https://upload.wikimedia.org/wikipedia/en/thumb/d/df/2016_Summer_Olympics_logo.svg/812px-2016_Summer_Olympics_logo.svg.png"
            }
          }
        },
        _sourceUrl: function(val,obj,detailData){
          return detailData.url;
        },
        _sourceId: function(val, obj, detailData){
          return detailData.url + "_" + obj._sport + "_" + obj._name;
        },
        name: function(val, obj){
          return "2016 Summer Olympics: " + obj._sport + " - " + obj._name.replace("&apos;", "'");
        }
      },
      //Reducer is called after all fieldMappings are called,
      //and just before postsMappings are called.
      //
      //You can use this to do a complete custom mapping.
      //Also going from 1 to several items is supported. This therefore implements #31.
      //reducer: function (doc) {
      //  console.log("HERE again", doc);
      //
      //   var showings = [];
      //
      //   _.each(doc.movie, function (movie) {
      //     _.each(movie.screeningEvent, function (screeningEvent) {
      //
      //       //Fandango correctly uses isoTime with correct tz -> translate to UTC
      //       var time = dateUtils.transposeTimeToUTC(screeningEvent.startDate);
      //
      //       //Id is required so make it up.
      //       //NOTE: we can't use _sourceId = _sourceUrl, since _sourceUrl doesn't
      //       //always exist.
      //       var locationName = doc.locationName,
      //         movieName = movie.movieName;
      //
      //       var id = (movieName + " -- " + locationName + " -- " + time);
      //
      //       showings.push({
      //         _sourceUrl: screeningEvent._sourceUrl, //doesn't always exist
      //         _sourceId: id,
      //         name: movieName + " @ " + locationName,
      //         startDate: time,
      //         workPresented: movie.workPresented,
      //         location: doc.location
      //       });
      //     });
      //   });
      //
      //   return showings;
      //},
      //
      // postMapping: {
      //   "_sourceUrl": function (sourceUrl) {
      //     //only keep urls if they actually point somewhere
      //     //I.e.: outdated events don't have real urls
      //     if (sourceUrl.lastIndexOf("#") === sourceUrl.length - 1) {
      //       return undefined;
      //     }
      //     return sourceUrl;
      //   },
      //   location: function (location) {
      //
      //     //NOT: http://www.fandango.com/amcloewslincolnsquare13_aabqi/theaterpage?date=01%2f24%2f2016"
      //     //YES: http://www.fandango.com/amcloewslincolnsquare13_aabqi/theaterpage
      //     var needle = location.lastIndexOf("?");
      //     if (needle !== -1) {
      //       return location.substring(0, needle);
      //     }
      //     return location;
      //   }
      // },
    }
  }
};
