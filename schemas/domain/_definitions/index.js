var _ = require("lodash");
var fs = require("fs");
var path = require('path');
var glob = require("glob");

var propertiesSchemaOrg = require("./propertiesSchemaOrg");


module.exports = {
	properties: propertiesSchemaOrg,
	types: _.reduce(glob.sync(path.resolve(__dirname, "types") + "**/**/*.js"), function(types, file) {
		var clazzName = file.substring(file.lastIndexOf("/") + 1, file.lastIndexOf("."));
		var type = require(file);
		if (!type.disable) {
			types[clazzName] = type;
		}
		return types;
	}, {})
};
