module.exports = {
	properties: {
		itemReviewed: {
			//See: https://github.com/Kwhen/crawltest/issues/51

			//this property is calculated so can not be written to. Isntead it's value is copied from 
			//another property.
			writeFrom: "about"
		},
		reviewBody: {
			writeFrom: "text"
		},
		reviewRating: {}
	}
};
