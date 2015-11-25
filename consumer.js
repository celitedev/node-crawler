var _ = require("lodash");
var Xray = require('x-ray');
var uuid = require("uuid");
var argv = require('yargs').argv;
var path = require("path");
var fs = require("fs");
var proxyDriver = require("./drivers/proxyDriver");
var kue = require('kue');

var utils = require("./utils");

var Promise = require("bluebird");
var async = require('async');

var MA = require('moving-average');

var queue = kue.createQueue({
	prefix: utils.KUE_PREFIX,
});


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

////////////////////////////
//initialize all crawlers //
////////////////////////////
var normalizedPath = path.join(__dirname, "crawlers");
fs.readdirSync(normalizedPath).forEach(function(file) {
	var stat = fs.statSync(path.join(normalizedPath, file));
	if (stat.isFile()) {
		startCrawlerQueue(require("./crawlers/" + file));
	}
});


////////////////////////
//Process actual work //
////////////////////////
function processJob(job, done) {

	var data = job.data;

	if (!data.source) {
		throw new Error("'source' not defined on job: " + JSON.strinfify(job));
	}
	if (!data.type) {
		throw new Error("'type' not defined on job: " + JSON.strinfify(job));
	}

	var crawlerName = utils.calculated.getCrawlerName(data);
	var crawlerResource = resourcesPerCrawlerType[crawlerName];
	if (crawlerResource === undefined) {
		throw new Error("crawler not found: " + crawlerName);
		//LATER: might want to add hot loading here.
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

	Promise.resolve()
		.then(function() {
			return new Promise(function(resolve, reject) {
				x(data.url, "html", {

					//pagination
					paginate: function distributedPaginate(el, cb) {
						if (crawlSchema.seed.type !== "urlToNextPage") {
							//no pagination
							return cb();
						}

						var paginateConfig = crawlSchema.seed.config;

						//disable pagination (used for testing)
						if (paginateConfig.disable) {
							return cb();
						}

						//upload next url to queue
						//TODO: execute stop criterium
						utils.addCrawlJob(queue, data.crawlJobId, crawlConfig, paginateConfig.nextUrl(el), cb);
					},

					//results crawling
					results: x(crawlSchema.results.selector, [crawlResultSchema])
				})(function(err, obj) {
					if (err) {
						return reject(err);
					}
					resolve(obj);
				});
			});
		})
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
				//- check EIP book
				//- check guidelines for Kafka
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
				//push them to other queue
			});
		})
		.then(done)
		.catch(function(err) {
			//Error: move job back to queue
			console.log("ERR", err);
			done(new Error("job error: orig: " + err.message));
		});

}

///////////////////////////////
// Start <source,type> queue //
///////////////////////////////
function startCrawlerQueue(crawlConfig) {

	var crawlerName = utils.calculated.getCrawlerName(crawlConfig.source.name, crawlConfig.entity.type);

	var outputMessageSchema;
	try {
		var outputSchemaName = crawlConfig.entity.type.toLowerCase();
		var outputSchemaPath = path.resolve(__dirname + "/schemas/" + outputSchemaName);
		outputMessageSchema = require(outputSchemaPath);
	} catch (err) {
		throw new Error("outputMessageSchema not found for entitytype: " + outputSchemaName);
	}

	var x = Xray();

	//install own driver which does: 
	//- proxying through crawlera
	//- caching using S3
	var proxyAndCacheDriver = proxyDriver(crawlConfig.driver);

	x.driver(proxyAndCacheDriver);

	var resource = resourcesPerCrawlerType[crawlerName] = {
		x: x,
		crawlerName: crawlerName,
		queueName: utils.calculated.getCrawlerQueueName(crawlConfig),
		proxyAndCacheDriver: proxyAndCacheDriver,
		crawlConfig: crawlConfig,
		outputMessageSchema: outputMessageSchema,
		stats: {
			intervalMS: 5000, // 5 seconds
			intervalMovingAverageMS: 5 * 60 * 1000, //5 minutes
			total: {
				nrDetailPages: 0,
			}
		},
		crawlResultSchema: _.extend({}, crawlConfig.schema.results.schema(x), {
			calcPageDone: function(el, cb) {
				resource.stats.total.nrDetailPages++;
				cb();
			}
		})
	};

	//start queue for this crawl
	queue.process(
		resource.queueName,
		crawlConfig.job.concurrentJobs,
		processJob
	);

	manageCrawlerLifecycle(resource);
}



////////////////////
//manage lifecyle of specific crawler: 
//- periodicially check if done and gracefully shutdown
//- report stats
////////////////////
function manageCrawlerLifecycle(resource) {

	async.parallel([
		function(cb) {
			//check nr inactive (i.e.: queued)
			queue.inactiveCount(resource.queueName, cb);
		},
		function(cb) {
			//check nr active in this process. 
			queue.activeCount(resource.queueName, cb);
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

		//Show some stats
		console.log("#####", resource.crawlerName);
		console.log(_.extend(generateStats(resource), {
			"QUEUE": {
				inactiveCount: lengths[0],
				activeCount: lengths[1]
			}
		}));

		if (countTotal) { //busy -> check when 
			setTimeout(function() {
				manageCrawlerLifecycle(resource);
			}, resource.stats.intervalMS);
		} else {
			console.log("SHUTDOWN ", resource.crawlerName);
			resource.isDone = true;
		}
	});
}

function generateStats(resource) {

	//INIT
	if (!resource.stats.totalPrev) {

		//init totalPrev to 0 for all values
		var prev = resource.stats.totalPrev = {},
			movingAverages = resource.stats.movingAverages = {};

		//init moving averages
		_.each(resource.stats.total, function(v, k) {
			prev[k] = 0;
			movingAverages[k] = MA(resource.stats.intervalMovingAverageMS);
		});
	}

	resource.stats.totalMS = resource.stats.totalMS + resource.stats.intervalMS || 0;

	//calculate delta. I.e.: totals changed since last check (in resource.stats.intervalMS interval)
	var delta = _.reduce(resource.stats.total, function(agg, v, k) {
		agg[k] = v - resource.stats.totalPrev[k];
		return agg;
	}, {});

	//from delta -> perSecond
	var perSecond = _.reduce(delta, function(agg, v, k) {
		agg[k] = v * 1000 / resource.stats.intervalMS; //multiplication first
		return agg;
	}, {});



	resource.stats.totalPrev = _.cloneDeep(resource.stats.total);
	return {

		"TOTAL": resource.stats.total,

		// "DELTA": delta,

		"PER_SECOND": perSecond,

		//exponential moving average / second
		"MAE_PER_SECOND": _.reduce(perSecond, function(agg, v, k) {
			var ma = resource.stats.movingAverages[k];
			ma.push(Date.now(), v);
			agg[k] = parseFloat((ma.movingAverage()).toFixed(2));
			return agg;
		}, {}),

		//Total average / second
		"AVG_PER_SECOND": _.reduce(resource.stats.total, function(agg, v, k) {
			agg[k] = parseFloat((resource.stats.totalMS ? v * 1000 / resource.stats.totalMS : 0).toFixed(2));
			return agg;
		}, {})
	};
}



///////////////////////////////////
//checker to shutdown everything //
///////////////////////////////////
(function manageShutdown() {

	//If all resources are set to isDone -> we're done with everything
	//and can gracefully shutdown the entire process: 
	//1. shutdown queue (which is shared between crawlers)
	//2. process.exit()

	var resources = _.values(resourcesPerCrawlerType),
		resourcesDone = _.filter(resources, {
			isDone: true
		});

	if (resources.length !== resourcesDone.length) {
		setTimeout(manageShutdown, 1000);
	} else {
		queue.shutdown(5000, function(err) {
			console.log("SHUTDOWN ALL");
			process.exit(0);
		});
	}
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
