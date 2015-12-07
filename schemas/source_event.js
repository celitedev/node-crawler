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
						url: {
							"format": "uri",
							type: "string"
						},
						id: {
							type: "string"
						},
						name: {
							type: "string"
						}
					},
					required: ["url"],
					additionalProperties: false
				}
			},
			"performerRefs": {
				description: "array of performer references within source.",
				type: "array",
				items: {
					type: "object",
					properties: {
						url: {
							"format": "uri",
							type: "string"
						},
						id: {
							type: "string"
						},
						name: {
							type: "string"
						}
					},
					required: ["url"],
					additionalProperties: false
				}
			},
			"objectRefs": {
				description: "array of event-object references within source.",
				type: "array",
				items: {
					type: "object",
					properties: {
						url: {
							"format": "uri",
							type: "string"
						},
						id: {
							type: "string"
						},
						name: {
							type: "string"
						}
					},
					required: ["url"],
					additionalProperties: false
				}
			}
		},
		"required": [
			"id",
			"url",
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
