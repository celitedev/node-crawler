module.exports = {

	////////////////////////////
	//http://schema.org/Thing //
	////////////////////////////

	name: {
		// jemeoder: "sadasd",
	},
	description: {},
	alternateName: {
		"isMulti": true
	},
	image: {
		"isMulti": true,

		//TODO
		validation: {
			URL: { //validation per range-object

			}
		}
	},
	sameAs: {
		"isMulti": true
	},
	url: {},


	/////////////////////////////
	//http://schema.org/Rating //
	/////////////////////////////
	bestRating: {
		ranges: ["Number"]
	}, //The highest value allowed in this rating system. If bestRating is omitted, 5 is assumed.
	ratingValue: {

	},
	worstRating: {
		ranges: ["Number"]
	},

	//////////////////////////////////////
	//http://schema.org/AggregateRating //
	//////////////////////////////////////
	itemReviewed: {
		//schema.org defines Thing. We define proper subtypes that may be reviewed. 
		//This includes all entities except for Review and Rating (these may not be reviewed themselves)
		//Of course, we've now created an ambiguous range so we need to specify how we're going to solve this
		ranges: [
			"Place",
			"Event",
			"PlaceWithOpeninghours",
			"OrganizationAndPerson",
			"CreativeWork"
		],
	},

	//define which rootType is supplied
	//see: ambiguitySolvedBy-issue: https://github.com/Kwhen/crawltest/issues/75
	itemOfRootType: {
		id: "itemOfRootType",
		isCustom: true,
		ranges: ["Text"], //TODO: enum that should restrict to roots
		required: true //TODO: if part of schema it's required.
	},
	ratingCount: {},
	reviewCount: {}, //bit weird, but can be used to list nr or reviews. Although factually not related to ratings


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


	//////////////////////////////////////
	//https://schema.org/GeoCoordinates //
	//////////////////////////////////////
	elevation: {
		ranges: ["Number"]
	},
	latitude: {
		ranges: ["Number"]
	},
	longitude: {
		ranges: ["Number"]
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

	},
	review: {
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
		ranges: ["Text", "URL"]
	},
	menu: {},
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
	// about: {}, 

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
	comment: {
		isMulti: true
	},
	commentCount: {},
	contentRating: {},
	copyrightYear: {},
	encoding: {
		isMulti: true
	},
	genre: {
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
		//should be accompanied with a writeFrom directive in all types carrying this property
		//this signals that reviewBody will not be part of the domain
		//https://github.com/Kwhen/crawltest/issues/52
		"transient": true
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
	catalogNumber: {},
	creditedTo: {},
	recordLabel: {},
	releaseOf: {}, //points to MusicAlbum


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
		isMulti: true
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
