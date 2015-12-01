//Schema for messaging event. 
//LATER: this may define a schema we store in Confluent Schema or something (Avro schemas) 
module.exports = {
	name: "Place",
	version: "0.1",
	schema: {
		"title": "Place Schema for specific source",
		"type": "object",
		"description": "A representation of a place for specific source",
		"required": ["name", "dtstart"],
		"properties": {
			id: {
				type: "string",
				description: "id of instance as known by source"
			},
			url: {
				"format": "uri",
				type: "string",
				description: "url of instance as known by source"
			},
			"name": {
				"type": "string",
				"description": "name of instance as known by source"
			},
			"descriptionShort": {
				"type": "string",
			},
			"description": {
				"type": "string"
			},
			latitude: {
				type: "number"
			},
			longitude: {
				type: "number"
			},
			streetAddress: {
				description: "streetaddres including primary number",
				type: "string"
			},
			streetAddressSup: {
				description: "supplement to streetAddress. E.g.: appt number",
				type: "string"
			},
			zipCode: {
				type: "string"
			},
			city: {
				type: "string"
			},
			region: {
				type: "string"
			},
			country: {
				type: "string"
			}
		},
		"required": [
			"id",
			"url",
			"name",
			"description"
		]
	}
};
