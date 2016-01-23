var _ = require("lodash");
var util = require("util");
var domainUtils = require("../utils");
var UUID = require("pure-uuid");


var excludePropertyKeys = domainUtils.excludePropertyKeys;

function getSourceId(sourceType, sourceId) {
	return new UUID(5, "ns:URL", sourceType + "--" + sourceId).format();
}

module.exports = function(generatedSchemas, AbstractEntity, r) {

	var validator = require("../validation")(generatedSchemas);

	function SourceEntity(state, bootstrapObj, options) {
		this._kind = domainUtils.enums.kind.SOURCE;
		SourceEntity.super_.call(this, state, bootstrapObj, options);
		if (!state.sourceType) {
			throw new Error("'state.sourceType' should be defined on SourceEntity");
		}
		if (!state.sourceId) {
			throw new Error("'state.sourceUrl' should be defined on SourceEntity");
		}
		if (!state.batchId) {
			throw new Error("'state.batchId' should be defined on SourceEntity");
		}
		if (state.detailPageAware === undefined) {
			throw new Error("'detailPageAware.detailPageAware' should be defined");
		}

		this.sourceType = state.sourceType;
		this.sourceUrl = state.sourceUrl; //optional
		this.sourceId = state.sourceId;
		this.detailPageAware = state.detailPageAware;
		this._refs = {};

		this.state = {
			batchId: state.batchId
		};

		if (this.detailPageAware && !this.sourceUrl) {
			throw new Error("SourceEntity with detailPageAware=true but sourceUrl undefined");
		}

		this.id = getSourceId(this.sourceType, this.sourceId);

		//bootstrapObject: the object from DB
		if (bootstrapObj) {

			////
			//Some Logic:
			//sourceId: guaranteed to match up (otherwise we wouldn't have this bootstrapObj)
			//TBD: sourceUrl: ok to be overwritten? for now: yeah. Later we need to recheck links.

			if (this.sourceType !== bootstrapObj._sourceType) {
				throw new Error("sourceType is different between current and saved object (current, saved): " +
					this.sourceType + ", " + bootstrapObj._sourceType);
			}

			//TBD: temporary check until we're sure we can handle (some) changs in type.
			if (!_.eq(this._type, bootstrapObj._type)) {
				throw new Error("TBD: _type doesn't line up between current and saved object (current, saved): " +
					this._type + ", " + bootstrapObj._type);
			}

			//copy _refs down to SourceEntity
			this._refs = bootstrapObj._refs;

			//Extend state with state of bootstap object. 
			//set old batch id to 'batchIdRead'
			var bState = bootstrapObj._state;
			delete bState.batchId;
			_.extend(this.state, bState);

		}
	}

	util.inherits(SourceEntity, AbstractEntity);

	SourceEntity.prototype._validationSchema = validator.createSchemaSourceEntity();

	//static
	SourceEntity.getSourceEntity = function(sourceType, sourceId) {

		var id = getSourceId(sourceType, sourceId);

		return r.table(domainUtils.statics.SOURCETABLE).getAll(id).without("_refs").then(function(results) {
			if (!results || !results.length) {
				return null;
			}
			if (results.length > 1) {
				throw new Error("Multiple objects with _sourceId in rethinkDB: " + id);
			}
			return results[0];
		});
	};

	//update refs to _refs
	SourceEntity.prototype.calculateRefs = function(properties) {
		var out = [];
		_calcRefsRecursive(properties, out);
		return out;
	};

	SourceEntity.prototype.commit = function(cb) {

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
			r.table(domainUtils.statics.SOURCETABLE).insert(obj, {
					conflict: "update"
				}).run()
				.then(function() {

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


	SourceEntity.prototype.toRethinkObject = function(props) {

		var now = new Date();

		return _.extend(AbstractEntity._toRethinkObjectRecursive(props || this._props, true), {

			id: this.id, //set by client based on uuidv5
			_type: this._type,
			_sourceType: this.sourceType,
			_sourceUrl: this.sourceUrl,
			_sourceId: this.sourceId, //a reasable sourceId like an url or an explicitly created compound-created id by crawler
			_state: _.defaults({
				modified: now //set modified to now
			}, this.state, {
				created: now //set created to now if not already set
			})
		});
	};



	function _calcRefsRecursive(properties, agg, prefix) {

		prefix = prefix || "";

		_.each(properties, function(v, k) {

			if (excludePropertyKeys.indexOf(k) !== -1) return;

			var compoundKey = prefix ? prefix + "." + k : k;

			function transformSingleItem(v) {

				//if first is range is datatype -> all in range are datatype as per #107
				//If datatype -> return undefined
				if (generatedSchemas.datatypes[generatedSchemas.properties[k].ranges[0]]) {
					return undefined;
				}

				if (!_.isObject(v)) {
					return undefined;
				}

				if (v._ref) {
					return v._ref;
				}

				var obj = _calcRefsRecursive(v, agg, compoundKey);

				if (!_.size(obj)) {
					return undefined;
				}

				return obj;
			}

			var arr = _.compact(_.map(_.isArray(v) ? v : [v], transformSingleItem));

			//add the dot-separated ref-path
			_.map(arr, function(v) {
				v._path = compoundKey;
			});

			if (!v.length) {
				v = undefined;
				return;
			}

			_.each(arr, function(v) {
				agg.push(v); //can't do concat because array-ref not maintained
			});

		});

	}

	return SourceEntity;

};
