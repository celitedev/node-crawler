var properties = {
	// additionalProperty: {},
	name: {
		// jemeoder: "sadasd",
	},
	description: {},
	alternateName: {},
	image: {
		ranges: ["URL"] //ImageObject not supported for now
	},
	sameAs: {},
	url: {},

	// bla: {
	// 	description: "isNew properties are explicitly added by us",
	// 	isNew: true
	// }
};

var types = {
	Thing: {

		// overwrites: "Thing",

		//limit to the following Schema.org properties that the direct supertyped defines
		properties: {
			"name": {},
			"url": {},
			"description": {
				//isMulti : false -> default
			},
			"alternateName": {
				"isMulti": true,
				// "minItems": 1,
				// "maxItems": 2,
			},
			"image": {
				"isMulti": true
			},
			"sameAs": { //might be use to provide references from canonical to specific sources.
				"isMulti": true
			},
		},
		// //explicitly remove support for properties defined by ancestor types. 
		// //I.e.: a comment doesn't support a Image or something.
		// remove_ancestor_properties: {
		// 	//property names to remove by ancestors. format: `<name>: {}`
		// },
		// //properties added by Kwhen
		// added_properties: {

		// }
	},
	Place: {
		supertypes: ['Thing'], // must be proper subset of overwrite-type
		properties: {
			// additionalProperty: {}
		}
	}
};


module.exports = {
	properties: properties,
	types: types
};
