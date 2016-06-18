var Promise = require('bluebird');
var _ = require("lodash");
require("colors");
var env = process.env.NODE_ENV || "dev";

var config = {
  dev: {
    redis: {
      host: "localhost",
      port: 6379
    },

    //https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html
    elasticsearch: {
      host: 'http://ec2-52-91-153-20.compute-1.amazonaws.com:9200',
      // log: 'trace',
      apiVersion: "2.1",
      // maxSockets: 10, //default
      // defer: function() { //overwrite how ES makes promises
      //  return Promise.defer();
      // }
    },

    rethinkdb: {
      pool: true, //default = true
      //true is interesting:  When true, the driver will regularly pull data from the table server_status 
      //to keep a list of updated hosts, default false
      //TBD: check if useul to put to true.
      discovery: false,
      db: "kwhen", //default databse if non is mentioned
      servers: [{
        host: 'localhost',
        port: 28015
      }],
      buffer: 50,
      max: 1000
    }
  },
  prod_remote: {
    redis: {
      host: "localhost",
      port: 6379
    },

    //https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html
    elasticsearch: {
      host: 'http://ec2-54-236-244-71.compute-1.amazonaws.com:9200',
      // log: 'trace',
      apiVersion: "2.1",
      // maxSockets: 10, //default
      // defer: function() { //overwrite how ES makes promises
      //  return Promise.defer();
      // }
    },

    rethinkdb: {
      pool: true, //default = true
      //true is interesting:  When true, the driver will regularly pull data from the table server_status 
      //to keep a list of updated hosts, default false
      //TBD: check if useul to put to true.
      discovery: false,
      db: "kwhen", //default databse if non is mentioned
      servers: [{
        host: 'ec2-52-87-199-237.compute-1.amazonaws.com',
        port: 28015
      }],
      buffer: 50,
      max: 1000
    }
  },
  prod: {

  	//IF REMOVED, NOT INITIALIZED. 
  	//THIS ONLY WORKS FOR API; CRAWLER STILL NEEDS REDIS
    // redis: {
    //   host: "localhost",
    //   port: 6379
    // },

    //https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html
    elasticsearch: {
      host: 'http://ec2-54-236-244-71.compute-1.amazonaws.com:9200',
      // log: 'trace',
      apiVersion: "2.1",
      // maxSockets: 10, //default
      // defer: function() { //overwrite how ES makes promises
      //  return Promise.defer();
      // }
    },

    rethinkdb: {
      pool: true, //default = true
      //true is interesting:  When true, the driver will regularly pull data from the table server_status 
      //to keep a list of updated hosts, default false
      //TBD: check if useul to put to true.
      discovery: false,
      db: "kwhen", //default databse if non is mentioned
      servers: [{
        host: 'ec2-52-87-199-237.compute-1.amazonaws.com',
        port: 28015
      }],
      buffer: 50,
      max: 1000
    }
  }
};

if(!config[env]){
  console.log(("config not found for environment=").red + (env).green + " Available options: " + (_.keys(config).join(",")).yellow);
  throw new Error("Config error");
}

console.log(("Starting with config: ") + ("'" + env + "'-mode").yellow);

module.exports = config[env];
