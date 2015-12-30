var argv = require('yargs').argv;
var _ = require("lodash");
var Schema = require('async-validate');
var async = require("async");
var validator = require("validator");

var Rule = require("async-validate").Rule;
var urlRegex = require('url-regex');
var hogan = require("hogan");

var utils = require("../../utils");
var config = require("../../config");
var generatedSchemas = require("../../createDomainSchemas.js")({
	checkSoundness: true
});


Schema.plugin([
	require('async-validate/plugin/object'),
	require('async-validate/plugin/string'),
	require('async-validate/plugin/float'),
	require('async-validate/plugin/integer'),
	require('async-validate/plugin/number'),
	require('async-validate/plugin/util'),
	require('async-validate/plugin/array')
]);


var datatypesEnum = ["Boolean", "Date", "DateTime", "Number", "Float", "Integer", "Text", "Time", "URL"];

var typeValidators = _.reduce(generatedSchemas.types, function(agg, type, tName) {

	//TODO:
	//aliasOf
	//p.validate -> array of object guaranteed to exist
	//p.transform  -> array of object guaranteed to exist

	agg[tName] = {
		type: "object",
		fields: _.reduce(type.properties, function(fields, prop, pName) {

			var fn = passInTypeClosure(tName);

			var fieldValidatorObj = !prop.isMulti ? fn : {
				type: "array",
				values: fn,
				min: 1 //if array defined it must have minLength of 1. (or otherwise don't supply)
			};

			fieldValidatorObj.required = prop.required; //setting on returned object
			fields[pName] = fieldValidatorObj;

			return fields;

		}, {})
	};
	return agg;
}, {});


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
// 	_type: "CreativeWork",
// 	name: "Home asdasdasd",
// 	url: "http://www.google.com",
// 	// genre: [], //["joo", "asdas", "sadas"],
// 	about: "de305d54-75b4-431b-adb2-eb6b9e546014"
// };

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

		var fieldtype = generatedSchemas.properties[rule.field]; //NOTE: ok to use instead of generatedSchemas.properties

		var typeName = value._type;
		var isToplevel = !parentName;

		//we explicitly allow an array value to come through here so we can properly raise a 
		//validation error. 
		if (_.isArray(value)) {
			return generateDataTypeValidator({
				ranges: ["Text"] //just specifiy a bogus range. This will not influence the error message
			});
		}

		//fetch type or datatype. This is guaranteed to exist since we run all sorts of prechecks
		var type = generatedSchemas.types[typeName] || generatedSchemas.datatypes[typeName];

		if (type.isDataType) {

			//STATE: type is a DATATYPE

			//field specific validator
			return generateDataTypeValidator({
				fieldName: rule.field,
				ranges: [typeName],
				validate: fieldtype ? fieldtype.validate : undefined
			});


		} else {

			//STATE: type is a TYPE not a DATATYPE

			if (type.isValueObject || isToplevel) {

				//SOLUTION: type-object should be included by EMBEDDING.

				var validatorObj = _.omit(typeValidators[typeName], "fields");

				//Prune fields to only leave required or available fields. 
				//This makes sure recursion doesn't fail on empty results.
				//tech: copy properties (being functions) directly, instead of cloning, since this fails..
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

				return generateDataTypeValidator({
					ranges: ["Text"],
					required: true,
					validate: "isUUID"
				});

			}
		}
	};

	fn.isSchemaFunction = true;
	return fn;
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
	//2. error out if value is array but fieldtype is singleValued. 
	//3. make value multivalued by doing v -> [v], if field is multivalued, and not already array
	//6. recurse
	_.each(obj, function(v, k) {

		if (k === "_type" || k === "_value" || k === "_isBogusType") return;

		var fieldtype = type.properties[k]; //guaranteed to exist

		if (v === undefined) {
			delete obj[k]; //lets nip this in the balls
			return;
		}

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
		obj[k] = !_.isArray(v) ? transformSingleObject(ancestors, k, v) : _.map(v, _.partial(transformSingleObject, ancestors, k));

	}); //end each

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

function addCannedValidator(validateRulesArr, name) {
	validateRulesArr.push(function(cb) {
		var cannedValidator = validator[name];
		if (!cannedValidator) {
			return cb(new Error("canned validator not found: " + name));
		}
		if (!cannedValidator(this.value)) {
			this.raise(this.value + ' is not a valid ' + name);
		}
		return cb();
	});
}


//NOTE: 'required' is managed upstream
function generateDataTypeValidator(prop) {


	//in a preprocess tasks we've already pruned the optional and empty values
	//so setting required = tru
	var validateObj = {
		required: !!prop.required
	};

	var validateRulesArr = [validateObj];

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
			addCannedValidator(validateRulesArr, "isURL");
			break;
		default:
			throw new Error("dattype not supported " + dt);
	}

	//add custom validation
	if (prop.validate) {
		var customValidationArr = _.isArray(prop.validate) ? prop.validate : [prop.validate];
		validateRulesArr = validateRulesArr.concat(_.map(customValidationArr, function(validateObj) {
			return function(cb) {

				//allow shorthand notation
				if (_.isFunction(validateObj) || _.isString(validateObj)) {
					validateObj = {
						type: validateObj
					};
				}

				if (_.isString(validateObj.type)) {
					var cannedValidator = validator[validateObj.type];
					if (!cannedValidator) {
						return cb(new Error("canned validator not found: " + validateObj.type));
					}
					var isValid;
					if (_.isArray(validateObj.options)) {
						isValid = _.partial(cannedValidator, this.value).apply(null, validateObj.options);
					} else {
						isValid = cannedValidator(this.value, validateObj.options);
					}

					if (!isValid) {

						var msg;

						//if `errorMessage` defined on validateObj choose this
						//It's a hogan/mustache template. The only variable to be used is `val`
						//
						//e.g.: "{{val}} isn't a correct URL"
						if (validateObj.errorMessage) {
							msg = hogan.compile(validateObj.errorMessage).render({
								val: this.value
							});
						} else {

							//for error message from, say, 'isURL' -> 'URL'
							var errorName = validateObj.type;
							if (errorName.substring(0, 2) === "is") {
								errorName = errorName.substring(2);
							}
							msg = this.value + ' is not a valid ' + errorName;
						}

						//raise validation error.
						this.raise(msg);
					}
					return cb();
				} else if (_.isFunction(validateObj.type)) {
					return cb(new Error("custom validation functions not implemented yet"));
				} else {
					return cb(new Error("validator.type should be either string or function: " + JSON.stringify(validateObj, null, 2)));
				}
			};
		}));
	}

	return {
		type: 'object',
		fields: {
			_value: validateRulesArr
		}
	};
}
