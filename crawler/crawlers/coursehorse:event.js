var _ = require("lodash");
var moment = require("moment");
var dateUtils = require("./utils/dateUtils");
var config = require("../../config");


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

    concurrentJobs: 1, //TODO JIM

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
    //proxy: 'http://' + config.proxy.host + ':' + config.proxy.port,

    //Default Headers for all requests
    headers: {
      "Accept-Encoding": 'gzip, deflate',
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language":"en-US,en;q=0.8",
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
      disable: true, //for testing. Disabled nextUrl() call //TODO JIM

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
        name: "zeroResults",
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
            educationEvent: x("div#new-course-start-dates-layout tr.section-row", [{
              id: "@data-section-id",
              startDate: ".ui.radio.checkbox label",
              times: "td:nth-child(2)",
              price: "td:nth-child(5)"
            }]),
            otherSections: x("div#new-course-start-dates-layout tr.other-sections", [{
              classes: "@class",
              startDate: "td:nth-child(1)",
              times: "td:nth-child(2)",
              price: "td:nth-child(5)"
            }])
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

        var otherSections = obj._detail.otherSections;
        delete obj._detail.otherSections;

        //create an eduction event for each dateTime
        var items = _.compact(_.map(educationEvents, function(educationEvent){
          var endDate;

          var myOtherSections = _.filter(otherSections, function(otherSection){
            return otherSection.classes.includes(educationEvent.id);
          });
          var startDateParts = educationEvent.startDate.split(" ");
          var startYear = moment().year();
          var monthNow = moment().month();
          if (monthNow > moment().month(startDateParts[1]).format("MMM")) {
            startYear = (moment().year() + 1);
          }
          var startDate = moment.utc(startDateParts[1] + " " + startDateParts[2] + " " + startYear + " " + educationEvent.times.split("-")[0].replace("pm", " pm").replace("am", " am").trim(), "MMM DD YYYY HH:mm a");
          var startTzOffset = startDate.clone().tz("America/New_York").utcOffset();
          startDate.add(-startTzOffset, 'minutes');
          startDate.utcOffset(startTzOffset);

          var endDateParts;
          var endTime;
          if( myOtherSections.length > 0 ){
            var lastSection = myOtherSections[myOtherSections.length - 1];
            endDateParts = lastSection.startDate.split(" ");
            endTime = lastSection.times.split("-")[1].replace("pm", " pm").replace("am", " am");
          } else {
            endDateParts = educationEvent.startDate.split(" ");
            endTime = educationEvent.times.split("-")[1].replace("pm", " pm").replace("am", " am");
          }
          var endYear = moment().year();
          if (monthNow > moment().month(endDateParts[1]).format("MMM")) {
            endYear = (moment().year() + 1);
          }
          endDate = moment.utc(endDateParts[1] + " " + endDateParts[2] + " " + endYear + " " + endTime, "MMM DD YYYY HH:mm a" );
          var endTzOffset = endDate.clone().tz("America/New_York").utcOffset();
          endDate.add(-endTzOffset, 'minutes');
          endDate.utcOffset(endTzOffset);

          var id = obj.workFeatured + "--" + educationEvent.id;
          var item =  _.defaults({
            _sourceId: id,

            //NOTE: we leave this to be url to course instead of event. 
            //This works out ok: 
            //1. we create an ID per event which is in the end what matters for Kwhen internally. 
            //2. at same time _sourceUrl will make sure we prune correctly for detail pages.
            _sourceUrl: obj._sourceUrl,
            name: obj._courseName,
            startDate: dateUtils.transposeTimeToUTC(startDate.format()),
            endDate: dateUtils.transposeTimeToUTC(endDate.format())
          },obj);

          item.fact = [];

          //just for conciceness testing. It's removed anyway
          delete item._htmlDetail;

          if(educationEvent.price){
            item.fact.push({
              name: "price",
              val: [educationEvent.price]
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
