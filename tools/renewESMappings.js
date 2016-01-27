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


var client = new elasticsearch.Client(config.elasticsearch);


var indexMapping = {
	"settings": {
		"number_of_shards": 1
	},
	"mappings": {
		"type1": {

			//no source
			"_source": {
				"enabled": false
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
		return "kwhen-" + root.toLowerCase();
	});
}

var promises = _.map(getAllIndexNames(), function(indexName) {

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
				body: indexMapping
			});
		});
});


Promise.all(promises)
	.then(function(result) {
		console.log("indices created: ", getAllIndexNames().join(","));
	})
	.catch(function(err) {
		console.trace(err);
	});
