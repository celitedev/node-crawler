var _ = require("lodash");
var util = require("util");
var domainUtils = require("../utils");
var UUID = require("pure-uuid");

var excludePropertyKeys = domainUtils.excludePropertyKeys;

//instead of _.compact
function removeUndefined(col) {
  return _.reject(col, function (val) {
    return _.isUndefined(val);
  });
}

module.exports = function (generatedSchemas, AbstractEntity, r) {

  var refMapCalc = {};
  var refsInProgress = [];

  var domainUtils = require("../utils");
  var tableCanonicalEntity = r.table(domainUtils.statics.CANONICALTABLE);

  var erdMappingConfig = require("../../es_schema")(generatedSchemas);
  var entityUtils = require("./utils")(generatedSchemas);
  var validator = require("../validation")(generatedSchemas);

  function CanonicalEntity(state, bootstrapObj, options) {
    this._kind = domainUtils.enums.kind.CANONICAL;
    this._sourceTable = domainUtils.statics.CANONICALTABLE;
    CanonicalEntity.super_.call(this, state, bootstrapObj, options);

    //FOR NOW: canonical id is derived from canonical
    if (!state.id) {
      throw new Error("'state.id' should be defined on CanonicalEntity");
    }

    this.id = state.id;
    if (bootstrapObj) {
      this.state = bootstrapObj._state;
    }
  }


  util.inherits(CanonicalEntity, AbstractEntity);

  CanonicalEntity.prototype._validationSchema = validator.createSchema();

  CanonicalEntity.prototype.toRethinkObject = function (props) {

    var now = new Date();

    return _.extend(entityUtils._toRethinkObjectRecursive(props || this._props, true), {
      id: this.id, //set by client based on uuidv5
      _type: this._type,
      _state: _.defaults({
        modified: now //set modified to now
      }, this.state, {
        created: now //set created to now if not already set
      })
    });
  };

  CanonicalEntity.prototype.toERDObject = function (refMap) {

    var self = this;

    return Promise.resolve()
      .then(function toERDObjectPromise() {

        var props = _.cloneDeep(self._props);

        //Given (possible multiple) this._type, get the typechain.
        var typechain = CanonicalEntity.super_.getTypechain(self._type); //may contain duplicate types, see method

        //Get the root, which will tell in which index to store, as well as the subtypes: 
        //i.e. the typechain sitting below the root.
        var rootAndSubtypes = CanonicalEntity.super_.getRootAndSubtypes(typechain);

        var root = rootAndSubtypes.root;

        //subtypes-property is the union of: 
        //- official subtypes 
        //- other subtypes which were free to be manually assigned. They *must* adhere to Controlled Vocabulary through
        //  - subtypes *might* also be populated from the 'tag'-property
        props.subtypes = _.union(rootAndSubtypes.subtypes, props.subtypes);

        //we want root to be indexed to ES as well.
        props.root = root;

        //we need id to be avail on root
        props.id = self.id;

        //populate values from other fields.
        _populate(props, root, false);

        //do the mapping and stuff.
        return toERDRecursive(props, typechain, refMap)
          .then(function toERDObjectAfterRecursive(dto) {

            //post populate
            _populate(dto, root, true);

            //optional post reduce values
            //This is especially useful when wanting to bring a multi-valued value to 
            //a concatted single-valued value in ERD.
            _postReduce(dto, root);

            _.extend(dto, {
              id: self.id,
              _root: root,
            });

            return dto;

          });
      });
  };

  function _populate(props, root, isPostPopulate) {

    _.each(entityUtils.calcPropertyOrderToPopulate(root), function populateLoop(propName) {
      var prop = erdMappingConfig.properties[propName] || erdMappingConfig.propertiesCalculated[propName];

      if (!prop) return;

      var populateObj = prop[!isPostPopulate ? "populate" : "postPopulate"];

      if (!populateObj) return;

      //the fieldnames of which the contents should be populated into the current propName
      var fields = _.isArray(populateObj.fields) ? populateObj.fields : [populateObj.fields];

      //populate.stategy with default fallback function
      var fn = populateObj.strategy || function populateDefaultFN(val) {
        return _.isArray(val) ? val : [val];
      };

      if (!prop.isMulti) {

        ///////////////////////////////////////////////
        //process populate for a single-valued field //
        ///////////////////////////////////////////////

        _.each(fields, function populateSingleValued(field) {

          if (props[propName] !== undefined) return; //only continue if value not set already

          //fetch content of field
          var fieldContents = props[field];

          //provide `props` as second arg as well in case we want to noop from entire context
          var val = fn(fieldContents, props);
          val = _.isArray(val) ? val : [val];

          //fetch first item if it exists and set 
          if (val.length && val[0] !== undefined) {
            props[propName] = val[0];
          }

        });

      } else {

        //////////////////////////////////////////////
        //process populate for a multi-valued field //
        //////////////////////////////////////////////

        //iterate all fieldnames, fetch the contents, pipe through the strategy function, and save
        props[propName] = _.uniq(_.reduce(fields, function populateReducer(arr, field) {
          var fieldContents = props[field];

          var val = fn(fieldContents, props);
          val = _.isArray(val) ? val : [val];

          return fieldContents ? arr.concat(val) : arr;
        }, props[propName] || []));

      }
    });

  }

  //optional reduce which is executed AFTER Post-populate.
  function _postReduce(props, root) {
    _.each(entityUtils.calcPropertyOrderToPopulate(root), function populateLoop(propName) {
      var prop = erdMappingConfig.properties[propName] || erdMappingConfig.propertiesCalculated[propName];

      if (!prop) return;

      if (!prop.postReduce) return;

      var val = props[propName];
      val = _.isArray(val) ? val : [val];

      props[propName] = prop.postReduce(val, props);
    });
  }


  function toERDRecursive(properties, typechain, resolvedRefMap) {


    if (!typechain) {
      throw new Error("toERDRecursive expects arg 'typechain'");
    }

    typechain = _.isArray(typechain) ? typechain : [typechain];

    return Promise.resolve()
      .then(function toERDRecursiveFetchRefsIfNeeded() {

        if (!resolvedRefMap) {
          return fetchRefs(properties);
        } else {
          return resolvedRefMap;
        }
      })
      .then(function toERDRecursiveWork(resolvedRefMap) {

        var expandMapToInclude = {};

        var dto = {};

        var promises = _.map(properties, function toERDRecursivePerProperty(v, k) {

          if (excludePropertyKeys.indexOf(k) !== -1) return;

          var argObj = {
            isTotalValueMultiValued: _.isArray(v),
            k: k,
            expandMapToInclude: expandMapToInclude,
            typechain: typechain,
            resolvedRefMap: resolvedRefMap
          };

          return Promise.resolve()
            .then(function toERDRecursivePerPropertyRecurse() {

              if (_.isArray(v)) {

                return Promise.all(_.map(v, function toERDRecursivePerPropertyRecurseForArray(singleVal) {
                    return toERDRecursiveSingleItem(singleVal, argObj);
                  }))
                  .then(function toERDRecursivePerPropertyRecurseForArrayThen(arrOfPossibleArr) {

                    arrOfPossibleArr = removeUndefined(arrOfPossibleArr);

                    return _.reduce(arrOfPossibleArr, function toERDRecursivePerPropertyRecurseForArrayReduce(out, possibleArr) {
                      return out.concat(_.isArray(possibleArr) ? possibleArr : [possibleArr]);
                    }, []);
                  });

              } else {
                //apply single transform to single item. Result may be undefined as well as array. 
                //Remember isMulti= false, doesn't dictate that a transform can't make an array. 
                //For instance geoPoint is tranformed to array [long, lat] 
                return toERDRecursiveSingleItem(v, argObj);
              }
            })
            .then(function toERDRecursivePerPropertyRecurseAfter(out) {

              if (_.isArray(out)) {

                //compact: some may be undefined. uniq: vocab lookup may produce dupes
                out = _.uniq(removeUndefined(out));


                //if the remaining size is zero, return undefined.
                if (!_.size(out)) {
                  out = undefined;
                }
              }

              //add result to output object only if not undefined
              if (out !== undefined) {
                dto[k] = out;
              }
            });
        });

        return Promise.all(promises)
          .then(function toERDRecursiveExtendDTO() {
            return _.extend(dto, expandMapToInclude);
          });
      });

  }

  function toERDRecursiveSingleItem(v, argObj) {

    var isTotalValueMultiValued = argObj.isTotalValueMultiValued;
    var k = argObj.k;
    var expandMapToInclude = argObj.expandMapToInclude;
    var typechain = argObj.typechain;
    var resolvedRefMap = argObj.resolvedRefMap;

    var erdMappingObj = erdMappingConfig.properties[k] || erdMappingConfig.propertiesCalculated[k];

    return Promise.resolve()
      .then(function toERDRecursiveSingleItemCalcV() {

        if (!v._type) return v;

        //Translate only original values coming from DB. 
        //This means no Elasticsearch transformed values.
        var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];

        if (propType.isValueObject) {
          //recurse non-datatypes
          //We've already resolved references for all valueObjects.
          return toERDRecursive(v, typechain, resolvedRefMap);
        } else if (v._ref) {
          return undefined; //skip all non-resolved refs. 
        } else {
          return v._value; //simplify all datatypes and object-references to their value
        }
      })
      .then(function erdExpandSingleItem(v) {

        if (v === undefined) return undefined;

        return Promise.resolve()
          .then(function () {


            //If mapping contains a `expand` directive, create a new, possibly multivalued, field named: <prop>#expanded. 
            //E.g.: location#expanded
            if (erdMappingObj && erdMappingObj.expand) {

              var expandObj = erdMappingObj.expand;

              //fetch the reference and only keep the `fields` defined.
              var ref = resolvedRefMap[v];

              if (!ref) {
                throw new Error("resolved ref couldn't be resolved: " + v + " - " + k);
              }

              var refId = ref.id;

              return Promise.resolve()
                .then(function calcRefObj() {

                  if (refMapCalc[refId]) {
                    return refMapCalc[refId];
                  }

                  if (refsInProgress.indexOf(refId) === -1) {

                    refsInProgress.push(refId);
                    return _processObjExpanded(ref, expandObj, refId);

                  } else {

                    //ref in progress, let's wait for it. It's quicker that way
                    var start = new Date().getTime();
                    return Promise.resolve()
                      .then(function recheckIfRefInProgressIsDone() {

                        if (refMapCalc[refId]) {
                          //cool, we've resolved the objExpanded now
                          return refMapCalc[refId];

                        } else {

                          if (new Date().getTime() - start < 1000) {
                            //check in later if we've resolved.
                            return new Promise(function (resolve, reject) {
                              setTimeout(function () { //Promise.delay doesn't work? so do it like this
                                return resolve(recheckIfRefInProgressIsDone());
                              });
                            });

                          } else {
                            //we've waited > 500 ms to resolve. Probably due to crash in other concurrent worker. 
                            //We can't let this get in the way, so we resolve ourselves.
                            return _processObjExpanded(ref, expandObj, refId);
                          }
                        }
                      });

                  }
                })
                .then(function doCalculationsBasedOnObjExpanded(objExpanded) {

                  if (!expandObj.flatten) {

                    var key = k + "--expand";
                    expandMapToInclude[key] = isTotalValueMultiValued ?
                      (expandMapToInclude[key] || []).concat([objExpanded]) :
                      objExpanded;

                  } else {

                    //add individual fields to expandMapToInclude
                    _.each(objExpanded, function toERDRecursiveSingleItemExpandMap(v, fieldKey) {
                      var key = k + "--" + fieldKey;

                      if (isTotalValueMultiValued) {
                        v = _.isArray(v) ? v : [v];
                        expandMapToInclude[key] = (expandMapToInclude[key] || []).concat(v);
                      } else {
                        //NOTE: v can still be an array here
                        expandMapToInclude[k + "--" + fieldKey] = v;
                      }
                    });
                  }
                });

            }
          })
          .then(function () {
            return v; // return v in all circumstances
          });
      })
      .then(function transformOrRecurseOnValue(v) {

        if (v === undefined) return undefined;

        if (!erdMappingObj) return v; //no mapping object so no transformers, vocab lookup, etc.
        if (erdMappingObj.exclude) return undefined;

        if (!typechain) {
          throw new Error("sanity check: 'typechain' not defined on applyTransformOrInspectNestedAttribs");
        }
        return Promise.resolve()
          .then(function transformOrRecurseOnValueTransformOrRecurse() {

            if (erdMappingObj.transform) {
              //we either do a transform, and then don't try to recurse anymore (since transform can alter at will, 
              //which will make tranform on child-properties moot).. 
              return _doESTransform(v, erdMappingObj.transform);
            } else if (_.isObject(v)) {
              // .. or no transform specified and we recurse properties
              return toERDRecursive(v, typechain, resolvedRefMap);
            } else {
              return v;
            }
          })
          .then(function transformOrRecurseOnValueVocabLookup(v) {

            return _doVocabLookup(v, _.extend({
              transformer: erdMappingObj.transform
            }, argObj));

          });
      });
  }


  function _processObjExpanded(ref, expandObj, refId) {

    ref = _.pick(ref, expandObj.fields.concat("_type"));

    //We get the first reftype. We can't do any better for ambiguous types: we can only expand
    //properties when they occur on all types
    var refTypechain = CanonicalEntity.super_.getTypechain(ref._type);
    var refRoot = CanonicalEntity.super_.getRootAndSubtypes(refTypechain).root;

    if (!refTypechain.length) {
      throw new Error("Sanity check: reftypeChain of length 0 for type: " + JSON.stringify(ref._type));
    }

    //populate values on Ref
    _populate(ref, refRoot);

    return toERDRecursive(ref, refTypechain)
      .then(function toERDRecursiveSingleItemWorkAfterToESRecursive(objExpanded) {

        //post populate on Ref
        _populate(objExpanded, refRoot, true);

        //optional post reduce values
        //This is especially useful when wanting to bring a multi-valued value to 
        //a concatted single-valued value in ERD.
        _postReduce(objExpanded, refRoot);

        //After populate we need to prune to wanted fields again.
        objExpanded = _.pick(objExpanded, expandObj.fields);

        //Now optionally we prune some more fields. 
        //This allows for keeping a calculated field (say all_tags) which is based on 
        //a field that we now want to prune
        objExpanded = _.omit(objExpanded, expandObj.postPruneFields || []);

        if (_.isArray(objExpanded)) {
          throw new Error("sanity check: expanded object after transform should never be array? ");
        }

        if (expandObj.includeId) {
          objExpanded.id = v;
        }

        return objExpanded;
      })
      .then(function cacheRef(objExpanded) {
        refMapCalc[refId] = objExpanded; //cache
        refsInProgress.splice(refsInProgress.indexOf(refId), 1); //can be removed
        return objExpanded;
      });

  }


  //transform a value to it's ES-counterpart by either 
  //- object-notation -> <k,v> map where values are functions with sig function(val)
  //  missing keys are passed along untouched
  //- function-notation -> one function with the value passed.
  //- string-notation -> canned transformer such as float, lowercase. 
  //
  //Note: when transformer not defined we recurse the possibly nested object. 
  //When transformer IS defined, we cannot do that anymore, since the transformer
  //might (read: is likely to) have changed the 'property-schema' on which recursing relies.
  function _doESTransform(v, transformers) {

    transformers = _.isArray(transformers) ? transformers : [transformers];

    return _.reduce(transformers, function _doESTransformReduce(out, transformer) {

      if (_.isFunction(transformer)) {
        return transformer(v);
      }

      if (_.isObject(transformer)) {
        if (!_.isObject(v)) {
          throw new Error("object-transformer selected but value not an object: " + v);
        }
        return _.reduce(v, function _doESTransformReducePerProperty(agg, value, k) {
          var transK = transformer[k];
          if (transK) {
            if (_.isString(transK)) {
              transK = domainUtils.transformers[transformer];
              if (!fn) throw new Error("canned transformer not found: " + transK);
            }
            agg[k] = transK(value);
          }
          return agg;
        }, {});
      }

      if (_.isString(transformer)) {
        var fn = domainUtils.transformers[transformer];
        if (!fn) throw new Error("canned transformer not found: " + transformer);
        return fn(v);
      }

      throw new Error("transformer needs to be function or object:" + transformer);

    }, v);

  }


  function _doVocabLookup(v, argObj) {
    var k = argObj.k,
      typechain = argObj.typechain,
      transformer = argObj.transformer;

    // Vocabulary lookups. 
    var erdMappingObj = erdMappingConfig.properties[k] || erdMappingConfig.propertiesCalculated[k]; //exists based on calling logic
    if (erdMappingObj.enum) {

      //It's safe to make array, bc: enum -> prop is multivalued
      //resulting array is later flatmapped into overall result
      v = _.isArray(v) ? v : [v];

      //e.g.: ["Movie"]
      var typesForThisEnum = _.intersection(_.keys(erdMappingObj.enum.sourceMappings), typechain);

      v = _.reduce(v, function _doVocabLookupReduce(arr, val) {

        //do a vocab lookup
        val = _.reduce(typesForThisEnum, function _doVocabLookupReducePerSingleVal(arr, typeName) {
          var valueMapForType = erdMappingObj.enum.sourceMappings[typeName];
          return arr.concat(valueMapForType[val] || []);
        }, []);


        //after vocab lookup, do a transform again because lookup may have resulted 
        //in values not respecting transform
        val = transformer ? _.reduce(val, function (arr, indivVal) {
          var out = _doESTransform(indivVal, transformer);
          out = _.isArray(out) ? out : [out];
          return arr.concat(out); //
        }, []) : val;

        return arr.concat(val);
      }, []);

      v = _.uniq(removeUndefined(v));

      if (erdMappingObj.enumStrictSingleValued) {
        if (!v.length) {
          return undefined;
        }

        return v[0];
      }
    }
    return v;
  }

  function fetchRefs(propertiesOrEntities, isEntities) {

    var fieldsToFetch = _.uniq(erdMappingConfig.refExpandWithFields.concat(["id", "_type"]));

    var refs;

    if (!isEntities) {
      var properties = propertiesOrEntities;
      refs = _fetchResolvedRefsRecursive(properties);
    } else {
      var entities = propertiesOrEntities;
      refs = _.reduce(entities, function fetchRefsReduce(arr, entity) {
        return arr.concat(_fetchResolvedRefsRecursive(entity._props));
      }, []);
    }

    if (!refs.length) {
      return Promise.resolve({});
    }

    //lot's of dupes potentially
    refs = _.uniq(refs);

    return tableCanonicalEntity.getAll.apply(tableCanonicalEntity, refs).pluck(fieldsToFetch)
      .then(function fetchRefsAfter(results) {

        //skip building aliases since that's not needed
        var options = {
          skipAlias: true
        };

        return _.reduce(results, function fetchRefsAfterReduce(agg, result) {

          var entity = new CanonicalEntity({
            id: result.id,
            type: result._type
          }, result, options);

          var simpleDTO = entity.toSimple();
          simpleDTO.id = result.id;

          agg[entity.id] = simpleDTO;

          return agg;
        }, {});
      });
  }

  CanonicalEntity.fetchRefs = fetchRefs;


  function _fetchResolvedRefsRecursive(properties) {

    var refs = _.reduce(properties, function _fetchResolvedRefsRecursivePerProp(arr, v, k) {
      if (excludePropertyKeys.indexOf(k) !== -1) return arr;

      function transformSingleItem(v) {

        var prop = generatedSchemas.properties[k];
        if (!prop) {
          //possible because we've already performed `populate` which can add calculated properties
          return;
        }

        //if first is range is datatype -> all in range are datatype as per #107
        //If datatype -> return undefined
        if (generatedSchemas.datatypes[prop.ranges[0]]) {
          return;
        }

        var type = generatedSchemas.types[prop.ranges[0]];

        if (!type) {
          throw new Error("sanity check: type should exist for propName: " + k);
        }

        if (type.isValueObject) {
          return arr.concat(_fetchResolvedRefsRecursive(v));
        }

        if (v._value) {
          arr.push(v._value);
        } else if (_.isString(v)) {
          //must be a reference as well since it's a string and no datatype
          //it's not formatted as a _value anymore, since it was already simplified. 
          //This happens on nested objects from 2nd degree onwards.
          arr.push(v);
        }
      }

      _.each(_.isArray(v) ? v : [v], transformSingleItem);

      return arr;
    }, []);


    return refs;
  }



  return CanonicalEntity;

};
