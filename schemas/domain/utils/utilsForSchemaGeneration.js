var _ = require("lodash");
var mod = module.exports = {
  //Generate DAG (directed acyclic graph) of schemas
  //correctly errors out on cycle
  //if fromRoot is supplied, constrain hierarchy + order to subgraph starting with optionalRootTypeName
  generateDAG: function (inputTypes, fromRoot) {
    var types = _.cloneDeep(inputTypes);
    var hierarchy = {};
    var typePrefix = {},
      order = [],
      rootOrSubs;

    //create an array of ids containing the fromRoot + all subtypes
    if (fromRoot) {
      rootOrSubs = _.reduce(types, function (arr, t) {
        if (t.id === fromRoot || t.ancestors.indexOf(fromRoot) !== -1) {
          arr.push(t.id);
        }
        return arr;
      }, []);
    }

    while (true) {
      var typesWithoutDepsInThisIt = 0;
      _.each(types, function (t, k) {

        if (t.supertypes.length) {
          return;
        }

        var logHierarchy = !fromRoot || (fromRoot && rootOrSubs.indexOf(k) !== -1);

        typesWithoutDepsInThisIt++; //detect cycle

        //we've found a type without deps -> create array
        var hierForType = typePrefix[k];
        var arr;

        if (logHierarchy) {

          if (!hierForType) {
            arr = hierarchy[k] = {};
          } else {
            // console.log(hierForType);
            arr = _.property(hierForType)(hierarchy)[k] = {};
          }
          order.push(k);
        }

        _.each(types, function (innerT, innerK) {
          if (innerT.supertypes.indexOf(k) !== -1) {
            innerT.supertypes.splice(innerT.supertypes.indexOf(k), 1);
            if (logHierarchy) {
              typePrefix[innerK] = hierForType ? hierForType + "." + k : k; //assign hierarchyPrefix
            }
          }
        });

        delete types[k]; //delete type -> counts as stop crit
      });
      if (!_.size(types)) {
        break; //done
      }
      if (!typesWithoutDepsInThisIt) {
        throw new Error("Cycle detected!");
      }
    }
    return {
      hierarchy: hierarchy,
      order: order
    };
  },
  printHierarchy: function (inputTypes, fromRoot) {
    mod._printHierarchy(mod.generateDAG(inputTypes, fromRoot).hierarchy);
  },

  _printHierarchy: function (hier, prefix) {
    _.each(hier, function (innerHier, k) {

      var name = !prefix ? k : prefix + " -> " + k;
      console.log(name);
      mod._printHierarchy(innerHier, name);
    });
  },

  //return an array of typeNames for which the order is such that supertpes 
  //always come before subtypes
  //
  //Tech: return a breadth-first search soluation over the DAG.
  getTypesInDAGOrder: function (inputTypes, optionalRootTypeName) {
    return mod.generateDAG(inputTypes, optionalRootTypeName).order;
  }
};
