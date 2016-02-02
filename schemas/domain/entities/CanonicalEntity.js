var _ = require("lodash");
var util = require("util");
var domainUtils = require("../utils");
var UUID = require("pure-uuid");

var excludePropertyKeys = domainUtils.excludePropertyKeys;

var domainUtils = require("../utils");

module.exports = function(generatedSchemas, AbstractEntity, r) {

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

	CanonicalEntity.prototype.toElasticsearchObject = function(resolvedRefMap) {

		var props = _.cloneDeep(this._props);

		//Given (possible multiple) this._type, get the typechain.
		var typechain = CanonicalEntity.super_.getTypechain(this._type); //may contain duplicate types, see method

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
		props = _toESRecursive(props, resolvedRefMap || {}, typechain);

		//post populate
		_populate(props, root, true);

		var dto = _.extend({
			id: this.id,
			_root: root,
		}, props);

		return dto;
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


	function _toESRecursive(properties, resolvedRefMap, typechain) {

		if (!typechain) {
			throw new Error("_toESRecursive expects arg 'typechain'");
		}

		typechain = _.isArray(typechain) ? typechain : [typechain];

		var expandMapToInclude = {};
		var dto = _.reduce(properties, function(agg, v, k) {

			if (excludePropertyKeys.indexOf(k) !== -1) return agg;

			var argObj = {
				isTotalValueMultiValued: _.isArray(v),
				k: k,
				expandMapToInclude: expandMapToInclude,
				resolvedRefMap: resolvedRefMap,
				typechain: typechain
			};

			var out;
			if (_.isArray(v)) {

				//Apply single transform to map, this can results in array or array of arrays
				out = _.reduce(v, function(arr, singleVal) {
					var possibleArr = _toESRecursiveSingleItem(singleVal, argObj);
					return arr.concat(_.isArray(possibleArr) ? possibleArr : [possibleArr]);
				}, []);

			} else {
				//apply single transform to single item. Result may be undefined as well as array. 
				//Remember isMulti= false, doesn't dictate that a transform can't make an array. 
				//For instance geoPoint is tranformed to array [long, lat] 
				out = _toESRecursiveSingleItem(v, argObj);
			}

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
				agg[k] = out;
			}

			return agg;
		}, {});

		_.extend(dto, expandMapToInclude);

		return dto;
	}


	function _toESRecursiveSingleItem(v, argObj) {

		var isTotalValueMultiValued = argObj.isTotalValueMultiValued;
		var k = argObj.k;
		var expandMapToInclude = argObj.expandMapToInclude;
		var resolvedRefMap = argObj.resolvedRefMap;
		var typechain = argObj.typechain;

		function applyTransformOrInspectNestedAttribs(v, transformer, typechain) {

			if (!typechain) {
				throw new Error("sanity check: 'typechain' not defined on applyTransformOrInspectNestedAttribs");
			}

			if (v !== undefined) {
				if (transformer) {
					v = _doESTransform(v, transformer);
				} else if (_.isObject(v)) {
					v = _toESRecursive(v, resolvedRefMap, typechain);
				}
			}

			if (v === undefined) return undefined;

			return _doVocabLookup(v, _.extend({
				transformer: transformer
			}, argObj));
		}

		//Translate only original values coming from DB. 
		//This means no Elasticsearch transformed values.
		if (v._type) {

			var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];

			if (propType.isValueObject) {
				v = _toESRecursive(v, resolvedRefMap, typechain); //recurse non-datatypes
			} else if (v._ref) {
				v = undefined; //skip all non-resolved refs. 
			} else {
				v = v._value; //simplify all datatypes and object-references to their value
			}

			if (v === undefined) {
				return undefined;
			}
		}

		//Apply Elasticsearch mapping if it exists for the current key.
		var esMappingObj = esMappingConfig.properties[k];
		if (esMappingObj) {

			//If mapping contains a `expand` directive, create a new, possibly multivalued, field named: <prop>#expanded. 
			//E.g.: location#expanded
			if (esMappingObj.expand) {

				var expandObj = esMappingObj.expand;

				//fetch the reference and only keep the `fields` defined.
				var ref = _.pick(resolvedRefMap[v], _.uniq(expandObj.fields.concat("_type")));
				if (!ref) {
					throw new Error("resolved ref couldn't be resolved: " + v);
				}

				//We get the first reftype. We can't do any better for ambiguous types: we can only expand
				//properties when they occur on all types
				var refTypechain = CanonicalEntity.super_.getTypechain(ref._type);
				var refRoot = CanonicalEntity.super_.getRootAndSubtypes(refTypechain).root;

				if (!refTypechain.length) {
					throw new Error("Sanity check: reftypeChain of length 0 for type: " + JSON.stringify(ref._type));
				}

				//populate values on Ref
				_populate(ref, refRoot);

				//perform transforms / vocab lookup on reg
				var objExpanded = _toESRecursive(ref, resolvedRefMap, refTypechain);

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

				var key = k + "--expand";
				expandMapToInclude[key] = isTotalValueMultiValued ?
					(expandMapToInclude[key] || []).concat([objExpanded]) :
					objExpanded;
			}


			if (esMappingObj.exclude) { //Exclude value from ES-index.  
				v = undefined;
			} else {

				//apply transform if exists, or inspect nested attributes for needed transforms recursively.
				v = applyTransformOrInspectNestedAttribs(v, esMappingObj.transform, typechain);

			}
		}

		return v;
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

	//fetch a deduped array of resolved reference ids
	CanonicalEntity.prototype.fetchResolvedRefs = function(props) {
		return _fetchResolvedRefsRecursive(props || this._props);
	};


	function _fetchResolvedRefsRecursive(properties) {
		var refs = _.reduce(_.clone(properties), function(arr, v, k) {
			if (excludePropertyKeys.indexOf(k) !== -1) return arr;

			function transformSingleItem(v) {

				//if first is range is datatype -> all in range are datatype as per #107
				//If datatype -> return undefined
				if (generatedSchemas.datatypes[generatedSchemas.properties[k].ranges[0]]) {
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



	return CanonicalEntity;

};
