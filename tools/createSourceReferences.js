var _ = require("lodash");
var argv = require('yargs').argv;
var redis = require("redis");
var Promise = require("bluebird");

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

var entities = require("../schemas/domain/entities")(generatedSchemas, r);
var CanonicalEntity = entities.CanonicalEntity;
var SourceEntity = entities.SourceEntity;

function getSourceEntityState(r) {
	return {
		sourceType: r._sourceType,
		sourceUrl: r._sourceUrl,
		sourceId: r._sourceId,
		batchId: r._state.batchId,
		type: r._type,
		detailPageAware: false, //for completeness
	};
}

Promise.resolve().then(function processNewSources() {

	console.log("processNewSources");
	var batch = 1000;

	//Get SourceEntities that haven't been processed by this process yet. 
	//This process sets modifiedMakeRefs to a DT once it's done
	//
	//TODO: how to use indices here? 
	return r.table(SourceEntity.SOURCETABLE)
		.filter(r.row('_state').hasFields("modifiedMakeRefs").not()).limit(batch)
		.run()
		.then(function(results) {

			var sourceObjects = _.map(results, function(r) {
				return new SourceEntity(getSourceEntityState(state), r);
			});

			//TODO: 
			//1. find/create refnorm (by either sourceId or sourceUrl)
			// - add sourceRefId
			// - add sourceId|sourceUrl if not already there
			// 
			// error: if found and sourceRefId already present (and not equal)
			// note: present + equal can happen during crash
			// 
			// 2. if refnorm found (instead of created) find all refx for which 
			// refx.refNormId = refNorm.id and update those with sourceRefId
			// 
			// 3. set _state.modifiedMakeRefs to now()

			//Fetch new sources until results.length < batch
			//This doesn't guarantee complete (since crawler may be adding)
			//but this makes sure this process will not be slowed-down to crawler-rate


			//Update state. This does a partial update of _state so it
			//doesn't interfere with other processes.
			r.table(SourceEntity.SOURCETABLE).get(10001).update({
				_state: {
					modifiedMakeRefs: new Date().getTime()
				}
			});

		});


}).finally(function() {

	//quit
	redisClient.quit();
	r.getPoolMaster().drain();
});
