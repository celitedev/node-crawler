var request = require('request');
var Promise = require("bluebird");

var config = require("../../config");

var searchQueryParserUrl = "http://" + config.search_query_parser.host + ":" + config.search_query_parser.port;

function parseQuestion( question ){
  return new Promise(function(resolve, reject) {
    request.post({
        url: searchQueryParserUrl,
        form: { text: question, utcOffset:-5}}, //TODO SEARCH QUERY PARSER add real offset from client side
      function (err, res, body) {
        if(err){
          return reject(err);
          //console.log("err: ", err); //DEBUG
        }
        if(res.statusCode != 200){
          var throwErr = new Error("Error in search_query_parser: " + body);
          throwErr.status = res.statusCode;
          return reject(throwErr);
        }
        return resolve(body);
      });
  });
}

module.exports = {
  parseQuestion: parseQuestion
};