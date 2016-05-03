var _ = require("lodash");

var typesGlobal = [];


var openinghoursStats = {
  has: 0,
  success: 0,
  failParse: 0,
  failOrder: 0
};

function getFactsObject(htmlFragment) {

  //later extra 0 and 2. 1 is used for matching div which might have class attached but we don't need
  //to extract it.
  var re = /<h4>(.*?)<\/h4><div(.*?)>(.*?)<\/div>/g,
    match, params = {};

  while (match = re.exec(htmlFragment)) {
    params[match[1]] = match[3];
  }
  return params;
}

//crawlSchema for: 
//source: Eventful
//type: events
module.exports = {
  _meta: {
    name: "NYC restaurants",
    description: "Distributed Crawler for NYC.com Restaurants"
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
    concurrentJobs: 3, //10 master pages * nrof detail pages per master page
    retries: 5,
    ttl: 40 * 1000,
  },
  driver: {

    //timeout on individual request. 
    //Result: fail job and put back in queue as oer config.job.retries
    timeoutMS: 40000,

    //local proxy, e.g.: TOR
    proxy: "socks://localhost:5566",

    //Default Headers for all requests
    headers: {
      "Accept-Encoding": 'gzip, deflate'
    },

    //cache to simple fileCache. This doesn't do any TTL or whatever. 
    //
    doCache: true
  },
  schema: {
    version: "0.1", //version of this schema
    type: "masterDetail", //signifies overall type of scroll. For now: only 'masterDetail'
    requiresJS: false, //If true, use PhantomJS
    seed: {
      disable: false, //for testing. Disabled nextUrl() call

      //may be a string an array or string or a function producing any of those
      seedUrls: function () {
        var urls = [];
        for (var i = 0; i < 1; i++) {
          urls.push("http://www.nyc.com/search/find.aspx?secid=6&pagefrom=" + (i * 20 + 1));
        }
        return urls;
      },

      nextUrlFN: function (el) {
        return el.find(".searchnav > a:last-child").attr("href");
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
          _factReservationOpentable: ".btngroups .reservation@href",
          _detail: x("> a@href", {
            name: "h1",
            _descFull: ".editorial-and-map .ellipsis-full",
            _descFallback: ".editorial-and-map > p",
            geo: {
              latitude: "[property='place:location:latitude']@content",
              longitude: "[property='place:location:longitude']@content",
            },
            address: {
              streetAddress: '[property="restaurant:contact_info:street_address"]@content',
              postalCode: '[property="restaurant:contact_info:postal_code"]@content',
              addressLocality: '[property="restaurant:contact_info:locality"]@content',
              addressRegion: '[property="restaurant:contact_info:region"]@content',
              addressCountry: '[property="restaurant:contact_info:country_name"]@content',
              neighborhood: "#pnlNeighborhood h3",
              telephone: ".rating address" //needs post mapping
            },

            sameAs: ".rating address > a@href", //own website

            //TODO: we're mapping an editorialRating to aggregateRating. 
            //Clearly this isn't 100% correct
            aggregateRating: [".category > .starlite"], //needs post mapping

            _factRaw: function ($, cb) {

              var facts = {};
              $(".blackbox .rating").each(function () {
                _.extend(facts, getFactsObject($(this).html()));
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
        _type: function (val) {
          return ["LocalBusiness", "Restaurant"];
        },
        description: function (val, obj) {
          return obj._detail._descFull || obj._detail._descFallback;
        },
        image: function (imgUrl) {
          if (!imgUrl) {
            return undefined;
          }

          //placeholder
          if (~imgUrl.indexOf("icon_restaurants")) {
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

        "_detail.address.telephone": function mapTel(val) {
          //lots of text. Need to only extract tel
          if (!val) return undefined;

          //Regex: http://stackoverflow.com/questions/16699007/regular-expression-to-match-standard-10-digit-phone-number
          var telArr = val.match(/(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g);
          if (!telArr) return undefined;
          return telArr[0];
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

        //Create 'fact'-attribute by combining all the separate facts we've collected
        var factArr = obj.fact = obj.fact || [];

        //a link to opentable reservation
        if (obj._factReservationOpentable) {
          //http://www.opentable.com/single.aspx?rid=105373&ref=148
          //remove &ref, which probably is NYC affiliate id
          var urlOpenTable = obj._factReservationOpentable;
          urlOpenTable = urlOpenTable.substring(urlOpenTable, urlOpenTable.lastIndexOf("&")).trim();

          if (urlOpenTable) {
            factArr.push({
              name: "urlOpenTable",
              val: [urlOpenTable]
            });
          }
        }

        //ALL TYPES SEEN ON NYC RESTAURANTS
        // 'Info',
        // 'Editorial Rating',
        // 'Category', //WE MAP THIS
        // 'Price',    //WE MAP THIS
        // 'Ambience', //WE MAP THIS
        // 'Payment',  //WE MAP THIS
        // 'This Week&apos;s Hours',
        // 'Nearby Subway',
        // 'Featured On';
        // 
        var factsRaw = obj._detail._factRaw;
        if (factsRaw.Category) {
          factArr.push({
            name: "servesCuisine", //http://schema.org/servesCuisine
            val: [factsRaw.Category]
          });
        }
        if (factsRaw.Price) {
          //priceCat, e.g: $$$ -> 3
          var priceRange = "" + factsRaw.Price.substring(3, factsRaw.Price.indexOf("<")).length;

          factArr.push({
            name: "priceRange", //http://schema.org/priceRange
            val: [priceRange]
          });
        }
        if (factsRaw.Ambience) {
          factArr.push({
            name: "ambience",
            val: [factsRaw.Ambience]
          });
        }
        if (factsRaw.Payment) {
          factArr.push({
            name: "paymentAccepted", //http://schema.org/paymentAccepted
            val: [factsRaw.Payment]
          });
        }

        if (factsRaw["This Week&apos;s Hours"]) {

          var mealTypes = {
            dinner: "dinner",
            brunch: "brunch",
            lunch: "lunch",
            breakfast: "breakfast",
            "bar &amp; lounge": "bar / lounge",
            "bar": "bar / lounge",
            "lounge": "bar / lounge",
            "late": "late",
            "late menu": "late",
          };


          var dayMapping = {
            mon: 0,
            tue: 1,
            wed: 2,
            thu: 3,
            fri: 4,
            sat: 5,
            sun: 6,
            dai: [0, 1, 2, 3, 4, 5, 6] //daily
          };

          //lowercase -> trim -> remove spaces next to '-'
          var openRaw = factsRaw["This Week&apos;s Hours"]
            .toLowerCase()
            .trim()
            .replace(/( )+to( )+/g, '-') //change word 'to' -> '-'
            .replace(/( )+from( )+/g, '#') //change word 'from' -> '#'
            .replace(/( )*-( )*/g, '-')
            .replace(/&(.){2,7};/g, "#") //remove special characters. Assume these are separators
            .replace(/<[^>]*>/g, "#") //change all tags  -> #
            .replace(/:( )+/g, "#") //change colon plus at least 1 space -> #
            .replace(/:#/g, "#")
            .replace(/am( )+/g, "am#") //am (pm) followed by space injects a separator.
            .replace(/pm( )+/g, "pm#")
            .replace(/( )*am( )*/g, "am") //remove space around am
            .replace(/( )*pm( )*/g, "pm")
            .replace(/( )*#( )*/g, "#")
            .replace(/\#+/g, '#') //change multiple ## -> #
            .replace(/^#/g, '') //remove first #
            .replace(/#$/g, ''); //... and last

          var openingArr = openRaw.split("#");


          var openingDayParser = {
            //find day range
            //PRE: check if dayIndexStart exists
            findDayRange: function (el) {
              var dayIndexStart = dayMapping[el.substring(0, 3)]; //Exists as checked upstream
              var dayRange;
              if (~el.indexOf("-")) { //e.g.: mon-sun
                var dayIndexStop = dayMapping[el.substring(4, 7)];
                if (_.isArray(dayIndexStart)) {
                  throw new Error("found date-range '-' but dateStart is already a day-array");
                }
                if (dayIndexStop === undefined) {
                  throw new Error("dayRange end not found");
                }
                if (_.isArray(dayIndexStop)) {
                  throw new Error("found date-range '-' but dayIndexStop is already a day-array");
                }

                //create dayRange using [begin, end]
                if (dayIndexStart > dayIndexStop) {
                  dayIndexStop += 7; //mod
                }

                dayRange = [];
                for (var i = dayIndexStart; i <= dayIndexStop; i++) {
                  dayRange.push(i % 7);
                }
              } else { //e.g: 'monday' or 'daily'
                dayRange = _.isArray(dayIndexStart) ? dayIndexStart : [dayIndexStart];
              }
              return dayRange;
            }
          };


          //We probably have pairs of day (or day-ranges) + a time-range
          function processOpeninghours(arr) {

            if (!arr.length) return [];

            var el = arr.shift();

            var thisTerm;

            if (mealTypes[el] !== undefined) { //find mealtype
              thisTerm = "mealType";
            } else if (dayMapping[el.substring(0, 3)] !== undefined) { //fine dayrange
              thisTerm = "dayrange";
            } else if (~el.indexOf("am-") || ~el.indexOf("pm-")) { //find timerange
              thisTerm = "timerange";
            } else {
              var err = new Error("no parser found: " + el);
              err.status = "NO_PARSER";
              throw err;
            }

            //continue processing
            return [thisTerm].concat(processOpeninghours(arr));
          }

          //Generally we split into 2 distinct groups: 
          //1. indication of mealtype
          //2. NO indication of mealtype

          try {
            openinghoursStats.has++;
            var result = processOpeninghours(_.clone(openingArr));

            var lastTerm;
            var errMsg;
            _.each(result, function (term) {

              if (!lastTerm) { //init
                lastTerm = term;
                return;
              }

              if (lastTerm === "mealType" && term === "mealType") {
                errMsg = errMsg || "mealType cannot directly follow mealtype: " + openingArr;
              } else if (lastTerm === "timerange" && term === "timerange") {
                errMsg = errMsg || "timerange cannot directly follow timerange: " + openingArr;
              } else if (lastTerm === "mealType" && term === "timerange") {
                errMsg = errMsg || "timerange cannot directly follow mealType: " + openingArr;
              }
              lastTerm = term;
            });

            if (errMsg) {
              var error = new Error(errMsg);
              error.status = "ERROR_IN_ORDER";
              throw error;
            }

            openinghoursStats.success++;

          } catch (err) {
            switch (err.status) {
              case "ERROR_IN_ORDER":
                // console.log(err.message);
                openinghoursStats.failOrder++;
                break;
              case "NO_PARSER":
                // console.log(err.message);
                openinghoursStats.failParse++;
                break;
              default:
                throw err; //uncaught
            }
          }
        }

        // console.log(openinghoursStats);




        //NOTE: opens
        // obj.openingHoursSpecification = [{
        //   opens: "8AM", //NOTE: of dataType=time which is not validated (assumes time)
        //   closes: "10PM",
        //   dayOfWeek: "MON",
        //   // validFrom: {},
        //   // validThrough: {},
        //   hoursPayload: "dinner"
        // }];


        ///////////////////////
        //NOTE: 
        // Validation error when not passing an array for fact.val 
        //Thought we auto-moved from singlevalued to array if isMulti=true 

        if (!obj.fact.length) {
          delete obj.fact;
        }
        return obj;
      },

      pruner: function (result) {
        if (!result._detail.address.streetAddress) {
          //markets might not have streetAddress. 
          //We skip these.
          return undefined;
        }

        if (~result._detail.name.indexOf("CLOSED")) {
          //NYC.com way of denoting restaurant is closed. Let's skip these.
          return undefined;
        }

        return result;
      }
    }
  }
};
