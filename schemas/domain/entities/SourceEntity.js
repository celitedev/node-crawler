var _ = require("lodash");
var util = require("util");
var UUID = require("pure-uuid");

var domainUtils = require("../utils");

function getSourceId(sourceType, sourceId) {
	return new UUID(5, "ns:URL", sourceType + "--" + sourceId).format();
}

module.exports = function(generatedSchemas, AbstractEntity, r) {

	var entityUtils = require("./utils")(generatedSchemas);
	var validator = require("../validation")(generatedSchemas);

	function SourceEntity(state, bootstrapObj, options) {
		this._kind = domainUtils.enums.kind.SOURCE;
		this._sourceTable = domainUtils.statics.SOURCETABLE;
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
			this._refNormIds = bootstrapObj._refNormIds;
			this._refToSourceRefIdMap = bootstrapObj._refToSourceRefIdMap;

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


	SourceEntity.prototype.toRethinkObject = function(props) {

		var now = new Date();

		return _.extend(entityUtils._toRethinkObjectRecursive(props || this._props, true), {

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



	return SourceEntity;

};
