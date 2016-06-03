var _ = require("lodash");
var colors = require("colors");

//simply the most fantastic NLP stuff evarrr..
var subtypeToFilterQuery = {

  ///////////////
  //TOP LEVEL
  //top level types
  "event": {
    type: "Event",
    "temporal": {
      "gte": "now"
    },
    "sort": {
      "type": "field",
      "field": "startDate",
      "asc": true
    },
    label: {
      plural: "events",
      singular: "event",
      sorted: "(soonest first)"
    }
  },
  "placewithopeninghours": {
    type: "PlaceWithOpeninghours",
    label: {
      plural: "places",
      singular: "place"
    }
  },
  "creativework": {
    type: "CreativeWork",
    label: {
      plural: "creative works",
      singular: "creative work"
    }
  },
  "organizationandperson": {
    type: "OrganizationAndPerson",
    label: {
      plural: "organizations or persons",
      singular: "ogranization or person"
    }
  },


  //////////////
  //EVENT

  //movie showing
  "screeningevent": {
    type: "Event",
    filter: {
      subtypes: "screeningevent"
    },
    "temporal": {
      "gte": "now"
    },
    "sort": {
      "type": "field",
      "field": "startDate",
      "asc": true
    },
    label: {
      plural: "movie screenings",
      singular: "movie screening",
      sorted: "(soonest first)"
    }
  },

  "concert": {
    type: "Event",
    filter: {
      subtypes: "concert"
    },
    "temporal": {
      "gte": "now"
    },
    "sort": {
      "type": "field",
      "field": "startDate",
      "asc": true
    },
    label: {
      plural: "concerts",
      singular: "concert",
      sorted: "(soonest first)"
    }
  },

  /////////////////
  //PLACE
  restaurant: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "restaurant"
    },
    label: {
      plural: "restaurants",
      singular: "restaurant"
    }
  },
  bar: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "bar"
    },
    label: {
      plural: "bars",
      singular: "bar"
    }
  },
  pub: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "pub"
    },
    label: {
      plural: "pubs",
      singular: "pub"
    }
  },
  club: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "club"
    },
    label: {
      plural: "clubs",
      singular: "club"
    }
  },
  store: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "store"
    },
    label: {
      plural: "stores",
      singular: "store"
    }
  },
  movietheater: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "movietheater"
    },
    label: {
      plural: "movie theaters",
      singular: "movie theater"
    }
  },


  ////////////
  //CREATIVE WORK

  //For movie we actually show: 
  //1. screeningevent
  //2. movie
  "movie": [{
    type: "Event",
    filter: {
      subtypes: "screeningevent"
    },
    "temporal": {
      "gte": "now"
    },
    "sort": {
      "type": "field",
      "field": "startDate",
      "asc": true
    },
    label: {
      plural: "movie screenings",
      singular: "movie screening",
      sorted: "(soonest first)"
    }
  }, {
    type: "CreativeWork",
    filter: {
      subtypes: "movie"
    },
    "sort": {
      "type": "field",
      "field": "aggregateRating.ratingValue",
      "asc": false
    },
    label: {
      plural: "movies",
      singular: "movie",
      sorted: "(best rated first)"
    }
  }],

  /////////////////////////////
  //ORGANIZATION AND PERSON
  performer: {
    type: "OrganizationAndPerson",
    filter: {
      tag: "performer"
    },
    label: {
      plural: "performers",
      singular: "performer"
    }
  },
};


var labelsNotDefined = [];
_.each(subtypeToFilterQuery, function (v, k) {

  _.each(_.isArray(v) ? v : [v], function (vIndiv) {
    if (!vIndiv.label) {
      labelsNotDefined.push(k);
    } else {
      vIndiv.filter = vIndiv.filter || {};
    }
  });
});

if (labelsNotDefined.length) {
  console.log((labelsNotDefined.join(",")).yellow);
  throw new Error("LABELS NOT DEFINED FOR ABOVE (SUB)TYPES");
}

/////////////
//synonyms //
/////////////

subtypeToFilterQuery["place"] = subtypeToFilterQuery.placewithopeninghours;
subtypeToFilterQuery["local businesses"] = subtypeToFilterQuery.place;
subtypeToFilterQuery["local business"] = subtypeToFilterQuery.place;

subtypeToFilterQuery["showing"] = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery["movie showing"] = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery["movie screening"] = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery.moviescreening = subtypeToFilterQuery.screeningevent;

subtypeToFilterQuery["movie theater"] = subtypeToFilterQuery.movietheater;
subtypeToFilterQuery.theater = subtypeToFilterQuery.movietheater;

//person
subtypeToFilterQuery.person = subtypeToFilterQuery.organizationandperson;
subtypeToFilterQuery.organization = subtypeToFilterQuery.organizationandperson;

//performer
subtypeToFilterQuery.artist = subtypeToFilterQuery.performer;
subtypeToFilterQuery.singer = subtypeToFilterQuery.performer;



module.exports = {
  subtypeToFilterQuery: subtypeToFilterQuery
};
