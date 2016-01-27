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

var promises = _.map(domainConfig.domain.roots, function(root) {

	var indexName = root.toLowerCase();

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
				index: indexName
			});
		});
});


Promise.all(promises)
	.then(function(result) {
		console.log("indices created: ", domainConfig.domain.roots.join(","));
	})
	.catch(function(err) {
		console.trace(err);
	});
