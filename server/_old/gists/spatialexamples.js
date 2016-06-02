var test = {
  //Where does the avengers play near me?  (SPATIAL TYPE = NEARPOINT)
  A: {

    //... in soho
    spatial: {
      type: "containedInPlace",
      options: "id"
    },
  },
  B: {
    //... in soho
    spatial: {
      type: "containedInPlace",
      options: {
        name: "soho",
      }
    },
  },
  C: {
    //.. in theater X, referenced by id. 
    //
    //Uses default paths to get to `location` property. 
    //
    //This works for 
    //- Place
    //- PlaceWithOpeninghours
    //- OrganizationOrPerson
    //- CreativeWork
    //- Event
    //
    spatial: {
      type: "location",
      options: "id"
    }
  },
  D: {
    //.. in theater X, referenced by name
    //
    //Uses default paths to get to `location` property. 
    //
    //Can perform in 1 query if `location--name` or `location--expand.name` is avail
    //Otherwise does lookup on location by name and use derived id in `location` property
    spatial: {
      type: "location",
      options: {
        name: "theater X",
      }
    }

  },

  Z: {

    //
    //Also see: https://github.com/Kwhen/crawltest/issues/174
    //
    //When has Person organized Event at Theater? 
    //
    //- assume Person
    //- theater referenced by name
    //- relationship `organizer` is made explicit by defining `path`
    //- the default relationship for Person -> `location` = `performer`
    //
    //1. Fetch id of Person
    //2. Remainder can perform in 1 query if `location--name` or `location--expand.name` is avail
    // Otherwise does lookup on location by name and use derived id in `location` property
    // 
    spatial: {
      type: "location",
      options: {
        name: "theater X",
        _path: "organizer--inverse.location"
      }
    }

  },
  nearbyPoint: {
    spatial: {
      type: "location",
      options: {
        name: "theater X",
        _path: "organizer--inverse.location",

        //if defined changes query from AT place to NEAR place (using location.geo)
        //Again, it depends on expansion if this can be done in 1 query.
        _nearby: {
          point: {
            latitude: "<latitude>", //e.g User coords
            longitude: "<longitude>",
          },
          radius: 5,
          radiusMetric: "km"
        }
      }
    }
  },

  nearbyPointEntityById: {
    spatial: {
      type: "location",
      options: {
        name: "theater X",
        _path: "organizer--inverse.location",
        _nearby: {
          entity: {
            id: "<id>", //needs separate lookup to find latitude/longitude
          },
          radius: 5,
          radiusMetric: "km"
        }
      }
    }
  },

  nearbyPointEntityByName: {
    spatial: {
      type: "location",
      options: {
        name: "theater X",
        _path: "organizer--inverse.location",
        _nearby: {
          entity: {
            name: "Grand Central", //needs separate lookup to find latitude/longitude
          },
          radius: 5,
          radiusMetric: "km"
        }
      }
    }
  }
};
