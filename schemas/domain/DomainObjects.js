var _ = require("lodash");
var util = require("util");
var domainUtils = require("./utils");
var urlRegex = require('url-regex');

var UUID = require("pure-uuid");

var excludePropertyKeys = domainUtils.excludePropertyKeys;

module.exports = function(generatedSchemas, r) {

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
			throw new Error("'state.type' should be defined on DomainObject");
		}

		typeName = _.isArray(typeName) ? typeName : [typeName];

		_.each(typeName, function(typeNameSingle) {
			var type = generatedSchemas.types[typeNameSingle];

			if (!type) {
				throw new Error("type doesn't exist as defined by _type: " + typeNameSingle);
			}
			if (!type.isEntity) {
				throw new Error("type should be an entity but isn't: " + typeNameSingle);
			}
		});

		//TEMPORARY: check that multiple types are in same root: #101
		(function temporaryCheck() {
			var roots = _.uniq(_.map(typeName, function(typeNameSingle) {
				var type = generatedSchemas.types[typeNameSingle];
				return type.rootName;
			}));
			if (roots.length > 1) {
				throw new Error("TEMPORARY CONSTRAINT: we require all types " +
					"of single DomainObject to belong to save root. Not the case here: " + roots.join(","));
			}
		}());


		this._type = typeName;

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

	AbstractDomainObject.prototype.getErrors = function() {
		return this._state.errors;
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

		var combined = _transformProperties(doOverwrite ? delta : _.extend({}, this._propsDirty, delta), true, [], this._kind);

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
				err = new Error(self._state.errors);
				err.validationError = self._state.errors;
				// console.log(self._state.errors);
				// err = new Error("Cannot commit because of validation errors in item: " + self._kind + " - " + self.sourceId +
				// 	" - " + self._type + " - " + JSON.stringify(self.getErrors(), null, 2));
				err.isValidationError = true;
				return cb(err);
			}

			var props = _.cloneDeep(self._propsDirty); //freeze propsDirty to persist

			//NOTE: toDataObject should NOT be passed to Rethink. 
			//Instead this should be passed to Elasticsearch by rethink2ES-feeder 
			// console.log(JSON.stringify(self.toDataObject(props), null, 2));


			var obj = self.toRethinkObject(props);

			//More info: https://www.rethinkdb.com/api/javascript/insert/
			r.table("sourceObjects").insert(obj, {
					conflict: "update",
					returnChanges: true
				}).run()
				.then(function(result) {

					///////////////////////////
					//FOR NOW: Latest wins. 
					//
					//NOTE: THERE'S NO CODE TO UPDATE PROCESS WITH ENTITY UPDATED OUT-OF-PROCESS.
					//NOT A PROB SINCE THAT SHOULDNT HAPPEN FOR NOW
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

				});

		});
	};



	function CanonicalObject(state) {
		this._kind = domainUtils.enums.kind.CANONICAL;
		CanonicalObject.super_.call(this, state);
	}


	function SourceObject(state) {
		this._kind = domainUtils.enums.kind.SOURCE;
		SourceObject.super_.call(this, state);
		if (!state.sourceType) {
			throw new Error("'state.sourceType' should be defined on SourceObject");
		}
		if (!state.sourceId) {
			throw new Error("'state.sourceUrl' should be defined on SourceObject");
		}
		if (!state.batchId) {
			throw new Error("'state.batchId' should be defined on SourceObject");
		}

		this.sourceType = state.sourceType;
		this.sourceUrl = state.sourceUrl; //optional
		this.sourceId = state.sourceId;
		this.batchId = state.batchId;
	}

	CanonicalObject.prototype._validationSchema = validator.createSchema();
	SourceObject.prototype._validationSchema = validator.createSchemaSourceObject();


	util.inherits(CanonicalObject, AbstractDomainObject);
	util.inherits(SourceObject, AbstractDomainObject);


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

		//NOTE: temp restriction in place that requires all entities to be of same root (#101)
		//We therefore can infer _index by fetching rootName from *any* type since it will be the same
		//LATER: this may result in multiple objects: 1 for each index.

		var _index = generatedSchemas.types[this._type[0]].rootName;

		return {
			_index: _index,

			//subtypes is the unique union 
			//of all subtypes (starting at _index and walking down the typechain)
			//over all types
			_subtypes: _.uniq(_.reduce(this._type, function(arr, typeName) {
				var type = generatedSchemas.types[typeName];
				var ancestorsAndSelf = type.ancestors.concat([typeName]);
				return arr.concat(ancestorsAndSelf.slice(ancestorsAndSelf.indexOf(_index) + 1));
			}, [])),

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


	SourceObject.prototype.toRethinkObject = function(props) {

		return _.extend(_toRethinkObjectRecursive(props || this._props, true), {
			id: this.getSourceObjectId(),
			_type: this._type,
			_sourceUrl: this.sourceUrl,
			_sourceId: this.sourceId,
			_sourceType: this.sourceType,
			_batchId: this.batchId,
		});
	};

	SourceObject.prototype.getSourceObjectId = function() {
		var arr = [
			this.sourceType,
			this._type[0], //the type as specified in the crawler
			this.sourceId
		];
		return new UUID(5, "ns:URL", arr.join("--")).format();
	};


	//1. transform obj so all values are expanded into objects. 
	//E.g.: "some value" is expanded to {"_value": "some value"}
	//2. 
	function _transformProperties(obj, isTopLevel, ancestors, kind) {

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
			if (fieldtype.isMulti) {
				v = _.isArray(v) ? v : [v];
			}

			//transform input
			if (fieldtype.fieldTransformers) {
				v = !_.isArray(v) ? fieldtype.fieldTransformers(v) : _.map(v, fieldtype.fieldTransformers);
			}

			//bit weird: we allow an array value for isMulti=false. 
			//This so we can catch this validation error properly later in the validation code

			// //if we're processing a SOURCEOBJECT instead of a CANONICAL OBJECT 
			// //AND we're referencing an entity -> expand shortcut ref to fullblown ref-structure. 
			// //
			// //E.g.: "some source id" -> 
			// //{
			// //	_ref: {
			// //		sourceId: "some source id"
			// //	}

			//TODO: soundness check #107 so we know (if first el = Type <=> all type of range is Type)
			var rangeType = generatedSchemas.types[fieldtype.ranges[0]];
			if (kind === domainUtils.enums.kind.SOURCE && rangeType && rangeType.isEntity) {
				//we've got an entity reference which is to be expanded to a _ref-object.
				v = !_.isArray(v) ? expandToRef(v) : _.map(v, expandToRef);
			}

			obj[k] = !_.isArray(v) ? _transformSingleObject(ancestors, k, kind, v) : _.map(v, _.partial(_transformSingleObject, ancestors, k, kind));

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
			_.each(generatedSchemas.properties, function(prop, k) {
				if (prop.aliasOf && obj[k] === undefined && obj[prop.aliasOf] !== undefined) {
					obj[k] = obj[prop.aliasOf];
				}
			});
		}

		return obj;
	}

	function _transformSingleObject(ancestors, k, kind, val) {
		if (!_.isObject(val)) {
			val = {
				_value: val
			};
		}
		return _transformProperties(val, undefined, ancestors.concat([k]), kind);
	}

	//When shortcut _ref given expand to _ref object. 
	//This is done for entity-references within an SourceObject
	//
	//Example:
	//
	//{
	//	_ref: {
	//		sourceId: "bla"
	//	}
	//}
	//
	//or
	//
	//	//{
	//	_ref: {
	//		sourceUrl: "https://en.wikipedia.org/wiki/Quentin_Tarantino"
	//	}
	//}
	//
	//Already expanded _ref-objects are left untouched. e.g.: 
	//
	//{
	//	_ref: {
	//		name: "Quentin Tarantino"
	//	}
	//}
	function expandToRef(v) {
		if (!_.isObject(v)) {

			var objExpanded = {
				_ref: {}
			};

			var key = urlRegex({
				exact: true
			}).test(v) ? "sourceUrl" : "sourceId";

			objExpanded._ref[key] = v;
			v = objExpanded;
		}
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

	return {
		CanonicalObject: CanonicalObject,
		SourceObject: SourceObject,
	};

};
