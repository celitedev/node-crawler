var _ = require("lodash");
var moment = require("moment");
var dateUtils = require("./utils/dateUtils");
var ratingVal = 0;

module.exports = {
  _meta: {
    name: "Coursehorse Course",
    description: "Distributed Crawler for Coursehorse.com Courses"
  },
  source: {
    name: "Coursehorse"
  },
  entity: {
    type: "CreativeWork",
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
    // proxy: "http://localhost:5566",

    //Default Headers for all requests
    headers: {
      "Accept-Encoding": 'gzip, deflate',
      "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.71 Safari/537.36" //coursehorse rejects default user agent "node-superagent"
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
        {url:"https://coursehorse.com/nyc/classes/art/browse?page=1", dataType:'html'},
        {url:"https://coursehorse.com/nyc/classes/acting/browse?page=1", dataType:'html'},
        {url:"https://coursehorse.com/nyc/classes/cooking/browse?page=1", dataType:'html'},
        {url:"https://coursehorse.com/nyc/classes/dance/browse?page=1", dataType:'html'},
        {url:"https://coursehorse.com/nyc/classes/kids/browse?page=1", dataType:'html'},
        {url:"https://coursehorse.com/nyc/classes/life-skills/browse?page=1", dataType:'html'},
        {url:"https://coursehorse.com/nyc/classes/language/browse?page=1", dataType:'html'},
        {url:"https://coursehorse.com/nyc/classes/music/browse?page=1", dataType:'html'},
        {url:"https://coursehorse.com/nyc/classes/professional/browse?page=1", dataType:'html'},
        {url:"https://coursehorse.com/nyc/classes/tech/browse?page=1", dataType:'html'}
      ],

      nextUrlFN: function (el) {
        return el.find("#filter-page-container a[title='Next page']").attr("href");
      },

      stop: [{
        name: "zeroResults", //zeroResults
      }]
    },
    results: {
      selector: "#filter-results >div >div", //selector for results

      detailPageAware: true,

      schema: function (x, detailObj) { //schema for each individual result
        return {

          _sourceId: ".title a@href",
          _sourceUrl: ".title a@href",
          name: ".title a > span",

          _detail: x("div.body.eleven.wide.column > div", {
            description: "p.description",
            _ratingSum: {
              _rating1: "div> div > span > span > i:nth-child(1)@class",
              _rating2: "div> div > span > span > i:nth-child(2)@class",
              _rating3: "div> div > span > span > i:nth-child(3)@class",
              _rating4: "div> div > span > span > i:nth-child(4)@class",
              _rating5: "div> div > span > span > i:nth-child(5)@class",
            },
            aggregateRating: {
              ratingValue: 0,
              ratingCount: "div div.course-review.five.wide.column.right.aligned span:nth-child(2)",
            },
            _tag: [".title a@href"]
          }, undefined, detailObj),

          image: x(".image-wrapper a img", [{
            _ref: { //notice: _ref here.
              contentUrl: ".photo-block-img@data-src",
              url: ".photo-block-img@data-src",
            }
          }]),

        };
      },

      mapping: {
        subtypes: function (val, obj) {
          //pending in http://pending.schema.org/Course
          //Which is why we define it as subtypes instead of _type
          return ['Course'];
        },
        "_detail.aggregateRating.ratingCount": function (val) {
          if (val === undefined) return val;
          return +val;
        },

        "_detail._ratingSum._rating1": function (val) {
          if(val == 'icon active') {
            ratingVal++;
          }
        },
        "_detail._ratingSum._rating2": function (val) {
          if(val == 'icon active') {
            ratingVal++;
          }
        },
        "_detail._ratingSum._rating3": function (val) {
          if(val=='icon active') {
            ratingVal++;
          }
        },
        "_detail._ratingSum._rating4": function (val) {
          if(val=='icon active') {
            ratingVal++;
          }
        },
        "_detail._ratingSum._rating5": function (val) {
          if(val == 'icon active') {
            ratingVal++;
          }
        },
        "_detail.aggregateRating.ratingValue": function (val) {
          var finalRating = ratingVal;
          ratingVal = 0;
          return finalRating.toString();
        },
      },

      reducer: function (obj) {


        if(!obj._sourceUrl){
          return;
        }

        var genres = _.reduce(obj._detail._tag, function(arr, url){

          //given url we want to get 2 consequeitve tags after classes to be defined as genre
          //https://coursehorse.com/nyc/classes/professional/architecture?via=551
          if(~url.indexOf("?")){
            url = url.substring(0,url.indexOf("?"));
          }
          var urlParts = url.split("/");

          var specialCheckByType,
              arrByType = [];

          //special cases
          if(~url.indexOf("tech/by-brand")){
            specialCheckByType = "by-brand";
            arrByType = ["course_tech"];
          }else if(~url.indexOf("tech/by-subject")){
            specialCheckByType = "by-subject";
            arrByType = ["course_tech"];
          }else if(~url.indexOf("tech/popular-tech")){
            specialCheckByType = "popular-tech";
            arrByType = ["course_tech"];
          }

          var indexOfClasses = urlParts.indexOf(specialCheckByType || "classes");
          if(~indexOfClasses){
            //[indexOfClasses+1, Math.min(length-1, indexOfClasses+3)]
            var genres = arrByType.concat(_.map(urlParts.slice(indexOfClasses+1, Math.min(indexOfClasses+3, urlParts.length)), function(genre){
              return "course_"+genre;
            }));

            arr = arr.concat(genres);
          }

          return arr;
        }, []);

        if(genres.length){

          obj.fact = [{
            name: "genre",
            val: _.uniq(genres)
          }];
        }


        return obj;
      },


    }
  }
};
