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
				mapping: {
					type: "string",
					"index": "not_analyzed"
				},
				enum: {
					type: "static",
					options: {
						values: {
							drama: "Drama",
							documentary: "documentary",
							"action/adventure": ["action", "adventure"],
							"art house/foreign": ["art house", "foreign"]
						}
					}
				}
			},


			subtypes: {
				mapping: {
					type: "string",
					"index": "not_analyzed"
				},

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
				//mapping: used during mapping process (tools/renewESMappings)
				//mappings are to be passed verbatim to ES mapping endpoint.
				mapping: {
					type: "double"
				},

				//transform: used on indexing as well as quering
				transform: function(val) {
					return parseFloat(val);
				}
			},

			ratingCount: {
				mapping: {
					type: "long"
				},
				transform: function(val) {
					return parseFloat(val);
				}
			},

			aggregateRating: {
				mapping: {
					type: "object",
				}
			},


			//Geo is of type geo_point
			//https://www.elastic.co/guide/en/elasticsearch/guide/current/lat-lon-formats.html
			geo: {
				mapping: {
					type: "geo_point",

					//geopoints are expensive. We'll store them on disk instead of mem
					//https://www.elastic.co/guide/en/elasticsearch/guide/current/geo-memory.html#geo-memory
					"doc_values": true
				},
				transform: function(geoObj) {
					return [geoObj.longitude, geoObj.latitude]; //long first -> bit weird but this is the GeoJSON compliant way.
				}
			},

			name: {
				mapping: {

					type: "string",

					//example of multi-fields
					//https://www.elastic.co/guide/en/elasticsearch/reference/current/_multi_fields.html
					"fields": {
						"raw": {
							"type": "string",
							"index": "not_analyzed"
						}
					}
				}
			},

			location: {

				//each ref should be like this, since it allows term filter
				mapping: {
					type: "string",
					"index": "not_analyzed"
				},

				//Exclude=true: exclude value from indexing. 
				//Note: This doesn't prevent expanded and/or derived fields from being indexed
				exclude: false,

				//Creates a new property `location--expand`
				//If multivalued this is of type 'nested' otherwise of type 'object'
				expand: {
					fields: ["name", "geo"],
					// includeId: true, //include id in expanded objects. Useful for multivalued fields

					transform: { //transform in object-notation
						geo: function(geo) {
							return [geo.longitude, geo.latitude]; //GEOJSON format
						}
					}
				}
			},

			workFeatured: {

				mapping: {
					type: "string",
					"index": "not_analyzed"
				},

				//exclude=true: exclude value from indexing. 
				//This doesn't prevent expanded and/or derived fields from being indexed
				exclude: false,

				//creates a new property `workFeatured--expand`
				//If multivalued this is of type 'nested' otherwise of type 'object'
				expand: {
					fields: ["name", "aggregateRating", "genre"],
					// includeId: true, //include id in expanded objects. Useful for multivalued fields
					//transform: is optional and defaults to `_.pick(ref,expand.fields)`
				}
			}
		},

		propertiesCalculated: {

			subtypesAll: {
				populate: {
					fields: "subtypes"
				},
				roots: true, //true (all) or (array of) rootNames
				isMulti: true,
				mapping: {
					type: "string",
					"index": "not_analyzed"
				}
			},

		},
	};

	//Need for singleton (instead of local copy) 
	//because we change this object in process, and this change
	//should be propagated to all stuff referencing it.
	singleton = singleton || obj;

	return singleton;
};
