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
		//.. in theater X
		spatial: {
			type: "location",
			options: "id"
		}
	},
	D: {
		//.. in theater X
		spatial: {
			type: "location",
			options: {
				name: "theater X",
			}
		}
		//nearPOint + NearPlace
		//what's the conceptual difference (from NLP) between containedInPlace and location? 
		//i.e.: how can we know what to ask? 
	},
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
