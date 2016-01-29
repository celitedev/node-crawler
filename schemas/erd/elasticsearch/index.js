//This file describes elasticsearch mappings. 
//Each domain-property that IS NOT described here, is mapped verbatim. 
//If a domain-property should NOT be indexed in ES it should be made explicit here. 
//
//TODO: Calculated properties should also be allowed. 
//These is likely seperate config altogether, since we must
//loop them separately in renewEsMapping and populateES jobs
//
module.exports = {

	//when expanding refs in ERD, for increased perf on indexing we don't 
	//fetch all fields. The fields fetched here should include all the 
	//fields that you ever want to use while expanding refs of any kind
	refExpandWithFields: [
		"name",
		"address",
		"geo"
	],

	properties: {
		//https://www.elastic.co/guide/en/elasticsearch/guide/current/lat-lon-formats.html
		//Geo is of type geo_point
		geo: {
			mapping: { //mappings are to be passed verbatim to ES mapping endpoint.
				type: "geo_point",
			},
			transform: function(geoObj) {
				return [geoObj.longitude, geoObj.latitude]; //long first -> bit weird but this is the GeoJSON compliant way.
			}
		},
		location: { //ref
			//creates a new property `location--expanded`
			//If multivalued this is of type 'nested' otherwise of type 'object'
			mappingExpanded: {
				"name": {

					type: "string",

					//example of multi-fields
					//https://www.elastic.co/guide/en/elasticsearch/reference/current/_multi_fields.html
					"fields": {
						"raw": {
							"type": "string",
							"index": "not_analyzed"
						}
					}
				},
				"geo": {
					type: "geo_point",
				}
			},
			//goal is to return the properties as defined in mappingExpanded
			//Input: 
			//- v: value before transforming
			//- ref: resolved ref
			transformExpanded: function(v, ref) {

				var out = {
					name: ref.name
				};

				if (ref.geo) {
					out.geo = [ref.geo.longitude, ref.geo.latitude];
				}
				return out;
			}
		}
	}

};
