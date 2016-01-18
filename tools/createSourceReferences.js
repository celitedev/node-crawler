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

var domainUtils = require("../schemas/domain/utils");

var config = require("../config");
var redisClient = redis.createClient(config.redis);
var r = require('rethinkdbdash')(config.rethinkdb);

var entities = require("../schemas/domain/entities")(generatedSchemas, r);
var CanonicalEntity = entities.CanonicalEntity;
var SourceEntity = entities.SourceEntity;

function getSourceEntityState(result) {
	return {
		sourceType: result._sourceType,
		sourceUrl: result._sourceUrl,
		sourceId: result._sourceId,
		batchId: result._state.batchId,
		type: result._type,
		detailPageAware: false, //for completeness
	};
}

var total = 0;

Promise.resolve().then(function processNewSources() {

	var batch = 200;
	var nrOfResults;

	var tableSourceEntity = r.table(domainUtils.statics.SOURCETABLE);
	var tableRefNorms = r.table(domainUtils.statics.REFNORMS);
	var tableRefX = r.table(domainUtils.statics.REFX);

	//Func: Get SourceEntities that haven't been processed by this process yet. 
	//Tech: Get SourceEntities that don't exist in index 'modifiedMakeRefs'
	//'modifiedMakeRefs' is created based on field _state.modifiedMakeRefs. See #142 for more.

	return tableSourceEntity.getAll(false, {
			index: 'modifiedMakeRefs'
		}).limit(batch).run()
		.then(function processBatchOfNewSourceEntities(results) {

			nrOfResults = results.length;

			total += nrOfResults;
			console.log("processNewSources", total);

			if (!nrOfResults) {
				return;
			}

			var options = {
				skipAlias: true
			};

			//format the results into actual SourceEntity domain objects.
			var sourceObjects = _.map(results, function(result) {
				return new SourceEntity(getSourceEntityState(result), result, options);
			});

			//Pluck the sourceId from each sourceObject
			var lookupDocsOnSourceId = _.pluck(sourceObjects, "sourceId");
			var lookupDocsOnId = _.pluck(sourceObjects, "id");
			var sourceIdToRefMap = _.reduce(sourceObjects, function(agg, obj) {
				agg[obj.id] = obj._refs || {};
				return agg;
			}, {});

			var refNormIdsFound = {};

			//Fetch all refNorms that have a sourceId in the above list
			//This is enough: no need to lookup by sourceUrl.
			return tableRefNorms.getAll.apply(tableRefNorms, lookupDocsOnSourceId.concat({
					index: '_sourceId'
				})).run()
				.then(function createOrUpdateRefNorms(refNorms) {

					var refsPerSourceId = _.groupBy(refNorms, "_sourceId");

					//Loop each sourceObject and check if RefNorm exist. 
					//If it does not -> create
					//If it does -> update with sourceUrl which may potentially not be set
					//In both cases update with sourceRefId, which will not be set most of the time. I.e.: it *may*
					//be set with same sourceRefId iff process crashed just after update and before this *transaction* 
					//was completed. 
					//It may NEVER have a different sourceRefId set since this would be a logic error
					var refNormsToUpsert = _.map(sourceObjects, function(obj) {

						var refNormArr = refsPerSourceId[obj.sourceId];

						var newRefNorm = {
							_sourceId: obj.sourceId,
							_sourceUrl: obj.sourceUrl,
							_sourceRefId: obj.id
						};

						if (refNormArr) { //guaranteed at least 1 element. 

							var err;
							if (refNormArr.length > 1) {

								//#146
								//This can happen when multiple processes fetch/update stuff in parallel. 
								//It isn't an error as long as sourceRef is the same for all?
								//For now: we just go with this but still log in all cases.

								var sourceRefs = _.uniq(_.pluck(refNormArr, "_sourceRefId"));

								if (sourceRefs.length > 1) {
									err = new Error("#146: Severe: multiple RefNorms found for sourceId with different sourceRefs (sourceId, sourceRefs): " +
										obj.sourceId + ", " + sourceRefs.join(","));

									err.halt = true;
									throw err;

								} else {
									console.log(("warn: #146, multiple RefNorms found for sourceId with SAME sourceRef (sourceId, sourceRefs): " +
										obj.sourceId + ", " + sourceRefs[0]).yellow);
								}
							}

							var refNorm = refNormArr[0];

							if (refNorm._sourceRefId) {
								if (refNorm._sourceRefId === obj.id) {
									// console.log("warning: updating refnorm for which sourceRefId already set to same", obj.id);
								} else {
									err = new Error("Severe: updating refnorm for which sourceRefId already set to DIFFERENT sourceRefId (want to set to, actual set to) " +
										obj.id + ", " + refNorm._sourceRefId);
									err.halt = true;
									throw err;
								}
							}

							refNormIdsFound[refNorm.id] = obj.id;
							newRefNorm.id = refNorm.id;
						}

						return newRefNorm;

					});

					// upsert refNorms
					return tableRefNorms.insert(refNormsToUpsert, {
						conflict: "update"
					}).run();

				})
				.then(function updateExistingRefX() {

					//All refX-rows that reference any of the refNormIds are updated with the corresponding
					//sourceRefId.

					if (_.size(refNormIdsFound)) {
						return tableRefX.getAll.apply(tableRefX, _.keys(refNormIdsFound).concat({
							index: 'refNormId'
						})).update({
							sourceRefId: r.expr(refNormIdsFound).getField(r.row('refNormId')) //lookup sourceRefId in <refNormId -> sourceRefId> map
						});
					}
				})
				.then(function composeRefs() {



					//loop all references in the sourceObject to build the _refs-property
					//This is build by fusing new reference properties with old ones. 
					//
					//The structure of the _refs property is as follows: 
					//
					//<key.with.nested>: {
					// _sourceId
					//}
					var unlinkedRefsWithSourceId = [];
					_.each(sourceObjects, function(obj) {

						function transformVal(v) {
							if (!v.id && v._sourceId) {
								v.id = uuid.v4();
								unlinkedRefsWithSourceId.push(v);
							}
							v._refId = obj.id;
							return v;
						}

						//get new refs
						var refs = obj.calculateRefs(obj._props);
						_.each(refs, function(refVal) {
							refVal = _.isArray(refVal) ? _.map(refVal, transformVal) : transformVal(refVal);
						});

						sourceIdToRefMap[obj.id] = refs;
					});

					//Fetch all refsNorms given refs with sourceId using 1 call and create new ones if they don't exist 
					//LATER: #143: do the same for refs without sourceId.                                               

					var sourceIdsToSupport = _.uniq(_.pluck(unlinkedRefsWithSourceId, "_sourceId"));
					var sourceIdsFound = [];
					var refNormMap;

					return Promise.resolve()
						.then(function fetchExistingRefNorms() {

							//fetch refNorms given sourceIds
							if (sourceIdsToSupport.length) {

								return tableRefNorms.getAll.apply(tableRefNorms, sourceIdsToSupport.concat({
									index: '_sourceId'
								})).then(function(refs) {

									//create a map of refNorms with sourceId as key
									refNormMap = _.zipObject(_.pluck(refs, "_sourceId"), refs);

									//select the sourceIds for which a refNorm is found. 
									//This is used to know which refNorms should still be created
									sourceIdsFound = _.pluck(refs, "_sourceId");
								});
							}

						})
						.then(function insertNewRefNorms() {

							//get a list of all sourceIds for which refNorms needs to be created
							//since no refNorm yet exists...
							var refNormsWithSourceIdsToCreate = _.difference(sourceIdsToSupport, sourceIdsFound);

							//.. consequently, the refNorms to insert...
							var refNormsToUpsert = _.map(refNormsWithSourceIdsToCreate, function(sourceId) {
								return {
									_sourceId: sourceId
								};
							});

							//... as well as the actual inserting
							return tableRefNorms.insert(refNormsToUpsert, {
								conflict: "update",
								returnChanges: true //We want results back from this insert...
							}).run().then(function(refNorms) {

								//... which are fetched from the changes object.
								var refNormsNew = _.pluck(refNorms.changes, "new_val");

								//Now, the newly added refNorms are added to the refNorm map
								_.each(refNormsNew, function(refNormNew) {
									var sourceId = refNormNew._sourceId;
									if (refNormMap[sourceId]) {
										throw new Error("Sanity check: _sourceId found in existing refNormMap, while we just checked it wasn't there: " + sourceId);
									}
									refNormMap[sourceId] = refNormNew;
								});
							});
						})
						.then(function insertRefX() {

							//Now that we've fetched or created RefNorms for all unlinked references, 
							//it's time to create actual refX-rows for all references. 
							//A RefX row is an cross-table between References (as stored in SourceEntity._refs) and RefNorms

							//So, let's create the raw refX-objects to insert...
							var refXCollection = _.map(unlinkedRefsWithSourceId, function(unlinkedRef) {

								var refNorm = refNormMap[unlinkedRef._sourceId];

								if (!refNorm) {
									throw new Error("sanity check: refNorm must exist for _sourceId at this point: " + unlinkedRef._sourceId);
								}

								var obj = {
									refId: unlinkedRef._refId,
									refNormId: refNorm.id
								};

								delete unlinkedRef._refId; //not needed anymore, and don't persist

								if (refNorm._sourceRefId) {
									obj.sourceRefId = refNorm._sourceRefId;
								}
								return obj;
							});

							// ... and actually insert them
							return tableRefX.insert(refXCollection, {
								conflict: "update"
							}).run();
						});

				})
				.then(function updateModifiedDateForSourceEntities() {

					// Update 'modifiedMakeRefs' and '_refs' for all processed sourceEntities in this batch. 
					var d = new Date();

					return tableSourceEntity.getAll.apply(tableSourceEntity, lookupDocsOnId.concat({
						index: 'id'
					})).update({
						_state: {
							modifiedMakeRefs: d
						},
						_refs: r.expr(sourceIdToRefMap).getField(r.row("id"))
					});
				});
		})
		.then(function() {
			//process all new sources by recursively fetching and processing all sourceEntities in batches
			if (nrOfResults === batch) {
				return processNewSources();
			}
		});


}).finally(function() {

	console.log("QUITTING");

	//quit
	redisClient.quit();
	r.getPoolMaster().drain();
});
