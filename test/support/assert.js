// Cribbed from the ever prolific Konstantin Kaefer
// https://github.com/mapbox/tilelive-mapnik/blob/master/test/support/assert.js

var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var util = require('util');

var request = require('request');

var assert = module.exports = exports = require('assert');

/**
 * Takes an image data as an input and an image path and compare them using ImageMagick fuzz algorithm, if case the
 * similarity is not within the tolerance limit it will callback with an error.
 *
 * @param buffer The image data to compare from
 * @param {string} referenceImageRelativeFilePath The relative file to compare against
 * @param {number} tolerance tolerated mean color distance, as a per mil (‰)
 * @param {function} callback Will call to home with null in case there is no error, otherwise with the error itself
 * @see FUZZY in http://www.imagemagick.org/script/command-line-options.php#metric
 */
assert.imageEqualsFile = function(buffer, referenceImageRelativeFilePath, tolerance, callback) {
    callback = callback || function(err) { assert.ifError(err); };
    var referenceImageFilePath = path.resolve(referenceImageRelativeFilePath),
        testImageFilePath = createImageFromBuffer(buffer, 'test');

    imageFilesAreEqual(testImageFilePath, referenceImageFilePath, tolerance, function(err) {
        fs.unlinkSync(testImageFilePath);
        callback(err);
    });
};

assert.imageBuffersAreEqual = function(bufferA, bufferB, tolerance, callback) {
    var randStr = (Math.random() * 1e16).toString().substring(0, 8);
    var imageFilePathA = createImageFromBuffer(bufferA, randStr + '-a'),
        imageFilePathB = createImageFromBuffer(bufferB, randStr + '-b');

    imageFilesAreEqual(imageFilePathA, imageFilePathB, tolerance, function(err, similarity) {
        callback(err, [imageFilePathA, imageFilePathB], similarity);
    });
};

function createImageFromBuffer(buffer, nameHint) {
    var imageFilePath = path.resolve('test/results/png/image-' + nameHint + '-' + Date.now() + '.png');
    var err = fs.writeFileSync(imageFilePath, buffer, 'binary');
    assert.ifError(err);
    return imageFilePath;
}

function imageFilesAreEqual(testImageFilePath, referenceImageFilePath, tolerance, callback) {
    var resultFilePath = path.resolve(util.format('/tmp/windshaft-result-%s-diff.png', Date.now()));
    var imageMagickCmd = util.format(
        'compare -metric fuzz "%s" "%s" "%s"',
        testImageFilePath, referenceImageFilePath, resultFilePath
    );

    exec(imageMagickCmd, function(err, stdout, stderr) {
        if (err) {
            fs.unlinkSync(testImageFilePath);
            callback(err);
        } else {
            stderr = stderr.trim();
            var metrics = stderr.match(/([0-9]*) \((.*)\)/);
            if ( ! metrics ) {
                callback(new Error("No match for " + stderr));
                return;
            }
            var similarity = parseFloat(metrics[2]),
                tolerancePerMil = (tolerance / 1000);
            if (similarity > tolerancePerMil) {
                err = new Error(util.format(
                        'Images %s and %s are not equal (got %d similarity, expected %d). Result %s',
                        testImageFilePath, referenceImageFilePath, similarity, tolerancePerMil, resultFilePath)
                );
                err.similarity = similarity;
                callback(err, similarity);
            } else {
                fs.unlinkSync(resultFilePath);
                callback(null, similarity);
            }
        }
    });
}

// jshint maxcomplexity:9
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
        var status = res.status || res.statusCode;
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

                // Assert response body
                if (res.body) {
                    var eql = res.body instanceof RegExp ? res.body.test(response.body) : res.body === response.body;
                    assert.ok(
                        eql,
                        colorize('[red]{Invalid response body.}\n' +
                            '     Expected: [green]{' + res.body + '}\n' +
                            '     Got: [red]{' + response.body + '}')
                    );
                }

                // Assert response status
                if (typeof status === 'number') {
                    assert.equal(response.statusCode, status,
                        colorize('[red]{Invalid response status code.}\n' +
                            '     Expected: [green]{' + status + '}\n' +
                            '     Got: [red]{' + response.statusCode + '}\n' +
                            '     Body: ' + response.body)
                    );
                }

                // Assert response headers
                if (res.headers) {
                    var keys = Object.keys(res.headers);
                    for (var i = 0, len = keys.length; i < len; ++i) {
                        var name = keys[i],
                            actual = response.headers[name.toLowerCase()],
                            expected = res.headers[name],
                            headerEql = expected instanceof RegExp ? expected.test(actual) : expected === actual;
                        assert.ok(headerEql,
                            colorize('Invalid response header [bold]{' + name + '}.\n' +
                                '     Expected: [green]{' + expected + '}\n' +
                                '     Got: [red]{' + actual + '}')
                        );
                    }
                }

                // Callback
                callback(response);
            });
        });

    }
};
// jshint maxcomplexity:6

// @param tolerance number of tolerated grid cell differences
// jshint maxcomplexity:9
assert.utfgridEqualsFile = function(buffer, file_b, tolerance, callback) {
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
