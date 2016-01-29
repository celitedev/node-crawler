var elasticsearch = require('elasticsearch');
var _ = require("lodash");
var argv = require("yargs").argv;

var config = require("../config");
var domainConfig = require("../schemas/domain/_definitions/config");
var esMappingConfig = require("../schemas/erd/elasticsearch");
var esMappingProperties = esMappingConfig.properties;

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")({
	checkSoundness: true,
	config: domainConfig,
	properties: require("../schemas/domain/_definitions").properties,
	types: require("../schemas/domain/_definitions").types,
	schemaOrgDef: require("../schemas/domain/_definitions/schemaOrgDef")
});


var client = new elasticsearch.Client(config.elasticsearch);

var indexMapping = {
	"settings": {
		"number_of_shards": 1
	},
	"settings": {
		//We don't coerce since we want everything to be explicit. 
		//This is needed since we want to transform all queries through the same pipeline as indexing
		"index.mapping.coerce": false
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


function getAllIndexNames() {
	return _.map(domainConfig.domain.roots, function(root) {
		return {
			root: root,
			indexName: "kwhen-" + root.toLowerCase()
		};
	});
}

var promises = _.map(getAllIndexNames(), function(obj) {

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
		});
});


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

	mapping.mappings.type1.properties = _.reduce(propNames, function(agg, propName) {

		addPropertyMapping(propName, agg);

		return agg;
	}, {});

	return mapping;
}

Promise.all(promises)
	.then(function(result) {
		console.log("indices created: ", _.pluck(getAllIndexNames(), "indexName").join(","));
	})
	.catch(function(err) {
		console.trace(err);
	});


var nestedTypes = ["object", "nested"];

function addPropertyMapping(propName, agg) {

	var propType = generatedSchemas.properties[propName];
	var propESObj = esMappingProperties[propName];
	if (propESObj) {

		if (propESObj.mapping) {
			agg[propName] = propESObj.mapping;

			//no mapping defined on a nested object, so recurse
			//NOTE: this deliberately doesn't use clone, so this code will automatically inject
			//the updated mapping to 'expand' mappings below
			if (!agg[propName].properties && ~nestedTypes.indexOf(agg[propName].type)) {
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
				var fieldESObj = esMappingProperties[fieldName];
				if (fieldESObj && fieldESObj.mapping) {
					agg[fieldName] = fieldESObj.mapping;
				}
				return agg;
			}, {});

			_.extend(agg, out);
		}
	}
}
