module.exports = {
	properties: {
		about: {},
		aggregateRating: {},
		alternativeHeadline: {},
		//author: //person || org
		//character //peron (fictional character. So not actor for instance)
		citation: {
			isMulti: true
		},
		comment: {
			isMulti: true
		},
		commentCount: {},
		contentRating: {}, //MPAA PG-13
		copyrightYear: {},

		//NOTE. 
		//creator 
		//encoding: MediaObject
		genre: {
			isMulti: true
		},
		hasPart: {
			isMulti: true
		},
		headline: {},
		isPartOf: {
			isMulti: true
		},
		keywords: {
			"isMulti": true
		},
		license: {},
		//producer
		//publisher
		text: {},
		thumbnailUrl: {},
	}
};
