var _ = require("lodash");
var util = require("util");
var domainUtils = require("../utils");
var UUID = require("pure-uuid");

module.exports = function(generatedSchemas, AbstractEntity, r) {

	var validator = require("../validation")(generatedSchemas);

	function CanonicalEntity(state) {
		this._kind = domainUtils.enums.kind.CANONICAL;
		CanonicalEntity.super_.call(this, state);
	}

	util.inherits(CanonicalEntity, AbstractEntity);

	CanonicalEntity.prototype._validationSchema = validator.createSchema();

	return CanonicalEntity;

};
