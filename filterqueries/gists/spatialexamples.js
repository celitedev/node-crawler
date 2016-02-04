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
				_path: "inverse--organizer.location.geo"
			}
		}

	},


	//nearPOint + NearPlace
	//what's the conceptual difference (from NLP) between containedInPlace and location? 
	//i.e.: how can we know what to ask? 
	E: {
		type: "nearPoint",
		options: {
			latitude: "<latitude>",
			longitude: "<longitude>",
			radius: 5,
			radiusMetric: "km"
		}
	},
	F: {
		//Near place requires doing a lookup on ThingIndex for place / placewithOpeningHours
		//Fetch the geo and do a nearPoint calculation
		type: "nearPlace",
		options: {
			id: "<id>",
			radius: 5,
			radiusMetric: "km"
		}
	},
	G: {
		type: "nearPlace",
		options: {
			name: "Grand Central",
			radius: 5,
			radiusMetric: "km"
		}
	}
};
