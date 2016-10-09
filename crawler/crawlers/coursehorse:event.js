var _ = require("lodash");
var moment = require("moment");
var dateUtils = require("./utils/dateUtils");

module.exports = {
  _meta: {
    name: "Coursehorse Event",
    description: "Distributed Crawler for Coursehorse.com Events"
  },
  source: {
    name: "Coursehorse"
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
        return el.find("#filter-page-container > div > div > div > a[title='Next page']").attr("href");
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

          _courseName: ".title a > span",
          _sourceUrl: ".title a@href", //see notes below
          location: ".school@href",
          workFeatured: ".title a@href",
          _detail: x(".title a@href", {
            educationEvent: x("script[type='application/ld+json']", [{
              jsonLdData: "",
            }]),
          }, undefined, detailObj),
        };
      },

      mapping: {
        _type: function (val, obj) {
          return ['EducationEvent'];
        },
      },

      reducer: function (obj) {

        if(!obj._courseName) return  null;

        var educationEvents = obj._detail.educationEvent;
        delete obj._detail.educationEvent;

        for (var i=0; i<=educationEvents.length; i++) {
          //jsonLdData has the json+ld content coming from schema. Getting only those with @type=Product.
          if(educationEvents[i] && educationEvents[i].jsonLdData && educationEvents[i].jsonLdData.indexOf("\"@type\":\"Product\"")>=0) {
            educationEvents = educationEvents[i].jsonLdData;
            educationEvents = educationEvents.toString().replace('//<!--\n    ', '').replace('    //-->', '');
            educationEvents = JSON.parse(educationEvents);
            educationEvents = educationEvents.offers;
            break;
          }
        }

        //create an eduction event for each dateTime
        var items = _.compact(_.map(educationEvents, function(educationEvent){
          var id = obj.workFeatured + "--" + educationEvent.availabilityStarts;
          var item =  _.defaults({
            _sourceId: id,

            //NOTE: we leave this to be url to course instead of event. 
            //This works out ok: 
            //1. we create an ID per event which is in the end what matters for Kwhen internally. 
            //2. at same time _sourceUrl will make sure we prune correctly for detail pages.
            _sourceUrl: obj._sourceUrl,
            name: obj._courseName,
            startDate: dateUtils.transposeTimeToUTC(educationEvent.availabilityStarts),
            endDate: dateUtils.transposeTimeToUTC(educationEvent.availabilityEnds)
          },obj);

          item.fact = [];

          //just for conciceness testing. It's removed anyway
          delete item._htmlDetail;

          if(educationEvent.price){
            item.fact.push({
              name: "price",
              val: [educationEvent.priceCurrency + educationEvent.price]
            });
          }

          if (!item.fact.length) {
            delete item.fact;
          }

          return item;

        }));
        return items;
      },

      //NOTE: pruner always applies to a single item even if reducer returned an array
      pruner: function (singleResult) {
        if(!singleResult.startDate) return undefined;
        return singleResult;
      }

    }
  }
};
