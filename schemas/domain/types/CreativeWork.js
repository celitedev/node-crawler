module.exports = {
	properties: {
		// about: {}, part of #63
		aggregateRating: {},
		alternativeHeadline: {},
		author: { //person || org
			isMulti: true
		},
		character: { //peron (fictional character. So not actor for instance)
			isMulti: true
		},
		citation: {
			isMulti: true
		},
		comment: {
			isMulti: true
		},
		commentCount: {},
		contentRating: {}, //MPAA PG-13
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
			isMulti: true
		},
		keywords: {
			"isMulti": true
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
	}
};
