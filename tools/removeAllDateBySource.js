const _ = require("lodash");
const Promise = require("bluebird");
const elasticsearch = require('elasticsearch');
const config = require("../config");
const domainUtils = require("../schemas/domain/utils");

const argv = require('yargs').argv;

return Promise.resolve()
  .then(() => {
    const esBulkDelete = docs => {
      return new Promise((resolve, reject) => {
        const es_config = _.cloneDeep(config.elasticsearch);
        const es_client = new elasticsearch.Client(es_config);

        let bulkData = _.map(docs, (doc) => {
          return {
            delete: {
              _index: `kwhen-${doc.root.toLowerCase()}`,
              _type: 'type1',
              _id: doc.id
            }
          }
        })

        es_client.bulk({body: bulkData}, (err, resp) => {
          if(err) return reject(err);
          return resolve(resp);
        })
      })
    };

    const source = argv.source;
    const r = require('rethinkdbdash')(config.rethinkdb);

    const tableSourceEntity = r.table(domainUtils.statics.SOURCETABLE);
    const tableCanonicalEntities = r.table(domainUtils.statics.CANONICALTABLE);
    const tableErd = r.table(domainUtils.statics.ERDTABLE);
    const tableRefNorms = r.table(domainUtils.statics.REFNORMS);

    let data = [];
    return new Promise((resolve, reject) => {
      if (!source) return reject('YOU MUST DEFINE A SOURCE');
      console.log(`Removing all ${source} data`);
      tableSourceEntity.filter({'_sourceType': source}).pluck("id").run().then(results=>{
        console.log(`Found ${results.length} source entities`);
        if (results.length == 0) return resolve();


        Promise.all(_.map(results, (row) =>  {
           return tableErd.get(row.id).pluck("root").run().then(result=>{
            if (result) {
              data.push({
                id: row.id,
                root: result.root
              })
            }
          })
        })).then(()=>{
          esBulkDelete(data).then(()=>{
            console.log('Removed ES Data');
            Promise.all(_.map(data, (row) =>  {
              return tableErd.get(row.id).delete().run();
            })).then(()=>{
              console.log("Removed ERD");
              Promise.all(_.map(data, (row) =>  {
                return tableCanonicalEntities.get(row.id).delete().run();
            })).then(()=>{
                console.log('Removed Canonical Entities');
                Promise.all(_.map(data, (row) =>  {
                  tableRefNorms.get(row.id).delete().run().then(()=>{
                    return tableRefNorms.filter({"_sourceRefId":row.id}).delete().run();
                  })
              })).then(()=>{
                  console.log('Removed RefNorms');
                  Promise.all(_.map(data, (row) =>  {
                    return tableSourceEntity.get(row.id).delete().run();
                })).then(()=>{
                    console.log('Removed Source Entities, DONE!');
                    return resolve();
                  })
                })
              })
            })
          });
        });
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


