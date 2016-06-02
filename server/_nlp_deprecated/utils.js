var _ = require("lodash");


function ChunkPart(type, parent, abstract, abstractText, path) {
  this.type = type;
  this.parent = parent;
  this.abstract = abstract;
  this.abstractText = abstractText;
  this.path = path;
}

ChunkPart.prototype.toJSON = function () {
  return {
    type: this.type,
    abstract: this.abstract,
    abstractText: this.abstractText,
    path: this.path,
    // parts: this.parts //much clearer in debug session. Let's see if this is enough info
  };
};

function TagPart(type, parent, tag, word, text, path, abstract) {
  this.type = type;
  this.parent = parent;
  this.tag = tag;
  this.word = word;
  this.text = text;
  this.path = path;
  this.abstract = abstract;
}

TagPart.prototype.toJSON = function () {
  return {
    type: this.type,
    tag: this.tag,
    word: this.word,
    text: this.text,
    path: this.path,
    abstract: this.abstract
  };
};

var chunkUtils = {


  //Allow regex on one or more properties. Supplied as a map
  //Only those parts are returned for which all properties match corresponding regex
  filter: function (parts, filterObj, doRecurse, chunkNamesAsStopCriteria, ancestorInstanceAsStopCriteria) {

    //define chunktypes that count as stop criterium for recursion
    chunkNamesAsStopCriteria = chunkNamesAsStopCriteria || [];

    //define actual chunk instances that count as stop criterium for recursion
    ancestorInstanceAsStopCriteria = ancestorInstanceAsStopCriteria || [];

    //make regex
    var filterObjRegex = _.reduce(filterObj, function (agg, v, k) {
      agg[k] = new RegExp(v, "g");
      return agg;
    }, {});

    //find result on current level
    var result = _.filter(parts, function (part) {

      var result = _.compact(_.map(filterObjRegex, function (regex, key) {
        if (!part[key]) return false;
        return !!part[key].match(regex) && !~ancestorInstanceAsStopCriteria.indexOf(part);
      }));

      return result.length === _.size(filterObjRegex);
    });

    //recurse all the way down. No turtles involved
    if (doRecurse) {


      var chunkParts = _.filter(parts, function (part) {

        //a part is a chunk part that should be recursed iff:
        return !!part.chunkType && //.. it's a chunkpart
          !~result.indexOf(part) && //.. it isn't included itself in the result. E.g: when querying for VPs we only include the topmost
          !~chunkNamesAsStopCriteria.indexOf(part.chunkType) && //.. chunktype isn't part of stop criteria
          !~ancestorInstanceAsStopCriteria.indexOf(part); //.. chunk itself isn't part of stop criteria
      });

      result = _.reduce(chunkParts, function (result, chunkPart) {
        return result.concat(chunkUtils.filter(chunkPart.parts, filterObj, doRecurse, chunkNamesAsStopCriteria, ancestorInstanceAsStopCriteria));
      }, result);
    }

    return result;
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

          part = new ChunkPart("chunk", currentChunk, null, null, sChunk.substring(startPartAt, i + 1).trim());
          currentChunk.parts = currentChunk.parts || [];
          currentChunk.parts.push(chunkUtils.getParts(part, part.path.substring(1, part.path.length - 1)));

          startPartAt = i + 1;
        }
      } else if ((c === " " || i === sChunk.length - 1) && !depth) {

        var sPart = sChunk.substring(startPartAt, i + 1).trim();

        if (sPart) { //don't add spaces

          if (!startPartAt && !~sPart.indexOf("/")) { //we're at start. Possibly the chunk type
            currentChunk.chunkType = sPart;
          } else {
            var wordTag = sPart.split("/");

            part = new TagPart("tag", currentChunk, wordTag[1], wordTag[0], wordTag[0], sPart, ["tag:" + wordTag[1]]);

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
