var _ = require("lodash");
var config = require("../../config");

var nycUtils = require("./utils/nycUtils")({
  DEBUG_OPENINGHOURS: false
});

var nycObj = require("../../schemas/domain/_definitions/config").statics.NYC;

module.exports = {
  _meta: {
    name: "NYC Attractions",
    description: "Distributed Crawler for NYC.com Attractions"
  },
  source: {
    name: "NYC"
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
    pruneEntity: "batch",

  },
  job: {
    concurrentJobs: 1, //3 master pages * nrof detail pages per master page
    retries: 10,

    // fail job if not complete in 100 seconds. This is used because a consumer/box can fail/crash
    // In that case the job would get stuck indefinitely in 'active' state.
    // With this solution, the job is placed back on the queue, and retried according to 'retries'-policy
    // This should be WAY larger then driver.timeoutMS
    ttl: 100 * 1000, //this does need to be longer then driver timeout right?
  },
  driver: {

    //timeout on individual request.
    //Result: fail job and put back in queue as oer config.job.retries
    timeoutMS: 35 * 1000,

    //local proxy, e.g.: TOR
    proxy: 'http://' + config.proxy.host + ':' + config.proxy.port,

    //Default Headers for all requests
    headers: {
      "Accept-Encoding": 'gzip, deflate'
    },

    //cache to simple fileCache. This doesn't do any TTL or whatever. 
    doCache: false
  },
  schema: {
    version: "0.1", //version of this schema
    type: "masterDetail", //signifies overall type of scroll. For now: only 'masterDetail'
    requiresJS: false, //If true, use PhantomJS
    seed: {
      disable: false, //for testing. Disabled nextUrl() call

      seedUrls: [{url:"http://www.nyc.com/search/find.aspx?secid=2&pagefrom=1", dataType:'html'}],

      nextUrlFN: function (el) {
        return (el.find("body > div.container.body-container > div.col-md-9.col-md-push-3.col-sm-12.records > div > a:nth-child(2)").attr("href")||
        el.find("body > div.container.body-container > div.col-md-9.col-md-push-3.col-sm-12.records > div > a").attr("href"));
      },

      stop: [{
        name: "zeroResults", //zeroResults
      }]
    },
    results: {
      selector: ".recordlist > li", //selector for results
      detailPageAware: true,

      schema: function (x, detailObj) { //schema for each individual result
        return {
          _sourceUrl: "> a@href",
          _sourceId: "> a@href",
          image: "img.thumb@src",
          _detail: x("> a@href", {
            name: "h1",
            _descFull: ".editorial-and-map .ellipsis-full",
            _descFallback: ".editorial-and-map > p",
            geo: {
              latitude: "[property='place:location:latitude']@content",
              longitude: "[property='place:location:longitude']@content",
            },
            address: {
              streetAddress: '[property="business:contact_data:street_address"]@content',
              postalCode: '[property="business:contact_data:postal_code"]@content',
              addressLocality: '[property="business:contact_data:locality"]@content',
              addressRegion: '[property="business:contact_data:region"]@content',
              addressCountry: '[property="business:contact_data:country_name"]@content',
              neighborhood: "#pnlNeighborhood h3",
              telephone: '[property="business:contact_data:phone_number"]@content',
            },

            sameAs: ".rating address > a@href", //own website

            _otherPopular: ".otherrecords h3", //detour to get to genre

            //TODO: we're mapping an editorialRating to aggregateRating. 
            //Clearly this isn't 100% correct
            aggregateRating: [".category > .starlite"], //needs post mapping

            _factRaw: function ($, cb) {

              var facts = {};
              $(".blackbox .rating").each(function () {
                _.extend(facts, nycUtils.getFactsObject($(this).html()));
              });

              cb(null, facts);
            },

            // subtypes: .... TODO
          }, undefined, detailObj)
        };
      },

      //mapping allow function(entire obj) || strings or array of those
      //returning undefined removes them
      mapping: {
        containedInPlace: function (val) {
          return nycObj.sourceId; //always grab the sourceId not the id!
        },
        _type: function (val) {
          return ["TouristAttraction"];
        },
        description: function (val, obj) {
          return obj._detail._descFull || obj._detail._descFallback;
        },
        image: function (imgUrl) {
          if (!imgUrl) {
            return undefined;
          }

          //placeholder
          if (~imgUrl.indexOf("icon_attractions")) {
            return undefined;
          }

          //from thumb to large file
          //NOPE since not all thumbs have a larger variant.. Hmm
          // imgUrl = imgUrl.replace("thumb", "front");

          return {
            _ref: { //notice: _ref here.
              contentUrl: imgUrl,
              url: imgUrl,
            }
          };

        },
        "_detail.geo": function (val) {
          if (!val) return undefined;
          if (!val.latitude || !val.longitude) return undefined;
          return {
            latitude: parseFloat(val.latitude),
            longitude: parseFloat(val.longitude)
          };
        },
        "_detail.sameAs": function (val) {
          //lowercase url so it passes isUrl check
          if (!val) return val;
          var url = val.toLowerCase();
          if (url.lastIndexOf(".") === url.length - 1) { //formatting error: url sometimes ends in '.'
            url = url.substring(0, url.length - 1);
          }
          return url;
        },
        "_detail.address.neighborhood": function mapNeighborhood(val, obj) {

          //East Village Description -> East Village
          if (!val) return val;
          var needle = "Description";
          var index = val.indexOf(needle);
          if (index === -1) return val;
          return val.substring(0, index).trim();
        },

        "_detail.aggregateRating": function mapRating(val) {
          if (!val) {
            return val;
          }
          //rating = the number or .starlite tags
          return {
            ratingValue: "" + val.length //needs to be string
          };
        }

      },

      reducer: function (obj) {

        // console.log(obj._type);
        //Create 'fact'-attribute by combining all the separate facts we've collected
        var factArr = obj.fact = obj.fact || [];


        var factsRaw = obj._detail._factRaw;

        var factsWeTrack = [
          "This Week&apos;s Hours", //mapped
          'Editorial Rating', //already mapped above
          'Featured On', //not mapped
          "Admission And Tickets" //not mapped
        ];

        var factsWeMissed = _.difference(_.keys(factsRaw), factsWeTrack);
        if (factsWeMissed.length) {
          console.log("FACTS WE MISSED", factsWeMissed);
        }

        if (obj._detail._otherPopular) {
          var genre = obj._detail._otherPopular.substring("Other".length);
          genre = genre.substring(0, genre.length - "Attractions".length).trim();
          if (genre) { //sometimes it says :"other attractions" in case we skip
            obj.subtypes = [genre];
          }
        }

        if (factsRaw["This Week&apos;s Hours"]) {
          var openingHours = nycUtils.processOpeninghoursTotal(factsRaw["This Week&apos;s Hours"]);
          if (openingHours) {
            obj.openingHoursSpecification = openingHours;
          }
        }

        ///////////////////////
        //NOTE: 
        // Validation error when not passing an array for fact.val 
        //Thought we auto-moved from singlevalued to array if isMulti=true? 
        if (!obj.fact.length) {
          delete obj.fact;
        }
        return obj;
      },

      pruner: function (result) {

        if (!result._detail.name || ~result._detail.name.indexOf("CLOSED")) {
          //NYC.com way of denoting place is closed. Let's skip these.
          return undefined;
        }

        if (result.subtypes) {

          //these are events. Skip
          if (~result.subtypes.indexOf("parades & festivals")) {
            return undefined;
          }

          //weird. Skip
          if (~result.subtypes.indexOf("dance")) {
            return undefined;
          }
        }


        if (!result._detail.address.streetAddress) {
          //some attractions don't have a streetaddress, such as governer's island: 
          //http://www.nyc.com/arts__attractions/governors_island.1192384/
          //For now let's skip these.
          return undefined;
        }
        return result;
      }
    }
  }
};
