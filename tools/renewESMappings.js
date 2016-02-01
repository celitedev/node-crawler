var elasticsearch = require('elasticsearch');
var _ = require("lodash");
var argv = require("yargs").argv;

var config = require("../config");
var domainConfig = require("../schemas/domain/_definitions/config");

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")({
	checkSoundness: true,
	config: domainConfig,
	properties: require("../schemas/domain/_definitions").properties,
	types: require("../schemas/domain/_definitions").types,
	schemaOrgDef: require("../schemas/domain/_definitions/schemaOrgDef")
});

var esMappingConfig = require("../schemas/erd/elasticsearch")(generatedSchemas);

var client = new elasticsearch.Client(config.elasticsearch);

var indexMapping = {
	"settings": {
		"number_of_shards": 1
	},
	"settings": {
		//We don't coerce since we want everything to be explicit. 
		//This is needed since we want to transform all queries through the same pipeline as indexing
		"index.mapping.coerce": false,

		"index": {
			"analysis": {
				"analyzer": {
					"enum": {
						"tokenizer": "keyword",
						"filter": "lowercase"
					}
				}
			}
		}
	},
	"mappings": {
		"type1": {

			//no source
			"_source": {
				"enabled": true //for now
			},

			//timestamp probably useful for Kibana: 
			//https://www.elastic.co/guide/en/elasticsearch/reference/1.4/mapping-timestamp-field.html
			"_timestamp": {
				"enabled": true
			}
		}
	}
};


Promise.resolve()
	.then(function() {

		var nonExistPropNames = [],
			enumOnNonDatatypes = [],
			enumNotMultivalued = [];

		_.each(_.keys(esMappingConfig.properties), function(propName) {
			if (!~_.keys(generatedSchemas.properties).indexOf(propName)) {
				nonExistPropNames.push(propName);
			} else {

				var prop = generatedSchemas.properties[propName];

				if (prop.enum) {
					//enum defined -> may not be defined on non-datatypes
					//may be defined on all calculated fields since these are treated
					//as datatypes at all time
					var typeName = prop.ranges[0];
					if (!generatedSchemas.datatypes[typeName]) {
						enumOnNonDatatypes.push(propName);
					} else if (!prop.isMulti) {
						enumNotMultivalued.push(propName);
					}
				}
			}
		});

		//test for calculated fields that define enum -> should be isMulti=true
		_.each(esMappingConfig.propertiesCalculated, function(prop, propName) {
			if (prop.enum && !prop.isMulti) {
				enumNotMultivalued.push(propName);
			}
		});

		if (nonExistPropNames.length) {
			throw new Error("ES property doesn't exit in definitions. " +
				"Did you want to make it a calculated property? : " +
				nonExistPropNames.join(","));
		}


		if (enumOnNonDatatypes.length) {
			throw new Error("ES property with 'enum' exists on non-datatype property: " +
				enumOnNonDatatypes.join(","));
		}

		if (enumNotMultivalued.length) {
			throw new Error("ES property with 'enum' exists on singlevalued property: " +
				enumNotMultivalued.join(","));
		}

		//test / normalize all enums
		var allProps = _.extend({}, esMappingConfig.properties, esMappingConfig.propertiesCalculated);
		_.each(allProps, function(prop, propName) {
			if (!prop.enum) return;
			if (prop.enum.type !== "static") throw new Error("enum.type should be 'static' for now: " +
				prop.enum.type);

			var options = prop.enum.options;

			if (!options || !options.values) throw new Error("enum.options and enum.options.values should be defined: " +
				JSON.stringify(prop.enum));

			_.each(options.values, function(val) {
				if (_.isObject(val) && !_.isArray(val) && !val.out) throw new Error("enum.options.values[x].out should be defined (or string shortcut): " +
					JSON.stringify(val));
			});

		});


	})
	.then(function() {
		return Promise.all(_.map(getAllIndexNames(), function(obj) {

			var root = obj.root,
				indexName = obj.indexName;

			return Promise.resolve()
				.then(function deleteIndex() {

					return Promise.resolve()
						.then(function() {
							return client.indices.delete({
								index: indexName
							});
						})
						.catch(function(err) {
							//silenty ignore index_not_found
							if (err.body.error.type !== "index_not_found_exception") {
								throw err;
							}
						});
				})
				.then(function createIndex() {
					return client.indices.create({
						method: "PUT",
						index: indexName,
						body: createIndexMapping(indexMapping, root)
					});
				})
				.catch(function(err) {
					throw err;
				});
		}));
	})
	.then(function(result) {
		console.log("indices created: ", _.pluck(getAllIndexNames(), "indexName").join(","));
	})
	.catch(function(err) {
		setTimeout(function() { //throw already
			throw err;
		});
	});



function getAllIndexNames() {
	return _.map(domainConfig.domain.roots, function(root) {
		return {
			root: root,
			indexName: "kwhen-" + root.toLowerCase()
		};
	});
}

function createIndexMapping(indexMapping, root) {
	var mapping = _.cloneDeep(indexMapping);

	//get root + all subtypes
	var typesForRoot = _.filter(generatedSchemas.types, {
		rootName: root
	});


	//Get all properties that can exist in index. 
	//This is the aggregate of all properties defined on the above types.
	var propNames = _.uniq(_.reduce(typesForRoot, function(arr, type) {
		return arr.concat(_.keys(type.properties));
	}, []));

	//add mappings for properties that exist on root
	mapping.mappings.type1.properties = _.reduce(propNames, function(agg, propName) {
		addPropertyMapping(propName, agg);
		return agg;
	}, {});


	//Add mappings for isCalculated properties that should exist on this root. 
	//This is defined by directive `roots`, with options: 
	//- true -> belong to any root
	//- string || [string]  
	var allPropertyNames = _.keys(generatedSchemas.properties);
	var calculatedProps = esMappingConfig.propertiesCalculated;

	var existingProps = _.intersection(allPropertyNames, _.keys(calculatedProps));
	if (existingProps.length) {
		throw new Error("calculated ES properties exist that are already defined in prop definitions: " + existingProps.join(","));
	}

	mapping.mappings.type1.properties = _.reduce(calculatedProps, function(agg, prop, propName) {
		var roots = _.isArray(prop.roots) ? prop.roots : [prop.roots];
		if (prop.roots === true || ~roots.indexOf(root)) {
			addPropertyMapping(propName, agg);
		}
		return agg;
	}, mapping.mappings.type1.properties);

	return mapping;
}

function isNestedMapping(mapping) {
	return ~["object", "nested"].indexOf(mapping.type);
}

function addPropertyMapping(propName, agg) {

	var propESObj = esMappingConfig.properties[propName] || esMappingConfig.propertiesCalculated[propName];
	var propType = generatedSchemas.properties[propName]; //NOTE: doesn't exist in case of calculated prop.

	if (propESObj) {

		if (propESObj.mapping) {
			agg[propName] = propESObj.mapping;

			//If nested mapping defined without properties -> attempt to fetch mappings through
			//knowledge of type on that property, and through that find possible nested props.
			//
			//TECH NOTE: this deliberately doesn't use clone, so this code will automatically inject
			//the updated mapping to 'expand' mappings below
			if (isNestedMapping(agg[propName]) && !agg[propName].properties && propType) {
				var nestedPropNames = _.pluck(generatedSchemas.types[propType.ranges[0]].properties, "id");
				agg[propName].properties = _.reduce(nestedPropNames, function(agg, propName) {
					addPropertyMapping(propName, agg);
					return agg;
				}, {});
			}
		}

		//Extend with mappingExpanded, i.e.: a bunch of fields to include/expand a reference with
		var expandObj = propESObj.expand;
		if (expandObj) {

			var out = {};
			var obj = out[propName + "--expand"] = {
				type: propType.isMulti ? "nested" : "object"
			};

			obj.properties = _.reduce(expandObj.fields, function(agg, fieldName) {
				var fieldESObj = esMappingConfig.properties[fieldName];
				if (fieldESObj && fieldESObj.mapping) {
					agg[fieldName] = fieldESObj.mapping;
				}
				return agg;
			}, {});

			_.extend(agg, out);
		}
	}
}
