var _ = require("lodash");

var domainUtils = require("../utils");
var domainConfig = require("../_definitions/config");
var utilsForSchemaGeneration = require("../utils/utilsForSchemaGeneration");

module.exports = function (generatedSchemas, r) {
  var entityUtils = require("./utils")(generatedSchemas);

  var roots = domainConfig.domain.roots;
  var typesInOrder = utilsForSchemaGeneration.getTypesInDAGOrder(generatedSchemas.types);


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
  function AbstractEntity(state, bootstrapObj, options) {
    //console.log("Abstract Entity state: ", state);

    if (!this._kind) {
      throw new Error("AbstractEntity should be called by subtype");
    }
    if (!state) {
      throw new Error("'state' should be defined on DomainObject creation");
    }

    if (!state.type) {
      throw new Error("'state.type' should be defined on DomainObject");
    }

    state.type = _.isArray(state.type) ? state.type : [state.type];

    _.each(state.type, function (typeNameSingle) {
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
      var roots = _.uniq(_.map(state.type, function (typeNameSingle) {
        var type = generatedSchemas.types[typeNameSingle];
        //console.log("Found type of: " + typeNameSingle + " to be: ", type.rootName );
        return {
          rootName: type.rootName,
          superTypes: type.supertypes
        }
      }), function(obj){return obj.rootName});
      //console.log("Roots are: ", roots);
      if (roots.length > 1) {
        var types = _.uniq(_.map(roots, function(roots) {return roots.rootName}));
        var error = false;
        if (types.length > 1) {
          var unmatched_types = types.length;
          _.each(roots, function(root){
            var superTypes = _.compact(_.uniq(_.flatten(_.map(_.filter(roots, root), function(r) {return r.superTypes}))));
            if (_.intersection(superTypes, root.superTypes).length > 0) unmatched_types -= 1;
          });
          if (unmatched_types > 0) error = true;
        } else {
          error = true;
        }
        if (error) {
          throw new Error("We require all types of single DomainObject to belong to same root or have the same supertype. Not the case here: " + types.join(","));
        }
      }
    }());


    this._type = state.type;

    this._propsDirty = {
      _type: this._type
    };

    this._state = {
      isValidated: false, //signals if validate has been called or is implicit based on db load
      // isValid: false, //signals if validate succeeded or is implicit based on db load
      // isDirty: false //signals if props have changed since last call to validate
      recommitCount: 0
    };

    //load object
    if (bootstrapObj) {

      //add all properties excluding those starting with '_'
      //also skip 'id'
      this.set(_.reduce(bootstrapObj, function (agg, v, k) {
        if (k.indexOf("_") !== 0 && k !== "id") {
          agg[k] = v;
        }
        return agg;
      }, {}), true, _.extend({}, options, {
        isFromDB: true
      }));
    }

    this.isInitialized = true;
  }


  AbstractEntity.prototype.isValidated = function () {
    return !!this._state.isValidated;
  };

  AbstractEntity.prototype.isValidOrUnchecked = function () {
    return !!this._state.isValid;
  };

  AbstractEntity.prototype.getErrors = function () {
    return this._state.errors;
  };

  AbstractEntity.prototype.isDirty = function () {
    return !!this._state.isDirty;
  };

  AbstractEntity.prototype.set = function (objMutable, doOverwrite, options) {

    options = options || {};

    if (options.isFromDB && this.isInitialized) {
      throw new Error("AbstractEntity.set(toPropsDirectly) may only be used on init");
    }
    if (!objMutable) {
      throw new Error("objMutable should be provided to create domain object");
    }

    if (objMutable._type) {
      throw new Error("type should NOT be defined on toplevel but on `state.type` during DomainObject creation");
    }

    //delta is supplied delta + _type as included from domainObject. 
    //This guarantees _type cannot not overwritten.
    var delta = objMutable;
    delta._type = this._type;

    // var delta = _.extend(
    // 	_.cloneDeep(objMutable), //This *might* be needed depending on calling client. For now just be safe.
    // 	{
    // 		_type: this._type
    // 	}
    // );

    var combined = entityUtils._transformProperties(doOverwrite ? delta : _.extend({}, this._propsDirty, delta), true, [], this._kind, options);

    //if loaded from DB -> directly load into into _props
    if (options.isFromDB) {
      //only used on init
      this._props = combined;

    } else {

      //if combined isn't the same as _propsDirty -> reset isValidated & isValid 
      if (!_.eq(combined, this._propsDirty)) {
        this._state.isValidated = false;
        this._state.isValid = false;
      }

      //TECH: propsDirty becomes a NEW object since `combined` is new.
      //This results in being able to safely set props <- propsDirty on commit
      this._propsDirty = combined;

      //if _propsDirty isn't the same as _props -> set isDirty = true, otherwise set to false
      this._state.isDirty = !_.eq(this._propsDirty, this._props);
    }

  };

  AbstractEntity.prototype.commit = function (cb) {

    var self = this;
    this.validate(function (err) {
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

      //STATE: validated

      //Freeze propsDirty to persist. 
      //This to be able to check if entity dirty after save, because of in between change.
      var props = _.cloneDeep(self._propsDirty);


      //if not dirty -> only upload the meta-properties for perf-reasons
      var obj = self.toRethinkObject(self.isDirty() ? props : {});

      //TODO #141: use (previous) obj._state.modifiedAndDirty as version for OCC (if exists here, i.e. not new)
      var prevModifiedAndDirty = obj._state.modifiedAndDirty;

      //set modifiedAndDirty to true if dirty. 
      //This signals serverside that it should (re)process SourceEntity
      if (self.isDirty()) {
        obj._state.modifiedAndDirty = obj._state.modified; //updated to now
      }

      //More info: https://www.rethinkdb.com/api/javascript/insert/
      r.table(self._sourceTable).insert(obj, {
          conflict: "update"
        }).run()
        .then(function () {

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

          if (!self.isDirty()) {
            self._state.recommitCount = 0;
            return cb();
          }

          if (++self._state.recommitCount >= 3) {
            //we don't anticpiate this error yet. Seeing this is trouble...
            return cb(new Error("recommitCount reached for item! Can only happen on REAL high congestion"));
          }

          //do a re-commit, until success.
          self.commit(cb);

        })
        .catch(cb); //this passes an error back to the callback

    });
  };

  AbstractEntity.getRootAndSubtypes = function (typechain) {

    var root = _.intersection(_.clone(typechain).reverse(), roots)[0];
    var subtypeIndex = typechain.lastIndexOf(root) + 1;
    return {
      root: root,
      subtypes: subtypeIndex < typechain.length ? typechain.slice(subtypeIndex) : []
    };
  };

  AbstractEntity.getTypechain = function (types) {
    //NOTE: _type is array
    var entityTypesInOrder = _.intersection(typesInOrder, types);

    //Get typechain in order, this may contain duplicates. 
    //The root to return is the LAST root found in the typechain
    return _.reduce(entityTypesInOrder, function (arr, tName) {
      var type = generatedSchemas.types[tName];
      return arr.concat(type.ancestors).concat([tName]);
    }, []);
  };



  AbstractEntity.prototype.validate = function (cb) {
    var self = this;

    if (self.isValidated()) {
      //if already validated and `_propsDirty` didn't change => validation outcome doesn't change
      return cb();
    }

    this._validationSchema.validate(this._propsDirty, function (err, res) {
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

  /**
	 * Example:
	 * {
		  "_type": "Review",
		  "itemReviewed": "de305d54-75b4-431b-adb2-eb6b9e546014",
		  "reviewBody": "bla",
		  "about": "de305d54-75b4-431b-adb2-eb6b9e546014"
		}
	 */
  AbstractEntity.prototype.toSimple = function (optionalProps) {
    return _.extend({
      _type: this._type
    }, entityUtils._toSimpleRecursive(optionalProps || this._props));
  };

  return AbstractEntity;

};

