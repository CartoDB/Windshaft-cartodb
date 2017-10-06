// Cribbed from the ever prolific Konstantin Kaefer
// https://github.com/mapbox/tilelive-mapnik/blob/master/test/support/assert.js

var fs = require('fs');
var path = require('path');
var util = require('util');

var mapnik = require('windshaft').mapnik;

var request = require('request');

var assert = module.exports = exports = require('assert');

/**
 * Takes an image data as an input and an image path and compare them using mapnik.Image.compare mechanism, in case the
 * similarity is not within the tolerance limit it will callback with an error.
 *
 * @param buffer The image data to compare from
 * @param {string} referenceImageRelativeFilePath The relative file to compare against
 * @param {number} tolerance tolerated mean color distance, as a per mil (‰)
 * @param {function} callback Will call to home with null in case there is no error, otherwise with the error itself
 * @see FUZZY in http://www.imagemagick.org/script/command-line-options.php#metric
 */
assert.imageBufferIsSimilarToFile = function(buffer, referenceImageRelativeFilePath, tolerance, callback) {
    callback = callback || function(err) { assert.ifError(err); };

    var referenceImageFilePath = path.resolve(referenceImageRelativeFilePath);
    var referenceImageBuffer = fs.readFileSync(referenceImageFilePath, { encoding: null });

    assert.imageBuffersAreSimilar(buffer, referenceImageBuffer, tolerance, callback);
};

assert.imageBuffersAreSimilar = function(bufferA, bufferB, tolerance, callback) {
    var testImage = mapnik.Image.fromBytes(Buffer.isBuffer(bufferA) ? bufferA : new Buffer(bufferA, 'binary'));
    var referenceImage = mapnik.Image.fromBytes(Buffer.isBuffer(bufferB) ? bufferB : new Buffer(bufferB, 'binary'));

    imagesAreSimilar(testImage, referenceImage, tolerance, callback);
};

assert.imageIsSimilarToFile = function(testImage, referenceImageRelativeFilePath, tolerance, callback) {
    callback = callback || function(err) { assert.ifError(err); };

    var referenceImageFilePath = path.resolve(referenceImageRelativeFilePath);

    var referenceImage = mapnik.Image.fromBytes(fs.readFileSync(referenceImageFilePath,  { encoding: null }));

    imagesAreSimilar(testImage, referenceImage, tolerance, function(err) {
        if (err) {
            var testImageFilePath = randomImagePath();
            testImage.save(testImageFilePath);
        }
        callback(err);
    });
};

function imagesAreSimilar(testImage, referenceImage, tolerance, callback) {
    if (testImage.width() !== referenceImage.width() || testImage.height() !== referenceImage.height()) {
        return callback(new Error('Images are not the same size'));
    }

    var pixelsDifference = referenceImage.compare(testImage);
    var similarity = pixelsDifference / (referenceImage.width() * referenceImage.height());
    var tolerancePerMil = (tolerance / 1000);

    if (similarity > tolerancePerMil) {
        var err = new Error(
            util.format('Images are not similar (got %d similarity, expected %d)', similarity, tolerancePerMil)
        );
        err.similarity = similarity;
        callback(err, similarity);
    } else {
        callback(null, similarity);
    }
}

function randomImagePath() {
    return path.resolve('test/results/png/image-test-' + Date.now() + '.png');
}

assert.response = function(server, req, res, callback) {
    if (!callback) {
        callback = res;
        res = {};
    }

    var port = 5555,
        host = '127.0.0.1';

    var listeningAttempts = 0;
    var listener;
    function listen() {
        if (listeningAttempts > 25) {
            return callback(null, new Error('Tried too many ports'));
        }
        listener = server.listen(port, host);
        listener.on('error', function() {
            port++;
            listeningAttempts++;
            listen();
        });
        listener.on('listening', onServerListening);
    }

    listen();

    // jshint maxcomplexity:9
    function onServerListening() {
        var requestParams = {
            url: 'http://' + host + ':' + port + req.url,
            method: req.method || 'GET',
            headers: req.headers || {},
            timeout: req.timeout || 0,
            encoding: req.encoding || 'utf8'
        };

        if (req.body || req.data) {
            requestParams.body = req.body || req.data;
        }

        request(requestParams, function assert$response$requestHandler(error, response, body) {
            listener.close(function() {
                response.body = response.body || body;
                var err = validateResponse(response, res);
                return callback(response, err);
            });
        });

    }
};

function validateResponseBody(response, expected) {
    if (expected.body) {
        var eql = expected.body instanceof RegExp ?
            expected.body.test(response.body) :
            expected.body === response.body;
        if (!eql) {
            return new Error(colorize(
                '[red]{Invalid response body.}\n' +
                '     Expected: [green]{' + expected.body + '}\n' +
                '     Got: [red]{' + response.body + '}')
            );
        }
    }
}

function validateResponseStatus(response, expected) {
    var status = expected.status || expected.statusCode;
    // Assert response status
    if (typeof status === 'number') {
        if (response.statusCode !== status) {
            return new Error(colorize(
                '[red]{Invalid response status code.}\n' +
                '     Expected: [green]{' + status + '}\n' +
                '     Got: [red]{' + response.statusCode + '}\n' +
                '     Body: ' + response.body)
            );
        }
    }
}

function validateResponseHeaders(response, expected) {
    // Assert response headers
    if (expected.headers) {
        var keys = Object.keys(expected.headers);
        for (var i = 0, len = keys.length; i < len; ++i) {
            var name = keys[i],
                actual = response.headers[name.toLowerCase()],
                expectedHeader = expected.headers[name],
                headerEql = expectedHeader instanceof RegExp ? expectedHeader.test(actual) : expectedHeader === actual;
            if (!headerEql) {
                return new Error(colorize(
                    'Invalid response header [bold]{' + name + '}.\n' +
                    '     Expected: [green]{' + expectedHeader + '}\n' +
                    '     Got: [red]{' + actual + '}')
                );
            }
        }
    }
}

function validateResponse(response, expected) {
    // Assert response body
    return validateResponseBody(response, expected) ||
        validateResponseStatus(response, expected) ||
        validateResponseHeaders(response, expected);
}

// @param tolerance number of tolerated grid cell differences
assert.utfgridEqualsFile = function(buffer, file_b, tolerance, callback) {
    // jshint maxcomplexity:9
    fs.writeFileSync('/tmp/grid.json', buffer, 'binary'); // <-- to debug/update
    var expected_json = JSON.parse(fs.readFileSync(file_b, 'utf8'));

    var err = null;

    var Celldiff = function(x, y, ev, ov) {
        this.x = x;
        this.y = y;
        this.ev = ev;
        this.ov = ov;
    };

    Celldiff.prototype.toString = function() {
        return '(' + this.x + ',' + this.y + ')["' + this.ev + '" != "' + this.ov + '"]';
    };

    try {
        var obtained_json = Object.prototype.toString() === buffer.toString() ? buffer : JSON.parse(buffer);

        // compare grid
        var obtained_grid = obtained_json.grid;
        var expected_grid = expected_json.grid;
        var nrows = obtained_grid.length;
        if (nrows !== expected_grid.length) {
            throw new Error( "Obtained grid rows (" + nrows +
                ") != expected grid rows (" + expected_grid.length + ")" );
        }
        var celldiff = [];
        for (var i=0; i<nrows; ++i) {
            var ocols = obtained_grid[i];
            var ecols = expected_grid[i];
            var ncols = ocols.length;
            if ( ncols !== ecols.length ) {
                throw new Error( "Obtained grid cols (" + ncols +
                    ") != expected grid cols (" + ecols.length +
                    ") on row " + i );
            }
            for (var j=0; j<ncols; ++j) {
                var ocell = ocols[j];
                var ecell = ecols[j];
                if ( ocell !== ecell ) {
                    celldiff.push(new Celldiff(i, j, ecell, ocell));
                }
            }
        }

        if ( celldiff.length > tolerance ) {
            throw new Error( celldiff.length + " cell differences: " + celldiff );
        }

        assert.deepEqual(obtained_json.keys, expected_json.keys);
    } catch (e) { err = e; }

    callback(err);
};


/**
 * Colorize the given string using ansi-escape sequences.
 * Disabled when --boring is set.
 *
 * @param {String} str
 * @return {String}
 */
function colorize(str) {
    var colors = { bold: 1, red: 31, green: 32, yellow: 33 };
    return str.replace(/\[(\w+)\]\{([^]*?)\}/g, function(_, color, str) {
        return '\x1B[' + colors[color] + 'm' + str + '\x1B[0m';
    });
}
