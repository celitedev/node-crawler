var _ = require("lodash");
var URL = require("url");

var nycObj = require("../../schemas/domain/_definitions/config").statics.NYC;

//crawlSchema for: 
//source: Eventful
//type: events
module.exports = {
  _meta: {
    name: "Yelp Places",
    description: "Distributed Crawler for Yelp.com Places"
  },
  source: {
    name: "Yelp"
  },
  entity: {
    type: ["PlaceWithOpeninghours", "LocalBusiness"],
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
    timeoutMS: 40000,

    //local proxy, e.g.: TOR
    // proxy: "socks://localhost:5566",

    //Default Headers for all requests
    headers: {
      "Accept-Encoding": 'gzip, deflate'
    }
  },
  schema: {
    version: "0.1", //version of this schema
    type: "masterDetail", //signifies overall type of scroll. For now: only 'masterDetail'
    requiresJS: false, //If true, use PhantomJS
    seed: {
      disable: false, //for testing. Disabled nextUrl() call

      seedUrls: [{url:"http://www.yelp.com/search?find_loc=New+York,+NY,+USA&cflt=restaurants&start=0", dataType:'html'}],

      nextUrlFN: function (el) {
        return el.find(".prev-next.next").attr("href");
      },
    },
    headers: { //Default Headers for all requests
      "Accept-Encoding": 'gzip, deflate'
    },
    results: {
      selector: ".search-results > li.regular-search-result", //selector for results

      //does detailPage pruning. For this to work: 
      //- _sourceUrl should exist and should equal detail page visisted
      //- 'detail page visited' is the page on which the detailObj is attached.
      detailPageAware: true,

      schema: function (x, detailObj) { //schema for each individual result
        return {
          _sourceUrl: ".biz-name@href",
          _sourceId: ".biz-name@href",
          _detail: x(".biz-name@href", {

            name: ".biz-page-title",

            geo: {
              latitude: ".lightbox-map@data-map-state", //can't directly get to latitude but this is done in post-process
              longitude: ".lightbox-map@data-map-state",
            },

            address: {
              streetAddress: "[itemprop=streetAddress]",
              postalCode: "[itemprop=postalCode]",
              neighborhood: ".neighborhood-str-list",
              crossStreets: ".cross-streets",
              addressLocality: "[itemprop=addressLocality]",
              addressRegion: "[itemprop=addressRegion]",
              telephone: "[itemprop=telephone]",
            },


            sameAs: ".biz-website > a@href", //weird there's no other place for website?

            aggregateRating: {
              ratingValue: "[itemprop=ratingValue]@content",
              reviewCount: "[itemprop=reviewCount]",
            },

            //Works, but bit costly
            //TODO: in laer crawl possibly. Probably should 
            //fetch nice images from place website instead: nicer and no copyright issues.
            // images: x(".showcase-footer-links a@href", ".photo-box-grid > li", [{
            // 	url: "> img@src",
            // 	alt: "> img@alt",
            // 	// cc
            // }]),


            _openingHours: x(".hours-table tr", [{
              dayOfWeek: "> th",
              range: "> td",
            }]),

            priceRange: ".price-description",

            //contains _type (e.g.: Restaurants) as well as genres / cuisines, etc.
            //let's post process this
            _categories: x(".mapbox-container > [itemtype='http://data-vocabulary.org/Breadcrumb'] > a > span", ["@text"]),

            _tags: x(".category-str-list", ["a"]),

            fact: x(".short-def-list dl", [{
              name: "> dt",
              val: "> dd"
            }]),

          }, undefined, detailObj)
        };
      },

      //mappings allow function(entire obj) || strings or array of those
      //returning undefined removes them
      //
      //REMEMBER: obj._htmlDetail is always there for you should you need access to raw power.
      mapping: {

        containedInPlace: function (val) {
          return nycObj.sourceId; //always grab the sourceId not the id!
        },
         
        //fetch based on urlencoded json-stringified data-attrib
        "_detail.geo.latitude": [
          function (latitude, obj) {
            try {
              return JSON.parse(decodeURIComponent(latitude)).center.latitude;
            } catch (e) {
              //skip: caught by json schema validator
            }
          },
          "float"
        ],

        //fetch based on urlencoded json-stringified data-attrib
        "_detail.geo.longitude": [
          function (longitude, obj) {
            try {
              return JSON.parse(decodeURIComponent(longitude)).center.longitude;
            } catch (e) {
              //skip: caught by json schema validator
            }
          },
          "float"
        ],

        //parse the url from a redirect
        "_detail.sameAs": function (url, obj) {
          if (!url) {
            return undefined;
          }
          var absUrl = "http://yelp.com" + url;
          var urlObj = URL.parse(absUrl, true);
          return urlObj.query.url;
        },

        //from thumb to complete images
        // "detail.images": function(obj) {
        // 	return _.map(obj.detail.images, function(v) {
        // 		var url = v.url.substring(0, v.url.lastIndexOf("/")) + "/o.jpg";
        // 		return {
        // 			url: url,
        // 			alt: v.alt
        // 		};
        // 	});
        // },

        "_detail.aggregateRating.reviewCount": "int"
      },

      reducer: function (obj) {

        //combine yelp tags and yelp categories.
        var tags = obj._detail._tags || [];
        tags = _.uniq(tags.concat(obj._detail._categories || []));

        //It's important to get the type straight now, to allow added properties. 
        //The rest (tags, facts) are stored to those catch-all properties. 
        //Later on we can translate these tags and facts to more semantic-rich structures such as `subtypes`
        var yelpTypes = {
          "Restaurants": "Restaurant",
          "Pubs": "BarOrPub",
          "Bars": "BarOrPub"
        };

        //store Schema.org types as inferred from Yelp
        obj._type = _.compact(_.map(yelpTypes, function (v, k) {
          if (tags.indexOf(k) !== -1) {
            return v;
          }
        }));
        if (!obj._type.length) {
          delete obj._type;
        }

        //store remainder of intersect(categories, tags) -> tag
        obj._detail.tag = _.difference(tags, _.keys(yelpTypes));

        if (!obj._detail.tag.length) {
          delete obj._detail.tag;
        }

        //add _openingHours to `fact`
        obj._detail.fact = obj._detail.fact || [];
        if (obj._detail._openingHours) {
          obj._detail.fact.push({
            name: "openingHours",
            val: obj._detail._openingHours
          });
        }
        if (!obj._detail.fact.length) {
          delete obj._detail.fact;
        }

        return obj;
      }
    }
  }
};
