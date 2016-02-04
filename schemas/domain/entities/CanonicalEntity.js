var _ = require("lodash");
var util = require("util");
var domainUtils = require("../utils");
var UUID = require("pure-uuid");

var excludePropertyKeys = domainUtils.excludePropertyKeys;


module.exports = function(generatedSchemas, AbstractEntity, r) {

	var domainUtils = require("../utils");
	var tableCanonicalEntity = r.table(domainUtils.statics.CANONICALTABLE);

	var esMappingConfig = require("../../erd/elasticsearch")(generatedSchemas);
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

	CanonicalEntity.prototype.toRethinkObject = function(props) {

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

	CanonicalEntity.prototype.toElasticsearchObject = function() {

		var self = this;

		return Promise.resolve()
			.then(function() {

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

				//populate values from other fields.
				_populate(props, root);

				//do the mapping and stuff.
				return _toESRecursive(props, typechain)
					.then(function(dto) {

						//post populate
						_populate(dto, root, true);

						_.extend(dto, {
							id: self.id,
							_root: root,
						});

						return dto;

					});
			});
	};

	function _populate(props, root, isPostPopulate) {

		_.each(entityUtils.calcPropertyOrderToPopulate(root), function(propName) {
			var prop = esMappingConfig.properties[propName] || esMappingConfig.propertiesCalculated[propName];

			if (!prop) return;

			var populateObj = prop[!isPostPopulate ? "populate" : "postPopulate"];

			if (!populateObj) return;

			//the fieldnames of which the contents should be populated into the current propName
			var fields = _.isArray(populateObj.fields) ? populateObj.fields : [populateObj.fields];

			//populate.stategy with default fallback function
			var fn = populateObj.strategy || function(val) {
				return _.isArray(val) ? val : [val];
			};

			//iterate all fieldnames, fetch the contents, pipe through the strategy function, and save
			props[propName] = _.uniq(_.reduce(fields, function(arr, field) {
				var fieldContents = props[field];

				var val = fn(fieldContents);
				val = _.isArray(val) ? val : [val];

				return fieldContents ? arr.concat(val) : arr;
			}, props[propName] || []));
		});

	}


	function _toESRecursive(properties, typechain) {

		if (!typechain) {
			throw new Error("_toESRecursive expects arg 'typechain'");
		}

		typechain = _.isArray(typechain) ? typechain : [typechain];

		return fetchRefs(properties)
			.then(function(refMap) {

				var expandMapToInclude = {};

				var dto = {};

				var promises = _.map(properties, function(v, k) {

					if (excludePropertyKeys.indexOf(k) !== -1) return;

					var argObj = {
						isTotalValueMultiValued: _.isArray(v),
						k: k,
						expandMapToInclude: expandMapToInclude,
						typechain: typechain
					};

					return Promise.resolve()
						.then(function() {

							if (_.isArray(v)) {

								return Promise.all(_.map(v, function(singleVal) {
										return _toESRecursiveSingleItem(singleVal, argObj);
									}))
									.then(function(arrOfPossibleArr) {

										arrOfPossibleArr = _.compact(arrOfPossibleArr);

										return _.reduce(arrOfPossibleArr, function(out, possibleArr) {
											return out.concat(_.isArray(possibleArr) ? possibleArr : [possibleArr]);
										}, []);
									});

							} else {
								//apply single transform to single item. Result may be undefined as well as array. 
								//Remember isMulti= false, doesn't dictate that a transform can't make an array. 
								//For instance geoPoint is tranformed to array [long, lat] 
								return _toESRecursiveSingleItem(v, argObj);
							}
						})
						.then(function(out) {

							if (_.isArray(out)) {

								//compact: some may be undefined. uniq: vocab lookup may produce dupes
								out = _.uniq(_.compact(out));

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
					.then(function() {
						return _.extend(dto, expandMapToInclude);
					});
			});

	}


	function _toESRecursiveSingleItem(v, argObj) {

		var isTotalValueMultiValued = argObj.isTotalValueMultiValued;
		var k = argObj.k;
		var expandMapToInclude = argObj.expandMapToInclude;
		var typechain = argObj.typechain;

		var esMappingObj = esMappingConfig.properties[k];

		return Promise.resolve()
			.then(function calcV() {

				if (!v._type) return v;

				//Translate only original values coming from DB. 
				//This means no Elasticsearch transformed values.
				var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];

				if (propType.isValueObject) {
					return _toESRecursive(v, typechain); //recurse non-datatypes
				} else if (v._ref) {
					return undefined; //skip all non-resolved refs. 
				} else {
					return v._value; //simplify all datatypes and object-references to their value
				}
			})
			.then(function(v) {

				if (v === undefined) return undefined;

				return Promise.resolve()
					.then(function() {

						//If mapping contains a `expand` directive, create a new, possibly multivalued, field named: <prop>#expanded. 
						//E.g.: location#expanded
						if (esMappingObj && esMappingObj.expand) {

							var expandObj = esMappingObj.expand;

							//fetch the reference and only keep the `fields` defined.
							var ref = resolvedRefMap[v];

							if (!ref) {
								throw new Error("resolved ref couldn't be resolved: " + v);
							}

							ref = _.pick(ref, _.uniq(expandObj.fields.concat("_type")));

							//We get the first reftype. We can't do any better for ambiguous types: we can only expand
							//properties when they occur on all types
							var refTypechain = CanonicalEntity.super_.getTypechain(ref._type);
							var refRoot = CanonicalEntity.super_.getRootAndSubtypes(refTypechain).root;

							if (!refTypechain.length) {
								throw new Error("Sanity check: reftypeChain of length 0 for type: " + JSON.stringify(ref._type));
							}

							//populate values on Ref
							_populate(ref, refRoot);

							return _toESRecursive(ref, refTypechain)
								.then(function(objExpanded) {

									//post populate on Ref
									_populate(objExpanded, refRoot, true);

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

									if (!expandObj.flatten) {

										var key = k + "--expand";
										expandMapToInclude[key] = isTotalValueMultiValued ?
											(expandMapToInclude[key] || []).concat([objExpanded]) :
											objExpanded;

									} else {

										//add individual fields to expandMapToInclude
										_.each(objExpanded, function(v, fieldKey) {
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
					.then(function() {
						return v;
					});
			})
			.then(function transformOrRecurseOnValue(v) {

				if (v === undefined) return undefined;

				if (!esMappingObj) return v;
				if (esMappingObj.exclude) return undefined;

				if (!typechain) {
					throw new Error("sanity check: 'typechain' not defined on applyTransformOrInspectNestedAttribs");
				}
				return Promise.resolve()
					.then(function() {

						if (esMappingObj.transform) {
							return _doESTransform(v, esMappingObj.transform);
						} else if (_.isObject(v)) {
							return _toESRecursive(v, typechain);
						} else {
							return v;
						}
					})
					.then(function(v) {

						return _doVocabLookup(v, _.extend({
							transformer: esMappingObj.transform
						}, argObj));

					});
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

		return _.reduce(transformers, function(out, transformer) {

			if (_.isFunction(transformer)) {
				return transformer(v);
			}

			if (_.isObject(transformer)) {
				if (!_.isObject(v)) {
					throw new Error("object-transformer selected but value not an object: " + v);
				}
				return _.reduce(v, function(agg, value, k) {
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
		var esMappingObj = esMappingConfig.properties[k]; //exists based on calling logic
		if (esMappingObj.enum) {

			//It's safe to make array, bc: enum -> prop is multivalued
			//resulting array is later flatmapped into overall result
			v = _.isArray(v) ? v : [v];

			//e.g.: ["Movie"]
			var typesForThisEnum = _.intersection(_.keys(esMappingObj.enum.sourceMappings), typechain);

			v = _.reduce(v, function(arr, val) {

				//do a vocab lookup
				val = _.reduce(typesForThisEnum, function(arr, typeName) {
					var valueMapForType = esMappingObj.enum.sourceMappings[typeName];
					return arr.concat(valueMapForType[val] || []);
				}, []);

				//after vocab lookup, do a transform again because lookup may have resulted 
				//in values not respecting transform
				val = transformer ? _.map(val, _.partial(_doESTransform, _, transformer)) : val;

				return arr.concat(val);
			}, []);

			v = _.uniq(_.compact(v));
		}
		return v;
	}


	function _fetchResolvedRefsRecursive(properties) {

		var refs = _.reduce(_.clone(properties), function(arr, v, k) {
			if (excludePropertyKeys.indexOf(k) !== -1) return arr;

			function transformSingleItem(v) {

				var prop = generatedSchemas.properties[k];
				if (!prop) {
					//possible because we've already performed `populate` which can add calculated properties
					return undefined;
				}

				//if first is range is datatype -> all in range are datatype as per #107
				//If datatype -> return undefined
				if (generatedSchemas.datatypes[prop.ranges[0]]) {
					return undefined;
				}

				if (v.isValueObject) {
					return arr.concat(_fetchResolvedRefsRecursive(v));
				}

				if (v._value) {
					arr.push(v._value);
				}
			}

			_.each(_.isArray(v) ? v : [v], transformSingleItem);

			return arr;
		}, []);


		return refs;
	}


	function fetchRefs(properties) {


		var fieldsToFetch = _.uniq(esMappingConfig.refExpandWithFields.concat(["id", "_type"]));

		// var refs = _.uniq(_.reduce(data.entities, function(arr, entity) {

		// 	var refs = _fetchResolvedRefsRecursive(properties);
		// 	entity._refsResolved = refs;

		// 	return arr.concat(refs);
		// }, []));

		var refs = _fetchResolvedRefsRecursive(properties);

		if (!refs.length) {
			return Promise.resolve({});
		}

		return tableCanonicalEntity.getAll.apply(tableCanonicalEntity, refs).pluck(fieldsToFetch)
			.then(function(results) {

				//skip building aliases since that's not needed
				var options = {
					skipAlias: true
				};

				return _.reduce(results, function(agg, result) {

					var entity = new CanonicalEntity({
						id: result.id,
						type: result._type
					}, result, options);

					var simpleDTO = entity.toSimple();
					agg[entity.id] = simpleDTO;

					return agg;
				}, {});
			});
	}


	return CanonicalEntity;

};
