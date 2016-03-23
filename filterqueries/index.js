var elasticsearch = require('elasticsearch');

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")({
  checkSoundness: true,
  config: require("../schemas/domain/_definitions/config"),
  properties: require("../schemas/domain/_definitions").properties,
  types: require("../schemas/domain/_definitions").types,
  schemaOrgDef: require("../schemas/domain/_definitions/schemaOrgDef")
});


var config = require("../config");

//Rethink
var r = require('rethinkdbdash')(config.rethinkdb);

//Elasticsearch 
var esClient = new elasticsearch.Client(config.elasticsearch);


/////////////
//EXPRESS GENERAL SETUP //
/////////////

var express = require('express');
var cors = require('cors');
var app = express();
var bodyParser = require('body-parser');
var methodOverride = require('method-override');

app.use(cors());
app.use(bodyParser());
app.use(methodOverride());


var command = {
  app: app,
  generatedSchemas: generatedSchemas,
  r: r,
  config: config,
  esClient: esClient
};

///////////////
//add routes //
///////////////
require("./routes/filterQueries")(command);
// require("./routes/nlp")(command);



///////////////////
//Error HAndling //
///////////////////
app.use(function jsonErrorHandler(err, req, res, next) {
  console.error(err.stack);

  var status = 500;
  res.status(status).json({
    meta: {
      status: status,
      filterQuery: err.filterQuery
    },
    error: err.message
  });
});


/////////////////
//Start Server //
/////////////////
app.server = app.listen(3000, function () {
  console.log(('Tester for Kwhen FilterQueries. Do a POST to localhost:3000 to get started').yellow);
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
