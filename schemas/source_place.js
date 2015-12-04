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
			neighborhood: {
				type: "string"
			},
			crossStreets: {
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
			},
			tel: {
				type: "string"
			},
			fax: {
				type: "string"
			},
			email: {
				type: "string"
			},
			website: {
				type: "string"
			},
			images: {
				type: "array",
				items: {
					type: "object",
					properties: {
						url: {
							type: "string"
						},
						alt: {
							description: "the alternative description",
							type: "string",
						},
						cc: {
							description: "contribution / licence info",
							type: "string"
						},
					},
					additionalProperties: false,
					required: ["url"]
				}
			},

			openinghours: {
				type: "array",
				items: {
					type: "object",
					properties: {
						dayOfWeek: {
							type: "string"
						},
						range: {
							type: "string",
						},
					},
					additionalProperties: false,
					required: ["dayOfWeek", "range"]
				}
			},

			pricerange: {
				type: "string"
			},

			categories: {
				type: "array",
				items: {
					type: "string"
				}
			},

			tags: {
				type: "array",
				items: {
					type: "string"
				}
			},

			reviews_nr: {
				type: "number"
			},
			reviews_avg: {
				type: "number"
			},

			facts: {
				type: "array",
				items: {
					type: "object",
					properties: {
						name: {
							type: "string"
						},
						val: {
							type: "string",
						},
					},
					additionalProperties: false,
					required: ["name", "val"]
				}
			},


		},
		"required": [
			"id",
			"url",
			"name",
			// "description"
		],
		// additionalProperties: false
	}
};
