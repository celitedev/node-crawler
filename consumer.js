var _ = require("lodash");
var Xray = require('x-ray');
var uuid = require("uuid");
var argv = require('yargs').argv;
var path = require("path");

var proxyDriver = require("./drivers/proxyDriver");
var kue = require('kue');

var utils = require("./utils");

var Promise = require("bluebird");
var async = require('async');

var queue = kue.createQueue();


/////////////////////////////////////////////////////////////////////////////////
//TODO                                                                         //
// Seed queue or continue with job                                             //
// i.e.: there should only be 1 seeder process and multiple listening boxes    //
//                                                                             //
// Moreover, we should check:                                                  //
// - master url already done in OR(queue, completed) for *this* batch -> skip
//   - next batch we want to recheck master pages for new entities
// - detail url already done in OR(queue, completed) for *every* batch -> skip
//   - LATER: we may want to do rechecks of new data for existing entities. This
//   is likely a completely separate flow though.
//                                                                             //
/////////////////////////////////////////////////////////////////////////////////

//Set of master urls done
// //Key: <source, entityType, batch> -> [<url>]
// var setDoneMaster;

// //Set of detail urls done
// //Key: <source, entityType, batch> -> [<url>]
// var setDoneDetail;


//Each <source, type> has a cached version of a couple of things: 
//- xRay (bc of specific proxyAndCacheDriver)
//- proxyAndCacheDriver, bc of
//  - specific custom headers per <source, type>
var resourcesPerCrawlerType = {};


//TODO: from config
//THIS SHOULD BE <SOURCE,TYPE> SPECIFIC!
//Moreover, concurrency should be distributed.
var concurrentBatches = 1;
queue.process(utils.queues.seedUrlQueueName, concurrentBatches, waitUntilWork);


function waitUntilWork(job, done) {


	var data = job.data;

	console.log("START JOB", data.url);

	if (!data.source) {
		throw new Error("'source' not defined on job: " + JSON.strinfify(job));
	}
	if (!data.type) {
		throw new Error("'type' not defined on job: " + JSON.strinfify(job));
	}

	var crawlerName = utils.calculated.getCrawlerName(data);
	var crawlerResource = resourcesPerCrawlerType[crawlerName];
	if (crawlerResource === undefined) {
		crawlerResource = resourcesPerCrawlerType[crawlerName] = createCrawlerResource(data);
	}

	//the entire crawl config as defined in /crawlers
	var crawlConfig = crawlerResource.crawlConfig,

		//the schema
		crawlSchema = crawlConfig.schema,

		//the schema of the results (a x-ray mapping)
		crawlResultSchema = crawlerResource.crawlResultSchema,

		//schema of message that needs to be put on queue
		outputMessageSchema = crawlerResource.outputMessageSchema,

		//x-ray instance specific to <source,type>
		x = crawlerResource.x;


	var crawlBatch = Promise.promisify(x(crawlSchema.seed.config.seedUrl, "html", {
		paginate: function distributedPaginate(el, cb) {
			if (crawlSchema.seed.urlToNextPage !== "urlToNextPage") {
				//no pagination
				return cb();
			}

			//upload next url to queue
			//
			//TODO: execute stop criterium
			utils.addCrawlJob(queue, data.crawlJobId, crawlConfig, crawlSchema.seed.config.nextUrl(el), cb);
		},
		results: x(crawlSchema.results.selector, [crawlResultSchema])
	}));


	crawlBatch()
		.then(function(obj) {
			return iterTrim(obj);
		})
		.then(function(obj) { //TODO: why did we have this nested again? 
			return obj.results;
		})
		.map(function(result) {

			var detail = result.detail,
				sourceId = result.sourceId,
				sourceUrl = result.sourceUrl;

			delete result.detail;
			delete result.sourceId;
			delete result.sourceUrl;

			return _.extend({
				id: uuid.v4(),
				//TODO: check what attributes should always exist in msg: 
				//- check book
				//- check guigelines for Kafka
				meta: {
					type: crawlConfig.entity.type,
					crawl: {
						crawlJob: 123, //the large job. TODO: based on crawling manager
						taskId: 132903712, //the specific mini job/batch within this crawlJob. TODO: based on crawling manager
						dateTime: new Date().toISOString(),
						crawlConfig: crawlSchema.version, //specific version for this schema, i.e.: Eventful Events v1.0
						msgSchema: outputMessageSchema.version, //specific version of the target message schema. 
					},
					source: {
						name: crawlConfig.source.name,
						id: sourceId,
						url: sourceUrl
					}
				},

			}, result, detail);
		})
		.filter(function(result) {
			// return _.filter(results, function(result) {
			// 	//This is a general filter that removes all ill-selected results, e.g.: headers and footers
			// 	//The fact that a sourceId is required allows is to select based on this. 
			// 	//It's extremely unlikely that ill-selected results have an id (as fetched by the schema) 
			// 	return result.meta.source.id;
			// });
			return result.meta.source.id;
		})
		.then(function(results) {
			_.each(results, function(result) {
				// console.log(result);
			});
		})
		.catch(function(err) {
			//Error: move job back to queue
			console.log("ERR", err);
			done(new Error("job error: orig: " + err.message));
		})
		.then(done)
		.finally(function() {
			console.log("END JOB");
		});



}



// Create a cachable crawler resource for each <source,type>-combo
function createCrawlerResource(jobData) {

	var crawlerResource = utils.init(jobData);

	var x = Xray();

	//install own driver which does: 
	//- proxying through crawlera
	//- caching using S3
	var proxyAndCacheDriver = proxyDriver({
		ctx: {
			headers: crawlerResource.crawlConfig.schema.headers
		}
	});

	x.driver(proxyAndCacheDriver);

	var out = {
		x: x,
		proxyAndCacheDriver: proxyAndCacheDriver,
		crawlConfig: crawlerResource.crawlConfig,
		outputMessageSchema: crawlerResource.outputMessageSchema,
		stats: {
			downloadedDetailPages: 0,
		},
		job: jobData,
		crawlResultSchema: _.extend({}, crawlerResource.crawlConfig.schema.results.schema(x), {
			calcPageDone: function(el, cb) {
				out.stats.downloadedDetailPages++;
				cb();
			}
		})
	};

	return out;
}

function displayStats() {
	console.log("STATS--------------");
	_.each(resourcesPerCrawlerType, function(resource) {
		console.log("downladed detail pages: " + resource.stats.downloadedDetailPages +
			" - for <" + resource.job.source + "," + resource.job.type + ">");
	});
}

(function checkIfDone() {
	async.parallel([
		function(cb) {
			//check nr inactive (i.e.: queued)
			queue.inactiveCount(utils.queues.seedUrlQueueName, cb);
		},
		function(cb) {
			//check nr active in this process. 
			//TODO: this is a distrbuted check, while a local check should be enough (and better?)
			queue.activeCount(utils.queues.seedUrlQueueName, cb);
		},
		function(cb) {
			//TODO:  no more busy seeds -> check in redis
			cb(undefined, 0);
		}
	], function(err, lengths) {

		if (err) {
			throw err;
		}
		var countTotal = _.reduce(lengths, function(total, len) {
			return total + len;
		}, 0);

		displayStats();

		if (countTotal) { //busy -> check when 
			setTimeout(checkIfDone, 5000);
		} else {
			console.log("DONE");
			//TODO: for each proxyAndCacheDriver
			// proxyAndCacheDriver.redisCache.db.quit();
			// setTimeout(process.exit, 1000);
		}
	});
}());


////////////
//HELPERS //
////////////

//iteratively walks object and trims all strings
function iterTrim(obj, key) {
	if (_.isDate(obj)) {
		return obj;
	} else if (_.isArray(obj)) {
		return _.map(obj, iterTrim);
	} else if (_.isObject(obj)) {
		return _.reduce(obj, function(agg, prop, key) {
			agg[key] = iterTrim(prop, key);
			return agg;
		}, {});
	} else if (_.isString(obj)) {
		obj = _.trim(obj);
		return obj;
	} else {
		return obj;
	}
}
