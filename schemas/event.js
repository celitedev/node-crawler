//Schema for messaging event. 
//LATER: this may define a schema we store in Confluent Schema or something (Avro schemas) 
module.exports = {
	name: "Event",
	version: "0.1",
	schema: {
		"title": "Event Schema",
		"type": "object",
		"description": "A representation of an event",
		"required": ["dtstart", "summary"],
		"properties": {
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
			"summary": {
				"type": "string"
			},
			"location": {
				"type": "string"
			},
			"url": {
				"type": "string",
				"format": "uri"
			},
			"duration": {
				"format": "time",
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
			"category": {
				"type": "string"
			},
			"description": {
				"type": "string"
			},
			"geo": {
				"$ref": "http: //json-schema.org/geo"
			}
		}
	}
};
