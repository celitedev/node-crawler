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
  "movie": {
    type: "CreativeWork",
    filter: {
      subtypes: "Movie"
    }
  },

  //movie showing
  "screeningevent": {
    type: "Event",
    filter: {
      subtypes: "ScreeningEvent"
    }
  },

  //place
  restaurant: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "Restaurant"
    }
  },
  bar: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "Bar"
    }
  },
  store: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "Store"
    }
  },
  movietheater: {
    type: "PlaceWithOpeninghours",
    filter: {
      subtypes: "movietheater"
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



module.exports = {
  subtypeToFilterQuery: subtypeToFilterQuery
};
