//PERSON
// {
//   "Person.additionalName": "Text",
//   "Person.address": {
//     "PostalAddress": {
//       "addressCountry": "Country",
//       "addressLocality": "Text",
//       "addressRegion": "Text",
//       "postOfficeBoxNumber": "Text",
//       "postalCode": "Text",
//       "streetAddress": "Text",
//       "contactType": "Text",
//       "email": "Text",
//       "faxNumber": "Text",
//       "telephone": "Text"
//     }
//   },
//   "Person.birthDate": "Date",
//   "Person.deathDate": "Date",
//   "Person.familyName": "Text",
//   "Person.gender": "Text",
//   "Person.givenName": "Text",
//   "Person.honorificPrefix": "Text",
//   "Person.honorificSuffix": "Text",
//   "Person.jobTitle": "Text",
//   "Person.memberOf": "Organization",
//   "Person.nationality": "Country",
//   "Person.name": "Text",
//   "Person.url": "URL",
//   "Person.description": "Text",
//   "Person.alternateName": "Text",
//   "Person.sameAs": "URL"
// }


//PLACE
// {
//   "Place.aggregateRating": {
//     "AggregateRating": {
//       "ratingTotal": "Number",
//       "ratingCount": "Integer",
//       "ratingValue": "Text"
//     }
//   },
//   "Place.address": {
//     "PostalAddress": {
//       "addressCountry": "Country",
//       "addressLocality": "Text",
//       "addressRegion": "Text",
//       "postOfficeBoxNumber": "Text",
//       "postalCode": "Text",
//       "streetAddress": "Text",
//       "contactType": "Text",
//       "email": "Text",
//       "faxNumber": "Text",
//       "telephone": "Text"
//     }
//   },
//   "Place.branchCode": "Text",
//   "Place.containedInPlace": "Place",
//   "Place.containsPlace": "Place",
//   "Place.geo": {
//     "GeoCoordinates": {
//       "elevation": "Number",
//       "latitude": "Number",
//       "longitude": "Number"
//     }
//   },
//   "Place.logo": "URL,ImageObject",
//   "Place.name": "Text",
//   "Place.url": "URL",
//   "Place.description": "Text",
//   "Place.alternateName": "Text",
//   "Place.sameAs": "URL"
// }

var argv = require('yargs').argv;
var _ = require("lodash");
var Schema = require('async-validate');

var utils = require("../../utils");
var config = require("../../config");
var generatedSchemas = require("../../createDomainSchemas.js")({
	checkSoundness: true
});

var Rule = require("async-validate").Rule;

Schema.plugin([
	require('async-validate/plugin/object'),
	require('async-validate/plugin/string'),
	require('async-validate/plugin/float'),
	require('async-validate/plugin/integer'),
	require('async-validate/plugin/number'),
	require('async-validate/plugin/util')
]);


var datatypesEnum = ["Boolean", "Date", "DateTime", "Number", "Float", "Integer", "Text", "Time", "URL"];


// function isSimpleRange(p) {
// 	if (p.ranges.length > 1) {
// 		return false;
// 	} else {
// 		return !generatedSchemas.types[p.ranges[0]];
// 	}
// }


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

function isFieldTypeAmbiguous(fieldtype) {
	return fieldtype.ranges.length > 1;
}

function generateDataTypeValidator(prop) {

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

	if (prop.required) {
		validateObj.required = prop.required;
	}
	return validateObj;
}

var typeValidators = _.reduce(generatedSchemas.types, function(agg, type, tName) {

	var typeValidator = {};
	typeValidator.type = "object";

	//TODO: type.required -> set prop.required
	//TODO set type of properties (datatypes)
	//TODO: isMulti stuff 
	//aliasOf
	//p.validate -> array of object guaranteed to exist
	//p.transform  -> array of object guaranteed to exist
	//TODO: error when other fields are found then those specified.
	typeValidator.fields = _.reduce(type.properties, function(fields, prop, pName) {
		// if (isSimpleRange(prop)) {

		// 	//guaranteed: range of 1 + datatype instead of type
		// 	fields[pName] = [generateDataTypeValidator(prop)].concat(prop.validate);

		// } else {

		// 	var fn = passInTypeClosure(tName);
		// 	if (prop.required) {
		// 		fn.required = prop.required; //we can just set props on functions remember...
		// 	}
		// 	fields[pName] = fn;
		// }
		var fn = passInTypeClosure(tName);
		fn.required = prop.required; //we can just set props on functions remember...
		fn.validate = prop.validate;

		fields[pName] = fn;

		return fields;
	}, {});

	agg[tName] = typeValidator;
	return agg;
}, {});

// console.log(JSON.stringify(typeValidators, null, 2));

// console.log(typeValidators);
//schema passed in if: 
//- range is multivalued OR 
//- range contains a type instead of datatype
//- object passed in 
function passInTypeClosure(parentName) {

	var parentType = generatedSchemas.types[parentName];

	var fn = function passInSchema(rule, value) {

		var fieldName = rule.field;
		var fieldtype = generatedSchemas.properties[fieldName];
		var typeName = value._type;

		var isToplevel = !parentName;

		//Q: is type defined explicitly?
		if (typeName) {
			//A: yes, type is defined explicitly

			var isDataType = false;

			var type = generatedSchemas.types[typeName];

			if (!type) {
				//type not found. Check if it's a datatype instead
				type = generatedSchemas.datatypes[typeName];
				isDataType = true;
			}

			//Q: does specified type exist (as either Type or DataType)?
			if (!type) {
				throw new Error("type not found: " + typeName); //A: nope, error out
			}
			//A: yes, type exists and is either a Type (.e.: CreativeWork) or a Datatype (e.g.: Text)


			//Q: is type allowed for fieldtype?  
			if (parentName && !isTypeAllowedForRange(type, fieldtype)) {
				throw new Error("type not allowed for fieldname: " + fieldName); //A: nope, error out
			}

			if (!parentName) {

				////////////////////////////////////////////////
				//TBD: checks to do when object is toplevel?  //
				////////////////////////////////////////////////
				//e.g.: check if type != valueObject? 
			}


			//A: yes, type is allowed for field or we're at toplevel. 
			//Regardless, type is allowed here. 

			//Q: is type a DataType (e.g.: Text, Number) ? 
			if (isDataType) {
				//A: yes it is. 

				//SOLUTION: create a field validator as follows: 
				//- passed value should be an object. This is already checked
				//- object should have a `_value` field. This field is required.
				//- `value` should pass fieldValidator. 
				//- this fieldValidator is a simple datatype validator


				/////////////////////////////////////////////////////////////////
				//- TBD:fieldValidator should be mixed in with field-specific  //
				//`validate` and `transform`  
				//NOTE: validate + transform only make sense on datatypes as opposed to types right? 
				/////////////////////////////////////////////////////////////////

				var valueFieldValidator = generateDataTypeValidator({
					ranges: [typeName]
				});

				//_value required as per above
				valueFieldValidator.required = true;

				return {
					type: 'object',
					fields: {
						_value: valueFieldValidator
					}
				};
			}
			//A: no, type is a Type (e.g.: CreativeWork) instead of a DataType

			//Q: is Type a ValueObject or toplevel? 
			if (type.isValueObject || isToplevel) {

				//A: yes, type is a ValueObject or it's toplevel. 

				//SOLUTION: Since type is a valueobject, type-object should be included by reference.
				//Create a type validator as follows: 
				//- use the typeValidator as proto
				//- filter `fields` on typeValidator to exclude non-avail and optional fields. 
				//This effectively prunes fields to check, limits recursion and likely improves performance quite a bit

				//fetch typeValidator (which must exist as per app logic) and remove `fields`
				//typeValidators[typeName] must exist as per app logic
				var validatorObj = _.omit(typeValidators[typeName], "fields");

				//prune fields to only leave required or available fields
				validatorObj.fields = _.reduce(typeValidators[typeName].fields, function(agg, obj, k) {
					if (obj.required || value[k]) {
						agg[k] = obj;
					}
					return agg;
				}, {});

				return validatorObj;
			}

			//A: no, type is NOT a valueObject. Therefore eitehr isEntity = true || isAbstract = true
			throw new Error("isEntity || isAbstract not implemented yet");

		} else {
			//A: type is NOT defined explicitly

			//Q: is type toplevel? 
			if (isToplevel) {
				//A: yep. This is a problem since toplevel element should define _type. 
				//Otherwise, how to know what we're looking at?
				throw new Error("toplevel element should define `_type`.");
			}
			//A: type is not toplevel. Therefore `fieldtype` is guaranteed to be defined

			//Q: can type be inferred straightforward?  
			if (!isFieldTypeAmbiguous(fieldtype)) {
				//A: yes, there's only 1 type defined on fieldtype.ranges

				//SOLUTION:
				//Based on preprocessing `value` is guaranteed to be an object 
				//let's add _type to that `value`

				value._type = fieldtype.ranges[0];
				return passInSchema(rule, value);
			}
			//A: no, we're looking at an ambiguous range, so we need to infer type in some other way


		}
	};

	fn.isSchemaFunction = true;
	return fn;
}

// var obj = {
// 	_type: "Place",
// 	name: "Home sweet home",
// 	address: {
// 		_type: "PostalAddress",
// 		addressLocality: "Tilburg",
// 		postalCode: "5021 GW",
// 		streetAddress: "stuivesantplein 7",
// 		email: "gbrits@gmail.com"
// 	},
// 	geo: {
// 		_type: "GeoCoordinates",
// 		latitude: 43.123123,
// 		longitude: 12.123213,
// 		elevation: 1,
// 		test: 43.123123,
// 	}
// };


var obj = {
	_type: "CreativeWork",
	name: "Home sweet home",
	// genre: {
	// 	_type: "URL",
	// 	_value: "adssad"
	// }
	genre: "asdasd"
};

//We can use schema globally now
var schema = new Schema(passInTypeClosure(null));

extendObject(obj);
validate(obj);


function validate(obj) {

	if (!obj._type) {
		throw new Error("to be validated root object doesn't have _type: " + JSON.stringify(obj.null, 2));
	}

	schema.validate(obj, function(err, res) {
		if (err) {
			throw err;
		} else if (res) {
			// validation failed, res.errors is an array of all errors
			// res.fields is a map keyed by field unique id (eg: `address.name`)
			// assigned an array of errors per field
			return console.dir(res.errors);
		}
		console.log("ALL FINE");
		// validation passed
	});

	//TODO: 
	//- non-described fields are forbidden
	//- polymorhpic types -> https://github.com/freeformsystems/async-validate/issues/56
	//- single/multivalued
	//- field-level sanitization  / coercing -> async-validate transform()
	//
}

//transform obj so all values are expanded into objects. 
//E.g.: "some value" is expanded to {"_value": "some value"}
function extendObject(obj) {
	_.each(obj, function(v, k) {
		if (k === "_type" || k === "_value") return;
		if (_.isObject(v)) {
			obj[k] = extendObject(v);
		} else {
			obj[k] = {
				_value: v
			};
		}
	});
	return obj;
}
