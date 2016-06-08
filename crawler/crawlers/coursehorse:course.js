var _ = require("lodash");
var moment = require("moment");
var dateUtils = require("./utils/dateUtils");

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
    doCache: true
  },
  schema: {
    version: "0.1", //version of this schema
    type: "masterDetail", //signifies overall type of scroll. For now: only 'masterDetail'
    requiresJS: false, //If true, use PhantomJS
    seed: {
      disable: false, //for testing. Disabled nextUrl() call

      seedUrls: function () {
        var urls = [];
        
        var i;

        //art
        for (i = 1; i < 400; i++) { 
          urls.push("https://coursehorse.com/nyc/classes/art?page=" + i);
        }

        //acting
        for (i = 1; i < 90; i++) { 
          urls.push("https://coursehorse.com/nyc/classes/acting?page=" + i);
        }
        
        //cooking
        for (i = 1; i < 400; i++) { 
          urls.push("https://coursehorse.com/nyc/classes/cooking?page=" + i);
        }
        
        //dance
        for (i = 1; i < 80; i++) { 
          urls.push("https://coursehorse.com/nyc/classes/dance?page=" + i);
        }
        
        //kids
        for (i = 1; i < 220; i++) { 
          urls.push("https://coursehorse.com/nyc/classes/kids?page=" + i);
        }
        
        //life-skills
        for (i = 1; i < 270; i++) { 
          urls.push("https://coursehorse.com/nyc/classes/life-skills?page=" + i);
        }
        
        //language
        for (i = 1; i < 60; i++) { 
          urls.push("https://coursehorse.com/nyc/classes/language?page=" + i);
        }
        
        //music
        for (i = 1; i < 50; i++) { 
          urls.push("https://coursehorse.com/nyc/classes/music?page=" + i);
        }

        //professional
        for (i = 1; i < 300; i++) { 
          urls.push("https://coursehorse.com/nyc/classes/professional?page=" + i);
        }
        
        //tech
        for (i = 1; i < 330; i++) { 
          urls.push("https://coursehorse.com/nyc/classes/tech?page=" + i);
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
      selector: ".article-block", //selector for results

      detailPageAware: true,

      schema: function (x, detailObj) { //schema for each individual result

        return {

          _sourceId: ".title@href", 
          _sourceUrl: ".title@href", 
          name: ".title > span",

          _detail: x(".title@href", {
            description: "[itemprop=description]",
            aggregateRating: {
              ratingValue: "[itemprop=ratingValue]@content",
              ratingCount: "[itemprop=ratingCount]",
            },
            _tag: ["#sidebar h2[data-ga-action] > a@href"] 
          }, undefined, detailObj),

          image: x(".photo-block", [{
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
            var genres = arrByType.concat(_.map(urlParts.slice(indexOfClasses+1, Math.min(indexOfClasses+3, urlParts.length-1)), function(genre){
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
