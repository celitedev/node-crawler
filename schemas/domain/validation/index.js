var _ = require("lodash");
var validator = require("validator");
// var Rule = require("async-validate").Rule;
var hogan = require("hogan");
var Schema = require('async-validate');

Schema.plugin([
	require('async-validate/plugin/object'),
	require('async-validate/plugin/string'),
	require('async-validate/plugin/float'),
	require('async-validate/plugin/integer'),
	require('async-validate/plugin/number'),
	require('async-validate/plugin/util'),
	require('async-validate/plugin/array')
]);


module.exports = function(generatedSchemas) {

	function passInTypeClosure(parentName) {

		// var parentType = generatedSchemas.types[parentName]; //not needed for now

		var fn = function passInSchema(rule, value) {

			var fieldtype = generatedSchemas.properties[rule.field]; //NOTE: ok to use instead of generatedSchemas.properties

			var typeName = value._type;
			var isToplevel = !parentName;

			//we explicitly allow an array value to come through here so we can properly raise a 
			//validation error. 
			if (_.isArray(value)) {
				return _generateDataTypeValidator({
					ranges: ["Text"] //just specifiy a bogus range. This will not influence the error message
				});
			}

			//fetch type or datatype. This is guaranteed to exist since we run all sorts of prechecks
			var type = generatedSchemas.types[typeName] || generatedSchemas.datatypes[typeName];

			if (type.isDataType) {

				//STATE: type is a DATATYPE

				//field specific validator
				return _generateDataTypeValidator({
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

					return _generateDataTypeValidator({
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

	function _addCannedValidator(validateRulesArr, name) {
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
	function _generateDataTypeValidator(prop) {

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
				_addCannedValidator(validateRulesArr, "isURL");
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

	var datatypesEnum = ["Boolean", "Date", "DateTime", "Number", "Float", "Integer", "Text", "Time", "URL"];

	var typeValidators = _.reduce(generatedSchemas.types, function(agg, type, tName) {

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

	return {
		datatypesEnum: datatypesEnum,
		typeValidators: typeValidators,
		// passInTypeClosure: passInTypeClosure,
		createSchema: function() {
			return new Schema(passInTypeClosure(null));
		}
	};
};
