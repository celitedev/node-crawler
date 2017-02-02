const _ = require("lodash");
const Promise = require("bluebird");
const config = require("../config");
const domainUtils = require("../schemas/domain/utils");

return Promise.resolve()
  .then(() => {
    const r = require('rethinkdbdash')(config.rethinkdb);

    const tableSourceEntities = r.table(domainUtils.statics.SOURCETABLE);
    const tableCanonicalEntities = r.table(domainUtils.statics.CANONICALTABLE);
    const tableErd = r.table(domainUtils.statics.ERDTABLE);
    const tableRefNorms = r.table(domainUtils.statics.REFNORMS);

    return new Promise((resolve, reject) => {
      console.log(`Removing all data except sourceEntities, reset sourceEntities to new`);
      tableSourceEntities.replace(r.row.without([
        {_state:{modifiedMakeRefs: true}},
        {_state:{modifiedAndDirty: true}},
        {_state:{modifiedMatch: true}},
        '_refToSourceRefIdMap',
        '_refNormIds',
        '_refs'
      ])).run().then(()=>{
        console.log('source entities cleaned?!');
        tableRefNorms.delete().run().then(()=>{
          console.log("Ref Norms Removed");
          tableCanonicalEntities.delete().run().then(()=>{
            console.log("Canonical Entities Removed");
            tableErd.delete().run().then(()=>{
              console.log("ERD Removed, DONE!  Don't forget to run renewERDMapping before running ingestion");
              return resolve();
            })
          })
        })
      })
    })
      .catch(function (err) {
        throw err;
      })
      .finally(function () {
        console.log("QUITTING");
        r.getPoolMaster().drain(); //quit
      });
  });
