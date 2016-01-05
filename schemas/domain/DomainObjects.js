var _ = require("lodash");
var util = require("util");
var domainUtils = require("./utils");
var generatedSchemas = require("./createDomainSchemas.js")({
	checkSoundness: true
});


var validator = require("./validation")(generatedSchemas);
var excludePropertyKeys = ["_type", "_value", "_isBogusType"];

/**
 * Example: 
 * {
	  "_props": {
	    "_type": "Review",
	    "itemReviewed": {
	      "_value": "de305d54-75b4-431b-adb2-eb6b9e546014",
	      "_isBogusType": true,
	      "_type": "Place"
	    },
	    "reviewBody": {
	      "_value": "bla",
	      "_type": "Text"
	    },
	    "about": {
	      "_value": "de305d54-75b4-431b-adb2-eb6b9e546014",
	      "_isBogusType": true,
	      "_type": "Place"
	    }
	  },
	  "_type": "Review",
	  "_typechain": [
	    "Thing",
	    "Review"
	  ]
	}
 */
function AbstractDomainObject(state) {

	if (!this._kind) {
		throw new Error("AbstractDomainObject should be called by subtype");
	}
	if (!state) {
		throw new Error("'state' should be defined on DomainObject creation");
	}

	var typeName = state.type;

	if (!typeName) {
		throw new Error("'state.type' should be defined on DomainObject creation");
	}

	var type = generatedSchemas.types[typeName];

	if (!type) {
		throw new Error("type doesn't exist as defined by _type: " + typeName);
	}

	this._type = typeName;
	this._typechain = type.ancestors.concat([this._type]);

	this._propsDirty = {
		_type: typeName
	};

	this._state = {
		isValidated: false, //signals if validate has been called or is implicit based on db load
		// isValid: false, //signals if validate succeeded or is implicit based on db load
		// isDirty: false //signals if props have changed since last call to validate
		recommitCount: 0
	};
}


AbstractDomainObject.prototype.isValidated = function() {
	return !!this._state.isValidated;
};

AbstractDomainObject.prototype.isValidOrUnchecked = function() {
	return !!this._state.isValid;
};

AbstractDomainObject.prototype.isDirty = function() {
	return !!this._state.isDirty;
};

AbstractDomainObject.prototype.set = function(objMutable, doOverwrite) {
	if (!objMutable) {
		throw new Error("objMutable should be provided to create domain object");
	}

	if (objMutable._type) {
		throw new Error("type should NOT be defined on toplevel but on `state.type` during DomainObject creation");
	}

	//delta is supplied delta + _type as included from domainObject. 
	//This guarantees _type cannot not overwritten.
	var delta = _.extend(
		_.cloneDeep(objMutable), //This *might* be needed depending on calling client. For now just be safe.
		{
			_type: this._type
		}
	);

	var combined = _transformProperties(doOverwrite ? delta : _.extend({}, this._propsDirty, delta), true);

	//if combined isn't the same as _propsDirty -> reset isValidated & isValid 
	if (!_.eq(combined, this._propsDirty)) {
		this._state.isValidated = false;
		this._state.isValid = false;
	}

	//TECH: propsDirty becomes a NEW object. 
	//This means we can safely set props <- propsDirty on commit
	this._propsDirty = combined;

	//if _propsDirty isn't the same as _props -> set isDirty = true, otherwise set to false
	this._state.isDirty = !_.eq(this._propsDirty, this._props);
};


AbstractDomainObject.prototype.validate = function(cb) {
	var self = this;

	if (self.isValidated()) {
		//if already validated and `_propsDirty` didn't change => validation outcome doesn't change
		return cb();
	}

	this._validationSchema.validate(this._propsDirty, function(err, res) {
		if (err) {
			return cb(err);
		}
		var validObj = self._state;
		validObj.isValidated = true;
		if (res) {
			validObj.errors = res.errors;
			validObj.isValid = false;
			return cb();
		}

		validObj.isValid = true;

		return cb();
	});
};


AbstractDomainObject.prototype.commit = function(cb) {

	// if (!this.isDirty()) return cb(); //commented-out: too much magic

	var self = this;
	this.validate(function(err) {
		if (err) {
			return cb(err);
		}
		if (!self.isValidOrUnchecked()) {
			return cb(new Error("Cannot commit because of validation errors"));
		}

		var props = _.cloneDeep(self._propsDirty); //freeze propsDirty to persist

		//NOTE: toDataObject should NOT be passed to Rethink. 
		//Instead this should be passed to Elasticsearch by rethink2ES-feeder 
		// console.log(JSON.stringify(self.toDataObject(props), null, 2));

		setTimeout(function fakeDbCommit() {

			///////////////////////////
			//FOR NOW: Latest wins. 
			//
			//NOTE: THERE'S NO CODE TO UPDATE PROCESS WITH ENTITY UPDATED OUT-OF-PROCESS.
			//THIS SHOULDN'T HAPPEN FOR NOW.
			//
			//PERHAPS LATER: Rethinkdb returns optimisticVersion, this should be set and used when doing update
			//On optimisticLockIssue we should reload data from DB (returning latest version) and 
			//see if diff works out. 
			/////////////////////////////

			//on success -> set props = propsDirty
			self._props = props;

			//in meantime _propsDirty may have changed..
			self._state.isDirty = !_.eq(self._propsDirty, self._props);

			if (!self._state.isDirty) {
				self._state.recommitCount = 0;
				return cb();
			}

			if (++self._state.recommitCount >= 3) {
				//we don't anticpiate this error yet. Seeing this is trouble...
				return cb(new Error("recommitCount reached for item! Can only happen on REAL high congestion"));
			}

			//do a re-commit, until success.
			self.commit(cb);

		}, 100);


	});
};



function CanonicalObject(state) {
	this._kind = domainUtils.enums.kind.CANONICAL;
	this._validationSchema = validator.createSchema();
	CanonicalObject.super_.call(this, state);
}

function SourceObject(state) {
	this._kind = domainUtils.enums.kind.SOURCE;
	this._validationSchema = validator.createSchemaSourceObject();
	SourceObject.super_.call(this, state);
}



util.inherits(CanonicalObject, AbstractDomainObject);
util.inherits(SourceObject, AbstractDomainObject);

// CanonicalObject.prototype.set = _.wrap(AbstractDomainObject.prototype.set, function(superFN, objMutable) {
// 	superFN.call(this, objMutable);
// 	this._props = _transformProperties(_.cloneDeep(objMutable), true);
// });



/**
 * Example:
 * {
	  "_index": "Review",
	  "_subtypes": [
	    "Thing",
	    "Review"
	  ],
	  "_props": {
	    "reviewBody": "bla",
	    "about": "de305d54-75b4-431b-adb2-eb6b9e546014"
	  }
	}
 */
AbstractDomainObject.prototype.toDataObject = function(props) {
	var type = generatedSchemas.types[this._type]; //guaranteed

	return {
		_index: type.rootName,
		_subtypes: this._typechain.slice(this._typechain.indexOf(type.rootName) + 1),
		_props: _toDataObjectRecursive(props || this._props)
	};
};


/**
 * Example:
 * {
	  "_type": "Review",
	  "itemReviewed": "de305d54-75b4-431b-adb2-eb6b9e546014",
	  "reviewBody": "bla",
	  "about": "de305d54-75b4-431b-adb2-eb6b9e546014"
	}
 */
AbstractDomainObject.prototype.toSimple = function(props) {
	return _.extend({
		_type: this._type
	}, _toSimpleRecursive(props || this._props));
};



//1. transform obj so all values are expanded into objects. 
//E.g.: "some value" is expanded to {"_value": "some value"}
//2. 
function _transformProperties(obj, isTopLevel, ancestors) {

	ancestors = ancestors || [];

	if (!_.isObject(obj)) {
		throw new Error("SANITY CHECK: `obj` passed to _transformProperties should be an object");
	}

	var typeName = obj._type;
	var typeNameIsExplicit = !!typeName;
	var fieldName;
	var fieldtype;

	if (!isTopLevel) {
		//State: no toplevel: 
		//- ancestors.length > 0
		//- fieldtype is guaranteed to exist
		fieldName = ancestors[ancestors.length - 1];
		fieldtype = generatedSchemas.properties[fieldName];
	}

	if (!typeName) {

		//STATE: fieldtype guaranteed to exist.
		if (!fieldtype.isAmbiguous) {
			typeName = fieldtype.ranges[0];
		} else {
			if (fieldtype.ambiguitySolvedBy.type === "explicitType") {
				throw new Error("_type should be explicitly defined for (ambiguous field, value) " + fieldName + " - " + JSON.stringify(obj, null, 2));
			}
			typeName = domainUtils.inferTypeForAmbiguousRange(fieldtype, obj);
			if (!typeName) {
				throw new Error("ambiguous resolver couldn't resolve type (fieldName, value) " + fieldName + " - " + JSON.stringify(obj, null, 2));
			}
		}
		//pass in found type
		obj._type = typeName;
	}

	//State: typeName = obj._type = defined
	var type = generatedSchemas.types[typeName] || generatedSchemas.datatypes[typeName];

	if (!type) {
		throw new Error("type not found: " + typeName);
	}

	if (typeNameIsExplicit) {
		//_type explicitly passed. Let's make sure it's an allowed type
		if (!isTopLevel && !domainUtils.isTypeAllowedForRange(type, fieldtype)) {
			throw new Error("type not allowed for fieldname, type: " + ancestors.join(".") + " - " + typeName);
		}
	}

	//check that only allowed properties are passed
	var allowedProps = excludePropertyKeys.concat(_.keys(type.properties) || []),
		suppliedProps = _.keys(obj),
		nonAllowedProps = _.difference(suppliedProps, allowedProps);

	if (nonAllowedProps.length) {
		throw new Error("non-allowed properties found (field, non-allowed props): " + ancestors.join(".") +
			" - " + nonAllowedProps.join(","));
	}


	//walk properties and: 
	//1. if value isn't object -> make it object
	//2. make value multivalued by doing v -> [v], if field is multivalued, and not already array
	//   NOTE: multivalued value on singlevalued is caught later in validator.
	//3. copy to aliasOf-target if not already populated. If it is -> error out 
	//6. recurse
	_.each(obj, function(v, k) {

		if (excludePropertyKeys.indexOf(k) !== -1) return;

		if (v === undefined) {
			delete obj[k]; //lets nip this in the balls
			return;
		}

		var fieldtype = type.properties[k]; //guaranteed to exist

		//create array if fieldtype isMulti
		if (fieldtype.isMulti) {
			v = _.isArray(v) ? v : [v];
		}

		//transform input
		if (fieldtype.fieldTransformers) {
			v = !_.isArray(v) ? fieldtype.fieldTransformers(v) : _.map(v, fieldtype.fieldTransformers);
		}

		//bit weird: we allow an array value for isMulti=false. 
		//This so we can catch this validation error properly later in the validation code
		obj[k] = !_.isArray(v) ? _transformSingleObject(ancestors, k, v) : _.map(v, _.partial(_transformSingleObject, ancestors, k));

	}); //end each



	if (!type.isDataType) {

		//populate target of aliasOf. 
		//e.g.: populate b if a is set in a.aliasOf(b)
		//error out when DIFFERENT value already set on b (either by itself or by some other property that aliases to b as well)
		_.each(obj, function(v, k) {

			if (excludePropertyKeys.indexOf(k) !== -1) return;

			var fieldtype = type.properties[k]; //guaranteed to exist

			if (fieldtype.aliasOf) {
				if (obj[fieldtype.aliasOf] !== undefined && !_.isEqual(obj[k], obj[fieldtype.aliasOf])) {
					throw new Error("aliasOf target already contains value prop, aliasOf: " + k + ", " + fieldtype.aliasOf);
				}
				obj[fieldtype.aliasOf] = obj[k]; //already transformed
			}
		});

		//add aliasOf properties which weren't set. 
		//e.g.: populate a if b is set in a.aliasOf(b)
		_.each(type.properties, function(prop, k) {
			if (prop.aliasOf && obj[k] === undefined) {
				obj[k] = obj[prop.aliasOf];
			}
		});
	}

	return obj;
}

function _transformSingleObject(ancestors, k, val) {
	if (!_.isObject(val)) {
		val = {
			_value: val
		};
	}
	return _transformProperties(val, undefined, ancestors.concat([k]));
}



//Now that the object has been validated and it's guaranteed it can be saved
//prepare a DTO of the object that is actually passed to the datalayer for saving. 

//This consists of: 
//- removing all properties that define aliasOf directive. 
//- setting all properties that are datatypes to their simple version again.
//- LATER: might include chopping up in multiple root objects, if contained in 1 big structure. Not sure if we want to support this
//cascade-saving
//
//
//Example of dataobject: 
//
// {
//   "reviewBody": "bla",
//   "about": "de305d54-75b4-431b-adb2-eb6b9e546014",
//   "_subtypes": [
//     "Thing",
//     "Review"
//   ],
//   "_index": "Review"
// }
// 
// NOTE: dataobjects: 
// - have passed validation
// - sanitization is applied. 
function _toDataObjectRecursive(properties) {

	var dto = _.reduce(_.clone(properties), function(agg, v, k) {
		if (excludePropertyKeys.indexOf(k) !== -1) return agg;

		var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];

		//remove aliasOf properties. 
		//By now these are already validated and copied to the aliasOf-target
		if (generatedSchemas.properties[k].aliasOf) {
			return agg;
		}

		if (propType.isValueObject) {
			v = _toDataObjectRecursive(v); //recurse non-datatypes
		} else {
			v = v._value; //simplify all datatypes and object-references to their value
		}

		agg[k] = v;
		return agg;
	}, {});


	return dto;
}

function _toSimpleRecursive(properties) {

	var dto = _.reduce(_.clone(properties), function(agg, v, k) {
		if (excludePropertyKeys.indexOf(k) !== -1) return agg;

		var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];

		if (propType.isValueObject) {
			v = _toSimpleRecursive(v); //recurse non-datatypes
		} else {
			v = v._value; //simplify all datatypes and object-references to their value
		}

		agg[k] = v;
		return agg;
	}, {});


	return dto;
}

module.exports = {
	CanonicalObject: CanonicalObject,
	SourceObject: SourceObject
};
