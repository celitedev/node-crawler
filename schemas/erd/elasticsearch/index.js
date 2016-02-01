var _ = require("lodash");

//This file describes elasticsearch mappings. 
//Each domain-property that IS NOT described here, is mapped verbatim. 
//If a domain-property should NOT be indexed in ES it should be made explicit here. 
//
//TODO: Calculated properties should also be allowed. 
//These is likely seperate config altogether, since we must
//loop them separately in renewEsMapping and populateES jobs


var singleton;
module.exports = function(generatedSchemas) {

	var obj = {

		//when expanding refs in ERD, for increased perf on indexing we don't 
		//fetch all fields. The fields fetched here should include all the 
		//fields that you ever want to use while expanding refs of any kind
		refExpandWithFields: [

			//thing
			"name",

			//place
			"address", "geo",

			//creative work
			"aggregateRating", "genre"
		],

		properties: {

			genre: {
				enum: {
					type: "static",
					options: {
						verbatim: ["drama"],
						values: {
							//Fandango Mappings
							"drama": "Drama",
							"action/adventure": ["action", "adventure"],
							"comedy": ["comedy", "comedies", "humor"],
							"suspense/thriller": ["suspense", "thriller"],
							"documentary": "documentary",
							"sci-fi/fantasy": ["sci-fy", "fantasy"],
							"family": "family",
							"animated": ["animated", "drawn", "animation"],
							"horror": ["horror", "scary"],
							"3d": ["animated", "3d", "animation"],
							"romance": ["romance", "romcom", "romantic"],
							"imax": "imax",
							"concert/special events": ["concert", "special events"],
							"art house/foreign": ["art house", "foreign"],
							"music/performing arts": ["music", "performing arts"]
						}
					}
				}
			},


			subtypes: {

				// enum: {
				// 	type: "static", //alternative: elasticsearch index/type

				// 	options: {

				// 		//pass-along all types verbatim
				// 		//these are lookedup + stored lowercase
				// 		verbatim: _.keys(generatedSchemas.types),

				// 		//keys (to which input is matched) as well as 'out' 
				// 		//are stored in matched / stored in lowercase
				// 		values: {
				// 			"MovieTheater": {
				// 				out: "movie theater",
				// 				limitToTypes: "LocalBusiness"
				// 			},
				// 			"pianoBar": "piano bar",
				// 			"BarOrPub": {
				// 				out: ["bar", "pub"],
				// 				schemaOrg: { //if a schema.org match exists for this enumeration-value list it here
				// 					type: "type", //the type of schema.org structure: e.g.: a Type with subtypes
				// 					name: "BarOrPub" //type name
				// 				}
				// 			}
				// 		}
				// 	}
				// }
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
				mapping: {

					//Geo is of type geo_point
					//https://www.elastic.co/guide/en/elasticsearch/guide/current/lat-lon-formats.html
					type: "geo_point",

					//geopoints are expensive. We'll store them on disk instead of mem
					//https://www.elastic.co/guide/en/elasticsearch/guide/current/geo-memory.html#geo-memory
					"doc_values": true
				},
				transform: "geo"
			},

			name: {
				mapping: {
					type: "string",

					//example of multi-fields
					//https://www.elastic.co/guide/en/elasticsearch/reference/current/_multi_fields.html
				},
				fields: {
					"raw": "kwhen_notAnalyzed"
				}
			},

			location: {

				//Exclude=true: exclude value from indexing. 
				//Note: This doesn't prevent expanded and/or derived fields from being indexed
				exclude: false,

				//Creates a new property populate`location--expand`
				//If multivalued this is of type 'nested' otherwise of type 'object'
				expand: {
					fields: ["name", "geo"],
					// includeId: true, //include id in expanded objects. Useful for multivalued fields
				}
			},

			workFeatured: {

				exclude: false,

				//creates a new property `workFeatured--expand`
				//If multivalued this is of type 'nested' otherwise of type 'object'
				expand: {
					fields: ["name", "aggregateRating", "genre"],
					// includeId: true, //include id in expanded objects. Useful for multivalued fields
				}
			}
		},

		propertiesCalculated: {

			all_subtypes: {
				roots: true, //true (all) or (array of) rootNames
				isMulti: true,
				mapping: "kwhen_enum",
				populate: {
					fields: "subtypes",
					// strategy: function(val) { //default function
					// 	return _.isArray(val) ? val : [val];
					// }
				},

			},

			all_genre: {
				roots: true,
				isMulti: true,
				mapping: "kwhen_enum",
				populate: {
					fields: "genre"
				},
			},
		},
	};

	//Need for singleton (instead of local copy) 
	//because we change this object in process, and this change
	//should be propagated to all stuff referencing it.
	singleton = singleton || obj;

	return singleton;
};
