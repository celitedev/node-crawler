var _ = require("lodash");

var domainUtils = require("./utils");
var generatedSchemas = require("./createDomainSchemas.js")({
	checkSoundness: true
});

var validator = require("./validation")(generatedSchemas);


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
	  "_subtypes": [
	    "Thing",
	    "Review"
	  ]
	}
 */
function DomainObject(objMutable) {

	if (!objMutable._type) {
		throw new Error("_type should be defined on toplevel");
	}

	this._props = _transformProperties(_.cloneDeep(objMutable), true);
	this._type = objMutable._type;

	var type = generatedSchemas.types[this._type]; //guaranteed to exist
	this._subtypes = type.ancestors.concat([this._type]);
}


DomainObject.prototype.validate = function(cb) {
	validator.createSchema().validate(this._props, cb);
};


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
DomainObject.prototype.toDataObject = function() {
	var type = generatedSchemas.types[this._type]; //guaranteed
	return {
		_index: type.rootName,
		_subtypes: this._subtypes,
		_props: _toDataObjectRecursive(this._props)
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
DomainObject.prototype.toSimple = function() {
	return _.extend({
		_type: this._type
	}, _toSimple(this._props));
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
		if (!isTopLevel && !isTypeAllowedForRange(type, fieldtype)) {
			throw new Error("type not allowed for fieldname, type: " + ancestors.join(".") + " - " + typeName);
		}
	}

	//check that only allowed properties are passed
	var allowedProps = ["_type", "_value", "_isBogusType"].concat(_.keys(type.properties) || []),
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

		if (k === "_type" || k === "_value" || k === "_isBogusType") return;

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

		//populate target of aliasOf. 
		//e.g.: populate b in a.aliasOf(b)
		//error out when value already set on b (either by itself or by some other property that aliases to b as well)
		if (fieldtype.aliasOf) {
			if (obj[fieldtype.aliasOf] !== undefined) {
				throw new Error("aliasOf target already contains value prop, aliasOf: " + k + ", " + fieldtype.aliasOf);
			}
			obj[fieldtype.aliasOf] = obj[k]; //already transformed
		}
	}); //end each


	//add aliasOf properties which weren't set. 
	//e.g.: set a if b is set in a.aliasOf(b)
	if (!type.isDataType) {
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
		if (k === "_type" || k === "_value" || k === "_isBogusType") return agg;

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

function _toSimple(properties) {

	var dto = _.reduce(_.clone(properties), function(agg, v, k) {
		if (k === "_type" || k === "_value" || k === "_isBogusType") return agg;

		var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];

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

module.exports = DomainObject;
