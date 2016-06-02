var _ = require("lodash");
var moment = require("moment");

var simpleCardFormatters = {
  placewithopeninghours: function (json, expand) {

    var raw = json.raw;

    _.defaults(json.formatted, {
      identifiers1: raw.name,
      identifiers2: _.compact([
        raw.address.streetAddress,
        raw.address.addressLocality,
        raw.address.postalCode,
        raw.address.Region
        //"x min by foot" //TODO: based on user info. What if not supplied? 
      ]),
      // headsup2: _.compact([json.contentRating].concat(json.genre)), //if omitted space will be truncated in frontend.
      // databits2: _.compact([movie.contentRating].concat(movie.genre)), //if omitted space will be truncated in frontend.
      // whyshown: "SEE ALL CRITIC REVIEWS"  //if omitted space will be truncated in frontend.
    });
  },
  movie: function (json, expand) {

    var raw = json.raw;

    _.defaults(json.formatted, {
      identifiers1: raw.name,
      headsup1: (function () {
        if (raw.aggregateRating.ratingValue) {
          return "Rating: " + (Math.round(raw.aggregateRating.ratingValue * 10) / 10) + "/5 (" + raw.aggregateRating.ratingCount + ")";
        } else {
          return "No Reviews yet";
        }
      }()),
      headsup2: _.compact([raw.contentRating].concat(raw.genre)), //if omitted space will be truncated in frontend.
      databits2: _.compact([json.contentRating].concat(json.genre)), //if omitted space will be truncated in frontend.
      // whyshown: "SEE ALL CRITIC REVIEWS"  //if omitted space will be truncated in frontend.
    });

  },
  screeningevent: function (json, expand) {

    //TODO: what to do if movie || theater not defined? This is possible....

    var raw = json.raw;

    var movie = expand[raw.workFeatured];
    var theater = expand[raw.location];

    _.defaults(json.formatted, {
      category: "movie screening", //overwrite 'screening event'
      identifiers1: movie.name,
      identifiers2: [
        theater.name,
        //"x min by foot" //TODO: based on user info. What if not supplied? 
      ],
      headsup1: moment(raw.startDate).format('MMMM Do YYYY, h:mm:ss a'),
      // headsup2: "Released: February 12, 2016", //if omitted space will be truncated in frontend.
      databits1: (function () {
        var databits;
        if (movie.aggregateRating.ratingValue) {
          databits = "Rating: " + (Math.round(movie.aggregateRating.ratingValue * 10) / 10) + "/5 (" + movie.aggregateRating.ratingCount + ")";
        } else {
          databits = "No Reviews yet";
        }
        databits += ", ****"; //TODO: HORRIBLE. NEEDS TO BE IN THIS FORMAT FOR FRONTEND. 
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
      category: raw.root,
      headsup1: json.formatted.headsup1 || (raw.startDate ? moment(raw.startDate).format('MMMM Do YYYY, h:mm:ss a') : "start time not known"),
      //default to name of event. Sometimes this is rather meaningless, so we might already set this in subtypes
      //which are processed earlier such as ScreeningEvent.
      identifiers1: raw.name
    });
  },

  organizationandperson: function (json, expand) {
    var raw = json.raw,
      formatted = json.formatted;

    formatted.category = formatted.category || raw.tag[0]; //e.g.: performer
    formatted.identifiers1 = raw.name;
  },

  thing: function (json, expand) {

    var raw = json.raw,
      formatted = json.formatted;

    //if category not yet defined, simply use the fist (most specific) type
    formatted.category = formatted.category || raw.types[0];

    formatted.databits2 = (formatted.databits2 || []).concat(raw.tag);

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

  var types = ["thing", json.raw.root.toLowerCase()].concat(json.raw.subtypes);
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
  return function (json) {

    return {

      query: {
        //TODO: what is this used for?
      },
      answerNLP: "TODO: below should be a DIFFERENT filtercontext. It's not very useful now", //TODO

      filterContext: command.filterContext,

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
