module.exports = {

	////////////////////////////
	//http://schema.org/Thing //
	////////////////////////////

	name: {
		// required: true,

		// //just for show...woot
		// validate: {
		// 	type: "isLength",

		// 	//if options is an array it's `applied` to validator, i.e.: 
		// 	//spreading/applying array items as arguments to function. 
		// 	//if non array -> arg passed as first parameter
		// 	options: [5], //name should have min 5 chars

		// 	//custom errorMessage which is mustache-expanded
		// 	errorMessage: "'{{val}}' doesn't satisfy length >= 5",
		// },

	},
	description: {},
	alternateName: {
		"isMulti": true
	},
	image: {
		"isMulti": true,
		ranges: ["ImageObject"]
	},
	sameAs: {
		"isMulti": true,

	},
	url: {},
	tag: {
		isMulti: true,
		isCustom: true,
		ranges: ["Text"]
	},
	fact: {
		isMulti: true,
		isCustom: true,
		ranges: ["Text", "Object"],
		ambiguitySolvedBy: {
			type: "implicitDataType",
			//results in 
			//- p.ambiguitySolvedBy.storage = "sharedField" -> store values in same field, regardless of datatype
			//- p.ambiguitySolvedBy.sharedParentDataType = Datatype -> 
			//which means Any Datatype, so not useful for mapping in ERD at all. 
			//We don't need this for `fact` since it's split in more fine-grained stuff
			//on ERD generation (See #134)
		},
	},


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
		aliasOf: "about"
	},


	//////////////////////////////////////
	//http://schema.org/AggregateRating //
	//////////////////////////////////////

	ratingTotal: { //keep tally of total. Allows for calculating ratingValue
		id: "ratingTotal",
		isCustom: true,
		ranges: ["Integer"]
	},
	ratingCount: {
		ranges: ["Integer"]
	},
	reviewCount: {},

	///////////////////////////////////
	//http://schema.org/ContactPoint //
	///////////////////////////////////
	contactType: {},
	email: {
		validate: "isEmail", //short notation
		transform: "normalizeEmail" //short notation

		//short notation:  "normalizeEmail"
		//is the same as: 
		//{
		//	type: "normalizeEmail", 
		//	options: {}
		//}, 
		//of course you can do more stuff (hint: add options) with the latter
	},
	faxNumber: {},
	telephone: {},


	////////////////////////////////////
	//http://schema.org/PostalAddress //
	////////////////////////////////////
	addressCountry: {
		ranges: ["Text"]
	},
	// addressCity: {
	// 	"id": "addressCity",
	// 	"ranges": [
	// 		"Text"
	// 	],
	// 	isCustom: true, //defined ourselves!
	// },
	addressLocality: {},
	addressRegion: {},
	neighborhood: {
		isCustom: true,
		ranges: ["Text"]
	},
	crossStreets: {
		isCustom: true,
		ranges: ["Text"],
	},
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
		ranges: ["Number"]
	},
	latitude: {
		required: true,
		ranges: ["Number"]
	},
	longitude: {
		required: true,
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
		ambiguitySolvedBy: { //Place is ambiguous: Place or PlaceWithOpeninghours
			type: "implicitType",
			storage: "thingIndex"
		},
		isMulti: true
	},
	containsPlace: {
		ambiguitySolvedBy: { //Place is ambiguous: Place or PlaceWithOpeninghours
			type: "implicitType",
			storage: "thingIndex"
		},
		"isMulti": true
	},
	geo: {
		// required: true,
		ranges: ["GeoCoordinates"]
	},
	logo: {
		ranges: ["ImageObject"]

		//redefining range to only cover ImageObejct.
		//Orig range [Url, ImageObject] cannot solved with urlVsSomething
		//since how would we store this range?
		// ambiguitySolvedBy: {
		// 	type: "urlVsSomething"
		// }
	},

	//special property defining custom subtypes. 
	//E.g.: a PianoBar and a Cocktailbar are subtypes of bar
	subtypes: {
		isCustom: true,
		ranges: ["Text"],
		isMulti: true
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
			type: "implicitType",
			storage: "thingIndex"
		}
	},

	alternativeHeadline: {},
	author: {
		isMulti: true,

		//Person || Organization || PlaceWithOpeningHours
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "thingIndex"
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
	},
	license: {
		ranges: ["URL"]
	},
	producer: {
		//Person || Organization
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "thingIndex"
		},
		isMulti: true
	},
	publisher: {
		//Person || Organization
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "thingIndex"
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
			type: "implicitType",
			storage: "sharedRoot"
		},
		isMulti: true
	},
	productionCompany: {
		//Organization allowed. 
		//This means roots: 
		//- OrganizationAndPerson
		//- PlaceWithOpeninghours (bc. LocalBusiness)
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "thingIndex"
		},
	},
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
			type: "implicitType",
			storage: "thingIndex"
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
		//Organization allowed. 
		//This means roots: 
		//- OrganizationAndPerson
		//- PlaceWithOpeninghours (bc. LocalBusiness)
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "thingIndex"
		},
		ranges: ["Organization"], //Don't allow ProgramMembership for now
		isMulti: true
	},
	nationality: {},


	///////////////////////////////////
	//http://schema.org/Organization //
	///////////////////////////////////
	department: {
		//Organization allowed. 
		//This means roots: 
		//- OrganizationAndPerson
		//- PlaceWithOpeninghours (bc. LocalBusiness)
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "thingIndex"
		},
	},
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
		ranges: ["Place"], //NO: PostalAddress or Text
		ambiguitySolvedBy: { //Place is ambiguous: Place or PlaceWithOpeninghours
			type: "implicitType",
			storage: "thingIndex"
		},
		isMulti: true
	},
	member: { //e.g.: org or persons
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "thingIndex"
		},
		isMulti: true
	},
	parentOrganization: {
		//Organization allowed. 
		//This means roots: 
		//- OrganizationAndPerson
		//- PlaceWithOpeninghours (bc. LocalBusiness)
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "thingIndex"
		},
	},
	subOrganization: {
		//Organization allowed. 
		//This means roots: 
		//- OrganizationAndPerson
		//- PlaceWithOpeninghours (bc. LocalBusiness)
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "thingIndex"
		},
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
			type: "implicitType",
			storage: "thingIndex"
		},
		isMulti: true
	},
	performer: {
		//Person || Organization
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "thingIndex"
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
		aliasOf: "workFeatured"
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
	workPresented: {
		aliasOf: "workFeatured"
	},


	///////////////////////////////////
	// http://schema.org/SportsEvent //
	///////////////////////////////////
	awayTeam: {
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "sharedRoot"
		}
	}, //The away team in a sports event.
	competitor: { //A competitor in a sports event.
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "sharedRoot"
		},
		isMulti: true
	},
	homeTeam: {
		ambiguitySolvedBy: {
			type: "implicitType",
			storage: "sharedRoot"
		}
	}, //The home team in a sports event.

};
