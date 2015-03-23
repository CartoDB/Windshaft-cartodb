if (process.argv.length !== 3) {
    console.error('Usage: node %s lzma_string', __filename);
    process.exit(1);
}

var LZMA = require('lzma').LZMA;
var lzmaWorker = new LZMA();
var lzmaInput = decodeURIComponent(process.argv[2]);
var lzmaBuffer = new Buffer(lzmaInput, 'base64')
    .toString('binary')
    .split('')
    .map(function(c) {
        return c.charCodeAt(0) - 128
    });

lzmaWorker.decompress(lzmaBuffer, function(result) {
    console.log(JSON.stringify(JSON.parse(JSON.parse(result).config), null, 4));
});
