//simply the most fantastic NLP stuff evarrr..
var subtypeToFilterQuery = {

  //top level types
  "creativework": {
    type: "CreativeWork"
  },
  "event": {
    type: "Event"
  },
  "place": {
    type: "PlaceWithOpeninghours"
  },
  "organizationandperson": {
    type: "OrganizationAndPerson"
  },

  "movie": {
    type: "CreativeWork",
    filter: {
      subtypes: "movie"
    }
  },

  //movie showing
  "screeningevent": {
    type: "Event",
    filter: {
      subtypes: "screeningEvent"
    }
  },

  //place
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

  //performer
  "performer": {
    type: "OrganizationAndPerson",
    filter: {
      tag: "performer"
    }
  },
};

/////////////
//synonyms //
/////////////
subtypeToFilterQuery.creativeworks = subtypeToFilterQuery.creativework;
subtypeToFilterQuery.events = subtypeToFilterQuery.event;
subtypeToFilterQuery.places = subtypeToFilterQuery.place;

subtypeToFilterQuery.placewithopeninghours = subtypeToFilterQuery.place;
subtypeToFilterQuery.placeswithopeninghours = subtypeToFilterQuery.place;
subtypeToFilterQuery.localbusiness = subtypeToFilterQuery.place;
subtypeToFilterQuery.localbusinesses = subtypeToFilterQuery.place;
subtypeToFilterQuery["local businesses"] = subtypeToFilterQuery.place;
subtypeToFilterQuery["local business"] = subtypeToFilterQuery.place;

subtypeToFilterQuery.movies = subtypeToFilterQuery.movie;

subtypeToFilterQuery.screeningevents = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery.movieshowing = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery.movieshowings = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery["movie showing"] = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery["movie showings"] = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery["movie screening"] = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery["movie screenings"] = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery.moviescreening = subtypeToFilterQuery.screeningevent;
subtypeToFilterQuery.moviescreenings = subtypeToFilterQuery.screeningevent;

subtypeToFilterQuery.restaurants = subtypeToFilterQuery.restaurant;

subtypeToFilterQuery.movietheaters = subtypeToFilterQuery.movietheater;
subtypeToFilterQuery["movie theaters"] = subtypeToFilterQuery.movietheater;
subtypeToFilterQuery["movie theater"] = subtypeToFilterQuery.movietheater;
subtypeToFilterQuery.theater = subtypeToFilterQuery.movietheater;
subtypeToFilterQuery.theaters = subtypeToFilterQuery.movietheater;

//person
subtypeToFilterQuery.person = subtypeToFilterQuery.organizationandperson;
subtypeToFilterQuery.persons = subtypeToFilterQuery.organizationandperson;

//performer
subtypeToFilterQuery.performers = subtypeToFilterQuery.performer;
subtypeToFilterQuery.artist = subtypeToFilterQuery.performer;
subtypeToFilterQuery.artists = subtypeToFilterQuery.performer;



module.exports = {
  subtypeToFilterQuery: subtypeToFilterQuery
};
