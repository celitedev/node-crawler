var uuid = require("uuid");
var path = require("path");
var _ = require("lodash");

module.exports = {
	URL_SEED_PREFIX: "url_seed",
	URL_DONE_MASTER_PREFIX: "url_done_master",
	URL_DONE_DETAIL_PREFIX: "url_done_detail",
	init: function(argv) {

		if (!argv.crawler) {
			throw new Error("command-line arg 'crawler' not defined");
		}
		var crawlResultSchema;
		try {
			var crawlerSchemaPath = path.resolve(__dirname + "/crawlers/" + argv.crawler);
			crawlSchema = require(crawlerSchemaPath);

			if (crawlSchema.schema.requiresJS) {
				throw new Error("requiresJS not supported atm, since we've not implemented caching + prxying yet");
				// var phantom = require('x-ray-phantom');
				// x.driver(phantom());
			}

			if (!argv.isSeeder) {
				crawlResultSchema = _.extend(crawlSchema.schema.results.schema(argv.x), {
					calcPageDone: function(el, cb) {
						downloadedDetailPages++;
						cb();
					}
				});
			}

		} catch (err) {
			throw err;
			// console.log(err);
			// throw new Error("crawler not found: " + argv.crawler);
		}

		try {
			var outputSchemaName = crawlSchema.entity.type.toLowerCase();
			var outputSchemaPath = path.resolve(__dirname + "/schemas/" + outputSchemaName);
			outputschema = require(outputSchemaPath);
		} catch (err) {
			throw new Error("outputschema not found for entitytype: " + outputSchemaName);
		}

		return {
			crawlSchema: crawlSchema,
			crawlResultSchema: crawlResultSchema,
			outputschema: outputschema
		};
	},
	queues: {
		seedQueueName: "seedUrls"
	},
	addSeedJob: function(queue, batchId, crawlSchema, cb) {
		return queue.create(this.queues.seedQueueName, {
				crawlJobId: batchId,
				taskid: uuid.v4(), //id of this specific mini batch
				source: crawlSchema.source.name,
				type: crawlSchema.entity.type,
				url: crawlSchema.schema.seed.config.seedUrl,
				created: new Date().toISOString(),
				title: createSeedUrlTitle(crawlSchema.source.name, crawlSchema.entity.type, crawlSchema.schema.seed.config.seedUrl)
			})
			.ttl(100 * 1000) // fail job if not complete in 100 seconds
			//fail means retry: return to queue to be picked up later. Allows us to mimic 'at-least-once'-semantics
			//except for that fact that redis isn't durable. 
			//TODO: look into this as alternative to propert queueing? 
			.attempts(5)
			.removeOnComplete(true)
			.save(cb || noop);
	},
};

function createSeedUrlTitle(source, type, url) {
	return source + ":" + type + "--" + url;
}

function noop() {}
