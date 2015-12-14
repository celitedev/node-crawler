var _ = require("lodash");
var fs = require("fs");
var path = require('path');

var propertiesSchemaOrg = require("./propertiesSchemaOrg");
var ownProperties = require("./propertiesOwn");

var intersectPropertyKeys = _.intersection(_.keys(ownProperties), _.keys(propertiesSchemaOrg));
if (intersectPropertyKeys.length) {
	throw new Error("Forbidden overlap between own and schemaOrg defined props: " + intersectPropertyKeys.join(","));
}

module.exports = {
	properties: _.defaults({}, ownProperties, propertiesSchemaOrg),
	types: _.reduce(fs.readdirSync(path.resolve(__dirname, "types")), function(types, file) {
		var clazzName = file.substring(0, file.lastIndexOf("."));
		types[clazzName] = require(path.resolve(__dirname, "types", file));
		return types;
	}, {})
};
