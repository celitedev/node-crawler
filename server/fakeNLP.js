//simply the most fantastic NLP stuff evarrr..
var subtypeToFilterQuery = {

  ///////////////
  //TOP LEVEL
  //top level types
  "event": {
    type: "Event"
  },
  "place": {
    type: "PlaceWithOpeninghours"
  },
  "creativework": {
    type: "CreativeWork"
  },
  "organizationandperson": {
    type: "OrganizationAndPerson"
  },


  //////////////
  //EVENT

  //movie showing
  "screeningevent": {
    type: "Event",
    filter: {
      subtypes: "screeningEvent"
    }
  },

  "concert": {
    type: "Event",
    filter: {
      subtypes: "concert"
    }
  },

  /////////////////
  //PLACE
  restaurant: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "restaurant"
    }
  },
  bar: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "bar"
    }
  },
  club: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "club"
    }
  },
  store: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "store"
    }
  },
  movietheater: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "movietheater"
    }
  },


  ////////////
  //CREATIVE WORK
  "movie": {
    type: "CreativeWork",
    filter: {
      subtypes: "movie"
    }
  },

  /////////////////////////////
  //ORGANIZATION AND PERSON
  performer: {
    type: "OrganizationAndPerson",
    filter: {
      tag: "performer"
    }
  },
};

/////////////
//synonyms //
/////////////
subtypeToFilterQuery["local businesses"] = subtypeToFilterQuery.place;
subtypeToFilterQuery["local business"] = subtypeToFilterQuery.place;

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
