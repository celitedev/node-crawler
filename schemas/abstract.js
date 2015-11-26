var ZSchema = require("z-schema");

// ZSchema.registerFormat("fillHello", function(obj) {
// 	obj.hello = "world";
// 	return true;
// });

//Abstract schema. 
//Used to type-check the envelope. 
module.exports = {
	name: "Abstract",
	version: "0.1",
	schema: {
		"title": "Abstract Envelope Schema",
		"type": "object",
		properties: {
			id: {
				desription: "autocreated id of message. type=uuid.v4",
				"type": "string",
				// required: true
			},
			meta: {
				"type": "object"
			}
		}
		// "type": "object",
		// "format": "fillHello"
	}
};
