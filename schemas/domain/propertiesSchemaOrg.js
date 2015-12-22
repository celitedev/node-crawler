module.exports = {

	////////////////////////////
	//http://schema.org/Thing //
	////////////////////////////

	name: {
		required: true
	},
	description: {},
	alternateName: {
		"isMulti": true
	},
	// image: { //stored in separate index ImageObject
	// 	"isMulti": true,
	// 	ambiguitySolvedBy: {
	// 		type: "urlVsSomething"
	// 	},
	// 	//TODO
	// 	validation: {
	// 		URL: { //validation per range-object

	// 		}
	// 	}
	// },
	sameAs: {
		"isMulti": true,

	},
	url: {},


	/////////////////////////////
	//http://schema.org/Rating //
	/////////////////////////////
	// bestRating: { //The highest value allowed in this rating system. If bestRating is omitted, 5 is assumed.
	// 	ranges: ["Number"]
	// },
	ratingValue: {},
	// worstRating: {
	// 	ranges: ["Number"]
	// },

	itemReviewed: {
		aliasOf: "about", //alias althought not really needed, but to get the alias stuff in
		ranges: [
			"Place",
			"Event",
			"PlaceWithOpeninghours",
			"OrganizationAndPerson",
			"CreativeWork"
		],
		// ambiguitySolvedBy: {
		// 	type: "thingIndex"
		// }
	},


	//////////////////////////////////////
	//http://schema.org/AggregateRating //
	//////////////////////////////////////

	ratingTotal: { //keep tally of total. Allows for calculating ratingValue
		id: "ratingTotal",
		isCustom: true,
		ranges: ["Number"]
	},
	ratingCount: {},

	///////////////////////////////////
	//http://schema.org/ContactPoint //
	///////////////////////////////////
	contactType: {},
	email: {},
	faxNumber: {},
	telephone: {},


	////////////////////////////////////
	//http://schema.org/PostalAddress //
	////////////////////////////////////
	addressCountry: {
		ranges: ["Country"],
		//linkByLookup WIP: #70: open q: should this be on domain or more on outside?
		linkByLookup: {
			fields: {
				name: "addressCountry"
			}
		}
	},
	// addressCity: {
	// 	"id": "addressCity",
	// 	"ranges": [
	// 		"City"
	// 	],
	// 	isCustom: true, //defined ourselves!
	// 	//WIP: #70: open q: should this be on domain or more on outside?
	// 	linkByLookup: {
	// 		fields: {
	// 			name: "addressCity"
	// 		}
	// 	}
	// },
	addressLocality: {},
	addressRegion: {},
	postOfficeBoxNumber: {},
	postalCode: {},
	streetAddress: {},

	//////////////////////////////////
	//http://schema.org/Enumeration //
	//////////////////////////////////
	supersededBy: {
		//TODO: what does supersededBy mean? 
		ranges: ["Enumeration"]
	},


	////////////////////////////////////////////////
	//http://schema.org/OpeningHoursSpecification //
	////////////////////////////////////////////////
	closes: {},
	dayOfWeek: {},
	opens: {},
	validFrom: {},
	validThrough: {},

	//////////////////////////////////////
	//https://schema.org/GeoCoordinates //
	//////////////////////////////////////
	elevation: {
		ranges: ["Number"] //From Number
	},
	latitude: {
		ranges: ["Number"] //From Number
	},
	longitude: {
		ranges: ["Number"] //From Number
	},



	////////////////////////////
	//http://schema.org/Place //
	////////////////////////////
	aggregateRating: {}, //also avail in CreativeWork
	address: {
		//require PostalAddress instead of Text: format nicely where we can
		ranges: ["PostalAddress"]
	},
	branchCode: {},
	containedInPlace: { //we probably store entire place hierarchy
		isMulti: true
	},
	containsPlace: {
		"isMulti": true
	},
	geo: {
		ranges: ["GeoCoordinates"]
	},
	logo: {
		ambiguitySolvedBy: {
			type: "urlVsSomething"
		}
	},

	//////////////////////////////////////
	// https://schema.org/LocalBusiness //
	//////////////////////////////////////

	// 		The opening hours for a business. Opening hours can be specified as a weekly time range, starting with days, then times per day. 
	// 		Multiple days can be listed with commas ',' separating each day. Day or time ranges are specified using a hyphen '-'.
	// - Days are specified using the following two-letter combinations: Mo, Tu, We, Th, Fr, Sa, Su.
	// - Times are specified using 24:00 time. For example, 3pm is specified as 15:00. 
	// - Here is an example: <time itemprop="openingHours" datetime="Tu,Th 16:00-20:00">Tuesdays and Thursdays 4-8pm</time>. 
	// - If a business is open 7 days a week, then it can be specified as <time itemprop="openingHours" datetime="Mo-Su">Monday through Sunday, all day</time>.
	openingHoursSpecification: {
		isMulti: true
	},
	openingHours: {},
	paymentAccepted: {},
	priceRange: {},


	////////////////////////////////////
	//https://schema.org/MovieTheater //
	////////////////////////////////////
	screenCount: {},


	////////////////////////////////////
	//https://schema.org/FoodEstablishment //
	////////////////////////////////////
	acceptsReservations: {
		//was: ["Text", "URL", Boolean]
		//Text + Url can be supported since supertypee(url) = text
		ranges: ["Text", "URL"],
		ambiguitySolvedBy: {
			type: "urlVsSomething"
		}
	},
	menu: {
		ambiguitySolvedBy: {
			type: "urlVsSomething"
		}
	},
	servesCuisine: {
		isMulti: true
	},


	///////////////////////////////
	//https://schema.org/Airport //
	///////////////////////////////
	iataCode: {},
	icaoCode: {},


	///////////////////////////////////
	//http://schema.org/CreativeWork //
	///////////////////////////////////

	//problematic since linking to Thing. 
	//This would be possible with Disambugation Table (#58)
	//For now, dont' support.
	about: {
		ranges: [
			"Place",
			"Event",
			"PlaceWithOpeninghours",
			"OrganizationAndPerson",
			"CreativeWork"
		],
		ambiguitySolvedBy: {
			type: "thingIndex"
		}
	},

	alternativeHeadline: {},
	author: {
		isMulti: true,

		//Person || Organization
		ambiguitySolvedBy: {
			type: "sharedRoot"
		}
	},
	character: {
		isMulti: true
	},
	citation: {
		ranges: ["Text"],
		isMulti: true
	},
	commentCount: {},
	contentRating: {},
	copyrightYear: {},
	encoding: {
		isMulti: true
	},
	genre: {
		ambiguitySolvedBy: {
			type: "urlVsSomething"
		},
		isMulti: true
	},
	hasPart: {
		isMulti: true
	},
	headline: {},
	isPartOf: {
		isMulti: true //episode -> season -> series
	},
	keywords: {
		"isMulti": true,

		//Format from Kwhen domain -> schema.org
		//Here: we represent as array while schemaOrg insists on comma-delimited
		toSchemaOrg: function(keywordsArr, domainModel) {
			return keywordsArr.join(","); //from arr -> comma-delimited
		}
	},
	license: {
		ranges: ["URL"]
	},
	producer: {
		//Person || Organization
		ambiguitySolvedBy: {
			type: "sharedRoot"
		},
		isMulti: true
	},
	publisher: {
		//Person || Organization
		ambiguitySolvedBy: {
			type: "sharedRoot"
		},
		isMulti: true
	},
	text: {},
	thumbnailUrl: {},



	///////////////////////////////////
	//http://schema.org/MediaObject //
	///////////////////////////////////
	bitrate: {},
	contentSize: {},
	contentUrl: {},
	uploadDate: {},
	duration: {},

	//////////////////////////////////
	//http://schema.org/ImageObject //
	///////////////////////////////////
	caption: {},

	//////////////////////////////////
	//http://schema.org/VideoObject //
	///////////////////////////////////
	videoFrameSize: {},
	videoQuality: {},


	//////////////////////////////////
	//http://schema.org/Review //
	///////////////////////////////////
	reviewBody: {
		// aliasOf: "text"
	},
	//rating GIVEN in review. AggregateRating is rating of the review
	reviewRating: {},


	//////////////////////////////////
	//http://schema.org/Movie //
	///////////////////////////////////
	actor: {
		isMulti: true
	},
	countryOfOrigin: {},
	director: {
		isMulti: true
	},
	musicBy: {
		ambiguitySolvedBy: {
			type: "sharedRoot"
		},
		isMulti: true
	},
	productionCompany: {},
	trailer: {
		isMulti: true
	},


	////////////////////////////
	//https://schema.org/Book //
	////////////////////////////
	illustrator: {
		isMulti: true
	},
	isbn: {},
	numberOfPages: {},


	////////////////////////////////////////
	//https://schema.org/MusicComposition //
	////////////////////////////////////////
	composer: {
		ambiguitySolvedBy: {
			type: "sharedRoot"
		},
		isMulti: true
	},
	iswcCode: {},
	lyricist: {
		isMulti: true
	},
	recordedAs: {
		isMulti: true
	},


	/////////////////////////////////////
	//https://schema.org/MusicRecording //
	/////////////////////////////////////
	byArtist: {
		isMulti: true
	},
	inAlbum: {
		isMulti: true
	},
	inPlaylist: {
		isMulti: true
	},
	isrcCode: {},
	recordingOf: {},


	/////////////////////////////////////
	//https://schema.org/MusicPlaylist //
	/////////////////////////////////////
	numTracks: {},
	track: {
		ranges: ["MusicRecording"],
		isMulti: true
	},


	/////////////////////////////////////
	//https://schema.org/MusicRelease //
	/////////////////////////////////////
	// catalogNumber: {},
	// creditedTo: {},
	// recordLabel: {},
	// releaseOf: {}, //points to MusicAlbum


	//////////////////////////////////////////
	//https://schema.org/CreativeWorkSeries //
	//////////////////////////////////////////
	endDate: {},
	startDate: {},


	//////////////////////////////////////////
	//https://schema.org/CreativeWorkSeason //
	//////////////////////////////////////////
	numberOfEpisodes: {},
	partOfSeries: {},
	seasonNumber: {
		ranges: ["Text"]
	},


	////////////////////////////////
	//https://schema.org/TVSeries //
	////////////////////////////////
	containsSeason: { //ref to CreativeWorkSeason 
		isMulti: true
	},
	numberOfSeasons: {},
	episode: {
		isMulti: true
	},


	///////////////////////////////
	//https://schema.org/Episode //
	///////////////////////////////
	episodeNumber: {
		ranges: ["Text"]
	},
	partOfSeason: {},


	/////////////////////////////
	//http://schema.org/Person //
	/////////////////////////////
	additionalName: {},
	birthDate: {},
	deathDate: {},
	familyName: {},
	gender: {},
	givenName: {}, //use along side familyName. More specific than 'name'
	honorificPrefix: {},
	honorificSuffix: {},
	jobTitle: {},
	memberOf: {
		ambiguitySolvedBy: {
			type: "sharedRoot"
		},
		ranges: ["Organization"], //Don't allow ProgramMembership for now
		isMulti: true
	},
	nationality: {},


	///////////////////////////////////
	//http://schema.org/Organization //
	///////////////////////////////////
	department: {},
	dissolutionDate: {},
	employee: {
		isMulti: true
	},
	founder: {
		isMulti: true
	},
	foundingDate: {},
	legalName: {},
	location: {
		ranges: ["Place"], //important
		isMulti: true
	},
	member: { //e.g.: org or persons
		ambiguitySolvedBy: {
			type: "sharedRoot"
		},
		isMulti: true
	},
	parentOrganization: {},
	subOrganization: {
		isMulti: true
	},

	//////////////////////////////////////////
	//https://schema.org/SportsOrganization //
	//////////////////////////////////////////
	sport: {
		isMulti: true,
		ambiguitySolvedBy: {
			type: "urlVsSomething"
		}
	},


	///////////////////////////////////
	// https://schema.org/SportsTeam //
	///////////////////////////////////
	athlete: {
		isMulti: true
	},
	coach: {
		isMulti: true
	},


	////////////////////////////
	//http://schema.org/Event //
	////////////////////////////
	doorTime: {},
	// offers: //offers -> NOTE: shouldn't this be 'offer' 
	organizer: {
		//Person || Organization
		ambiguitySolvedBy: {
			type: "sharedRoot"
		},
		isMulti: true
	},
	performer: {
		//Person || Organization
		ambiguitySolvedBy: {
			type: "sharedRoot"
		},
		isMulti: true
	},
	recordedIn: {}, //creativeWork
	subEvent: {
		isMulti: true
	},
	superEvent: {},

	//A work featured in some event, e.g. exhibited in an ExhibitionEvent. 
	//Specific subproperties are available for workPerformed (e.g. a play), 
	//or a workPresented (a Movie at a ScreeningEvent).
	workFeatured: {
		isMulti: true
	},

	//A work performed in some event, for example a play performed in a TheaterEvent.
	workPerformed: {
		isMulti: true
	},


	///////////////////////////////////////
	//http://schema.org/PublicationEvent //
	///////////////////////////////////////
	isAccessibleForFree: {},


	//////////////////////////////////////
	// http://schema.org/ScreeningEvent //
	//////////////////////////////////////
	subtitleLanguage: {
		ranges: ["Text"]
	},
	videoFormat: {},
	workPresented: {},


	///////////////////////////////////
	// http://schema.org/SportsEvent //
	///////////////////////////////////
	awayTeam: {
		ambiguitySolvedBy: {
			type: "sharedRoot"
		}
	}, //The away team in a sports event.
	competitor: { //A competitor in a sports event.
		ambiguitySolvedBy: {
			type: "sharedRoot"
		},
		isMulti: true
	},
	homeTeam: {
		ambiguitySolvedBy: {
			type: "sharedRoot"
		}
	}, //The home team in a sports event.

};
