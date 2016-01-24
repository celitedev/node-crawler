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

var dataProto = {
	state: {
		total: 0,
		batch: 1000,
		nrOfResults: 0
	},
	time: {
		getSourceEntities: 0,
		updateExistingAndInsertNewRefNorms: 0,
		addSourceRefIdToExistingRefs: 0,
		composeRefs: 0,
		fetchExistingAndInsertNewRefNormsForReferences: 0,
		updateModifiedDataForSourceEntities: 0
	}
};

Promise.resolve()
	.then(function processNewSources() {

		//Func: Process SourceEntities that haven't been processed here yet. 
		//Tech: Process SourceEntities that don't exist in index 'modifiedMakeRefs'

		return processStack();

	})
	.then(function processExistingSources() {

		//Func: Process SourceEntities that have been processed but have become dirty since. 
		//Tech: Process SourceEntities that exist in index 'dirtyForMakeRefs'
		var processExistingButDirty = true;
		return processStack(processExistingButDirty);

	})
	.finally(function() {
		console.log("QUITTING");
		redisClient.quit(); //quit
		r.getPoolMaster().drain(); //quit
	});


function processStack(doProcessExisting) {

	var data = _.cloneDeep(dataProto);
	var start = new Date().getTime();

	return Promise.resolve()
		.then(function processSourcesRecursive() {
			return Promise.resolve()
				.then(toolUtils.getSourceEntities(data, doProcessExisting))
				.then(function calcStats(sourceEntities) {
					data.state.nrOfResults = sourceEntities.length;
					data.state.total += data.state.nrOfResults;
					console.log(!doProcessExisting ? "processNewSources" : "processExistingSources", data.state.total);
					return sourceEntities;
				})
				.then(toolUtils.resetDataFromSourceEntities(data))
				.then(toolUtils.updateExistingAndInsertNewRefNorms(data))
				.then(toolUtils.addSourceRefIdToExistingRefs(data))
				.then(toolUtils.composeRefs(data))
				.then(toolUtils.fetchExistingAndInsertNewRefNormsForReferences(data))
				.then(toolUtils.updateModifiedDataForSourceEntities(data))
				.then(timerStats(data, start))
				.then(function() {
					//process all new sources by recursively fetching and processing all sourceEntities in batches
					if (data.state.nrOfResults === data.state.batch) {
						return processSourcesRecursive();
					}
				});
		});
}



function timerStats(data, start) {
	return function calcStats() {
		var stats = _.reduce(data.time, function(agg, v, k) {
			agg[k] = v / 1000;
			return agg;
		}, {});
		stats.TOTAL = (new Date().getTime() - start) / 1000;
		console.log("Stats", JSON.stringify(stats, undefined, 2));
	};
}
