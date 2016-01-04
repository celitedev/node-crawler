var argv = require('yargs').argv;
var _ = require("lodash");

var domainUtils = require("../../domain/utils");

var generatedSchemas = require("../../domain/createDomainSchemas.js")({
	checkSoundness: true
});



var obj = {
	_type: "LocalBusiness",
	name: "Home sweet home",
	address: {
		// _type: "PostalAddress", //optional since can be inferred
		addressLocality: "Tilburg",
		postalCode: "5021 GW",
		streetAddress: "stuivesantplein 7",
		email: "GBRITS@ASDASD.COM"
	},
	geo: {
		// _type: "GeoCoordinates", //optional since can be inferred
		latitude: 43.123123,
		longitude: 12.123213,
		elevation: 1,
		// test: 43.123123,
	}
};


// var obj = {
// 	_type: "Review",
// 	itemReviewed: "de305d54-75b4-431b-adb2-eb6b9e546014",
// 	reviewBody: "bla",
// 	// about: "de305d54-75b4-431b-adb2-eb6b9e546014",
// };

// var obj = {
// 	_type: "CreativeWork",
// 	name: "Home asdasdasd",
// 	url: "http://www.google.com",
// 	// genre: [], //["joo", "asdas", "sadas"],
// 	about: "de305d54-75b4-431b-adb2-eb6b9e546014"
// };


var validator = require("../../domain/validation")(generatedSchemas);

//does a transform in place, so can skip _cloneDeep + assignment if not needed to keep orig
var objTransformed = transformObject(_.cloneDeep(obj), true, []);
console.log(objTransformed);

validator.validate(objTransformed, function(err, res) {
	if (err) {
		throw err;
	} else if (res) {
		// validation failed, res.errors is an array of all errors
		// res.fields is a map keyed by field unique id (eg: `address.name`)
		// assigned an array of errors per field
		return console.dir(res.errors);
	}

	var dto = new DataObject(objTransformed);

	console.log("DTO", JSON.stringify(dto, null, 2));
	console.log("ALL FINE");
	// STATE: validation passed
});



//now that the object has been validated and it's guaranteed it can be saved
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


function _formatToDataObjectFromExpanded(obj) {



	//clone because we *might* not want to change orig values. Note: deepclone not needed
	var dto = _.reduce(_.clone(obj), function(agg, v, k) {
		if (k === "_type" || k === "_value" || k === "_isBogusType") return agg;

		var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];

		//remove aliasOf properties. 
		//By now these are already validated and copied to the aliasOf-target
		if (generatedSchemas.properties[k].aliasOf) {
			return agg;
		}

		if (propType.isValueObject) {
			v = _formatToDataObjectFromExpanded(v); //recurse non-datatypes
		} else {
			v = v._value; //simplify all datatypes and object-references to their value
		}

		agg[k] = v;
		return agg;
	}, {});



	return dto;
}

function DataObject(obj) {

	var typeName = obj._type;
	var type = generatedSchemas.types[typeName];

	this._props = _formatToDataObjectFromExpanded(obj);

	//add _subtypes attribute
	this._subtypes = type.ancestors.concat([typeName]);
	this._index = type.rootName;

}



function transformSingleObject(ancestors, k, val) {
	if (!_.isObject(val)) {
		val = {
			_value: val
		};
	}
	return transformObject(val, undefined, ancestors.concat([k]));
}

//1. transform obj so all values are expanded into objects. 
//E.g.: "some value" is expanded to {"_value": "some value"}
//2. 
function transformObject(obj, isTopLevel, ancestors) {

	if (!_.isObject(obj)) {
		throw new Error("SANITY CHECK: `obj` passed to transformObject should be an object");
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

		//State: No typeName defined explicitly. Let's get it implicitly. 
		if (isTopLevel) {
			throw new Error("toplevel element should define `_type`.");
		}

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
	//2. error out if value is array but fieldtype is singleValued. 
	//3. make value multivalued by doing v -> [v], if field is multivalued, and not already array
	//6. recurse
	_.each(obj, function(v, k) {

		if (k === "_type" || k === "_value" || k === "_isBogusType") return;

		if (v === undefined) {
			delete obj[k]; //lets nip this in the balls
			return;
		}

		var fieldtype = type.properties[k]; //guaranteed to exist

		obj[k] = updateFieldValue(k, v, type, ancestors);

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

	return obj;
}


function updateFieldValue(k, v, type, ancestors) {
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
	return !_.isArray(v) ? transformSingleObject(ancestors, k, v) : _.map(v, _.partial(transformSingleObject, ancestors, k));

}
