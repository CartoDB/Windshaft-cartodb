/**
 * User: simon
 * Date: 30/08/2011
 * Time: 13:52
 * Desc: Loads test specific variables
 */

var _ = require('underscore');
var LZMA  = require('lzma/lzma_worker.js').LZMA;

// set environment specific variables
global.settings     = require(__dirname + '/../../config/settings');
global.environment  = require(__dirname + '/../../config/environments/test');
_.extend(global.settings, global.environment);
process.env.NODE_ENV = 'test';


// Utility function to compress & encode LZMA
function lzma_compress_to_base64(payload, mode, callback) {
  LZMA.compress(payload, mode, 
    function(ints) {
      ints = ints.map(function(c) { return String.fromCharCode(c + 128) }).join('')
      var base64 = new Buffer(ints, 'binary').toString('base64');
      callback(null, base64);
    },
    function(percent) {
      //console.log("Compressing: " + percent + "%");
    }
  );
}

module.exports = {
  lzma_compress_to_base64: lzma_compress_to_base64
}

