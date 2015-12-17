var jsonld = require("jsonld");
var jsonld_request = require("jsonld-request");
var _ = require("lodash");

var context = {
  "name": "http://schema.org/name",
  "homepage": {
    "@id": "http://schema.org/url",
    "@type": "@id"
  },
  "image": {
    "@id": "http://schema.org/image",
    "@type": "@id"
  }
};
var doc = {
  "http://schema.org/name": "Manu Sporny",
  "http://schema.org/url": {
    "@id": "http://manu.sporny.org/"
  },
  "http://schema.org/image": {
    "@id": "http://manu.sporny.org/images/manu.png"
  }
};


// // compact a document according to a particular context
// // see: http://json-ld.org/spec/latest/json-ld/#compacted-document-form
// jsonld.compact(doc, context, function(err, compacted) {
//   // console.log(JSON.stringify(compacted, null, 2));
//   // Output: {
//   //   "@context": {...
//   //   },
//   //   "name": "Manu Sporny",
//   //   "homepage": "http://manu.sporny.org/",
//   //   "image": "http://manu.sporny.org/images/manu.png"
//   // }

// });

// jsonld.flatten(doc, function(err, flattened) {
//   console.log(JSON.stringify(flattened, null, 2));
//   // all deep-level trees flattened to the top-level
// });

jsonld_request('http://schema.org/Person', function(err, res, data) {
  // console.log(_.pluck(data, "@id"));
  console.log(_.filter(data, {
    "@id": "http://schema.org/makesOffer"
  }));
});
