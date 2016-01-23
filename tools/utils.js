var redis = require("redis");
var Promise = require("bluebird");
var uuid = require("uuid");
var _ = require("lodash");

var domainUtils = require("../schemas/domain/utils");

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

module.exports = function(generatedSchemas, r, redisClient) {

	var entities = require("../schemas/domain/entities")(generatedSchemas, r);
	var CanonicalEntity = entities.CanonicalEntity;
	var SourceEntity = entities.SourceEntity;

	var tableSourceEntity = r.table(domainUtils.statics.SOURCETABLE);
	var tableRefNorms = r.table(domainUtils.statics.REFNORMS);
	var tableRefX = r.table(domainUtils.statics.REFX);

	//
	// Get all new / existing SourceEntities in batches. 
	// 
	// NEW SourceEntities are those that don't have _state.modifiedMakeRefs defined. 
	// Existing are those that have _state.modifiedMakeRefs < _staate.modifiedAndDirty
	// 
	// Return: the collection of SourceEntities.
	function getSourceEntities(data, processExistingButDirty) {
		return function() {

			var start = new Date().getTime();

			return Promise.resolve()
				.then(function() {

					if (!processExistingButDirty) {

						//fetch new
						return tableSourceEntity.getAll(false, {
							index: 'modifiedMakeRefs'
						}).without("_refs").limit(data.state.batch).run();

					} else {

						//fetch existing but dirty
						return tableSourceEntity.getAll(true, {
							index: 'dirtyForMakeRefs'
						}).without("_refs").limit(data.state.batch).run();
					}

				})
				.then(function fromResultsToSourceEntities(results) {

					var options = {
						skipAlias: true
					};

					data.time.getSourceEntities += new Date().getTime() - start;

					//format the results into actual SourceEntity domain objects.
					return _.map(results, function(result) {
						return new SourceEntity(getSourceEntityState(result), result, options);
					});
				});
		};
	}


	//Data-object is loaded based on sourceObjects. 
	//All other data is reset. 
	//
	//Tech: `data` is passed-along in promises and is reused over sequentially processed batches. 
	function resetDataFromSourceEntities(data) {
		return function(sourceObjects) {

			//the actual sourceObjects aka sourceEntities of this batch
			data.sourceObjects = sourceObjects;

			//Map containing <refNorm,sourceRefId> for each existing refNorm. 
			//This is used to add sourceRefId to all existing refX that point to said refNorm.
			data.refNormIdToSourceRefIdMap = {};

			//A collection of sourceIds which is used to lookup existing RefNorms
			data.sourceidsToLookup = _.pluck(sourceObjects, "sourceId");

			//A collection of sourceEntity-ids which is used to update state on SourceEntities once done processing
			data.sourceEntityIdsToLookup = _.pluck(sourceObjects, "id");

			//Map of <sourceId, reference-object> used to update SourceEntities once done 
			data.sourceIdToRefMap = _.reduce(sourceObjects, function(agg, obj) {
				agg[obj.id] = obj._refs || {};
				return agg;
			}, {});

			// Keeps track of all references (inside SourceEntity._refs) that are not linked yet
			// to a RefNorm (by means of a RefX)
			data.unlinkedRefsWithSourceId = [];

			//A list of all sourceIds for which RefNorms need to exist, as created by 
			//SourceEntity references
			data.sourceIdsToSupport = undefined; //explicit overwrite of previous batch

			data.refNormMap = {};

		};
	}

	//
	//Existing RefNorms are fetched based on _sourceId for bunch of sourceIds. 
	//Refnorms are upserted (created if not found) with sourceRefId attached. 
	//
	//This results in all RefNorms (that reference any of the processed SourceEntities by _sourceid), 
	//to have a guaranteed sourceRefId. 
	//
	//As such, this results in RefNorms: 
	//
	//{
	// id: uuid,									(guanranteed as before)
	// _sourceId: <sourceId>			(guanranteed as before))
	// _sourceUrl: <sourceUrl>		(optional)
	// _sourceRefId: uuid 				(guanranteed, possibly new)
	//
	//}
	//
	function updateExistingAndInsertNewRefNorms(data) {
		return function() {

			var start = new Date().getTime();

			return Promise.resolve()
				.then(function fetchExistingRefNorms() {
					if (data.sourceidsToLookup.length) {
						return tableRefNorms.getAll.apply(tableRefNorms, data.sourceidsToLookup.concat({
							index: '_sourceId'
						}));
					}
				})
				.then(function(existingRefNorms) {

					var existingRefNormsPerSourceid = _.groupBy(existingRefNorms, "_sourceId");

					//Loop each sourceObject and check if RefNorm exist. 
					//If it does not -> create
					//If it does -> update with sourceUrl which may potentially not be set
					//In both cases update with sourceRefId, which will not be set most of the time. I.e.: it *may*
					//be set with same sourceRefId iff process crashed just after update and before this *transaction* 
					//was completed. 
					//It may NEVER have a different sourceRefId set since this would be a logic error
					var refNormsToUpsert = _.map(data.sourceObjects, function(obj) {

						var newRefNorm = {
							_sourceId: obj.sourceId,
							_sourceRefId: obj.id
						};

						if (obj.sourceUrl) {
							newRefNorm._sourceUrl = obj.sourceUrl;
						}


						var refNormArr = existingRefNormsPerSourceid[obj.sourceId];

						if (refNormArr) { //existing RefForm

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

							//refNormArr guaranteed at least 1 element. 
							var refNormOld = refNormArr[0];

							if (refNormOld._sourceRefId && refNormOld._sourceRefId !== obj.id) {
								err = new Error("Severe: updating refnorm for which sourceRefId already set to DIFFERENT sourceRefId (want to set to, actual set to) " +
									obj.id + ", " + refNormOld._sourceRefId);
								err.halt = true;
								throw err;
							}

							newRefNorm.id = refNormOld.id;

							//Add <refNorm,sourceRefId> for each existing refNorm. 
							//This is later used to add sourceRefId to all existing refX that point to said refNorm.
							data.refNormIdToSourceRefIdMap[newRefNorm.id] = obj.id;

							//If is the same as old -> no need to update
							return _.eq(newRefNorm, refNormOld) ? undefined : newRefNorm;

						} else { //new RefNorm:

							return newRefNorm;

							// TODO: %150: do not save refNorm if we explicitly don't want to. 
							// For instance, MovieShowings are a dime a dozen and we can expect that 
							// no other entity will every reference it. If we know this we can optimize for it. 
							// This saves us a bunch of RefNorms that we don't ever use.
							// return undefined;

						}
					});


					refNormsToUpsert = _.compact(refNormsToUpsert);

					// upsert refNorms
					return tableRefNorms.insert(refNormsToUpsert, {
						conflict: "update"
					}).then(function() {
						data.time.updateExistingAndInsertNewRefNorms += new Date().getTime() - start;
					});
				});
		};
	}

	//Other sourceEntities may refer to a sourceEntity in this batch.
	//Tag this in SourceEntity._tags -> set `sourceRefId` 
	function addSourceRefIdToExistingRefs(data) {
		return function() {
			var start = new Date().getTime();

			if (_.size(data.refNormIdToSourceRefIdMap)) {

				var normids = _.keys(data.refNormIdToSourceRefIdMap);

				return Promise.resolve()
					.then(function fetchSourceEntitiesWithRefAnchors() {

						return tableSourceEntity.getAll.apply(tableSourceEntity, normids.concat({
							index: '_refNormIds'
						})).pluck("id", "_refNormIds", "_refs"); //pluck: save bandwidth, possible because partial update works

					})
					.then(function updateSourceEntitiesWithRefAnchors(docs) {

						var sourceEntitiesToUpdate = _.compact(_.map(docs, function(d) {

							//for the given doc get the refs pointing to the refNormids that *might* need updating. 
							var intersectNormIds = _.intersection(d._refNormIds, normids);

							if (!intersectNormIds.length) {
								var err = new Error("refNormid instersection is length zero. Should not happen?");
								err.halt = true;
								throw err;
							}

							//For this document create a updateDelta for the _refs property. 
							//This is done by iterating each refNormId that's present in both (a ref in) this doc as well as in the currenntly 
							//processed refNormIds. For these combinations the appropriate sourceRefId as added if not already done so. 
							//If sourceRefId already added for all refNormIds processed on this doc and in this batch, we can skip the update on this
							//doc altogether. 
							var refsUpdateDelta = _.reduce(intersectNormIds, function(agg, normId) {

								if (!d._refs[normId]._sourceRefId) { //only need to update if _sourceRefId not already present

									//this will result in a PARTIAL update: THe 'val' property is left untouched. We only add the _sourceRefId
									agg[normId] = {
										_sourceRefId: data.refNormIdToSourceRefIdMap[normId]
									};
								}
								return agg;
							}, {});

							if (!_.size(refsUpdateDelta)) {
								return undefined; // there's nothing to update on this doc. 
							}

							return {
								id: d.id,
								_refs: refsUpdateDelta
							};

						}));

						return tableSourceEntity.insert(sourceEntitiesToUpdate, {
							conflict: "update",
							returnChanges: false
						});

					})
					.then(function() {
						data.time.addSourceRefIdToExistingRefs += new Date().getTime() - start;
					});
			}
		};
	}

	// Compose the _refs-property for each processed SourceEntity. 
	// This consists of creating / updating based on all references occuring in the source. 
	function composeRefs(data) {
		return function() {

			var start = new Date().getTime();

			//loop all references in the sourceObject to build the _refs-property
			//This is build by fusing new reference properties with old ones. 
			//
			//The structure of the _refs property is as follows: 
			//
			//{
			// .....
			// "f37c6b8c-04bc-4a98-8046-ded9146c3763": {
			//   "sourceRefId": ....
			//   "val": [
			//     {
			//       "_sourceId": "http://www.fandango.com/theboy_187439/movieoverview",
			//       "_sourceUrl": "http://www.fandango.com/theboy_187439/movieoverview",
			//       "_path": "workFeatured",
			//       "_refNormId": "f37c6b8c-04bc-4a98-8046-ded9146c3763"
			//     }
			//   ]
			// }, 
			// ...
			//}

			var sourceIds = _.pluck(data.sourceObjects, "id");
			console.log(sourceIds);
			_.each(data.sourceObjects, function(obj) {

				// console.log("existing _refs: " + JSON.stringify(obj._refs, null, 2));

				//get new refs
				var refs = obj.calculateRefs(obj._props);

				//for all refs that don't link to refNorm yet, add them to unlinkedRefsWithSourceId
				_.each(refs, function(refVal) {
					if (!refVal._refNormId && refVal._sourceId) {
						data.unlinkedRefsWithSourceId.push(refVal);
					}
				});

				data.sourceIdToRefMap[obj.id] = refs;
			});

			data.time.composeRefs += new Date().getTime() - start;

		};
	}

	//For all references for all sourceEntities that don't link to refNorms yet, fetch RefNorms and create if not exists.
	function fetchExistingAndInsertNewRefNormsForReferences(data) {

		//LATER: #143: do the same for refs without sourceId.                                               

		return function() {

			var start = new Date().getTime();

			return Promise.resolve()
				.then(function fetchRefNormsForReferences() {

					data.sourceIdsToSupport = _.uniq(_.pluck(data.unlinkedRefsWithSourceId, "_sourceId"));

					//fetch refNorms given sourceIds
					if (data.sourceIdsToSupport.length) {

						return tableRefNorms.getAll.apply(tableRefNorms, data.sourceIdsToSupport.concat({
							index: '_sourceId'
						})).then(function(refs) {

							//create a map of refNorms with sourceId as key
							data.refNormMap = _.zipObject(_.pluck(refs, "_sourceId"), refs);

							//select the sourceIds for which a refNorm is found. 
							//This is used to know which refNorms should still be created
							return _.pluck(refs, "_sourceId");

						});
					} else {
						return undefined; //for sake of clarify
					}

				})
				.then(function upsertNewRefNormsForReferences(sourceIdsFound) {

					//get a list of all sourceIds for which refNorms needs to be created
					//since no refNorm yet exists...
					var refNormsWithSourceIdsToCreate = _.difference(data.sourceIdsToSupport, sourceIdsFound);

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
						})
						.then(function(refNorms) {

							//... which are fetched from the changes object.
							var refNormsNew = _.pluck(refNorms.changes, "new_val");

							//Now, the newly added refNorms are added to the refNorm map
							_.each(refNormsNew, function(refNormNew) {
								var sourceId = refNormNew._sourceId;
								if (data.refNormMap[sourceId]) {
									throw new Error("Sanity check: _sourceId found in existing refNormMap, while we just checked it wasn't there: " + sourceId);
								}
								data.refNormMap[sourceId] = refNormNew;
							});
						}).then(function() {
							data.time.fetchExistingAndInsertNewRefNormsForReferences += new Date().getTime() - start;
						});
				});
		};
	}

	//Now that we're done processing SourceEntities, save 
	//- new _refs including ids, so we know we don't have to process these anymore (for RefNorm and RefX creation)
	//- updated state. 
	function updateModifiedDataForSourceEntities(data) {
		return function() {

			var start = new Date().getTime();

			//Now that we've fetched or created RefNorms for all *unlinked* references, let's hook them up. 
			_.each(data.unlinkedRefsWithSourceId, function(unlinkedRef) {
				var refNorm = data.refNormMap[unlinkedRef._sourceId];

				if (!refNorm) {
					throw new Error("sanity check: refNorm must exist for _sourceId at this point: " + unlinkedRef._sourceId);
				}

				//add refnormId
				unlinkedRef._refNormId = refNorm.id;

				//if sourceRefId already exists -> persist this as well.
				if (refNorm._sourceRefId) {
					unlinkedRef._sourceRefId = refNorm._sourceRefId;
				}
			});

			// Update 'modifiedMakeRefs' and '_refs' for all processed sourceEntities in this batch. 
			var d = new Date();

			//Tech: note: only updates _state.modifiedMakeRefs and doesn't touch any other part
			//of _state. This is hugely important to guarantee no stale writes/reads on _state-object. 
			//Thank you RethinkDB
			var updatedSourceEntityDTO = _.map(data.sourceIdToRefMap, function(v, k) {

				var refsObj = _.reduce(_.groupBy(v, "_refNormId"), function(agg, arr, k) {
					agg[k] = {
						sourceRefId: arr[0]._sourceRefId, //May not exist. Guaranteed to be the same for all refs that point to same refNormId
						val: _.map(arr, _.partialRight(_.omit, ["_sourceRefId", "_refNormId"]))
					};
					return agg;
				}, {});

				return {
					id: k,
					_refNormIds: _.uniq(_.pluck(v, "_refNormId")),
					_refs: refsObj,
					_state: {
						modifiedMakeRefs: d
					}
				};
			});

			return Promise.resolve()
				// .then(function() {
				// 	return tableSourceEntity.insert(updatedSourceEntityDTO, {
				// 		conflict: "update"
				// 	});
				// })
				.then(function() {
					data.time.updateModifiedDataForSourceEntities += new Date().getTime() - start;
				});
		};
	}

	return {
		getSourceEntities: getSourceEntities,
		resetDataFromSourceEntities: resetDataFromSourceEntities,
		updateExistingAndInsertNewRefNorms: updateExistingAndInsertNewRefNorms,
		addSourceRefIdToExistingRefs: addSourceRefIdToExistingRefs,
		composeRefs: composeRefs,
		fetchExistingAndInsertNewRefNormsForReferences: fetchExistingAndInsertNewRefNormsForReferences,
		updateModifiedDataForSourceEntities: updateModifiedDataForSourceEntities,
	};
};
