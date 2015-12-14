//Schema for messaging event. 
//LATER: this may define a schema we store in Confluent Schema or something (Avro schemas) 
module.exports = {
	name: "Event",
	version: "0.1",
	schema: {
		"title": "Event Schema for specific source",
		"type": "object",
		"description": "A representation of an event for specific source",
		"required": ["name", "dtstart"],
		"properties": {
			id: {
				type: "string",
				description: "id of instance as known by source"
			},
			idCompound: {
				type: "boolean",
				description: "indicates if id was created manually/ compounded based on several attribs"
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
			"dtstart": {
				"format": "date-time",
				"type": "string",
				"description": "Event starting time"
			},
			"dtend": {
				"format": "date-time",
				"type": "string",
				"description": "Event ending time"
			},
			"duration": {
				// "format": "time",
				"type": "string",
				"description": "Event duration"
			},
			"rdate": {
				"format": "date-time",
				"type": "string",
				"description": "Recurrence date"
			},
			"rrule": {
				"type": "string",
				"description": "Recurrence rule"
			},
			"placeRefs": {
				description: "array of place references within source.",
				type: "array",
				items: {
					type: "object",
					properties: {
						id: {
							description: "key that uniquely identifies entity. May be an url",
							type: "string"
						},
						url: {
							"format": "uri",
							type: "string"
						},
						name: {
							type: "string"
						}
					},
					required: ["id"],
					additionalProperties: false
				}
			},
			"performerRefs": {
				description: "array of performer references within source.",
				type: "array",
				items: {
					type: "object",
					properties: {
						id: {
							description: "key that uniquely identifies entity. May be an url",
							type: "string"
						},
						url: {
							"format": "uri",
							type: "string"
						},
						name: {
							type: "string"
						}
					},
					required: ["id"],
					additionalProperties: false
				}
			},
			"objectRefs": {
				description: "array of event-object references within source.",
				type: "array",
				items: {
					type: "object",
					properties: {
						id: {
							description: "key that uniquely identifies entity. May be an url",
							type: "string"
						},
						url: {
							"format": "uri",
							type: "string"
						},
						name: {
							type: "string"
						}
					},
					required: ["id"],
					additionalProperties: false
				}
			}
		},
		"required": [
			"id",
			// "url", //not required. See #41
			"name",
			// "description",
			"dtstart",
			"placeRefs",
			// "performerRefs"
			// "objectRefs"
		],
		additionalProperties: false
	}
};
