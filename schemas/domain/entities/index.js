module.exports = function (generatedSchemas, r) {

  var AbstractEntity = require("./AbstractEntity")(generatedSchemas, r);
  var CanonicalEntity = require("./CanonicalEntity")(generatedSchemas, AbstractEntity, r);
  var SourceEntity = require("./SourceEntity")(generatedSchemas, AbstractEntity, r);

  return {
    CanonicalEntity: CanonicalEntity,
    SourceEntity: SourceEntity,
  };

};
