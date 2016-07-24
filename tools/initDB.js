var _ = require("lodash");
var Promise = require("bluebird");

var config = require("../config");
var r = require('rethinkdb');
var domainUtils = require("../schemas/domain/utils");
var conn

function createDB(){
  console.log(`Creating DB: ${config.rethinkdb.db}`);
  return new Promise((resolve, reject) => {    
    r.dbCreate(config.rethinkdb.db).run(conn, ()=>{resolve();});
  });
}

function createTables(){
  console.log('Creating Tables');
  return Promise.all([
    r.tableCreate(domainUtils.statics.SOURCETABLE).run(conn,()=>{}),
    r.tableCreate(domainUtils.statics.CANONICALTABLE).run(conn,()=>{}),
    r.tableCreate(domainUtils.statics.ERDTABLE).run(conn,()=>{}),
    r.tableCreate(domainUtils.statics.REFNORMS).run(conn,()=>{})
  ]);
}

function createIndices(){
  console.log('Creating Indices');
  return Promise.all([
    //SOURCETABLE
    r.table(domainUtils.statics.SOURCETABLE).indexCreate('_refNormIds', function(row) { return row("_refNormIds").setDifference(row("_refToSourceRefIdMap").keys()); }, {multi: true}).run(conn,()=>{}),
    r.table(domainUtils.statics.SOURCETABLE).indexCreate('_sourceId', function(_var19) { return _var19.getField("_sourceId"); }).run(conn,()=>{}),
    r.table(domainUtils.statics.SOURCETABLE).indexCreate('_sourceType', function(_var19) { return _var19.getField("_sourceType"); }).run(conn,()=>{}),
    r.table(domainUtils.statics.SOURCETABLE).indexCreate('_sourceUrl', function(_var19) { return _var19.getField("_sourceUrl"); }).run(conn,()=>{}),
    r.table(domainUtils.statics.SOURCETABLE).indexCreate('_type', function(_var19) { return _var19.getField("_type"); }, {multi: true}).run(conn,()=>{}),
    r.table(domainUtils.statics.SOURCETABLE).indexCreate('modifiedMakeRefs', function(var156) { return var156("_state").hasFields("modifiedMakeRefs"); }).run(conn,()=>{}),
    r.table(domainUtils.statics.SOURCETABLE).indexCreate('modifiedMatch', function(var159) { return r.or(r.not(var159("_state").hasFields("modifiedMatch")),r.eq(var159("_state")("modifiedMatch"), null),r.lt(var159("_state")("modifiedMatch"),var159("_state")("modifiedMakeRefs"))); }).run(conn,()=>{}),,
    r.table(domainUtils.statics.SOURCETABLE).indexCreate('dirtyForMakeRefs', function(doc) { 
      return r.add(r.and(doc("_state").hasFields("modifiedMakeRefs"),r.ge(doc("_state")("modifiedAndDirty"),doc("_state")("modifiedMakeRefs")))); 
    }).run(conn,()=>{}),
    //CANONICALTABLE
    r.table(domainUtils.statics.CANONICALTABLE).indexCreate('_type', function(_var19) { return _var19.getField("_type"); }, {multi: true}).run(conn,()=>{}),
    r.table(domainUtils.statics.CANONICALTABLE).indexCreate('modifiedERD', function(var222) { return r.or(r.not(var222("_state").hasFields("modifiedERD")),r.eq(var222("_state")("modifiedERD"), null),r.lt(var222("_state")("modifiedERD"), var222("_state")("modifiedAndDirty"))); }).run(conn,()=>{}),
    //ERD has none
    //REFNORMS
    r.table(domainUtils.statics.REFNORMS).indexCreate('_sourceId', function(_var19) { return _var19.getField("_sourceId"); }).run(conn,()=>{}),
    r.table(domainUtils.statics.REFNORMS).indexCreate('_sourceRefId', function(_var19) { return _var19.getField("_sourceRefId"); }).run(conn,()=>{}),
    r.table(domainUtils.statics.REFNORMS).indexCreate('_sourceUrl', function(_var19) { return _var19.getField("_sourceUrl"); }).run(conn,()=>{})
  ]);
}

return Promise.resolve()
  .then(() => {
    return new Promise((resolve, reject) => {
      r.connect(config.rethinkdb, (err, connection) => {
        if(err) return reject(err); 
        conn = connection;
        return resolve();
      })
    })
    .then(()=>{
        return new Promise((resolve, reject) => {
          r.dbList().run(conn, (err, dbList) => {
            if(err) return reject(err); 
            if (dbList.includes(config.rethinkdb.db)) {
              console.log(`Database ${config.rethinkdb.db} already exists.  Run r.dbDrop('${config.rethinkdb.db}') first.`);
              return reject();
            }
            return resolve();
          })
        })
    }).then(()=>{
      return new Promise((resolve, reject) => {
        createDB().then(createTables).then(createIndices).then(()=>{return resolve()})
      })
    })
  })
  .catch((err) => {
    throw err;
  })
  .finally(() => {
    console.log("QUITTING");
    process.exit();
  });