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
				description: "autocreated id of message. type=uuid.v4",
				"type": "string",

			},
			meta: {
				description: "meta data of message including versions of schemas",
				"type": "object",
				properties: {
					"crawl": {
						"type": "object",
						description: "specifies info on this crawl",
						properties: {
							"batchId": {
								description: "the id of the entire batch run. Monononically increasing",
								"type": "number",
								"minimum": 0,
							},
							"jobId": {
								description: "specific mini job this entity instance is part of. " +
									"A batch contains multiple jobs",
								"type": "string"
							},
							"createdAt": {
								"format": "date-time",
								description: "datestring (iso) signaling creation date of this message",
								"type": "string"
							},
							"crawlVersion": {
								"description": "version of the crawler/mapper. <source,type> specific",
								"type": "string"
							},
							"typeVersion": {
								description: "version of the outputMessage/ type, describing the payload.",
								"type": "string"
							}
						},
						"required": ["batchId", "jobId", "createdAt", "crawlVersion", "typeVersion"]
					},
				},
				"required": ["crawl"]
			},
			identifiers: {
				description: "attributes that together allow identification of source entity instance",
				"type": "object",
				properties: {
					id: {
						type: "string",
						description: "id of entity instance as known by source"
					},
					url: {
						"format": "uri",
						type: "string",
						description: "OPTIONAL: url of entity instance as known by source"
					},
					source: {
						//TODO: enum
						type: "string",
						description: "name of source as known by kwhen"
					},
					type: {
						//TODO: enum
						type: "string",
						description: "name of type mapped. Independent of source"
					}
				},
				"required": ["id", "source", "type"]
			},
			payload: {
				description: "actual payload of message. " +
					"THis is covered by a different entity-type specific schema",
				"type": "object"
			}
		},
		required: ["id", "meta", "identifiers", "payload"]
	}
};
