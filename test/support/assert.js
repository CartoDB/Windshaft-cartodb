'use strict';

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
assert.imageBufferIsSimilarToFile = function (buffer, referenceImageRelativeFilePath, tolerance, callback) {
    callback = callback || function (err) { assert.ifError(err); };

    var referenceImageFilePath = path.resolve(referenceImageRelativeFilePath);
    var referenceImageBuffer = fs.readFileSync(referenceImageFilePath, { encoding: null });

    assert.imageBuffersAreSimilar(buffer, referenceImageBuffer, tolerance, callback);
};

assert.imageBuffersAreSimilar = function (bufferA, bufferB, tolerance, callback) {
    var testImage = mapnik.Image.fromBytes(Buffer.isBuffer(bufferA) ? bufferA : Buffer.from(bufferA, 'binary'));
    var referenceImage = mapnik.Image.fromBytes(Buffer.isBuffer(bufferB) ? bufferB : Buffer.from(bufferB, 'binary'));

    imagesAreSimilar(testImage, referenceImage, tolerance, callback);
};

assert.imageIsSimilarToFile = function (testImage, referenceImageRelativeFilePath, tolerance, callback, format = 'png') {
    callback = callback || function (err) { assert.ifError(err); };

    var referenceImageFilePath = path.resolve(referenceImageRelativeFilePath);

    var referenceImage = mapnik.Image.fromBytes(fs.readFileSync(referenceImageFilePath, { encoding: null }));

    imagesAreSimilar(testImage, referenceImage, tolerance, function (err) {
        if (err) {
            var testImageFilePath = randomImagePath(format);
            testImage.save(testImageFilePath, format);
        }
        callback(err);
    }, format);
};

function imagesAreSimilar (testImage, referenceImage, tolerance, callback, format = 'png') {
    if (testImage.width() !== referenceImage.width() || testImage.height() !== referenceImage.height()) {
        return callback(new Error('Images are not the same size'));
    }

    var options = {};
    if (format === 'jpeg') {
        options.alpha = false;
    }
    var pixelsDifference = referenceImage.compare(testImage, options);
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

function randomImagePath (format = 'png') {
    return path.resolve('test/results/' + format + '/image-test-' + Date.now() + '.' + format);
}

assert.response = function (server, req, res, callback) {
    if (!callback) {
        callback = res;
        res = {};
    }

    var port = 0; // let the OS to choose a free port
    var host = '127.0.0.1';

    var listener = server.listen(port, host);
    listener.on('error', callback);
    listener.on('listening', function onServerListening () {
        // jshint maxcomplexity:9
        const { address: host, port } = listener.address();
        const address = `${host}:${port}`;

        var requestParams = {
            url: 'http://' + address + req.url,
            method: req.method || 'GET',
            headers: req.headers || {},
            timeout: req.timeout || 0,
            encoding: req.encoding || 'utf8'
        };

        if (req.body || req.data) {
            requestParams.body = req.body || req.data;
        }

        request(requestParams, function assert$response$requestHandler (error, response, body) {
            listener.close(function () {
                if (error) {
                    return callback(null, error);
                }

                response.body = response.body || body;
                var err = validateResponse(response, res);
                return callback(response, err);
            });
        });
    });
};

function validateResponseBody (response, expected) {
    if (expected.body) {
        var eql = expected.body instanceof RegExp
            ? expected.body.test(response.body)
            : expected.body === response.body;
        if (!eql) {
            return new Error(colorize(
                '[red]{Invalid response body.}\n' +
                '     Expected: [green]{' + expected.body + '}\n' +
                '     Got: [red]{' + response.body + '}')
            );
        }
    }
}

function validateResponseStatus (response, expected) {
    var status = expected.status || expected.statusCode;
    const message = colorize('[red]{Invalid response status code.}\n' +
                    '     Expected: [green]{' + status + '}\n' +
                    '     Got: [red]{' + response.statusCode + '}\n' +
                    '     Body: ' + response.body);

    // Assert response status
    if (typeof status === 'number' && response.statusCode !== status) {
        return new Error(message);
    }

    if (Array.isArray(status) && !status.includes(response.statusCode)) {
        return new Error(message);
    }
}

function validateResponseHeaders (response, expected) {
    // Assert response headers
    if (expected.headers) {
        var keys = Object.keys(expected.headers);
        for (var i = 0, len = keys.length; i < len; ++i) {
            var name = keys[i];
            var actual = response.headers[name.toLowerCase()];
            var expectedHeader = expected.headers[name];
            var headerEql = expectedHeader instanceof RegExp ? expectedHeader.test(actual) : expectedHeader === actual;
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

function validateResponse (response, expected) {
    // Assert response body
    return validateResponseBody(response, expected) ||
        validateResponseStatus(response, expected) ||
        validateResponseHeaders(response, expected);
}

// @param tolerance number of tolerated grid cell differences
assert.utfgridEqualsFile = function (buffer, fileB, tolerance, callback) {
    // jshint maxcomplexity:9
    fs.writeFileSync('/tmp/grid.json', buffer, 'binary'); // <-- to debug/update
    var expectedJson = JSON.parse(fs.readFileSync(fileB, 'utf8'));

    var err = null;

    var Celldiff = function (x, y, ev, ov) {
        this.x = x;
        this.y = y;
        this.ev = ev;
        this.ov = ov;
    };

    Celldiff.prototype.toString = function () {
        return '(' + this.x + ',' + this.y + ')["' + this.ev + '" != "' + this.ov + '"]';
    };

    try {
        var obtainedJson = Object.prototype.toString() === buffer.toString() ? buffer : JSON.parse(buffer);

        // compare grid
        var obtainedGrid = obtainedJson.grid;
        var expectedGrid = expectedJson.grid;
        var nrows = obtainedGrid.length;
        if (nrows !== expectedGrid.length) {
            throw new Error('Obtained grid rows (' + nrows +
                ') != expected grid rows (' + expectedGrid.length + ')');
        }
        var celldiff = [];
        for (var i = 0; i < nrows; ++i) {
            var ocols = obtainedGrid[i];
            var ecols = expectedGrid[i];
            var ncols = ocols.length;
            if (ncols !== ecols.length) {
                throw new Error('Obtained grid cols (' + ncols +
                    ') != expected grid cols (' + ecols.length +
                    ') on row ' + i);
            }
            for (var j = 0; j < ncols; ++j) {
                var ocell = ocols[j];
                var ecell = ecols[j];
                if (ocell !== ecell) {
                    celldiff.push(new Celldiff(i, j, ecell, ocell));
                }
            }
        }

        if (celldiff.length > tolerance) {
            throw new Error(celldiff.length + ' cell differences: ' + celldiff);
        }

        assert.deepStrictEqual(obtainedJson.keys, expectedJson.keys);
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
function colorize (str) {
    var colors = { bold: 1, red: 31, green: 32, yellow: 33 };
    return str.replace(/\[(\w+)\]\{([^]*?)\}/g, function (_, color, str) {
        return '\x1B[' + colors[color] + 'm' + str + '\x1B[0m';
    });
}
