module.exports = {
	domain: {
		roots: [
			"Place",
			"Organization",
			"Person",
			"Event",
			"PlaceWithOpeninghours", //combines  "LocalBusiness" and CivicStructure
			"CreativeWork",
			"MediaObject",
			"Comment",
			"Review",

			//all ratings are stored as root. This includes AggregateRating as subtype. 
			//This completes coverage as per https://github.com/Kwhen/crawltest/issues/76
			"Rating"

			//TODO: might bring review and rating together in same root 
			//(by creating a new placeholder type as with PlaceWithOpeninghours)

		]
	}
};
