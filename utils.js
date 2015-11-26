var uuid = require("uuid");
var path = require("path");
var _ = require("lodash");

var utils = module.exports = {
	URL_SEED_PREFIX: "url_seed",
	URL_DONE_MASTER_PREFIX: "url_done_master",
	URL_DONE_DETAIL_PREFIX: "url_done_detail",
	KUE_PREFIX: "kwhenqueue2",

	fetchCrawlConfig: function(config) {
		config.source = config.source.toLowerCase();
		config.type = config.type.toLowerCase();

		var crawlerName = utils.calculated.getCrawlerName(config.source, config.type);

		try {
			var crawlerSchemaPath = path.resolve(__dirname + "/crawlers/" + crawlerName);
			crawlConfig = require(crawlerSchemaPath);

			if (crawlConfig.schema.requiresJS) {
				throw new Error("requiresJS not supported atm, since we've not implemented caching + prxying yet");
				// var phantom = require('x-ray-phantom');
				// x.driver(phantom());
			}

		} catch (err) {
			throw err;
			// console.log(err);
			// throw new Error("crawler not found: " + config.crawler);
		}

		if (crawlConfig.entity.type.toLowerCase() !== config.type) {
			throw new Error("crawler type doesn't match up with filename (type, filename): " +
				crawlConfig.entity.type.toLowerCase() + ", " + crawlerName);
		}
		if (crawlConfig.source.name.toLowerCase() !== config.source) {
			throw new Error("crawler source doesn't match up with filename (source, filename): " +
				crawlConfig.source.name.toLowerCase() + ", " + crawlerName);
		}

		return crawlConfig;
	},

	addCrawlJob: function(queue, batchId, crawlConfig, url, cb) {

		var crawlerQueueName = utils.calculated.getCrawlerQueueName(crawlConfig);

		return queue.create(crawlerQueueName, {
				crawlJobId: batchId,
				taskid: uuid.v4(), //id of this specific mini batch
				source: crawlConfig.source.name,
				type: crawlConfig.entity.type,
				url: url,
				created: new Date().toISOString(),
				title: utils.calculated.getSeedUrlTitle(crawlConfig.source.name, crawlConfig.entity.type, url)
			})
			.ttl(crawlConfig.job.ttl)
			//fail means retry: return to queue to be picked up later. Allows us to mimic 'at-least-once'-semantics
			//except for that fact that redis isn't durable. 
			//TODO: look into this as alternative to propert queueing? 
			.attempts(crawlConfig.job.retries)
			.removeOnComplete(true)
			.save(cb || noop);
	},
	calculated: {
		getSeedUrlTitle: function(source, type, url) {
			return source + ":" + type + "--" + url;
		},

		/**
		 * Get name of crawler which is '<source>:<type>'
		 *
		 * Input either: 
		 * - source + type
		 * - seedUrlJob
		 * 
		 * @param  {[type]} source [description]
		 * @param  {[type]} type   [description]
		 * @return {[type]}        [description]
		 */
		getCrawlerName: function(source, type) {
			var name;
			if (_.isObject(source)) {
				name = source.source + ":" + source.type;
			} else {
				name = source + ":" + type;
			}
			return name.toLowerCase();
		},


		getCrawlerQueueName: function(crawlConfig) {
			var crawlerName = utils.calculated.getCrawlerName(crawlConfig.source.name, crawlConfig.entity.type);
			return "crawl-" + crawlerName;
		}
	}
};

function noop() {}
