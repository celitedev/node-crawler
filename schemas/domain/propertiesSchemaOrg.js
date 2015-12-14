module.exports = {

	////////////////////////////
	//http://schema.org/Thing //
	////////////////////////////

	name: {
		// jemeoder: "sadasd",
	},
	description: {},
	alternateName: {},
	image: {
		ranges: ["URL"], //ImageObject not supported for now
		validation: {
			URL: { //validation per range-object

			}
		}
	},
	sameAs: {},
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
	aggregateRating: {},
	address: {},
	branchCode: {},
	containedInPlace: {},
	containsPlace: {},
};
