var _ = require("lodash");
var util = require("util");
var domainUtils = require("../utils");
var UUID = require("pure-uuid");

module.exports = function(generatedSchemas, AbstractEntity, r) {

	var validator = require("../validation")(generatedSchemas);

	function SourceEntity(state) {
		this._kind = domainUtils.enums.kind.SOURCE;
		SourceEntity.super_.call(this, state);
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
		this.batchId = state.batchId;
		this.detailPageAware = state.detailPageAware;

		if (this.detailPageAware && !this.sourceUrl) {
			throw new Error("SourceEntity with detailPageAware=true but sourceUrl undefined");
		}
	}

	SourceEntity.prototype._validationSchema = validator.createSchemaSourceEntity();

	util.inherits(SourceEntity, AbstractEntity);

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

			//freeze propsDirty to persist. This to be able to check if entity dirty
			//after save because of in between change.
			var props = _.cloneDeep(self._propsDirty);

			var obj = self.toRethinkObject(props);

			if (self.isDirty()) {
				obj._hasUpdatedData = true;
			}

			//More info: https://www.rethinkdb.com/api/javascript/insert/
			r.table("sourceEntities").insert(obj, {
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


	SourceEntity.prototype.toRethinkObject = function(props) {

		var now = new Date();

		return _.extend(AbstractEntity._toRethinkObjectRecursive(props || this._props, true), {
			id: this.getSourceEntityId(),
			_type: this._type,
			_sourceUrl: this.sourceUrl,
			_sourceId: this.sourceId,
			_sourceType: this.sourceType,
			_batchId: this.batchId,
			_created: this._created || now,
			_modified: now,
			_hasUpdatedData: !!this._hasUpdatedData //turn undefined in false
		});
	};

	SourceEntity.prototype.getSourceEntityId = function() {
		var arr = [
			this.sourceType,
			this._type[0], //the type as specified in the crawler
			this.sourceId
		];
		return new UUID(5, "ns:URL", arr.join("--")).format();
	};


	return SourceEntity;

};
