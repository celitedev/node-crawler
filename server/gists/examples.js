var queries = {

  //When is the ‘White Horse Tavern’ bar open?
  A: {

    type: "LocalBusiness", //TBD: needs to be root?

    // user is requesting entity by name. Therefore a strong indicator
    // for wanting to return a unique result
    wantUnique: true,

    filter: {
      attributes: {
        subtypes: "bar",
        name: "White Horse Tavern"
      },

      //Default: filter to NYC
      spatial: {
        type: "containedInPlace",

        //options format specific to 'type'. 
        //type =containedInPlace -> options is either id to place or object containined attributes
        //In both cases it maps to property 'containedInPlace'
        options: 123, //lookup in thingIndex, as per ambiguity rules
      },

      // Ask the overlapping time-duration of today+tomorrow that 
      // the entity is openened.
      //
      // Since we're asking for a concept=place, the system knows
      // to check the opening/closing-hours.
      temporal: {
        from: "<today>",
        to: "<tomorrow>",
        dateOnly: true,
        type: "overlap"
      }
    },

    // To be complete we list the default sorting (can be omitted) 
    // which sorts on 'score' and returns the results with the highest 
    // score first. 
    //
    // 'score' takes into account: 
    // - free-form text-fields, since they can be fuzzy-matched, 
    // there can be a difference in score. I.e.: not just 0 or 1 
    //
    // As earlier described sorting is needed if wantUnique = true, since
    // we use the scoring to determine with a certain confidence that
    // the top scoring entity is indeed the entity the user is looking for. 
    sort: [{
      type: "normal",
      options: {
        attribute: "score",
        descend: true
      }
    }]
  },

  //Is the Apple Store in Soho open?
  B: {

    type: "LocalBusiness",
    wantUnique: true,

    filter: {
      attributes: {
        subtypes: "Store",
        name: "Apple Store"
      },

      spatial: {
        type: "containedInPlace",
        options: { //used containedInPlace--name if exists, and defaults to thingIndex lookup otherwise.
          name: "soho",
        }
      },
      // Since we're asking a time-related question, which is
      // indicated by asking: "is ... open?" while no timeconstraint 
      // is given we default to 'now'.
      // 
      // We're asking if from/to (which are both set to <now>) are 
      // contained within the timeduration of this entity.
      //
      // Since we're asking for a concept=place, the system knows
      // to check the opening/closing-hours.
      temporal: {
        from: "<now>",
        to: "<now>",
        dateOnly: false,
        type: "contained"
      }
    },

    //Scoring is default as with previous example. (we need scoring bc wantUnique = true)
    //Since no free-form fields are filtered on in the returned entity,
    //all entities will score the same.
    // 
    //To still return a useful ordering we use proximity to the 
    //user-location (if user location is provided) as tie-breaker.
    sort: [{
      type: "normal",
      options: {
        attribute: "score"
      },
      descend: true,
    }, {
      type: "spatialProximity",
      options: {
        clientLocation: {
          latitude: "<latitude>",
          longitude: "<longitude>"
        }
      },
      descend: false,
    }]
  },
  C: {
    //Where does The Avengers play near me today?

    root: "Event",
    wantUnique: false,

    filter: {
      attributes: {
        subtypes: "ScreeningEvent",
      },

      //Query planner should have knowledge that Event doesn't have 
      //location info on it's own, but this is contained in it's `location`-reference
      spatial: {
        type: "nearPoint",
        options: {
          latitude: "<latitude>",
          longitude: "<longitude>",
          radius: 5,
          radiusMetric: "km"
        }
      },

      //Defining the returned entity to be an event of the 
      //movie The Avengers. 
      //
      //Notice the similarity with defining Chain ‘Apple 
      //Store’ in the example above with this. Feels good.
      //
      aggregate: [{
        //wantUnique = true is default for aggregates
        //As discussed , if a movie can’t be found with
        //enough confidence, the user is presented with 
        //a GUI so select the movie he means. 
        //
        //Heuristics can be used to improve the confidence, 
        //e.g.: current movies are far more likely to be
        //of interest than older movies. 
        //
        //These are optimizations which can be added later on.
        //
        //TBD.
        wantUnique: true,

        //concept=EventObject should be detected by 
        //Translation phase (chapter 4)
        concept: "EventObject",
        filter: {
          attribs: {
            //type=movie should be detected by 
            //Translation phase (chapter 4)
            type: "movie",
            name: "The Avengers"
          }
        }
      }],

      // We're asking a time-related question, which is
      // indicated by asking: "... today?"  
      // 
      // The system understands that timing is strict for EVENTS, 
      // so makes sure to prune events that are today but are: 
      // - already in the past
      // - happening around now, without enough time for user to act. 
      // 
      // TBD: it's worth thinking how strict timing is for certain 
      // events. Depending on this we might change strategies. E.g.: 
      // - timing for movie-showings is strict: not much use to get after start
      // - timing for weekly markets is not strict.
      //
      //Based on this strategy we define to look for events
      //that start within the timeframe <now + 30min, end of day> . 
      //
      //NOTE: we sort on temporal proximity below
      temporal: {
        from: "<now + 30min>",
        to: "<today>",
        dateOnly: false,
        type: "contained"
      }
    },

    //Scoring is performed on spatial as well as temporal proximity
    //
    //A simple strategy would be to rank entities based on a weighted 
    //average based on both of these proximities (closer is better)
    //
    //A more advanced raking algorithm would take travel time into 
    //account. 
    //
    //TBD. 
    sort: [{
      type: "weighted",
      strategies: [{
        type: "spatialProximity",
        options: {
          clientLocation: {
            latitude: "<latitude>",
            longitude: "<longitude>"
          }
        },
        descend: false,
        boost: 2, //multiplier to influence weighted avg.
      }, {
        type: "temporalProximity",
        options: {
          clientTime: "<now> + 30min"
        },
        descend: false,
        boost: 1, //multiplier to influence weighted avg.
      }]
    }]
  }
};
