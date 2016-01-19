var _ = require("lodash");
var argv = require('yargs').argv;
var redis = require("redis");
var Promise = require("bluebird");
var uuid = require("uuid");

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")({
	checkSoundness: true,
	config: require("../schemas/domain/_definitions/config"),
	properties: require("../schemas/domain/_definitions").properties,
	types: require("../schemas/domain/_definitions").types,
	schemaOrgDef: require("../schemas/domain/_definitions/schemaOrgDef")
});

var config = require("../config");
var redisClient = redis.createClient(config.redis);
var r = require('rethinkdbdash')(config.rethinkdb);

var toolUtils = require("./utils")(generatedSchemas, r, redisClient);

var data = {
	state: {
		total: 0,
		batch: 200,
		nrOfResults: 0
	}
};

Promise.resolve().then(function processNewSources() {

	//Func: Get SourceEntities that haven't been processed by this process yet. 
	//Tech: Get SourceEntities that don't exist in index 'modifiedMakeRefs'
	//'modifiedMakeRefs' is created based on field _state.modifiedMakeRefs. See #142 for more.

	return Promise.resolve()
		.then(toolUtils.getNewSourceEntities(data))
		.then(function calcStats(sourceEntities) {
			data.state.nrOfResults = sourceEntities.length;
			data.state.total += data.state.nrOfResults;
			console.log("processNewSources", data.state.total);
			return sourceEntities;
		})
		.then(toolUtils.resetDataFromSourceEntities(data))
		.then(toolUtils.updateExistingAndInsertNewRefNorms(data))
		.then(toolUtils.addSourceRefIdToExistingRefX(data))
		.then(toolUtils.composeRefs(data))
		.then(toolUtils.fetchExistingAndInsertNewRefNormsForReferences(data))
		.then(toolUtils.insertRefX(data))
		.then(toolUtils.updateModifiedDateForSourceEntities(data))
		.then(function() {
			//process all new sources by recursively fetching and processing all sourceEntities in batches
			if (data.state.nrOfResults === data.state.batch) {
				return processNewSources();
			}
		});

}).finally(function() {
	console.log("QUITTING");
	redisClient.quit(); //quit
	r.getPoolMaster().drain(); //quit
});
