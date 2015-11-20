var _ = require("lodash");
var Xray = require('x-ray');
var JSONStream = require('JSONStream');
var h = require("highland");
var uuid = require("uuid");
var argv = require('yargs').argv;
var path = require("path");

var proxyDriver = require("./drivers/proxyDriver");

if (!argv.crawler) {
	throw new Error("command-line arg 'crawler' not defined");
}

var x = Xray(),
	crawlSchema,
	crawlResultSchema,
	outputschema;

//////////
//stats //
//////////
var downloadedDetailPages = 0;


/////////////////
//load schemas + some validation //
/////////////////
try {
	var crawlerSchemaPath = path.resolve(__dirname + "/crawlers/" + argv.crawler);

	crawlSchema = require(crawlerSchemaPath);

	if (crawlSchema.schema.requiresJS) {
		throw new Error("requiresJS not supported atm, since we've not implemented caching + prxying yet");
		// var phantom = require('x-ray-phantom');
		// x.driver(phantom());
	}


	crawlResultSchema = _.extend(crawlSchema.schema.results.schema(x), {
		calcPageDone: function(el, cb) {
			downloadedDetailPages++;
			cb();
		}
	});

} catch (err) {
	throw new Error("crawler not found: " + argv.crawler);
}


//install own dirver which does: 
//- proxying through crawlera
//- caching using S3
var proxyAndCacheDriver = proxyDriver({
	ctx: {
		headers: crawlSchema.schema.headers
	}
});
x.driver(proxyAndCacheDriver);


try {
	var outputSchemaName = crawlSchema.entity.type.toLowerCase();
	var outputSchemaPath = path.resolve(__dirname + "/schemas/" + outputSchemaName);
	outputschema = require(outputSchemaPath);
} catch (err) {
	throw new Error("outputschema not found for entitytype: " + outputSchemaName);
}


////////////////////////
//start feedback loop //
////////////////////////
var isDone = false;
(function signalProcess() {
	console.log("nr of detail pages downloaded", downloadedDetailPages);
	if (!isDone) {
		setTimeout(signalProcess, 1000);
	}
}());


/////////////////////
//Start processing, which involves streaming results
//
//LATER: we might improve on this since currenly we only start streaming when batch is done completely
//which is completely moot. Instead we might want to look into how to process 1 result at a time when done
/////////////////////
var rawObjectStream = x(crawlSchema.schema.seed.config.seedUrl, "html", {
		paginate: function distributedPaginate(el, cb) {
			if (crawlSchema.schema.seed.urlToNextPage !== "urlToNextPage") {
				//no pagination
				return cb();
			}
			//upload next url to queue
			console.log("PAGINATE URL STORED IN QUEUE", crawlSchema.schema.seed.config.nextUrl(el));
			//TODO: execute stop criterium
			cb();
		},
		results: x(crawlSchema.schema.results.selector, [crawlResultSchema])
	})
	.write()
	.on('error', function(err) {
		console.log("rawstream ERROR ", err);
	})
	.on('close', function(err) {
		console.log("rawstream CLOSE ", err);
	})
	.pipe(JSONStream.parse('results.*'));


// ////////////////////
// //filter a stream //
// ////////////////////
var jsonObjectStream = h(rawObjectStream)
	.map(function(obj) {
		return iterTrim(obj);
	})
	.map(function(obj) {
		var detail = obj.detail,
			sourceId = obj.sourceId,
			sourceUrl = obj.sourceUrl;

		delete obj.detail;
		delete obj.sourceId;
		delete obj.sourceUrl;

		return _.extend({
			id: uuid.v4(),
			//TODO: check what attributes should always exist in msg: 
			//- check book
			//- check guigelines for Kafka
			meta: {
				type: crawlSchema.entity.type,
				crawl: {
					crawlJob: 123, //the large job. TODO: based on crawling manager
					taskId: 132903712, //the specific mini job/batch within this crawlJob. TODO: based on crawling manager
					dateTime: new Date().toISOString(),
					crawlSchema: crawlSchema.schema.version, //specific version for this schema, i.e.: Eventful Events v1.0
					msgSchema: outputschema.version, //specific version of the target message schema. 
				},
				source: {
					name: crawlSchema.source.name,
					id: sourceId,
					url: sourceUrl
				}
			},

		}, obj, detail);

	})
	.filter(function(obj) {
		//This is a general filter that removes all ill-selected results, e.g.: headers and footers
		//The fact that a sourceId is required allows is to select based on this. 
		//It's extremely unlikely that ill-selected results have an id (as fetched by the schema) 
		return obj.meta.source.id;
	})
	.map(stringify)
	.on('error', function(err) {
		console.log("jsonObjectStream ERROR ", err);
	})
	.on('end', function() {
		//succesfull end of stream. 
		//Everything read and processed. 

		//TODO: 
		//- add msg to S3 (enrich with DT of complete) (NOTE: make sure clocks are in sync)
		//- deleted msg from input queue
		console.log("signal batch is done. E.g.: remove from Kafka");
		isDone = true;

		//shutdown redis
		proxyAndCacheDriver.redisCache.db.quit();
		setTimeout(process.exit, 1000);
	})
	.pipe(process.stdout);



////////////
//HELPERS //
////////////
function stringify(json) {
	return JSON.stringify(json, null, 4) + '\n';
}

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
