var _ = require("lodash");
var util = require("util");
var domainUtils = require("../utils");
var UUID = require("pure-uuid");

var excludePropertyKeys = domainUtils.excludePropertyKeys;

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

	CanonicalEntity.prototype.toElasticsearchObject = function(props) {

		//Get DTO: 
		//1. skip _refs (unresolved refs)
		//2. skip all resolved refs FOR NOW. Might replace with a couple of properties per ref? 
		//3. correct single/multi as per schema
		var dto = _toESRecursive(props || this._props);

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

	function _toESRecursive(properties) {

		var dto = _.reduce(_.clone(properties), function(agg, v, k) {
			if (excludePropertyKeys.indexOf(k) !== -1) return agg;

			var propertySchema = generatedSchemas.properties[k];

			//remove aliasOf properties. They have no place in ERD
			if (propertySchema.aliasOf) {
				return agg;
			}

			//NOTE: at this point _type is guaranteed NOT an array anymore. That was only at toplevel
			function transformSingleItem(v) {

				//if first is range is datatype -> all in range are datatype. As per #107
				//If datatype -> just grab _value
				//Needed for Datatype: Object
				if (generatedSchemas.datatypes[propertySchema.ranges[0]]) {
					return v._value;
				}

				var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];

				if (propType.isValueObject) {
					v = _toESRecursive(v); //recurse non-datatypes
				} else if (v._ref) {
					v = undefined; //skip all non-resolved refs. 
				} else {
					v = v._value; //simplify all datatypes and object-references to their value
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


		return dto;
	}


	return CanonicalEntity;

};
