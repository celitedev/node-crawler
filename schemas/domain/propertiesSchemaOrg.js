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
	bestRating: {}, //The highest value allowed in this rating system. If bestRating is omitted, 5 is assumed.
	ratingValue: {},
	worstRating: {},

	//////////////////////////////////////
	//http://schema.org/AggregateRating //
	//////////////////////////////////////
	itemReviewed: {},
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
	addressCountry: {},
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
		ranges: ["PostalAddress"] //require PostalAddress instead of Text: format nicely where we can
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
	logo: {},
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

	///////////////////////////////////
	//http://schema.org/CreativeWork //
	///////////////////////////////////
	about: {},
	alternativeHeadline: {},
	author: {
		isMulti: true
	},
	character: {
		isMulti: true
	},
	citation: {
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
	license: {},
	producer: {
		isMulti: true
	},
	publisher: {
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
	//https://schema.org/MusicAlbum //
	/////////////////////////////////////
	albumRelease: {
		isMulti: true //refers to 1-n MusicRelease
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
	seasonNumber: {},


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
	episodeNumber: {},
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
		isMulti: true
	},
	member: { //e.g.: org or persons
		isMulti: true
	},
	parentOrganization: {},
	subOrganization: {
		isMulti: true
	},

};
