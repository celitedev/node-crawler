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
		// ranges: ["URL"], //ImageObject not supported for now
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
	bestRating: {},
	ratingValue: {},
	worstRating: {},

	//////////////////////////////////////
	//http://schema.org/AggregateRating //
	//////////////////////////////////////
	itemReviewed: {},
	ratingCount: {},
	reviewCount: {},


	////////////////////////////////////
	//http://schema.org/PostalAddress //
	////////////////////////////////////
	addressCountry: {},
	addressLocality: {},
	addressRegion: {},
	postOfficeBoxNumber: {},
	postalCode: {},
	streetAddress: {},

	///////////////////////////////////
	//http://schema.org/ContactPoint //
	///////////////////////////////////
	contactType: {},
	email: {},
	faxNumber: {},
	telephone: {},


	////////////////////////////
	//http://schema.org/Place //
	////////////////////////////
	aggregateRating: {}, //also avail in CreativeWork
	address: {},
	branchCode: {},
	containedInPlace: {},
	containsPlace: {
		"isMulti": true
	},
	logo: {
		// ranges: ["URL"] //ImageObject not supported for now
	},
	// review: {}


	///////////////////////////////////
	//http://schema.org/CreativeWork //
	///////////////////////////////////
	about: {},
	alternativeHeadline: {},
	citation: {},
	comment: {},
	commentCount: {},
	contentRating: {},
	copyrightYear: {},
	// creator: {

	// 	//This is the same as the Author property for CreativeWork.

	// 	//exclude from internal model
	// 	//Just exists for compatibility with schema.org
	// 	excludeFromModel: true,
	// 	toSchemaOrg: function(notDefined, domainModel) {
	// 		return domainModel.author;
	// 	}
	// },
	genre: {},
	hasPart: {},
	headline: {},
	isPartOf: {},
	keywords: {
		"isMulti": true,

		//Format from Kwhen domain -> schema.org
		//Here: we represent as array while schemaOrg insists on comma-delimited
		toSchemaOrg: function(keywordsArr, domainModel) {
			return keywordsArr.join(","); //from arr -> comma-delimited
		}
	},
	license: {},
	text: {},
	thumbnailUrl: {},

	///////////////////////////////////
	//http://schema.org/MediaObject //
	///////////////////////////////////
	bitrate: {},
	contentSize: {},
	contentUrl: {},
	uploadDate: {},

	//////////////////////////////////
	//http://schema.org/ImageObject //
	///////////////////////////////////
	caption: {},

	//////////////////////////////////
	//http://schema.org/Movie //
	///////////////////////////////////


	//////////////////////////////////
	//http://schema.org/Review //
	///////////////////////////////////

	reviewBody: {
		//should be accompanied with a copyOf directive in all types carrying this property
		//this signals that reviewBody will not be part of the domain
		"transient": true
	},
	//rating GIVEN in review. AggregateRating is rating of the review
	reviewRating: {},
};
