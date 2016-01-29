var _ = require("lodash");
var util = require("util");
var domainUtils = require("../utils");
var UUID = require("pure-uuid");

var excludePropertyKeys = domainUtils.excludePropertyKeys;

var esMappingConfig = require("../../erd/elasticsearch");
var esMappingProperties = esMappingConfig.properties;

module.exports = function(generatedSchemas, AbstractEntity, r) {

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

	CanonicalEntity.prototype.toElasticsearchObject = function(props, resolvedRefMap) {

		resolvedRefMap = resolvedRefMap || {};

		//Get DTO: 
		//1. skip _refs (unresolved refs)
		//2. should we add couple of ref properties as well? 
		//3. correct single/multi as per schema
		var dto = _toESRecursive(props || this._props, resolvedRefMap);

		//TODO: Parse 'tag' and 'fact' to more rich semantic structures such as 'subtypes' based on Controlled Vocab lookup
		//TODO: #100 - Controlled Vocab filtering for all defined fields.
		// NOTE: types define which values are possible on a controlled vocab field. (i.e.: isExtensible = true)

		//get the root, which will tell in which index to store, as well as the subtypes: 
		//i.e. the typechain sitting below the root.
		var rootAndSubtypes = this.getRootAndSubtypes();

		//subtypes-property is the union of: 
		//- official subtypes 
		//- other subtypes which were free to be manually assigned. They *must* adhere to Controlled Vocabulary through
		//  - subtypes *might* also be populated from the 'tag'-property
		var subtypes = _.union(rootAndSubtypes.subtypes, dto.subtypes);

		return _.extend(dto, {
			_root: rootAndSubtypes.root,
			subtypes: subtypes,
			id: this.id, //Elasticsearch id <= Rethink id
		});
	};

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

	//transform a value by either 
	//- object-notation -> <k,v> map where values are functions with sig function(val)
	//  missing keys are passed along untouched
	//- function-notation -> one function with the value passed.
	//
	//Note: when transformer not defined we recurse the possibly nested object. 
	//When transformer IS defined, we cannot do that anymore, since the transformer
	//might (read: is likely to) have changed the 'property-schema' on which recursing relies.
	function doValueTransform(v, transformer) {
		if (v === undefined) {
			return undefined;
		}

		if (!transformer) {
			if (_.isObject(v)) {
				v = _toESRecursive(v, {}, true); //recurse
			}
			return v;
		}

		if (_.isFunction(transformer)) {
			return transformer(v);
		}

		if (_.isObject(transformer)) {
			if (!_.isObject(v)) {
				throw new Error("object-transformer selected but value not an object: " + v);
			}
			return _.reduce(v, function(agg, value, k) {
				agg[k] = transformer[k] ? transformer[k](value) : value;
				return agg;
			}, {});
		}

		throw new Error("transformer needs to be function or object:" + transformer);
	}

	function _toESRecursive(properties, resolvedRefMap, isRef) {

		var expandMapToInclude = {};

		var origProps = _.clone(properties);

		var dto = _.reduce(origProps, function(agg, v, k) {

			if (excludePropertyKeys.indexOf(k) !== -1) return agg;

			var isTotalValueMultiValued = _.isArray(v);

			var propertySchema = generatedSchemas.properties[k];

			//remove aliasOf properties. They have no place in ERD
			if (propertySchema.aliasOf) {
				return agg;
			}

			//NOTE: at this point _type is guaranteed NOT an array anymore. That was only at toplevel
			function transformSingleItem(v) {

				if (!isRef) {

					var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];

					if (propType.isValueObject) {
						v = _toESRecursive(v, resolvedRefMap, isRef); //recurse non-datatypes
					} else if (v._ref) {
						v = undefined; //skip all non-resolved refs. 
					} else {
						v = v._value; //simplify all datatypes and object-references to their value
					}

					if (v === undefined) {
						return v;
					}
				}

				var esMappingObj = esMappingProperties[k];
				if (esMappingObj) {

					//Transform to ES
					v = doValueTransform(v, esMappingObj.transform);

					//Add new, possibly multivalued, field named: <prop>#expanded. E.g.: location#expanded
					var expandObj = esMappingObj.expand;
					if (expandObj) {
						var key = k + "--expand";

						var ref = resolvedRefMap[v];
						if (!ref) {
							throw new Error("resolved ref couldn't be resolved: " + v);
						}

						var objExpanded = _.pick(doValueTransform(ref, expandObj.transform), expandObj.fields);

						if (expandObj.includeId) {
							objExpanded.id = v;
						}

						if (!isTotalValueMultiValued) {
							expandMapToInclude[key] = objExpanded;
						} else {
							var arr = expandMapToInclude[key] = expandMapToInclude[key] || [];
							arr.push(objExpanded);
						}
					}

					//Exclude value from ES-index. 
					//Note: it's still possible to have derived/calcualted and expanded values indexed. 
					if (esMappingObj.exclude) {
						v = undefined;
					}
				}

				return v;
			}

			var out;
			if (_.isArray(v)) {
				out = _.compact(_.map(v, transformSingleItem));
				if (!_.size(out)) {
					out = undefined;
				}
			} else {
				out = transformSingleItem(v);
			}
			if (out !== undefined) {
				agg[k] = out;
			}

			return agg;
		}, {});

		_.extend(dto, expandMapToInclude);

		return dto;
	}


	return CanonicalEntity;

};
