var argv = require('yargs').argv;
var _ = require("lodash");
var Schema = require('async-validate');

var utils = require("../../utils");
var config = require("../../config");
var generatedSchemas = require("../../createDomainSchemas.js")({
	checkSoundness: true
});

var Rule = require("async-validate").Rule;
var urlRegex = require('url-regex');

Schema.plugin([
	require('async-validate/plugin/object'),
	require('async-validate/plugin/string'),
	require('async-validate/plugin/float'),
	require('async-validate/plugin/integer'),
	require('async-validate/plugin/number'),
	require('async-validate/plugin/util')
]);


var datatypesEnum = ["Boolean", "Date", "DateTime", "Number", "Float", "Integer", "Text", "Time", "URL"];

var typeValidators = _.reduce(generatedSchemas.types, function(agg, type, tName) {
	//TODO: isMulti stuff 
	//aliasOf
	//p.validate -> array of object guaranteed to exist
	//p.transform  -> array of object guaranteed to exist

	agg[tName] = {
		type: "object",
		fields: _.reduce(type.properties, function(fields, prop, pName) {
			var fn = passInTypeClosure(tName);
			fn.required = prop.required; //oeehh, setting props on a function
			fn.validate = prop.validate;
			fields[pName] = fn;
			return fields;
		}, {})
	};
	return agg;
}, {});


// var obj = {
// 	_type: "Place",
// 	name: "Home sweet home",
// 	address: {
// 		// _type: "PostalAddress", //optional since can be inferred
// 		addressLocality: "Tilburg",
// 		postalCode: "5021 GW",
// 		streetAddress: "stuivesantplein 7",
// 		email: "gbrits@gmail.com"
// 	},
// 	geo: {
// 		// _type: "GeoCoordinates", //optional since can be inferred
// 		latitude: 43.123123,
// 		longitude: 12.123213,
// 		elevation: 1,
// 		// test: 43.123123,
// 	}
// };


var obj = {
	_type: "CreativeWork",
	name: "Home sweet home",
	genre: {
		// _type: "URL",
		_value: undefined //this is allowed if you really want to.
	},
	about: "bnla"
		// about: {
		// 	_type: "Place",
		// 	name: "bnla"
		// }
		// genre: "asdasd",
};

//We can use schema globally now
var schema = new Schema(passInTypeClosure(null));

if (!obj._type) {
	throw new Error("_type should be defined on toplevel");
}

//does a transform in place, so can skip _cloneDeep + assignment if not needed to keep orig
var objTransformed = transformObject(_.cloneDeep(obj), true, []);
console.log(objTransformed);
schema.validate(objTransformed, function(err, res) {
	if (err) {
		throw err;
	} else if (res) {
		// validation failed, res.errors is an array of all errors
		// res.fields is a map keyed by field unique id (eg: `address.name`)
		// assigned an array of errors per field
		return console.dir(res.errors);
	}
	console.log("ALL FINE");
	// STATE: validation passed
});


function passInTypeClosure(parentName) {

	// var parentType = generatedSchemas.types[parentName]; //not needed for now

	var fn = function passInSchema(rule, value) {

		// var fieldName = rule.field;
		// var fieldtype = generatedSchemas.properties[fieldName];
		var typeName = value._type;
		var isToplevel = !parentName;

		//fetch type or datatype. This is guaranteed to exist since we run all sorts of prechecks
		var type = generatedSchemas.types[typeName] || generatedSchemas.datatypes[typeName];

		if (type.isDataType) {

			//STATE: type is a DATATYPE

			//field specific validator
			//TODO: add validation for fieldname
			return generateDataTypeValidator({
				ranges: [typeName]
			});

		} else {

			//STATE: type is a TYPE not a DATATYPE

			if (type.isValueObject || isToplevel) {

				//SOLUTION: type-object should be included by EMBEDDING.

				var validatorObj = _.omit(typeValidators[typeName], "fields");

				//Prune fields to only leave required or available fields. 
				//This makes sure recursion doesn't fail on empty results.
				validatorObj.fields = _.reduce(typeValidators[typeName].fields, function(agg, obj, k) {
					if (obj.required || value[k]) {
						agg[k] = obj;
					}
					return agg;
				}, {});

				return validatorObj;

			} else {

				//STATE: type is Entity. because it: 
				//- is a type
				//- is not a ValueObject
				//- can not be Abstract, since otherwise an error would have been raised during schema creation

				//SOLUTION: type-object should be included by referencing

				var uuidValidator = generateDataTypeValidator({
					ranges: ["Text"]
				}, true);

				//TODO: add UUID validate 

				return uuidValidator;

			}
		}
	};

	fn.isSchemaFunction = true;
	return fn;
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
			typeName = inferTypeForAmbiguousRange(fieldtype, obj);
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
	//6. recurse
	_.each(obj, function(v, k) {

		if (k === "_type" || k === "_value" || k === "_isBogusType") return;

		var fieldtype = generatedSchemas.properties[k]; //guaranteed to exist

		if (!_.isObject(v)) {
			v = {
				_value: v
			};
		}
		obj[k] = transformObject(v, undefined, ancestors.concat([k]));

	});
	return obj;
}


//infer type from value when fieldtype has ambiguous range.
//NOTE: validity of ambiguity solver for fieldtype is already checked
//Also: type !== explicitType. This is already checked.
function inferTypeForAmbiguousRange(fieldtype, obj) {
	switch (fieldtype.ambiguitySolvedBy.type) {
		case "urlVsSomething":
			if (urlRegex({
					exact: true
				}).test(obj._value)) {
				return "URL";
			} else {
				//return the other thing. We know that there's exactly 2 elements, so...
				return _.filter(fieldtype.ranges, function(t) {
					return t !== "URL";
				})[0];
			}
			break;
		case "implicitType":
			//just assign the first type. It's guaranteed to be value by reference so we don't store
			//the (bogus) assigned type. 
			//This however, allows us to easily fake our way through the rest of the validation 
			//checks, which we can because they don't matter for this particular code-path.
			obj._isBogusType = true;
			return fieldtype.ranges[0];
		default:
			throw new Error("Ambiguous solver not implemented: " + fieldtype.ambiguitySolvedBy.type);
	}
}


//Calc if type is allowed in range. 
function isTypeAllowedForRange(typeOrTypeName, fieldtype) {

	//Calculated by taking the intersection of the type (including it's ancestors) 
	//and the range and checking for non-empty.
	//We take the ancestors as well since type may be a subtype of any of the types defined in range.

	var type = _.isString(typeOrTypeName) ?
		generatedSchemas.types[typeOrTypeName] || generatedSchemas.datatypes[typeOrTypeName] :
		typeOrTypeName;

	var ancestorsAndSelf = _.uniq(type.ancestors.concat(type.id));
	return _.intersection(ancestorsAndSelf, fieldtype.ranges).length;
}


function generateDataTypeValidator(prop, isRequired) {

	//in a preprocess tasks we've already pruned the optional and empty values
	//so setting required = tru
	var validateObj = {};

	var dt = prop.ranges[0]; //guaranteed range.length=1 and contents = datatype
	if (!~datatypesEnum.indexOf(dt)) {
		throw new Error("should not have 0 datatypes (propName) " + prop.id + " -> " + dt);
	}

	switch (dt) {
		case "Boolean":
			validateObj.type = "boolean";
			break;
		case "Date":
			validateObj.type = "string"; //TODO
			break;
		case "DateTime":
			validateObj.type = "string"; //TODO
			break;
		case "Number":
			validateObj.type = "number";
			break;
		case "Float":
			validateObj.type = "float";
			break;
		case "Integer":
			validateObj.type = "integer";
			break;
		case "Text":
			validateObj.type = "string";
			break;
		case "Time":
			validateObj.type = "string"; //TODO
			break;
		case "URL":
			validateObj.type = "string";
			//TODO:  format: "URL"
			break;
		default:
			throw new Error("dattype not supported " + dt); //forgot something?
	}

	return {
		type: 'object',
		fields: {
			_value: _.extend(validateObj, {
				required: isRequired || !!prop.required
			})
		}
	};
}
