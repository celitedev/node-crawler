var elasticsearch = require('elasticsearch');
var Promise = require("bluebird");
var redis = Promise.promisifyAll(require("redis"));

var _ = require("lodash");

var domainConfig = require("../schemas/domain/_definitions/config");

var domainUtils = require("../schemas/domain/utils");

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")({
  checkSoundness: true,
  config: domainConfig,
  properties: require("../schemas/domain/_definitions").properties,
  types: require("../schemas/domain/_definitions").types,
  schemaOrgDef: require("../schemas/domain/_definitions/schemaOrgDef")
});

var roots = domainConfig.domain.roots;

var config = require("../config");

//Rethink
var r = require('rethinkdbdash')(config.rethinkdb);

//Elasticsearch 
var esClient = new elasticsearch.Client(config.elasticsearch);

//Redis
var redisClient = redis.createClient(config.redis);


/////////////
//EXPRESS GENERAL SETUP //
/////////////

var express = require('express');
var cors = require('cors');
var bodyParser = require('body-parser');
var expressValidator = require('express-validator');
var methodOverride = require('method-override');

var app = express();

app.use(cors());
app.use(bodyParser());
app.use(expressValidator({
 customValidators: {
    isContainedInArray: function(value, arr) {
        return ~arr.indexOf(value);
    },
    isEmails: function(value) {
      var allValid = true;
      _.each(value.split(";"), function(email){
        email = email.trim(); 
        if(!(!email || expressValidator.validator.isEmail(email))){
          allValid = false;
        }
      });
      return allValid; 
    }
 }
})); 
app.use(methodOverride());


var command = {
  app: app,
  roots: roots,
  generatedSchemas: generatedSchemas,
  r: r,
  config: config,
  esClient: esClient,
  redisClient: redisClient,
  erdEntityTable: r.table(domainUtils.statics.ERDTABLE),
  sourceEntityTable: r.table(domainUtils.statics.SOURCETABLE),
  erdMappingConfig: require("../schemas/es_schema")(generatedSchemas),
  rootUtils: require("../schemas/domain/utils/rootUtils")(generatedSchemas),
  cacheUtils: null, //require("./_nlp_deprecated/cacheUtils").loadCache(redisClient)
};

command.filterQueryUtils = require("./filterQueryUtils")(command);

app.internalRoutes = {}; 


///////////////
//add routes //
///////////////
require("./routes/filterQueries")(command);
require("./routes/search")(command);
require("./routes/entities")(command);
require("./routes/suggest")(command);
require("./routes/share")(command);
// require("./routes/reloadNLP")(command); //part of deprecated NLP



///////////////////
//Error HAndling //
///////////////////
app.use(function jsonErrorHandler(err, req, res, next) {
  console.log("########### ERROR PRINTED IN jsonErrorHandler");
  console.error(err.stack);

  var status = err.status || 500;
  var statusInBody = status;

  //if status = 400 (bad request) and frontend wishes bad request to be passed as 200
  //-> let's do that then.
  if (req.body.badRequestIs200 && status === 400) {
    status = 200;
  }
  res.status(status).json({
    meta: {
      status: statusInBody,
      filterQuery: err.filterQuery
    },
    error: err.message,
    details: err.details
  });
});



/////////////////////
//MAnagement stuff //
/////////////////////
function exitHandler(options, err) {

  if (options.cleanup) {
    app.server.close();
    r.getPoolMaster().drain(); //quit
  }
  if (err) console.log(err.stack);
  if (options.exit) {
    console.log("Quitting");
    process.exit();
  }
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, {
  cleanup: true
}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {
  exit: true
}));



/////////////////
//Start Server //
/////////////////
app.server = app.listen(3000, function () {
  console.log(('Tester for Kwhen FilterQueries. Do a POST to localhost:3000 to get started').yellow);
});
