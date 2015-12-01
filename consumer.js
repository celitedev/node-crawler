var _ = require("lodash");
var Xray = require('x-ray');
var uuid = require("uuid");
var argv = require('yargs').argv;
var path = require("path");
var fs = require("fs");

var kue = require('kue');
var colors = require('colors');
var validUrl = require('valid-url');

var Promise = require("bluebird");
var async = require('async');
var ZSchema = require("z-schema");

var debug = require('debug')('kwhen-crawler');
var argv = require('yargs').argv;

var utils = require("./utils");
var proxyDriver = require("./drivers/proxyDriver");

var abstractTypeSchema = require("./schemas/abstract");

var jsonValidator = new ZSchema({
	breakOnFirstError: false
});


var queue = kue.createQueue({
	prefix: utils.KUE_PREFIX,
});

//DNS caching such as http://manpages.ubuntu.com/manpages/natty/man8/nscd.8.html
console.log("Remembered to install proper DNS caching on the box such as nscd?".green);

var resourcesPerCrawlerType = {};

if (argv.source && argv.type) {
	var specificCrawler = utils.calculated.getCrawlerName(argv.source, argv.type);
	console.log(("consuming jobs for specific crawler: " + specificCrawler).yellow);
} else {
	console.log(("consuming jobs for all crawlers").yellow);
}
////////////////////////////
//initialize all crawlers //
////////////////////////////
var normalizedPath = path.join(__dirname, "crawlers");
fs.readdirSync(normalizedPath).forEach(function(file) {
	var stat = fs.statSync(path.join(normalizedPath, file));
	if (stat.isFile()) {
		if ((specificCrawler && file === specificCrawler + ".js") || !specificCrawler) {
			startCrawlerQueue(require("./crawlers/" + file));
		} else {
			console.log(("skipping jobs for crawler: " + file.substring(0, file.lastIndexOf("."))).yellow);
		}
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

						var paginateConfig = crawlSchema.seed;

						//if no nextUrlFN function -> skip
						if (!paginateConfig.nextUrlFN) {
							return cb();
						}

						//disable pagination (used for testing)
						if (paginateConfig.disable) {
							return cb();
						}

						var nextUrl = paginateConfig.nextUrlFN(el);
						debug("url", data.url);
						debug("nexturl", nextUrl);

						//sometimes the next url just isn't there anymore. 
						//That's an easy and strong signal to stop bothering
						if (!validUrl.isUri(nextUrl)) {
							return cb();
						}

						//check if nextUrl is the same as currentUrl. 
						//If so -> quit
						if (nextUrl === data.url) {
							return cb();
						}

						//... otherwise there might be more domain specific ways in which to pick up signal that we're done
						var stopCriteriaFound = false;

						stopArr = paginateConfig.stop || [];
						stopArr = _.isArray(paginateConfig.stop) ? paginateConfig.stop : [paginateConfig.stop];

						_.each(stopArr, function(stop) {
							if (_.isString(stop)) {
								stop = {
									name: stop
								};
							}
							switch (stop.name) {
								case "zeroResults":
									//no results found -> stopCriteriaFound = true
									var filterFN = stop.selectorPostFilter || function(results) {
										return true;
									};
									if (!_.filter(el.find(crawlSchema.results.selector), filterFN)) {
										stopCriteriaFound = true;
									}
									break;

								default:
									console.log("stop-criteria not supported (and ignored)", stop.name);
							}
						});

						if (stopCriteriaFound) {
							return cb();
						}

						//upload next url to queue
						utils.addCrawlJob(queue, data.batchId, crawlConfig, nextUrl, cb);
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
		.then(function trimWhiteSpaceRecursively(obj) {
			return iterTrim(obj);
		})
		.then(function returnResultsAttrib(obj) {
			return obj.results;
		})
		.filter(function genericPrunerToCheckForSourceId(result) {
			//This is a generic filter that removes all ill-selected results, e.g.: headers and footers
			//The fact that a sourceId is required allows is to select based on this. 
			//It's extremely unlikely that ill-selected results have an id (as fetched by the schema)
			return result.sourceId;
		})
		.map(function transformToGenericOutput(result) {

			var detail = result.detail,
				sourceId = result.sourceId,
				sourceUrl = result.sourceUrl;

			delete result.detail;

			return _.extend({
				id: uuid.v4(),
				//TODO: check what attributes should always exist in msg: 
				//- check EIP book
				//- check guidelines for Kafka
				meta: {
					crawl: {
						batchId: parseInt(data.batchId), //the large batch.
						jobId: data.jobId, //the specific mini job within this batch. 
						createdAt: new Date().toISOString(),
						crawlVersion: crawlSchema.version, //specific version for this schema, i.e.: Eventful Events v1.0
						typeVersion: outputMessageSchema.version, //specific version of the target message/type schema. 
					},
				},
				identifiers: {
					id: sourceId,
					url: sourceUrl,
					source: crawlConfig.source.name,
					type: crawlConfig.entity.type,
				},
				payload: _.extend({}, result, detail)
			});
		})
		.then(function validateGenericEnvelopeSchema(results) {

			_.each(results, function(result) {
				var valid = jsonValidator.validate(result, abstractTypeSchema.schema);
				if (!valid) {
					var errors = jsonValidator.getLastErrors();
					console.log("TODO: throw eerrors bc coding error: validation errors on generic/evelope schema", errors);
				}
			});
			return results;
		})
		.then(function validateSpecificTypeSchema(results) {
			//TODO: #25: validate messages against JSON schema of particular schema
			return results;
		})
		.then(function postMessagesToQueue(results) {
			_.each(results, function(result) {
				//push them to other queue
			});
		})
		.then(done)
		.catch(function(err) {

			// if (err.code === "ENOTFOUND") {
			// 	throw err; //CHECK THIS
			// }

			// if (err.code === "ECONNABORTED") {
			// 	//likely timeout -> move back to queue

			// }

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
			total: {
				nrDetailPages: 0,
				unzippedInBytes: 0
			}
		},
		crawlResultSchema: _.extend({}, crawlConfig.schema.results.schema(x), {
			calcPageDone: function(el, cb) {
				resource.stats.total.nrDetailPages++;
				cb();
			}
		})
	};

	proxyAndCacheDriver.setTotalStats(resource.stats.total);

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
			//TODO:  no more busy seeds: relates to #23
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
		var prev = resource.stats.totalPrev = {};

		_.each(resource.stats.total, function(v, k) {
			prev[k] = 0;
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

		"PER_SECOND": perSecond,

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
