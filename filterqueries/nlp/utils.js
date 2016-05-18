var _ = require("lodash");

var chunkUtils = {

  //Allow regex on one or more properties. Supplied as a map
  //Only those parts are returned for which all properties match corresponding regex
  filter: function (parts, filterObj) {

    //make regex
    _.each(filterObj, function (v, k) {
      filterObj[k] = new RegExp(v, "g");
    });

    return _.filter(parts, function (part) {

      var result = _.compact(_.map(filterObj, function (regex, key) {
        if (!part[key]) return false;
        return !!part[key].match(regex);
      }));

      return result.length === _.size(filterObj);

    });
  },

  //find first or null
  find: function (parts, filterObj) {
    var arr = chunkUtils.filter(parts, filterObj);
    return arr.length ? arr[0] : null;
  },
  getParts: function (currentChunk, sChunk) {

    var depth = 0;
    var startPartAt = 0;

    sChunk = sChunk.trim();
    currentChunk.path = sChunk;

    var part;
    for (var i = 0; i < sChunk.length; i++) {
      var c = sChunk.charAt(i);
      if (c === '[') {
        depth++;
      } else if (c === ']') {
        depth--;
        if (!depth) {

          part = {
            type: "chunk",
            path: sChunk.substring(startPartAt, i + 1).trim(),
          };
          currentChunk.parts = currentChunk.parts || [];
          currentChunk.parts.push(chunkUtils.getParts(part, part.path.substring(1, part.path.length - 1)));

          startPartAt = i + 1;
        }
      } else if ((c === " " || i === sChunk.length - 1) && !depth) {

        part = sChunk.substring(startPartAt, i + 1).trim();

        if (part) { //don't add spaces

          if (!startPartAt && !~part.indexOf("/")) { //we're at start. Possibly the chunk type
            currentChunk.chunkType = part;
          } else {
            var wordTag = part.split("/");
            part = {
              type: "tag",
              tag: wordTag[1],
              word: wordTag[0],
              text: wordTag[0],
              path: part,
              abstract: ["tag:" + wordTag[1]]
            };
            currentChunk.parts = currentChunk.parts || [];
            currentChunk.parts.push(part);
          }
        }

        startPartAt = i;
      }
    }

    currentChunk.text = _.reduce(currentChunk.parts, function (sOut, part) {
      return sOut + " " + part.text;
    }, "").trim();

    //more sensible order for human consumption
    var curPath = currentChunk.path;
    delete currentChunk.path;
    currentChunk.path = curPath;

    currentChunk.abstract = _.reduce(currentChunk.parts, function (sOut, part) {
      if (part.type === "chunk" || part.type === "top") {
        return sOut.concat(["chunk:" + part.chunkType]);
      } else {
        return sOut.concat(part.abstract);
      }
    }, []);

    currentChunk.abstractText = currentChunk.abstract.join(" ").trim();

    return currentChunk;
  },
};

module.exports = chunkUtils;
