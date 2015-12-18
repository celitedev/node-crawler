// defines extra properties we want to add to the DOMAIN
// This doesn't included properties needed for logical/tech model, eventMessage-schemas, etc.

var _ = require('lodash');

var properties = {
	// name: {} //This would give error correctly, since this overwrites schemaOrg defined `name`

	// bla: {
	// 	description: "isNew properties are explicitly added by us",
	// }
};

//add isNew so we can check between schemaOrg added (isNew = false) and properties 
//added by us (isNew = true)
_.each(properties, function(p) {
	p.isNew = true;
});


module.exports = properties;
