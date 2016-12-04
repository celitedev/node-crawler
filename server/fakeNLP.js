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
      "startDate": {
        "gte": "now"
      }
    },
    "sort": [
      {"type": "keyword"},
      {"type": "date"}
    ],
    label: {
      plural: "events",
      singular: "event"
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
      plural: "performers", //organizations or persons
      singular: "performer"
    }
  },

  //////////////
  //EVENT

  //educationevent
  "educationevent": {
    type: "Event",
    filter: {
      subtypes: {
        text: "educationevent",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
    },
    "temporal": {
      "startDate": {
        "gte": "now"
      }
    },
    "sort": {
      "type": "date"
    },
    label: {
      plural: "courses",
      singular: "course"
    }
  },

  //movie showing
  "screeningevent": {
    type: "Event",
    filter: {
      subtypes: {
        text: "screeningevent",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
    },
    "temporal": {
      "startDate": {
        "gte": "now"
      }
    },
    "sort": {
      "type": "date"
    },
    label: {
      plural: "movie screenings",
      singular: "movie screening",
      //sorted: "(soonest first)"
    }
  },

  "concert": {
    type: "Event",
    filter: {
      subtypes: {
        text: "concert",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
    },
    "temporal": {
      "startDate": {
        "gte": "now"
      }
    },
    "sort": {
      "type": "date"
    },
    label: {
      plural: "concerts",
      singular: "concert",
      //sorted: "(soonest first)"
    }
  },

  /////////////////
  //PLACE
  restaurant: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: {
        text: "restaurant",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
    },
    label: {
      plural: "restaurants",
      singular: "restaurant"
    }
  },
  bar: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: {
        text: "bar",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
    },
    label: {
      plural: "bars",
      singular: "bar"
    }
  },
  pub: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: {
        text: "pub",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
    },
    label: {
      plural: "pubs",
      singular: "pub"
    }
  },
  club: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: {
        text: "club",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
    },
    label: {
      plural: "clubs",
      singular: "club"
    }
  },
  store: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: {
        text: "store",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
    },
    label: {
      plural: "stores",
      singular: "store"
    }
  },
  movietheater: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: {
        text: "movietheater",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
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
      subtypes:{
        text: "screeningevent",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
    },
    "temporal": {
      "startDate": {
        "gte": "now"
      }
    },
    "sort": {
      "type": "date"
    },
    label: {
      plural: "movie screenings",
      singular: "movie screening",
      //sorted: "(soonest first)"
    }
  }, {
    type: "CreativeWork",
    filter: {
      subtypes: {
        text: "movie",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
    },
    "sort": {
      "type": "field",
      "field": "aggregateRating.ratingValue"
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
      tag: {
        text: "performer",
        typeOfQuery: "Enum",
        typeOfMatch: "must"
      }
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

subtypeToFilterQuery.course = subtypeToFilterQuery.educationevent;

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
