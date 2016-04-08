var redis = require("redis");
var Promise = require("bluebird");
var uuid = require("uuid");
var _ = require("lodash");

var domainUtils = require("../schemas/domain/utils");

var excludePropertyKeys = domainUtils.excludePropertyKeys;

function getSourceEntityState(result) {
  return {
    id: result.id,
    sourceType: result._sourceType,
    sourceUrl: result._sourceUrl,
    sourceId: result._sourceId,
    batchId: result._state.batchId,
    type: result._type,
    detailPageAware: false, //for completeness
  };
}

module.exports = function (generatedSchemas, r) {

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
  function getSourceEntities(data, fetchQuery) {
    return function () {
      var start = new Date().getTime();

      return Promise.resolve()
        .then(function () {
          return fetchQuery();
        })
        .then(function fromResultsToSourceEntities(results) {

          var options = {
            //skip building of aliases, since they interfere with concise building of refs.
            skipAlias: true
          };

          //format the results into actual SourceEntity domain objects.
          return Promise.resolve()
            .then(function () {
              return _.map(results, function (result) {
                return new SourceEntity(getSourceEntityState(result), result, options);
              });
            })
            .then(function (results) {
              data.time.getSourceEntities += new Date().getTime() - start;
              return results;
            });
        });
    };
  }


  //Data-object is loaded based on sourceObjects. 
  //All other data is reset. 
  //
  //Tech: `data` is passed-along in promises and is reused over sequentially processed batches.
  //This is a bit premature optmiziation perhaps, but it might help with GC'ing instead of keeping
  //extra objects around
  function resetDataFromSourceEntities(data) {
    return function (sourceObjects) {

      //The actual sourceObjects aka sourceEntities of this batch
      data.sourceObjects = sourceObjects;

      //Map containing <refNorm,sourceRefId> for each existing refNorm. 
      //This is used to add sourceRefId to _refs-object in SourceEntity.
      data.refNormIdToSourceRefIdMap = {};

      //Map of <sourceId, reference-object> used to update SourceEntities once done 
      data.sourceIdToRefMap = _.reduce(sourceObjects, function (agg, obj) {
        agg[obj.id] = obj._refs || {};
        return agg;
      }, {});

      // List of all references (inside SourceEntity._refs) that are not linked
      // to a RefNorm yet
      data.unlinkedRefsWithSourceId = [];

      // Map containing sourceId -> RefNorm key-value-pairs. 
      // These are populated (and created if needed) for all sourceIds referenced
      // in any SourceEntity reference.
      data.sourceIdToRefNormMap = {};

    };
  }

  //
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
    return function () {

      var start = new Date().getTime();

      var sourceObjectsThatNeedRefNorms = _.filter(data.sourceObjects, function (obj) {
        return !obj.state.skipRefNormCreation;
      });

      return Promise.resolve()
        .then(function lookupExistingRefNormsBySourceIds() {

          //Given the collection of SourceEntities in this batch, lookup all existing
          //RefNorms that already exist (1-to-1) for these SourceEntities.
          //
          //Note: Although an edge-case, there may be multiple RefNorms for a single SourceEntity.

          var sourceidsToLookup = _.pluck(sourceObjectsThatNeedRefNorms, "sourceId");

          if (sourceidsToLookup.length) {
            return tableRefNorms.getAll.apply(tableRefNorms, sourceidsToLookup.concat({
              index: '_sourceId'
            }));
          }
        })
        .then(function (existingRefNorms) {


          //Group refNorms per sourceId 
          var existingRefNormsPerSourceid = _.groupBy(existingRefNorms, "_sourceId");

          //Construct RefNorms to upsert: a combination of existing and to-be-created RefNorms.
          //For existing RefNorms, we add the _sourceRefId pointing back to the SourceEntity.
          var refNormsToUpsert = _.map(sourceObjectsThatNeedRefNorms, function (obj) {

            var newRefNorm = {
              _sourceId: obj.sourceId,
              _sourceRefId: obj.id // this is the important part for existing RefNorms. 
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
              //This is used to populate sourceEntity._refToSourceRefIdMap
              //
              //NOTE: would appear to make sense for perf reasons to only store entry 
              //if below eq-rule results in false. However, that results in wrong data
              //in case of worker-errors. (i.e.: 'transaction' not complete -> will never complete)
              data.refNormIdToSourceRefIdMap[newRefNorm.id] = obj.id;

              //If is the same as old -> no need to update
              return _.eq(newRefNorm, refNormOld) ? undefined : newRefNorm;

            } else { //new RefNorm:

              //Note: no need to add newly created refNorm to refNormIdToSourceRefIdMap. 
              //This is because references reffing this RefNorm will auto-include 
              //sourceRefId themselves.
              return newRefNorm;

              // TODO: %150: do not save refNorm if we explicitly don't want to. 
              // For instance, MovieShowings are a dime a dozen and we can expect that 
              // no other entity will every reference it. If we know this we can optimize for it. 
              // This saves us a bunch of RefNorms that we don't ever use.
              // return undefined;

            }
          });

          //remove RefNorms from collection that don't need updating (i.e.: we've returned undef)
          refNormsToUpsert = _.compact(refNormsToUpsert);

          if (refNormsToUpsert.length) {
            // upsert refNorms
            return tableRefNorms.insert(refNormsToUpsert, {
              conflict: "update"
            }).then(function () {
              data.time.updateExistingAndInsertNewRefNorms += new Date().getTime() - start;
            });
          }
        });
    };
  }

  // SourceRefIds were added to a collection of refnorms (refNormIdToSourceRefIdMap). 
  // Find the SourceEntities that contain references to any of these Refnorms and update them.
  function addSourceRefIdToExistingRefs(data) {

    return function () {

      var start = new Date().getTime();

      if (_.size(data.refNormIdToSourceRefIdMap)) {

        var normids = _.keys(data.refNormIdToSourceRefIdMap);

        return Promise.resolve()
          .then(function fetchSourceEntitiesWithRefsReferringRefNorms() {

            // SourceRefIds were added to a collection of refnorms (refNormIdToSourceRefIdMap). 
            // Find the SourceEntities that contain references to any of these Refnorms

            // pluck: save bandwidth
            return tableSourceEntity.getAll.apply(tableSourceEntity, normids.concat({
              index: '_refNormIds'
            })).pluck("id", "_refNormIds", "_refToSourceRefIdMap");

          })
          .then(function updateSourceEntitiesWithRefsReferringRefNorms(docs) {

            //Create an array of SourceEntity-docs (partial updates) that need to be updated. 
            //Each partial doc contains 2 fields:
            //1. id
            //2. _refToSourceRefIdMap (partial)
            //
            //_refToSourceRefIdMap is a map containing Refnormid -> sourceRefId and thus
            //has the same format as refNormIdToSourceRefIdMap we're feeding from.
            //
            //Using a separate property `_refToSourceRefIdMap` to store these references
            //avoids potential racing writes on updating, say, _refs otherwise.
            //
            var sourceEntitiesToPartiallyUpdate = _.map(docs, function (d) {

              //Get normIds that might need updating.
              var intersectNormIds = _.intersection(d._refNormIds, normids);

              if (!intersectNormIds.length) {
                var err = new Error("refNormid instersection is length zero. Should not happen?");
                err.halt = true;
                throw err;
              }

              //init _refToSourceRefIdMap
              d._refToSourceRefIdMap = d._refToSourceRefIdMap || {};

              var refToSourceRefIdMapDelta = _.reduce(intersectNormIds, function (agg, normId) {
                //only need to update if key/value not already present
                if (!d._refToSourceRefIdMap[normId]) {
                  agg[normId] = data.refNormIdToSourceRefIdMap[normId];
                }
                return agg;
              }, {});

              if (!_.size(refToSourceRefIdMapDelta)) {
                return undefined; // there's nothing to update on this doc. 
              }

              return {
                id: d.id,
                _refToSourceRefIdMap: refToSourceRefIdMapDelta
              };

            });

            //remove sourceEntities that don't need updating.
            sourceEntitiesToPartiallyUpdate = _.compact(sourceEntitiesToPartiallyUpdate);

            return tableSourceEntity.insert(sourceEntitiesToPartiallyUpdate, {
              conflict: "update",
              returnChanges: false
            });

          })
          .then(function () {
            data.time.addSourceRefIdToExistingRefs += new Date().getTime() - start;
          });
      }
    };
  }

  // Compose the _refs-property for each processed SourceEntity. 
  // This consists of creating / updating based on all references occuring in the source. 
  function composeRefs(data) {
    return function () {

      var start = new Date().getTime();

      _.each(data.sourceObjects, function (obj) {

        //Calculate all references and filter to those that contain _sourceId
        //#143 (link entityReferences to refNorms without _sourceId) tracks creating references for non-sourceId references
        var newRefs = _.filter(_calcRefs(obj._props), "_sourceId");
        var oldRefs = obj._refs || {};

        //Mark all existing references with isOutdated = true. 
        //Those references which still hold that label after below processing are in fact outdated. 
        _.each(Array.prototype.concat.apply([], _.values(oldRefs)), function (obj) {
          obj.isOutdated = true;
        });

        //Check for each ref if it already existed, and if so replace it with the existing one, 
        //which might already have a refNormId attached.
        newRefs = _.reduce(_.groupBy(newRefs, "_path"), function (out, arr, path) {
          var oldArrForPath = oldRefs[path];
          if (!oldArrForPath) { //no array found for path-key, so stick with the new
            return out.concat(arr);
          }
          return out.concat(_.map(arr, function (ref) {
            var oldRef = _.find(oldArrForPath, _.omit(ref, "_path")); //find eixsting ref in array for given path
            if (oldRef) { //if oldRef exists return that...
              delete oldRef.isOutdated;
              return _.extend({}, oldRef, {
                _path: path
              });
            }
            return ref; //.. Otherwise return ref
          }));
        }, []);

        //As discussed anove, all existing refs which still have a label isOutdated=true are in fact outdated
        var outdatedRefs = _.reduce(oldRefs, function (out, arrForPath, path) {
          return out.concat(_.map(_.filter(arrForPath, "isOutdated"), function (outdatedRef) {
            return _.extend({}, outdatedRef, {
              _path: path
            });
          }));
        }, []);

        var refs = data.sourceIdToRefMap[obj.id] = newRefs.concat(outdatedRefs);

        //for all refs that don't link to refNorm yet, add them to unlinkedRefsWithSourceId
        _.each(refs, function (refVal) {
          if (!refVal._refNormId) {
            data.unlinkedRefsWithSourceId.push(refVal);
          }
        });
      });

      data.time.composeRefs += new Date().getTime() - start;

    };
  }

  //For all references of all sourceEntities that don't link to refNorms yet => 
  //fetch RefNorms or create if non exist.
  function fetchExistingAndInsertNewRefNormsForReferences(data) {

    return function () {

      var start = new Date().getTime();

      //refnorms should be fetched (or created) for the following sourceIds.
      var sourceIdsToSupport = _.uniq(_.pluck(data.unlinkedRefsWithSourceId, "_sourceId"));

      return Promise.resolve()
        .then(function fetchRefNormsForReferences() {

          //fetch refNorms given sourceIds
          if (sourceIdsToSupport.length) {

            return tableRefNorms.getAll.apply(tableRefNorms, sourceIdsToSupport.concat({
              index: '_sourceId'
            })).then(function (refs) {

              //Create a map of refNorms with sourceId as key. 
              //Note: due to edge-cases (see `updateExistingAndInsertNewRefNorms`) there may 
              //be multiple refNorms per sourceId. This selects any of them. That's okay.
              data.sourceIdToRefNormMap = _.zipObject(_.pluck(refs, "_sourceId"), refs);

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
          var refNormsWithSourceIdsToCreate = _.difference(sourceIdsToSupport, sourceIdsFound);

          //.. consequently, the refNorms to insert...
          var refNormsToUpsert = _.map(refNormsWithSourceIdsToCreate, function (sourceId) {
            return {
              _sourceId: sourceId
            };
          });

          //... as well as the actual inserting
          return tableRefNorms.insert(refNormsToUpsert, {
              conflict: "update",
              returnChanges: true //We want results back from this insert...
            })
            .then(function (refNorms) {

              //... which are fetched from the changes object.
              var refNormsNew = _.pluck(refNorms.changes, "new_val");

              //Now, the newly added refNorms are added to the refNorm map
              _.each(refNormsNew, function (refNormNew) {
                var sourceId = refNormNew._sourceId;
                if (data.sourceIdToRefNormMap[sourceId]) {
                  throw new Error("Sanity check: _sourceId found in existing sourceIdToRefNormMap, while we just checked it wasn't there: " + sourceId);
                }
                data.sourceIdToRefNormMap[sourceId] = refNormNew;
              });
            }).then(function () {
              data.time.fetchExistingAndInsertNewRefNormsForReferences += new Date().getTime() - start;
            });
        });
    };
  }

  function updateModifiedDataForSourceEntities(data) {
    return function () {

      var start = new Date().getTime();

      var refNormToSourceRefMap = {};

      //Remember: unlinkedRefsWithSourceId is a subset of sourceIdToRefMap. 
      //Here we add refNormid and optionally sourceRefId if already present. 
      _.each(data.unlinkedRefsWithSourceId, function (unlinkedRef) {
        var refNorm = data.sourceIdToRefNormMap[unlinkedRef._sourceId];

        if (!refNorm) {
          throw new Error("sanity check: refNorm must exist for _sourceId at this point: " + unlinkedRef._sourceId);
        }

        //add refnormId
        unlinkedRef._refNormId = refNorm.id;

        //add sourceRefid if already present
        if (refNorm._sourceRefId) {
          refNormToSourceRefMap[refNorm.id] = refNorm._sourceRefId;
        }
      });

      // Update 'modifiedMakeRefs' and '_refs' for all processed sourceEntities in this batch. 
      var d = new Date();

      //Tech: note: only updates _state.modifiedMakeRefs and doesn't touch any other part
      //of _state. This is hugely important to guarantee no stale writes/reads on _state-object. 
      //Thank you RethinkDB
      var updatedSourceEntityDTO = _.map(data.sourceIdToRefMap, function (v, k) {

        //create entire refs object: keyed by refNormId
        var refsObj = _.reduce(_.groupBy(v, "_path"), function (agg, arr, k) {
          agg[k] = _.map(arr, _.partialRight(_.omit, ["_path"]));
          return agg;
        }, {});

        //all refNormIds of sourceEntity (existing and new)
        var refNormIdsForSourceEntity = _.uniq(_.pluck(v, "_refNormId"));
        var refToSourceRefMap = _.pick(refNormToSourceRefMap, refNormIdsForSourceEntity);

        return {
          id: k,

          //RefNormids that *are* resolved, including sourceRefId to which they resolve. 
          _refToSourceRefIdMap: refToSourceRefMap,

          //RefNormids that need or are resolved. Used for lookup in index.
          _refNormIds: refNormIdsForSourceEntity,

          //add _refs object calculated above
          _refs: refsObj,

          _state: {
            modifiedMakeRefs: d
          }
        };
      });

      return Promise.resolve()
        .then(function () {
          return tableSourceEntity.insert(updatedSourceEntityDTO, {
            conflict: "update"
          });
        })
        .then(function () {
          data.time.updateModifiedDataForSourceEntities += new Date().getTime() - start;
        });
    };
  }

  //Calc references
  function _calcRefs(properties) {
    var out = [];
    _calcRefsRecursive(properties, out);
    return out;
  }

  function _calcRefsRecursive(properties, agg, prefix) {

    prefix = prefix || "";

    _.each(properties, function (v, k) {

      if (excludePropertyKeys.indexOf(k) !== -1) return;

      var compoundKey = prefix ? prefix + "." + k : k;

      function transformSingleItem(v) {

        //if first is range is datatype -> all in range are datatype as per #107
        //If datatype -> return undefined
        if (generatedSchemas.datatypes[generatedSchemas.properties[k].ranges[0]]) {
          return undefined;
        }

        if (!_.isObject(v)) {
          return undefined;
        }

        if (v._ref) {
          return v._ref;
        }

        var obj = _calcRefsRecursive(v, agg, compoundKey);

        if (!_.size(obj)) {
          return undefined;
        }

        return obj;
      }

      var arr = _.compact(_.map(_.isArray(v) ? v : [v], transformSingleItem));

      //add the dot-separated ref-path
      _.map(arr, function (v) {
        v._path = compoundKey;
      });

      _.each(arr, function (v) {
        agg.push(v); //can't do concat because array-ref not maintained
      });

    });

  }


  return {
    getSourceEntities: getSourceEntities,
    resetDataFromSourceEntities: resetDataFromSourceEntities,
    updateExistingAndInsertNewRefNorms: updateExistingAndInsertNewRefNorms,
    addSourceRefIdToExistingRefs: addSourceRefIdToExistingRefs,
    composeRefs: composeRefs,
    fetchExistingAndInsertNewRefNormsForReferences: fetchExistingAndInsertNewRefNormsForReferences,
    updateModifiedDataForSourceEntities: updateModifiedDataForSourceEntities
  };
};
