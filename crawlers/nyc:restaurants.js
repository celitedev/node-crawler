var _ = require("lodash");

var typesGlobal = [];


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

        // OPENINGHOURS Daily: 10:00am-10:30pm
        // OPENINGHOURS BREAKFAST<br>Monday &#x2013; Friday<br>7:30 am &#x2013; 11:30 am<br>Saturday &amp; Sunday<br>8:00 am &#x2013; 10:00 am<br><br><b>LUNCH</b><br>Monday &#x2013; Friday<br>12: 00 pm &#x2013; 3:00 pm<br><br>APR&#xC8;S-MIDI<br>3:00 pm &#x2013; 5:30 pm daily<br><br><b>DINNER</b><br>Sunday &#x2013; Wednesday<br>5:30 pm &#x2013; 11:00 pm<br>Thursday &#x2013; Saturday<br>5:30 pm &#x2013; 12:00 am<br><br>WEEKEND <b>BRUNCH</b><br>Saturday &amp; Sunday<br>10:00 am &#x2013; 3:00 pm
        // OPENINGHOURS Daily: 5:30pm-2:00am
        // OPENINGHOURS <b>LUNCH</b><br>Mon-Fri: 11:30am-3:00pm<br>Sat-Sun 11:30am-4:00pm<br><br><b>DINNER</b><br>Mon-Thu: 5:00pm-11:00pm<br>Fri-Sat: 5:00pm-12:00am<br>Sun: 5:00pm-10:00pm
        // OPENINGHOURS Daily: 11:00am-11:30pm
        // OPENINGHOURS <b>LUNCH</b><br>Mon-Fri: 11:00am-4:00pm<br><br><b>DINNER</b><br>Sun-Thu: 4:00pm-11:00pm<br>Fri-Sat: 4:00pm-12:00am
        // OPENINGHOURS BREAKFAST<br>Daily: 6:30am-10:30am<br><br><b>LUNCH</b><br>Mon-Fri: 11:30am-2:00pm<br><br><b>BRUNCH</b><br>Sat-Sun: 11:30am-2:00pm<br><br><i>Afternoon Tea</i><br>Daily: 2:00pm-5:00pm
        // OPENINGHOURS Tue-Thu: 12:00pm-11:00pm<br>Friday: 12:00pm-12:00am<br>Saturday: 5:00pm-12:00am<br>Sunday: 5:00pm-11:00pm<br><br><b>BRUNCH</b><br>Sat-Sun: 11:00am-4:00pm
        // OPENINGHOURS Mon-Thu: 5:00pm-11:30pm<br>Fri-Sun: 5:00pm-12:00am
        // OPENINGHOURS <b>LUNCH</b><br>Daily: 11:30am-3:30pm<br><br><b>DINNER</b><br>Sun-Thu: 6:00pm-12:00am<br>Fri-Sat 5:00pm-1:00am<br><br><i>Bar</i><br>Mon-Thu: 6:00pm-2:00am<br>Fri-Sat: 6:00pm-3:00am<br>Sunday: 3:00pm-12:00am
        // OPENINGHOURS <b>DINNER</b><br>Mon-Sat: 5:30pm-11:00pm
        // OPENINGHOURS Mon-Thu: 5:00pm-12:00am<br>Fri-Sat: 5:00pm-1:00am<br>Sunday: 5:00pm-11:00pm
        // OPENINGHOURS Mon-Fri: 7:00am-7:00pm<br>Sat-Sun: 8:00am-7:00pm
        // OPENINGHOURS <b>LUNCH</b><br><br>Mon-Fri<br>11:30am- 2:30pm<br>Reservations are required for the public at least 24 hours in advance.
        // OPENINGHOURS Tue-Fri: 8:00am-7:00pm<br>Saturday: 9:00am-7:00pm<br>Sunday: 10:00am-6:00pm
        // OPENINGHOURS Mon-Fri: 7:00am-8:00pm<br>Sat-Sun: 8:00am-8:00pm
        // OPENINGHOURS Daily: 11:00am-12:00am
        // OPENINGHOURS BREAKFAST<br>Mon-Fri: 8:00am-12:00pm<br><br><b>LUNCH</b><br>Mon-Fri: 12:00pm-3:00pm<br><br><b>DINNER</b><br>Mon-Tue: 5:30pm-11:00pm <br>Wed-Sat: 5:30pm-12:00am<br>Sun: 5:30pm-10:00pm<br><br><b>BRUNCH</b><br>Sat-Sun: 9am-4pm<br><br><i>Brasserie</i><br>Mon-Fri: 3pm-5:30pm<br>Sat-Sun: 4pm-5:30pm
        // OPENINGHOURS BREAKFAST<br>Daily: 7:00am-10:00am<br><br><b>LUNCH</b><br>Mon-Sat 12:00pm-2:30pm<br><br><b>DINNER</b><br>Tue-Sat 6:00pm-10:00pm<br><br><b>BRUNCH</b><br>Sun: 11:30am-2:30pm
        // OPENINGHOURS <b>LUNCH</b><br>Mon-Fri: 12:00pm-3:30pm<br><br><b>DINNER</b><br>Mon-Sun: 5:30pm-2:00am<br><br><b>BRUNCH</b><br>Sat-Sun: 11:00am-5:00pm
        // OPENINGHOURS Mon-Sat noon-8pm<br>Sun noon-6pm
        // OPENINGHOURS <b>LUNCH</b><br>Tue-Fri: 12:00pm-3:00pm<br><br><b>DINNER</b><br>Mon-Thu: 5:30pm-11:00pm<br>Fri-Sat: 5:30pm-12:00am<br>Sunday: 5:30pm-10:30pm
        // OPENINGHOURS Daily from 11:00 am to 7:00 pm
        // OPENINGHOURS <b>LUNCH</b><br>Sat-Sun: 12:00pm-3:30pm<br><br><b>DINNER</b><br>Mon-Sat: 6:00pm-11:00pm<br>Sunday: 5:30pm-10:00pm<br><br><b>BRUNCH</b><br>Sat-Sun; 11:00am-3:00pm


        // if (factsRaw["This Week&apos;s Hours"]) {
        //   console.log("OPENINGHOURS", factsRaw["This Week&apos;s Hours"]);
        // }


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
