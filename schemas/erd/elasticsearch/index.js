var _ = require("lodash");

//This file describes elasticsearch mappings. 
//Each domain-property that IS NOT described here, is mapped verbatim. 
//If a domain-property should NOT be indexed in ES it should be made explicit here. 
//
//TODO: Calculated properties should also be allowed. 
//These is likely seperate config altogether, since we must
//loop them separately in renewEsMapping and populateES jobs


//Elasticsearch mappings which may be included by reference. 
//We first implemented this by string lookup but this gave some weird errors
//on geo-mapping. This seems cleaner anyway.
var mappings = require("../../domain/utils").mappings;

var singleton;
module.exports = function(generatedSchemas) {

	var vocabs = require("../../../vocabularies")(generatedSchemas);

	var obj = {

		//when expanding refs in ERD, for increased perf on indexing we don't 
		//fetch all fields. The fields fetched here should include all the 
		//fields that you ever want to use while expanding refs of any kind
		refExpandWithFields: [

			//thing
			"name",

			//place
			"address", "geo", "containedInPlace",

			//creative work
			"aggregateRating", "genre"
		],

		properties: {

			genre: {
				enum: vocabs.genre
			},

			subtypes: {
				enum: vocabs.subtypes
			},

			ratingValue: {
				mapping: "double",
				transform: "float"
			},

			ratingCount: {
				mapping: "long",
				transform: "float"
			},

			aggregateRating: {
				mapping: "object"
			},

			geo: {
				mapping: mappings.geo,
				transform: "geo"
			},

			name: {
				mapping: {
					type: "string",
				},
				fields: {
					"raw": mappings.notAnalyzed
				}
			},

			containedInPlace: {
				expand: {
					fields: ["name"], //create field: containedInPlace--name
					flatten: true
				}
			},

			location: {
				exclude: false,
				expand: {
					fields: ["name", "geo", "containedInPlace", "containedInPlace--name"],
					// postPruneFields: ["containedInPlace"], //used to create containedInPlace--name
					includeId: false,
				}
			},

			performer: {
				exclude: false,
				expand: {
					fields: ["name"]
				}
			},

			workFeatured: {
				expand: {
					fields: ["name", "aggregateRating", "genre", "subtypes", "all_tags"],
					// postPruneFields: ["genre", "subtypes"] //there are used to create `all_tags`
				}
			},



		},

		propertiesCalculated: {

			//suggester: https://www.elastic.co/guide/en/elasticsearch/reference/current/search-suggesters-completion.html
			suggest: {
				roots: true, //true (all) or (array of) rootNames
				isMulti: false,
				mapping: mappings.suggestWithTypeAndLocationContext,
				populate: {
					fields: "name",
				},
			},

			root: { //works since 'root' is specifically defined in CanonicalEntity
				roots: true, //true (all) or (array of) rootNames
				isMulti: false
			},


			all_subtypes: {
				roots: true, //true (all) or (array of) rootNames
				isMulti: true,
				mapping: mappings.enum,
				populate: {
					fields: "subtypes",
				},
			},

			all_genre: {
				roots: "CreativeWork",
				isMulti: true,
				mapping: mappings.enum,
				populate: {
					fields: "genre"
				},
			},

			all_tags: {
				roots: true,
				isMulti: true,
				mapping: mappings.enum,
				postPopulate: { //populate *after* vocab lookup + transform
					fields: ["genre", "subtypes"]
				},
			},

		},

		defaultPropertyRelations: {

		}
	};

	//Need for singleton (instead of local copy) 
	//because we change this object in process, and this change
	//should be propagated to all stuff referencing it.
	singleton = singleton || obj;

	return singleton;
};
