var _ = require("lodash");
var validator = require("validator");
// var Rule = require("async-validate").Rule;
var hogan = require("hogan.js");
var Schema = require('async-validate');
var domainUtils = require("../utils");
var moment = require('moment');

Schema.plugin([
  require('async-validate/plugin/object'),
  require('async-validate/plugin/string'),
  require('async-validate/plugin/float'),
  require('async-validate/plugin/integer'),
  require('async-validate/plugin/number'),
  require('async-validate/plugin/util'),
  require('async-validate/plugin/array')
]);


var customValidators = {
  RefObjectNonEmpty: function (obj, err) {
    var sizeOk = _.size(obj);
    if (!sizeOk) {
      err.msg = "_ref object is empty";
    }
    return sizeOk;
  },
  isDate: function (str, err) {
    var isValid = moment(str).isValid();
    if (!isValid) {
      err.msg = "according to momentJS, string is not a properly formatted iso-86-1 date";
    }
    return isValid;
  }
};

module.exports = function (generatedSchemas) {

  function passInTypeClosure(kindOfEntity, parentTypeNames) {

    //parentTypeNames is an array of types or null: 
    //if null -> currently we're at toplevel
    //if 1 level below toplevel -> array containts 1 or more items
    //if below that -> array contains exactly 1 item. 
    //
    // var parentType = generatedSchemas.types[parentTypeNames[0]]; //not needed for now

    var fn = function passInSchema(rule, value) {

      var fieldName = rule.fieldName;
      var fieldtype = generatedSchemas.properties[fieldName]; //NOTE: ok to use instead of generatedSchemas.properties

      var isToplevel = !parentTypeNames;

      if (!fieldtype && !isToplevel) {
        throw new Error("fieldtype not found for rule.field: " + fieldName);
      }

      //we explicitly allow an array value to come through here so we can properly raise a 
      //validation error. 
      if (_.isArray(value)) {
        return _generateDataTypeValidator({
          ranges: ["Text"] //just specifiy a bogus range. This will not influence the error message
        });
      }

      if (!isToplevel) {

        try {

          //single type because not-toplevel
          var typeName = value._type;
          var type = generatedSchemas.types[typeName] || generatedSchemas.datatypes[typeName]; //guaranteed

          //type may be a datatype only iff non-toplevel
          if (type.isDataType) {

            //STATE: type is a DATATYPE

            //field specific validator
            return _generateDataTypeValidator({
              fieldName: fieldName,
              ranges: [typeName],
              validate: fieldtype ? fieldtype.validate : undefined
            });
          }
        } catch (e) {
          console.log("ERR", e);
          console.log(fieldName, fieldtype, rule, value);
        }
      }

      //////////////////////////////////////////////////
      //STATE: non-datatype, toplevel OR non-toplevel //
      //////////////////////////////////////////////////
      var typenames = isToplevel ? value._type : [value._type];

      if (!_.isArray(typenames)) {
        throw new Error("Sanity check: typenames should be an array but isn't: " + typenames);
      }

      if (!typenames.length) {
        throw new Error("Sanity check: typenames should have at least 1 element!");
      }

      var types = _.map(typenames, function (typeName) {
        var type = generatedSchemas.types[typeName];
        if (!type) {
          throw new Error("SANITY CHECK: type should exist since we've prechecked already: " + typeName);
        }
        return type;
      });

      if (isToplevel || types[0].isValueObject) { //bit magic but: if not toplevel, there's exactly 1 element

        //list the required properties by Or'ing over all type.properties
        var propsRequired = _.uniq(_.reduce(types, function (propNames, t) {
          return propNames.concat(_.pluck(_.filter(t.properties, {
            required: true
          }), "id"));
        }, []));

        //the properties to validate are the following: 
        //- all properties on the object 
        //- minus the properties such as _type, _value
        //- plus all required properties as calculated over all supplied types.
        var propsToValidate = _.difference(_.keys(value).concat(propsRequired), domainUtils.excludePropertyKeys);

        return {
          type: "object",
          fields: _.reduce(propsToValidate, function (fields, pName) {

            var prop = generatedSchemas.properties[pName];
            var fn = passInTypeClosure(kindOfEntity, typenames);
            fn.fieldName = pName; //use this instead of rule.field, since the latter shows array-indices in case of multi-valued.

            var fieldValidatorObj = !prop.isMulti ? fn : {
              type: "array",
              values: [fn],
              min: 1 //fixes 155: if array defined it must have minLength of 1. (or otherwise don't supply)
            };

            fieldValidatorObj.required = !!~propsRequired.indexOf(pName);
            fields[pName] = fieldValidatorObj;

            return fields;
          }, {})
        };

      } else {

        //STATE: type is Entity. because it: 
        //- is a type, since datatype already handled for non-toplevel and toplevel may not be a datatype
        //- is not a ValueObject
        //- can not be Abstract, since otherwise an error would have been raised during schema creation

        //SOLUTION: type-object should be included by referencing. 


        //A SOURCE as well as CANONICAL object may contain a ref-object. 
        //
        //For SOURCE this is always the case. 
        //For CANONICAL this is the case if reference hasn't been resolved yet. 
        //
        //Format of this ref-object: 
        //
        //{
        //	_ref: {
        //		<custom>
        //	}
        //}
        //
        //Moreover, CANONICAL contains a string of type UUID if ref IS resolved. 

        if (_.isString(value._value) && kindOfEntity === domainUtils.enums.kind.CANONICAL) {
          return _generateDataTypeValidator({
            ranges: ["Text"],
            required: true,
            validate: "isUUID"
          });
        }

        var refRules = [{
          type: "object",
          required: true
        }];

        return {
          type: 'object',
          fields: {
            _ref: _addCannedValidator(refRules, "RefObjectNonEmpty")
          },
        };

      }
    };

    fn.isSchemaFunction = true;
    return fn;
  }

  function _addCannedValidator(validateRulesArr, name) {
    validateRulesArr.push(function (cb) {
      var cannedValidator = customValidators[name] || validator[name];
      if (!cannedValidator) {
        return cb(new Error("canned validator not found: " + name));
      }
      var err = {};
      if (!cannedValidator(this.value, err)) {
        this.raise(err.msg || this.value + ' is not a valid ' + name);
      }
      return cb();
    });

    return validateRulesArr;
  }

  //NOTE: 'required' is managed upstream
  function _generateDataTypeValidator(prop) {

    //in a preprocess tasks we've already pruned the optional and empty values
    //so setting required = true
    var validateObj = {
      required: true
    };

    var validateRulesArr = [validateObj];

    var dt = prop.ranges[0]; //guaranteed range.length=1 and contents = datatype
    if (!~datatypesEnum.indexOf(dt)) {
      throw new Error("should not have 0 datatypes (propName) " + prop.id + " -> " + dt);
    }

    switch (dt) {
      case "Object":
        validateObj.type = "object";
        break;
      case "Boolean":
        validateObj.type = "boolean";
        break;
      case "Date":
        //NOTE: schema.org difference between Date and DateTime is not clear
        _addCannedValidator(validateRulesArr, "isDate");
        validateObj.type = "string";
        break;
      case "DateTime":
        _addCannedValidator(validateRulesArr, "isDate");
        validateObj.type = "string";
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
        // throw new Error("TODO: _generateDataTypeValidator.Time not validated yet");
        validateObj.type = "string";
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
      validateRulesArr = validateRulesArr.concat(_.map(customValidationArr, function (validateObj) {
        return function (cb) {

          //allow shorthand notation
          if (_.isFunction(validateObj) || _.isString(validateObj)) {
            validateObj = {
              type: validateObj
            };
          }

          if (_.isString(validateObj.type)) {
            var cannedValidator = customValidators[validateObj.type] || validator[validateObj.type];
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
      },
    };
  }

  var datatypesEnum = ["Boolean", "Date", "DateTime", "Number", "Float", "Integer", "Text", "Time", "URL"];


  // function _createTypeValidators(kindOfEntity) {

  // 	return _.reduce(generatedSchemas.types, function(agg, type, tName) {

  // 		agg[tName] = {
  // 			type: "object",
  // 			fields: _.reduce(type.properties, function(fields, prop, pName) {

  // 				//butt-ugly: need to pass typeValidators, which we're just creating...
  // 				var fn = passInTypeClosure(kindOfEntity, tName);

  // 				var fieldValidatorObj = !prop.isMulti ? fn : {
  // 					type: "array",
  // 					values: fn,
  // 					min: 1 //if array defined it must have minLength of 1. (or otherwise don't supply)
  // 				};

  // 				fieldValidatorObj.required = prop.required; //setting on returned object
  // 				fields[pName] = fieldValidatorObj;

  // 				return fields;

  // 			}, {})
  // 		};
  // 		return agg;
  // 	}, {});
  // }

  // var typeValidators = {};
  // typeValidators[domainUtils.enums.kind.CANONICAL] = _createTypeValidators(domainUtils.enums.kind.CANONICAL);
  // typeValidators[domainUtils.enums.kind.SOURCE] = _createTypeValidators(domainUtils.enums.kind.SOURCE);

  return {
    createSchema: function () {
      return new Schema(passInTypeClosure(domainUtils.enums.kind.CANONICAL, null));
    },
    createSchemaSourceEntity: function () {
      return new Schema(passInTypeClosure(domainUtils.enums.kind.SOURCE, null));
    }
  };
};
