var _ = require("lodash");
var Promise = require("bluebird");

var config = require("../config");
var r = require('rethinkdb');
var domainUtils = require("../schemas/domain/utils");
var conn;

return Promise.resolve().then(() => {
  return new Promise((resolve, reject) => {
    console.log("Connecting to RethinkDB at: ", config.rethinkdb);
    r.connect({host: config.rethinkdb.servers[0].host, port: config.rethinkdb.servers[0].port, db: config.rethinkdb.db}, (err, connection) => {
      if(err) return reject(err);
      conn = connection;
      return resolve();
    })
  }).then(()=>{
    return new Promise((resolve, reject) => {
      r.tableCreate(domainUtils.statics.QUERYHISTORYTABLE).run(conn,()=>{}).then(()=>{
        console.log(`Created Table ${domainUtils.statics.QUERYHISTORYTABLE}`);
        return resolve();
      })
    })
  })
})
.catch((err) => {
  console.error(err);
  throw err;
})
.finally(() => {
  console.log("QUITTING");
  process.exit();
});