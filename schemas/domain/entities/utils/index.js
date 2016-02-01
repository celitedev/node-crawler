var _ = require("lodash");

var domainUtils = require("../../utils");
var excludePropertyKeys = domainUtils.excludePropertyKeys;


module.exports = function(generatedSchemas) {

	var esMappingConfig = require("../../../erd/elasticsearch")(generatedSchemas);



	// /**
	// 	 * Example:
	// 	 * {
	// 		  "_index": "Review",
	// 		  "_subtypes": [
	// 		    "Thing",
	// 		    "Review"
	// 		  ],
	// 		  "_props": {
	// 		    "reviewBody": "bla",
	// 		    "about": "de305d54-75b4-431b-adb2-eb6b9e546014"
	// 		  }
	// 		}
	// 	 */
	// function toDataObject(props) {

	// 	//NOTE: temp restriction in place that requires all entities to be of same root (#101)
	// 	//We therefore can infer _index by fetching rootName from *any* type since it will be the same
	// 	//LATER: this may result in multiple objects: 1 for each index.

	// 	var _index = generatedSchemas.types[this._type[0]].rootName;

	// 	return {
	// 		_index: _index,

	// 		//subtypes is the unique union 
	// 		//of all subtypes (starting at _index and walking down the typechain)
	// 		//over all types
	// 		_subtypes: _.uniq(_.reduce(this._type, function(arr, typeName) {
	// 			var type = generatedSchemas.types[typeName];
	// 			var ancestorsAndSelf = type.ancestors.concat([typeName]);
	// 			return arr.concat(ancestorsAndSelf.slice(ancestorsAndSelf.indexOf(_index) + 1));
	// 		}, [])),

	// 		_props: _toDataObjectRecursive(props || this._props)
	// 	};
	// }


	//1. transform obj so all values are expanded into objects. 
	//E.g.: "some value" is expanded to {"_value": "some value"}
	//2. 
	function _transformProperties(obj, isTopLevel, ancestors, kind, options) {

		options = options || {};

		if (!_.isObject(obj)) {
			throw new Error("SANITY CHECK: `obj` passed to _transformProperties should be an object");
		}

		var fieldName;
		var fieldtype;
		var typeNonToplevel; //non-toplevel
		var typesToplevel; //toplevel
		var types; //generic combi of the 2 above

		if (!isTopLevel) {
			//State: no toplevel: 
			//- ancestors.length > 0
			//- fieldtype is guaranteed to exist
			fieldName = ancestors[ancestors.length - 1];
			fieldtype = generatedSchemas.properties[fieldName];

			var typeName = obj._type;
			var typeNameIsExplicit = !!typeName;

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
			typeNonToplevel = generatedSchemas.types[typeName] || generatedSchemas.datatypes[typeName];

			if (!typeNonToplevel) {
				throw new Error("type not found: " + typeName);
			}

			if (typeNameIsExplicit) {
				//_type explicitly passed. Let's make sure it's an allowed type
				if (!domainUtils.isTypeAllowedForRange(type, fieldtype)) {
					throw new Error("type not allowed for fieldname, type: " + ancestors.join(".") + " - " + typeName);
				}
			}

			types = [typeNonToplevel];

		} else {
			//toplevel has _type as an array
			//moreover, explicit type is required on toplevel, so we can skip all the ambiguous checks

			types = _.map(obj._type, function(tName) {
				var type = generatedSchemas.types[tName];
				if (!type) {
					throw new Error("type not found on top level: " + tName);
				}
				return type;
			});
		}

		var allowedProps = _.uniq(_.reduce(types, function(props, t) {
			return props.concat(_.keys(t.properties));
		}, [])).concat(excludePropertyKeys);

		//check that only allowed properties are passed
		var suppliedProps = _.keys(obj),
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

			var fieldtype = generatedSchemas.properties[k]; //guaranteed to exist

			//create array if fieldtype isMulti
			//make explicit exception for 'val' property which is part of 'fact'
			//We don't want this made into an array unless that's already the case.
			if (fieldtype.isMulti && k !== "val") {
				v = _.isArray(v) ? v : [v];
			} else if (!fieldtype.isMulti && options.isFromDB) {

				//loading from DB which has all values multivalued. 
				//Therefore, let's go back to proper single/multivalued-ness on every field
				if (_.isArray(v) && v.length > 1) {
					throw new Error("array with multiple items, for isMulti=false. Probably schema evolution error which we're not attempting to handle yet.:" +
						k + " - " + JSON.stringify(v, null, 2));
				}
				v = _.isArray(v) ? (v.length ? v[0] : undefined) : v;
			}

			//transform input
			if (fieldtype.fieldTransformers) {
				v = !_.isArray(v) ? fieldtype.fieldTransformers(v) : _.map(v, fieldtype.fieldTransformers);
			}

			//bit weird: we allow an array value for isMulti=false. 
			//This so we can catch this validation error properly later in the validation code

			// //if we're processing a SourceEntity instead of a CANONICAL OBJECT 
			// //AND we're referencing an entity -> expand shortcut ref to fullblown ref-structure. 
			// //
			// //E.g.: "some source id" -> 
			// //{
			// //	_ref: {
			// //		sourceId: "some source id"
			// //	}

			//Due to soundness check #107 we know that first el = Type <=> all type of range is Type
			var rangeType = generatedSchemas.types[fieldtype.ranges[0]];
			if (kind === domainUtils.enums.kind.SOURCE && rangeType && rangeType.isEntity) {
				//we've got an entity reference which is to be expanded to a _ref-object.
				v = !_.isArray(v) ? expandToRef(v) : _.map(v, expandToRef);
			}

			obj[k] = !_.isArray(v) ? _transformSingleObject(ancestors, k, kind, options, v) : _.map(v, _.partial(_transformSingleObject, ancestors, k, kind, options));

		}); //end each

		if (isTopLevel || !types[0].isDataType) {

			//populate target of aliasOf. 
			//e.g.: populate b if a is set in a.aliasOf(b)
			//error out when DIFFERENT value already set on b (either by itself or by some other property that aliases to b as well)
			_.each(obj, function(v, k) {

				if (excludePropertyKeys.indexOf(k) !== -1) return;

				var fieldtype = generatedSchemas.properties[k]; //guaranteed to exist

				if (fieldtype.aliasOf) {
					if (obj[fieldtype.aliasOf] !== undefined && !_.isEqual(obj[k], obj[fieldtype.aliasOf])) {
						throw new Error("aliasOf target already contains value prop, aliasOf: " + k + ", " + fieldtype.aliasOf);
					}
					obj[fieldtype.aliasOf] = obj[k]; //already transformed
				}
			});

			//add aliasOf properties which weren't set. 
			//e.g.: populate a if b is set in a.aliasOf(b)
			if (!options.skipAlias) {
				_.each(generatedSchemas.properties, function(prop, k) {
					if (prop.aliasOf && obj[k] === undefined && obj[prop.aliasOf] !== undefined) {
						obj[k] = obj[prop.aliasOf];
					}
				});
			}
		}

		return obj;
	}

	function _transformSingleObject(ancestors, k, kind, options, val) {

		var fieldtype = generatedSchemas.properties[k]; //guaranteed to exist

		//special: datatype 'Object' should not be transformed further. This datatype allows any complex object.         
		if (fieldtype.ranges.indexOf("Object") !== -1 && _.isObject(val)) {
			return {
				_value: val
			};
		}

		if (!_.isObject(val)) {
			val = {
				_value: val
			};
		}
		return _transformProperties(val, undefined, ancestors.concat([k]), kind, options);
	}

	function expandToRef(v) {

		var key;
		if (!_.isObject(v)) {

			//transform if we've set item directly 
			var objExpanded = {
				_ref: {}
			};

			key = isAbsoluteUrl(v) ? "_sourceUrl" : "_sourceId";

			if (key === "_sourceUrl") {
				objExpanded._ref._sourceUrl = v;
			}
			objExpanded._ref._sourceId = v; //always add _sourceId

			v = objExpanded;
		} else {

			if (v._ref) {

				if (!_.isObject(v._ref)) {

					//transform if we've set item to _ref
					var val = v._ref;

					//Incredibly expensive. Using quick check instead which is good enough here.
					// key = urlRegex({
					// 	exact: true
					// }).test(val) ? "_sourceUrl" : "_sourceId";

					key = isAbsoluteUrl(v) ? "_sourceUrl" : "_sourceId";

					v._ref = {};

					if (key === "_sourceUrl") {
						v._ref._sourceUrl = v;
					}
					v._ref._sourceId = v; //always add _sourceId
				}
				//we sometimes mistakingly use sourceId and sourceUrl in _ref
				//Let's transform them to _sourceId and _sourceUrl resp.
				if (v._ref.sourceUrl) {
					v._ref._sourceUrl = v._ref.sourceUrl;
					delete v._ref.sourceUrl;
				}
				if (v._ref.sourceId) {
					v._ref._sourceId = v._ref.sourceId;
					delete v._ref.sourceId;
				}
			}
		}

		//If _sourceId not set yet, it's defaulted to sourceUrl. Think this never happens though but just to be safe
		v._ref._sourceId = v._ref._sourceId || v._ref._sourceUrl;
		return v;
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

			//remove aliasOf properties. 
			//By now these are already validated and copied to the aliasOf-target
			if (generatedSchemas.properties[k].aliasOf) {
				return agg;
			}

			//NOTE: at this point _type is guaranteed NOT an array anymore. That was only at toplevel
			function transformSingleItem(v) {

				//if first is range is datatype -> all in range are datatype. As per #107
				//If datatype -> just grab _value
				//Needed for Datatype: Object
				if (generatedSchemas.datatypes[generatedSchemas.properties[k].ranges[0]]) {
					return v._value;
				}

				var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];
				if (propType.isValueObject) {
					v = _toDataObjectRecursive(v); //recurse non-datatypes
				} else if (v._ref) {
					v = _.pick(v, ["_ref"]); //no change
				} else {
					v = v._value; //simplify all datatypes and object-references to their value
				}

				return v;
			}

			agg[k] = _.isArray(v) ? _.map(v, transformSingleItem) : transformSingleItem(v);
			return agg;
		}, {});


		return dto;
	}

	function _toRethinkObjectRecursive(properties, isToplevel) {

		var dto = _.reduce(_.clone(properties), function(agg, v, k) {
			if (excludePropertyKeys.indexOf(k) !== -1) return agg;

			//remove aliasOf properties. 
			//By now these are already validated and copied to the aliasOf-target
			if (generatedSchemas.properties[k].aliasOf) {
				return agg;
			}

			//NOTE: at this point _type is guaranteed NOT an array anymore. That was only at toplevel
			function transformSingleItem(v) {

				//if first is range is datatype -> all in range are datatype. As per #107
				//If datatype -> just grab _value
				//Needed for Datatype: Object
				if (generatedSchemas.datatypes[generatedSchemas.properties[k].ranges[0]]) {
					return v._value;
				}

				var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];
				if (propType.isValueObject) {
					v = _toRethinkObjectRecursive(v); //recurse non-datatypes
				} else if (v._ref) {
					v = _.pick(v, ["_ref"]); //no change
				} else {
					v = v._value; //simplify all datatypes and object-references to their value
				}
				return v;
			}

			//rethink-object stores all toplevel properties as arrays. 
			//This keeps rethink-objects invariant under isMulti-changes.
			if (isToplevel) {
				v = _.isArray(v) ? v : [v];
			}

			agg[k] = _.isArray(v) ? _.map(v, transformSingleItem) : transformSingleItem(v);
			return agg;
		}, {});


		return dto;
	}



	function _toSimpleRecursive(properties) {

		var dto = _.reduce(_.clone(properties), function(agg, v, k) {
			if (excludePropertyKeys.indexOf(k) !== -1) return agg;


			function transformSingleItem(v) {

				//if first is range is datatype -> all in range are datatype. As per #107
				//If datatype -> just grab _value
				//Needed for Datatype: Object
				if (generatedSchemas.datatypes[generatedSchemas.properties[k].ranges[0]]) {
					return v._value;
				}

				//NOTE: at this point _type is guaranteed NOT an array anymore. That was only at toplevel
				var propType = generatedSchemas.types[v._type] || generatedSchemas.datatypes[v._type];

				if (propType.isValueObject) {
					v = _toSimpleRecursive(v); //recurse non-datatypes
				} else if (v._ref) {
					v = _.pick(v, ["_ref"]); //no change
				} else {
					v = v._value; //simplify all datatypes and object-references to their value
				}
				return v;
			}

			agg[k] = _.isArray(v) ? _.map(v, transformSingleItem) : transformSingleItem(v);
			return agg;
		}, {});


		return dto;
	}

	function isAbsoluteUrl(str) {
		//very fast decide if string is url
		return (str.indexOf("http://") === 0 || str.indexOf("https://") === 0);
	}


	var propertiesInOrderPerRoot = {};

	function calcPropertyOrderToPopulate(root) {

		var propNamesInOrder = propertiesInOrderPerRoot[root];
		if (!propNamesInOrder) {

			//get root + all subtypes
			var typesForRoot = _.filter(generatedSchemas.types, {
				rootName: root
			});

			//Get all properties that can exist in index on toplevel. 
			//This is the aggregate of all properties defined on the above types.
			var propNames = _.uniq(_.reduce(typesForRoot, function(arr, type) {
				return arr.concat(_.keys(type.properties));
			}, []));


			//add calculated fields that should exit on this root. 
			propNames = _.reduce(esMappingConfig.propertiesCalculated, function(arr, prop, propName) {
				var roots = _.isArray(prop.roots) ? prop.roots : [prop.roots];
				if (prop.roots === true || ~roots.indexOf(root)) {
					arr.push(propName);
				}
				return arr;
			}, propNames);

			//Create a map <propName, [dependentProps]> and use this to calculate a DAG
			var dagComparators = _.reduce(propNames, function(agg, propName) {
				var fieldsArr = [];
				var prop = esMappingConfig.properties[propName] || esMappingConfig.propertiesCalculated[propName];
				if (prop && prop.populate) {

					//This property has a `populate`-directive. 
					//That means it should be populated using other field(s)

					//Prereq: this field must be multivalued.
					if (esMappingConfig.propertiesCalculated[propName]) { //calculated field
						if (!prop.isMulti) {
							throw new Error("calculated property doesn't define isMulti=true: " + propName);
						}
					} else {
						var propType = generatedSchemas.properties[propName]; //should exist!
						if (!propType.isMulti) {
							throw new Error("property doesn't define isMulti=true: " + propName);
						}
					}

					var fields = prop.populate.fields;
					fieldsArr = _.intersection(_.isArray(fields) ? fields : [fields], propNames);
				}
				agg[propName] = fieldsArr;
				return agg;
			}, {});

			propNamesInOrder = propertiesInOrderPerRoot[root] = domainUtils.createDagOrderGeneric(dagComparators);
		}
		return propNamesInOrder;
	}


	return {

		_transformProperties: _transformProperties,

		_transformSingleObject: _transformSingleObject,

		expandToRef: expandToRef,

		_toDataObjectRecursive: _toDataObjectRecursive,

		_toRethinkObjectRecursive: _toRethinkObjectRecursive,

		_toSimpleRecursive: _toSimpleRecursive,

		isAbsoluteUrl: isAbsoluteUrl,

		calcPropertyOrderToPopulate: calcPropertyOrderToPopulate
	};

};
