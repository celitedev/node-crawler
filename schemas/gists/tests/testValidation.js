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



function isSimpleRange(p) {
	if (p.ranges.length > 1) {
		return false;
	} else {
		return !generatedSchemas.types[p.ranges[0]];
	}
}

var datatypesEnum = ["Boolean", "Date", "DateTime", "Number", "Float", "Integer", "Text", "Time", "URL"];

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
		var rangeTypeName = value._type;

		console.log("ASDASD", fieldtype);

		if (!rangeTypeName) {

			//TYPE NOT DEFINED EXPLICITLY
			//LETS TRY TO DERIVE IT ANYHOW

			//lookup fieldname
			//this gives ranges + ambiguityRule for ambiguous range
			//This allows us to find type and this validator
			//If we fail -> pass object that will cause an error


			//rangeTypeName = ...

			//_type not supplied and couldn't be inferred. 
			if (!rangeTypeName) {
				return {
					type: 'object',
					fields: {
						_type: {
							type: "string",
							required: true
						}
					}
				};
			}
		} else if (parentType && !~parentType.properties[fieldName].ranges.indexOf(rangeTypeName)) {
			//wrong explicitly defined type
			//TODO: return some object as above that fails with correct message
			throw new Error("wrong type for (prop) should be (range) (prop, range) " +
				fieldName + ", (" + parentType.properties[fieldName].ranges.join(",") + ")");
		}

		//POST: EXPLICIT AND CORRECT TYPE SPECIFIED
		//Not clear yet if: 
		//- datatype (with explicitly passed _type)
		//- type

		var datatype = generatedSchemas.datatypes[rangeTypeName];
		if (datatype) { //supplied _type is a datatype

			//value is of format: {
			//	_type: "String", //or other datatype
			//  _value: "blaa" //this should always exist in this case
			//}
			var valueFieldValidator = generateDataTypeValidator({
				ranges: [rangeTypeName]
			});

			//_values required as per above
			valueFieldValidator.required = true;

			return {
				type: 'object',
				fields: {
					_value: valueFieldValidator
				}
			};
		}

		//POST: _TYPE IS EXPLCIT AND CORREC CLASSTYPE SPECIFIED
		var staticInputForType = typeValidators[rangeTypeName];
		if (!staticInputForType) {
			throw new Error("validator object not found in typeValidators: " + staticInputForType);
		}

		var valObject = _.omit(staticInputForType, "fields");

		//Implement 'optional' by removing non-required fields on schema if not supplied on value 
		//cloning doesn't seem to work since field-functions are transformed into objects. 
		//Therefore we 'clone' like this
		valObject.fields = _.reduce(staticInputForType.fields, function(agg, obj, k) {
			//only not include in schema if optional + value not provided
			if (obj.required || value[k]) {
				agg[k] = obj;
			}
			return agg;
		}, {});

		return valObject;
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
	name: {
		_type: "Text",
		_value: "Home sweet home",
	},
	// name: "Home sweet home",
	genre: {
		_type: "URL",
		_value: "adssad"
	}
	// genre: {
	// 	_type: "Text",
	// 	_value: "asd"
	// }
};

validate(obj);

function validate(obj) {

	if (!obj._type) {
		throw new Error("to be validated root object doesn't have _type: " + JSON.stringify(obj.null, 2));
	}

	var schemaFunction = passInTypeClosure(null);
	if (!schemaFunction) {
		throw new Error("SANITY CHECK: validationOBJ not found for type: '" + obj._type +
			"'. Possible values: " + _.values(validatorFnObj).jon(","));
	}

	var schema = new Schema(schemaFunction);

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
