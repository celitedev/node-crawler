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

		var propType = generatedSchemas.properties[propName];

		if (esMappingProperties[propName]) {

			if (esMappingProperties[propName].mapping) {
				agg[propName] = esMappingProperties[propName].mapping;
			}

			//Extend with mappingExpanded, i.e.: a bunch of fields to include/expand a reference with
			if (esMappingProperties[propName].mappingExpanded) {
				var obj = {};
				obj[propName + "--expanded"] = {
					type: propType.isMulti ? "nested" : "object",
					properties: esMappingProperties[propName].mappingExpanded
				};
				_.extend(agg, obj);
			}
		}

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
