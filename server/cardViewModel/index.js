var _ = require("lodash");
var moment = require("moment");
require("moment-timezone");
var hogan = require("hogan.js");

//TODO: DRY (defined elsewhere as well)
var OPENINGHOURS_RESOLUTION = 5;

function formatDateHumanReadable(startDate){
  return moment(startDate).tz("America/New_York").calendar();  
}

function fromMomentToOpenHoursSpecNr(date){
  var days = date.isoWeekday() - 1; //returns[1, 7] -> map to [0,6]
  var hours = date.hours();
  var minutes = date.minutes();
  return ((24 * days + hours) * 60 / OPENINGHOURS_RESOLUTION) + Math.round(minutes / OPENINGHOURS_RESOLUTION);
}

function fromDateIntToDate(dateAsInt){

  //date in minutes
  var dateInMinutes = dateAsInt * OPENINGHOURS_RESOLUTION; 

  var dayMultiplier = 24 * 60;
  var hourMultiplier = 60;

  var daysIsoWeekday = Math.floor(dateInMinutes / dayMultiplier) +1; 
  dateInMinutes = dateInMinutes % dayMultiplier;

  var hours = Math.floor(dateInMinutes / hourMultiplier); 
  var minutes = (dateInMinutes % hourMultiplier) * OPENINGHOURS_RESOLUTION;

  return moment().tz("America/New_York").days(daysIsoWeekday).hours(hours).minutes(minutes).seconds(0).milliseconds(0);
}

function getOpenhourHumandReadable(date, specArr){

  var dateAsInt = fromMomentToOpenHoursSpecNr(date);
  var foundOpen = false; 
  var foundNext = false; 
  var foundNextOpen = 10000000; 
  _.each(specArr, function(openClose){
    if(foundOpen) return;
    if(dateAsInt >= openClose.opens && dateAsInt <= openClose.closes){
      foundOpen = openClose; 
    }else if(dateAsInt < openClose.opens && openClose.opens < foundNextOpen){
      //find the open-dt that's closest to dateAsInt
        foundNext = openClose;
        foundNextOpen = openClose.opens;
    }
  });


  var dateFuture = date.clone();
  var deltaInMinutes;
  if(foundOpen){
    //present closing DT
    var closeDate = fromDateIntToDate(foundOpen.closes);
    deltaInMinutes = (foundOpen.closes - dateAsInt) * OPENINGHOURS_RESOLUTION;
    
    if(deltaInMinutes <= 180){ //close within 3 hours: use relative time
      return [true, dateFuture.add(deltaInMinutes, 'minutes').fromNow()];
    }else{
      return [true, closeDate.calendar() + " - " + foundOpen.closes];
    }
  }else if(foundNext){

    //present opening DT
    var openDate = fromDateIntToDate(foundNext.opens);
    deltaInMinutes = (foundNext.opens - dateAsInt) * OPENINGHOURS_RESOLUTION;
    
    if(deltaInMinutes <= 180){ //close within 3 hours: use relative time
      return [false, dateFuture.add(deltaInMinutes, 'minutes').fromNow()];
    }else{
      return [false, openDate.calendar()];
    }

  }else{
    //does this ever happen? 
    return null;
  }
}

var simpleCardFormatters = {
 

  // ///////////
  // //EVENTS //
  // ///////////

  educationevent: function(json, expand){
    _.defaults(json.formatted, {
      category: "course event"
    });
  }, 

  screeningevent: function (json, expand) {

    //TODO: what to do if movie || theater not defined? This is possible....

    var raw = json.raw;
    var formatted = json.formatted;

    var movie = expand[raw.workFeatured];
    var theater = expand[raw.location];

    if(!movie || !theater){
      console.log("movie of theater not found for screeningevent", json.raw.id);
      return;
    }
    _.defaults(formatted, {
      // category: "movie screening", //overwrite 'screening event'
      identifiers1: movie.name,
      identifiers2: [
        theater.name,
        //"x min by foot" //TODO: based on user info. What if not supplied? 
      ],
      headsup1: formatDateHumanReadable(raw.startDate),
      // headsup2: "Released: February 12, 2016", //if omitted space will be truncated in frontend.
      databits1: (function () {
        var databits;
        if (movie.aggregateRating.ratingValue) {
          databits = "Rating: " + (Math.round(movie.aggregateRating.ratingValue * 10) / 10) + "/5 (" + movie.aggregateRating.ratingCount + ")";
        } else {
          databits = "No Reviews yet";
        }
      }()),
      databits2: _.compact([movie.contentRating].concat(movie.genre)),
      // whyshown: "SEE ALL CRITIC REVIEWS"  //if omitted space will be truncated in frontend.
    });
  },

  event: function (json, expand) {

    var raw = json.raw;

    //when raw.image not yet set, set if by workfeatured.image if that exists
    var workFeatured = expand[raw.workFeatured];
    if (workFeatured) {
      //add image-array from workFeatured
      raw.image = raw.image || workFeatured.image;
    }

    //set geo of event based on location if event doesn't have geo set yet
    var location = expand[raw.location];
    if (location) {
      raw.geo = raw.geo || location.geo;
      json.formatted.identifiers2 = json.formatted.identifiers2 || location.name;
    }

    _.defaults(json.formatted, {
      headsup1: raw.startDate ? formatDateHumanReadable(raw.startDate) : "start time not known",
    });
  },

  // //////////////////
  // //Creative Work //
  // //////////////////


  movie: function (json, expand) {

    var raw = json.raw;
    var formatted = json.formatted;

    _.defaults(formatted, {
      headsup1: (function () {
        if (raw.aggregateRating.ratingValue) {
          return "Rating: " + (Math.round(raw.aggregateRating.ratingValue * 10) / 10) + "/5 (" + raw.aggregateRating.ratingCount + ")";
        } else {
          return "No Reviews yet";
        }
      }())
    });

  },


  creativework: function (json, expand) {

    var raw = json.raw;
    var formatted = json.formatted;

    //temporary stuff until we add 'course' as subtype_controlled
    var category; 
    if(~raw.subtypes.indexOf("course")){
      category = "course"; 
    }

    _.defaults(json.formatted, {
      category: category
    });
  },



  // //////////////////////////
  // //placewithopeninghours //
  // //////////////////////////
  placewithopeninghours: function (json, expand) {

    var raw = json.raw;
    var formatted = json.formatted;

    if(raw.openingHoursSpecification){

      var nowDate = moment().tz("America/New_York");
      var openingHoursArr = getOpenhourHumandReadable(nowDate, raw.openingHoursSpecification);
      if(openingHoursArr){
        if(openingHoursArr[0]){ // if true -> open
           _.defaults(formatted, {
              headsup1: "Open Now", 
              headsup2: "Closes "  + openingHoursArr[1]
           });
        }else{ // if true -> closed
           _.defaults(formatted, {
              headsup1: "Closed", 
              headsup2: "Opens "  + openingHoursArr[1]
           });
        }
      }
    }


    _.defaults(formatted, {

      //address
      identifiers2: _.compact([
        raw.address.streetAddress,
        raw.address.addressLocality,
        raw.address.postalCode,
        raw.address.Region
        //"x min by foot" //TODO: based on user info. What if not supplied? 
      ]),

      // whyshown: "SEE ALL CRITIC REVIEWS"  //if omitted space will be truncated in frontend.
    });
  },

 

  //////////////////////////
  //organizationandperson //
  //////////////////////////
  organizationandperson: function (json, expand) {
    
    var raw = json.raw;
    var formatted = json.formatted;

    _.defaults(formatted, {
      //...
    });
  },


  //////////
  //THING //
  //////////
  thing: function (json, expand) {

    var raw = json.raw;
    var formatted = json.formatted;
    
    //if genre is defined
    var genreFacts = _.filter(raw.fact, {
      name: "genre"
    });

    var genresAsDatabits = _.reduce(genreFacts, function(arr, genre){
      return arr.concat(genre.val);
    }, []);

    _.defaults(formatted, {

      //default to category with some specifics
      category:   genreFacts.length ? genreFacts[0].val[0] : (raw.subtypes_controlled.length ? raw.subtypes_controlled[raw.subtypes_controlled.length - 1] : null),

      //default to name
      identifiers1: raw.name, 

      //all facts independent of fact type
      databits2: genresAsDatabits.length ? genresAsDatabits: raw.tagsFromFact
    });

    formatted.databits2 = formatted.databits2 || []; 


    //if imagePrimaryURL not set explicitly, set it to the first element in the image-array
    if (!raw.imagePrimaryUrl && raw.image && raw.image.length) {
      raw.imagePrimaryUrl = raw.image[0];
    }

  }
};

/**
 * [enrichViewModel description]
 * @param  {[type]} json   format: {
 *   raw: {}, 
 *   formatted: {}
 * }
 * @param  {[type]} expand [description]
 * @return {[type]}        [description]
 */
function enrichViewModel(json, expand) {

  var types = ["thing", json.raw.root.toLowerCase()].concat(json.raw.subtypes_controlled);
  types.reverse(); //types from most specific to most generic.

  json.raw.types = types;

  //Enrich by going from most specific to most generic.
  //This allows for fallbacks
  _.each(types, function (type) {
    if (simpleCardFormatters[type]) {
      agg = simpleCardFormatters[type](json, expand);
    }
  });

  return json;
}


function conditionalEnrichWithCardViewmodel(command, json) {
  if (!command.includeCardFormatting) {
    return json.hits;
  }

  var results = _.map(json.hits, function (hit) {
    var obj = {
      raw: hit,
      formatted: {}
    };

    return enrichViewModel(obj, json.expand);
  });

  return results;
}

function createDTOS(command) {

  var humanContext = command.humanContext;

  return function (json) {

    var filterContext = command.filterContext;

    // hogan
    var humanAnswer;

    if (humanContext && humanContext.template) {

      var nrOfResults = json.meta.elasticsearch.hits.total;

      humanContext.templateData = _.merge(humanContext.templateData || {}, {
        nrOfResults: nrOfResults,
        label: {
          pluralOrSingular: nrOfResults === 1 ? humanContext.templateData.label.singular : humanContext.templateData.label.plural
        }
      });
      var template = hogan.compile(humanContext.template);
      humanAnswer = template.render(humanContext.templateData); // + " in NYC";
    } else {
      humanAnswer = "TODO: human answer not set. HumanContext available: " + !!humanContext;
    }

    //TODO: for now we assume filter.name indicates we're processing a fallback rows
    // if (filterContext.filter.name) {
    //   humanAnswer = "Found " + json.meta.elasticsearch.hits.total + " " +
    //     filterContext.type + " matching '" + filterContext.filter.name + "'";
    // }

    return {

      query: {
        //TODO: what is this used for?
      },
      answerNLP: humanAnswer,

      filterContext: filterContext,

      //conditionally enrich results with cardViewModel
      results: conditionalEnrichWithCardViewmodel(command, json),

      totalResults: json.meta.elasticsearch.hits.total,

      expand: json.expand,

      meta: json.meta
    };
  };
}


//API
module.exports = {
  simpleCardFormatters: simpleCardFormatters,
  enrichViewModel: enrichViewModel,
  conditionalEnrichWithCardViewmodel: conditionalEnrichWithCardViewmodel,
  createDTOS: createDTOS
};
