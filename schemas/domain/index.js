var _ = require("lodash");
var fs = require("fs");
var path = require('path');
var glob = require("glob");

var propertiesSchemaOrg = require("./propertiesSchemaOrg");
var ownProperties = require("./propertiesOwn");

var intersectPropertyKeys = _.intersection(_.keys(ownProperties), _.keys(propertiesSchemaOrg));
if (intersectPropertyKeys.length) {
	throw new Error("Forbidden overlap between own and schemaOrg defined props: " + intersectPropertyKeys.join(","));
}

module.exports = {
	properties: _.defaults({}, ownProperties, propertiesSchemaOrg),
	types: _.reduce(glob.sync(path.resolve(__dirname, "types") + "**/**/*.js"), function(types, file) {
		var clazzName = file.substring(file.lastIndexOf("/") + 1, file.lastIndexOf("."));
		types[clazzName] = require(file);
		return types;
	}, {})
};
