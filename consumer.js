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

var debug = require('debug')('kwhen-crawler');
var argv = require('yargs').argv;
var moment = require("moment");
// var Ajv = require('ajv');

var utils = require("./utils");
var proxyDriver = require("./drivers/proxyDriver");

var generatedSchemas = require("./schemas/domain/createDomainSchemas.js")({
	checkSoundness: true,
	config: require("./schemas/domain/_definitions/config"),
	properties: require("./schemas/domain/_definitions").properties,
	types: require("./schemas/domain/_definitions").types,
	schemaOrgDef: require("./schemas/domain/_definitions/schemaOrgDef")
});

var domainObjects = require("./schemas/domain/DomainObjects")(generatedSchemas);
var CanonicalObject = domainObjects.CanonicalObject;
var SourceObject = domainObjects.SourceObject;

var domainUtils = require("./schemas/domain/utils");



///////////////
//validation //
///////////////
// var ajv = Ajv({
// 	allErrors: true
// });

// ajv.addFormat("date-time", function(dateTimeString) {
// 	var m = moment(dateTimeString);
// 	return m.isValid();
// });

// var abstractTypeSchema = require("./schemas/abstract");
// var validateAbstractSchema = ajv.compile(abstractTypeSchema.schema);

var queue = kue.createQueue({
	prefix: utils.KUE_PREFIX,
});


var functionLib = {
	"float": function(val) {
		if (val === undefined) return undefined;
		try {
			val = parseFloat(val);
		} catch (err) {
			//swallow: if json mapping is correct we'll catch this next
		}
		return val;
	},
	"int": function(val) {
		if (val === undefined) return undefined;
		try {
			val = parseInt(val);
		} catch (err) {
			//swallow: if json mapping is correct we'll catch this next
		}
		return val;
	}
};


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


///////////////////////////////
// Start <source,type> queue //
///////////////////////////////
function startCrawlerQueue(crawlConfig) {

	var crawlerName = utils.calculated.getCrawlerName(crawlConfig.source.name, crawlConfig.entity.type);

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
		stats: {
			intervalMS: 5000, // 5 seconds
			total: {
				nrDetailPages: 0,
				nrItemsComplete: 0,
				nrItemsPruned: 0,
				nrItemsFailedToValidate: 0,
				nrErrorsNonValidation: 0, //TODO: can we get more granular?
				unzippedInBytes: 0
			}
		},
		crawlResultSchema: _.extend({}, crawlConfig.schema.results.schema(x), {
			//add _htmlDetail for transormers to use. See #30
			_htmlDetail: function(el, cb) {
				cb(undefined, el.html());
			},
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

		//x-ray instance specific to <source,type>
		x = crawlerResource.x;

	function doFieldMappings(mappingName) {
		return function(results) {

			//transform results using declarative `mappings`
			if (!crawlConfig.schema.results[mappingName]) {
				return results;
			}
			return _.map(results, function(result) {

				_.each(crawlConfig.schema.results[mappingName], function(pipeline, path) {

					var needle = path.lastIndexOf("."),
						parent = ~needle ? _.property(path.substring(0, needle))(result) : result,
						childKey = ~needle ? path.substring(needle + 1) : path;

					pipeline = _.isArray(pipeline) ? pipeline : [pipeline];

					//transform pipeline of single field
					parent[childKey] = _.reduce(pipeline, function(val, stage) {
						var stageFn = _.isString(stage) ? functionLib[stage] : stage;
						if (!stageFn) {
							throw "canned transformer not available: '" + stage + "'. You should choose from '" + _.keys(functionLib).join(",") + "'";
						}
						return stageFn(val, result);
					}, parent[childKey]);

				});
				return result;
			});
		};
	}

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
						stopArr = _.isArray(stopArr) ? stopArr : [stopArr];

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
		.then(doFieldMappings("mapping"))
		.then(function callCustomReducer(results) {
			if (!crawlConfig.schema.results.reducer) {
				return results;
			}

			//reducer may output an array for an item
			//Lets fuse this (potential) array of arrays to an array by simply concatting
			return _.compact(_.reduce(results, function(arr, result) {
				var out = crawlConfig.schema.results.reducer(result);
				return arr.concat(_.isArray(out) ? out : [out]);
			}, []));
		})
		.then(doFieldMappings("postMapping"))
		.then(function customPruner(results) {
			if (!crawlConfig.schema.results.pruner) {
				return results;
			}
			return _.reduce(results, function(arr, result) {
				var out = crawlConfig.schema.results.pruner(result);
				out = _.isArray(out) ? out : [out];
				_.each(out, function(o) {
					if (o !== undefined) {
						arr.push(o);
					} else {
						crawlerResource.stats.total.nrItemsPruned++;
					}
				});
				return arr;
			}, []);
		})
		.map(function makeCompoundDoc(result) {


			var detail = result._detail;
			delete result._detail;

			// create compound doc object by fusing `detail` into toplevel
			// sourceId and sourceUrl may occur on either toplevel or on `detail`
			return _.extend(result, detail);
		})
		.filter(function genericPrunerToCheckForSourceId(doc) {
			//This is a generic filter that removes all ill-selected results, e.g.: headers and footers
			//The fact that a sourceId is required allows is to select based on this. 
			//It's extremely unlikely that ill-selected results have an id (as fetched by the schema)
			//
			//Moreover, it will remove results that are falsey. This can happen if we: 
			//- explicitly remove results by returning undefined in a `reducer`

			var doPrune = !(doc && doc._sourceId);
			if (doPrune) {
				crawlerResource.stats.total.nrItemsPruned++;
			}
			return !doPrune; //return true when we should NOT prune
		})
		.map(function transformToGenericOutput(doc) {

			var domainObject = new SourceObject({
				type: [crawlConfig.entity.type], //TODO: hmm how to vary in this? 
				sourceType: crawlConfig.source.name,
				sourceId: doc._sourceId, //required
				sourceUrl: doc._sourceUrl, //optional
			});

			delete doc._sourceId;
			delete doc._sourceUrl;

			//Private vars such as `_htmlDetail` are removed. 
			//These can be used in transformers etc.
			_.each(doc, function(v, k) {
				if (k.indexOf("_") === 0) { //don't remove
					delete doc[k];
				}
			});

			domainObject.set(doc);

			//TODO: still to process / save in same way?
			//We do at least want to save crawlVersion and schemaVersion 
			// crawl: {
			// 	batchId: parseInt(data.batchId), //the large batch.
			// 	jobId: data.jobId, //the specific mini job within this batch. 
			// 	createdAt: new Date().toISOString(),
			// 	crawlVersion: crawlSchema.version, //specific version for this schema, i.e.: Eventful Events v1.0
			// 	typeVersion: outputMessageSchema.version, //specific version of the target message/type schema. 
			// }

			return domainObject;
		})
		.then(function commitSourceObjects(sourceObjects) {

			//Validate and upsert objects. 
			//We don't fail batch if single item results in a validation error. 
			//All other errors, still *do* result in a complete batch failure, although at that point some 
			//objects may have been upserted already. This is not a big deal because idempotence.
			var promises = _.map(sourceObjects, function(obj) {
				return new Promise(function(resolve, reject) {
					obj.commit(function(err) {
						if (err) {
							return reject(err); //actual error in code (non-validation)
						}
						resolve(obj);
					});
				}).reflect(); //reflect results in no error thrown ever
			});

			return Promise.all(promises)
				.each(function(inspection) { //insepection API because we used `reflect()` above
					if (inspection.isRejected()) {

						var err = inspection.reason();

						if (err.isValidationError) {
							crawlerResource.stats.total.nrItemsFailedToValidate++;

							//TODO: log errors
							//1. sourceUrl / sourceId
							//2. _state.errors
							//3. crawlId (which version of this crawler)  + schemaId
							console.error("A promise in the array was rejected with", err);

							return;
						}

						//it's not a validation error. So we throw it which will fail -> reschedule the batch.
						throw err;

					} else {
						if (inspection.isFulfilled()) {

							crawlerResource.stats.total.nrItemsComplete++;
						} else if (inspection.isCancelled()) {
							throw new Error("SANITY CHECK: we don't cancel promises!");
						} else {
							throw new Error("SANITY CHECK: promise inspection in unclear state? NOT fulfilled / rejected / cancelled");
						}
					}
				});

		})
		.then(done)
		.catch(function(err) {
			throw err;
		});
	// .catch(function catchall(err) {
	// 
	// No validationErrors here since these are not thrown, only logged. 
	// 
	// 	if (err.halt) {
	// 		//errors that require immediate halting are thrown
	// 		throw err;
	// 	}

	// crawlerResource.stats.total.nrErrorsNonValidation++;

	// 	// if (err.code === "ENOTFOUND") {
	// 	// 	throw err; //CHECK THIS
	// 	// }

	// 	// if (err.code === "ECONNABORTED") {
	// 	// 	//likely timeout -> move back to queue

	// 	// }

	// 	//Non-200 http codes are treated as errors. 
	// 	//These error-objects are huge so we extract only the needed info here
	// 	if (err.status) {
	// 		var errTmp = new Error(err.message);
	// 		errTmp.status = err.status;
	// 		err = errTmp;
	// 	}

	// 	console.log("ERR", err);
	// 	done(new Error("job error: orig: " + err.message));

	// })
	// .catch(function severe(err) {
	// 	//TODO: we might do some cleanup here?
	// 	console.log("SEVERE ERR", err);
	// 	process.exit();
	// });

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


		function showStats(limitToFields) {
			//Show some stats
			console.log("#####", resource.crawlerName);
			console.log(_.extend(generateStats(resource, limitToFields), {
				"QUEUE": {
					inactiveCount: lengths[0],
					activeCount: lengths[1]
				}
			}));
		}

		if (argv.showStats) {
			showStats();
		} else {
			showStats(["nrItemsComplete"]);
		}

		if (countTotal) { //busy -> check when 
			setTimeout(function() {
				manageCrawlerLifecycle(resource);
			}, resource.stats.intervalMS);
		} else {
			showStats(); //always show stats on shutdown
			console.log("SHUTDOWN ", resource.crawlerName);
			resource.isDone = true;
		}
	});
}

function generateStats(resource, limitToFields) {

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
	var out = {

		"TOTAL": resource.stats.total,

		"PER_SECOND": perSecond,

		//Total average / second
		"AVG_PER_SECOND": _.reduce(resource.stats.total, function(agg, v, k) {
			agg[k] = parseFloat((resource.stats.totalMS ? v * 1000 / resource.stats.totalMS : 0).toFixed(2));
			return agg;
		}, {})
	};
	if (!limitToFields) {
		return out;
	}
	return {
		TOTAL: _.reduce(out.TOTAL, function(agg, v, k) {
			if (~limitToFields.indexOf(k)) {
				agg[k] = v;
			}
			return agg;
		}, {}),
		PER_SECOND: _.reduce(out.PER_SECOND, function(agg, v, k) {
			if (~limitToFields.indexOf(k)) {
				agg[k] = v;
			}
			return agg;
		}, {}),
		AVG_PER_SECOND: _.reduce(out.AVG_PER_SECOND, function(agg, v, k) {
			if (~limitToFields.indexOf(k)) {
				agg[k] = v;
			}
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
