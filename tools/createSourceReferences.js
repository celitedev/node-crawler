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
		addSourceRefIdToExistingRefX: 0,
		composeRefs: 0,
		fetchExistingAndInsertNewRefNormsForReferences: 0,
		insertRefX: 0,
		updateModifiedDateForSourceEntities: 0
	}
};


Promise.resolve()
	// .then(function processNewSources() {

// 	var data = _.cloneDeep(dataProto);
// 	var start = new Date().getTime();

// 	//Func: Get SourceEntities that haven't been processed by this process yet. 
// 	//Tech: Get SourceEntities that don't exist in index 'modifiedMakeRefs'
// 	//'modifiedMakeRefs' is created based on field _state.modifiedMakeRefs. See #142 for more.

// 	return Promise.resolve()
// 		.then(function processNewSourcesRecursive() {

// 			return Promise.resolve()
// 				.then(toolUtils.getSourceEntities(data))
// 				.then(function calcStats(sourceEntities) {
// 					data.state.nrOfResults = sourceEntities.length;
// 					data.state.total += data.state.nrOfResults;
// 					console.log("processNewSources", data.state.total);
// 					return sourceEntities;
// 				})
// 				.then(toolUtils.resetDataFromSourceEntities(data))
// 				.then(toolUtils.updateExistingAndInsertNewRefNorms(data))
// 				.then(toolUtils.addSourceRefIdToExistingRefX(data))
// 				.then(toolUtils.composeRefs(data))
// 				.then(toolUtils.fetchExistingAndInsertNewRefNormsForReferences(data))
// 				.then(toolUtils.insertRefX(data))
// 				.then(toolUtils.updateModifiedDateForSourceEntities(data))
// 				.then(timerStats(data, start))
// 				.then(function() {
// 					//process all new sources by recursively fetching and processing all sourceEntities in batches
// 					if (data.state.nrOfResults === data.state.batch) {
// 						return processNewSourcesRecursive();
// 					}
// 				});
// 		});

// })
.then(function processExistingSources() {

		var data = _.cloneDeep(dataProto);
		var start = new Date().getTime();

		var processExistingButDirty = true;

		//Func: Get SourceEntities that haven't been processed by this process yet. 
		//Tech: Get SourceEntities that don't exist in index 'modifiedMakeRefs'
		//'modifiedMakeRefs' is created based on field _state.modifiedMakeRefs. See #142 for more.

		return Promise.resolve()
			.then(function processExistingSourcesRecursive() {
				return Promise.resolve()
					.then(toolUtils.getSourceEntities(data, processExistingButDirty))
					.then(function calcStats(sourceEntities) {
						data.state.nrOfResults = sourceEntities.length;
						data.state.total += data.state.nrOfResults;
						console.log("processExistingSources", data.state.total);
						return sourceEntities;
					})
					.then(toolUtils.resetDataFromSourceEntities(data))
					.then(toolUtils.composeRefs(data))
					// .then(toolUtils.fetchExistingAndInsertNewRefNormsForReferences(data))
					// .then(toolUtils.insertRefX(data))
					// .then(toolUtils.updateModifiedDateForSourceEntities(data))
					.then(timerStats(data, start))
					.then(function() {
						//process all new sources by recursively fetching and processing all sourceEntities in batches
						if (data.state.nrOfResults === data.state.batch) {
							return processExistingSourcesRecursive();
						}
					});
			});

	})
	.finally(function() {
		console.log("QUITTING");
		redisClient.quit(); //quit
		r.getPoolMaster().drain(); //quit
	});


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
