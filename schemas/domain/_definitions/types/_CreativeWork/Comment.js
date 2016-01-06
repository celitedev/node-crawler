module.exports = {
	supertypes: ["Thing"], //not CreativeWork
	properties: {
		about: false,
		author: false,
		text: false
			//NOT NOW
			//upvoteCount
			//downvoteCount
	},
	removeProperties: ["sameAs", "alternateName", "description"]
};
